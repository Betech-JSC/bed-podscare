<?php

namespace App\Services;

use App\Events\OrderOperationalEvent;
use App\Models\AuditLog;
use App\Models\Notification;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\Warranty;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;

class OrderWorkflowService extends BaseWorkflowService
{
    /**
     * Ma trận chuyển đổi trạng thái hợp lệ của RepairOrder.
     */
    public const ALLOWED_TRANSITIONS = [
        'inspecting'       => ['waiting_approval', 'quote_pending', 'waiting_tech', 'in_repair', 'cancelled'],
        'waiting_approval' => ['waiting_tech', 'rejected', 'cancelled'],
        'quote_pending'    => ['waiting_tech', 'rejected', 'cancelled'],
        'rejected'         => ['inspecting', 'waiting_pickup', 'completed', 'cancelled'],
        'waiting_tech'     => ['assigned', 'in_repair'],
        'assigned'         => ['in_repair', 'ready_for_return', 'waiting_parts'],
        'in_repair'        => ['waiting_parts', 'waiting_qc', 'qc_pending', 'qc_inspecting', 'ready_for_return'],
        'waiting_parts'    => ['in_repair'],
        'rework_needed'    => ['in_repair', 'ready_for_return', 'waiting_parts'],
        'waiting_qc'       => ['ready_for_return', 'rework_needed'],
        'qc_pending'       => ['ready_for_return', 'rework_needed'],
        'qc_inspecting'    => ['ready_for_return', 'rework_needed'],
        'ready_for_return' => ['waiting_pickup', 'completed'],
        'waiting_pickup'   => ['completed'],
    ];

    /**
     * Từ điển nhãn trạng thái tiếng Việt chuẩn cho 13 trạng thái vòng đời đơn sửa chữa PodsCare.
     */
    public const STATUS_LABELS = [
        'inspecting'       => 'Đang kiểm tra',
        'waiting_approval' => 'Chờ khách duyệt',
        'quote_pending'    => 'Chờ khách duyệt',
        'rejected'         => 'Khách từ chối sửa',
        'waiting_tech'     => 'Chờ kỹ thuật',
        'assigned'         => 'KTV đã nhận',
        'in_repair'        => 'Đang sửa',
        'waiting_parts'    => 'Chờ linh kiện',
        'rework_needed'    => 'Cần sửa lại',
        'waiting_qc'       => 'Chờ QC',
        'qc_pending'       => 'Chờ QC',
        'qc_inspecting'    => 'Chờ QC',
        'ready_for_return' => 'Sẵn sàng trả',
        'waiting_pickup'   => 'Chờ khách nhận',
        'completed'        => 'Hoàn tất',
        'cancelled'        => 'Đã hủy',
    ];

    protected ?string $logModel = AuditLog::class;

    protected string $foreignKeyName = 'auditable_id';

    /**
     * Chuẩn hóa trạng thái (map 2 chiều qc_pending/qc_inspecting -> waiting_qc, quote_pending -> waiting_approval) trước khi chuyển đổi.
     */
    public function transition(Model $model, string $newStatus, array $options = []): Model
    {
        if ($newStatus === 'qc_pending' || $newStatus === 'qc_inspecting') {
            $newStatus = 'waiting_qc';
        }

        if ($newStatus === 'quote_pending') {
            $newStatus = 'waiting_approval';
        }

        if ($model->status === 'qc_pending' || $model->status === 'qc_inspecting') {
            $model->status = 'waiting_qc';
        }

        if ($model->status === 'quote_pending') {
            $model->status = 'waiting_approval';
        }

        return parent::transition($model, $newStatus, $options);
    }

    /**
     * Xác thực bước chuyển trạng thái cho RepairOrder theo ma trận và ném DomainException tiếng Việt thân thiện.
     */
    public function validateTransition(string $fromStatus, string $toStatus): void
    {
        parent::validateTransition($fromStatus, $toStatus);
    }

    /**
     * Hook trước khi chuyển trạng thái: xác thực điều kiện nghiệp vụ.
     */
    protected function beforeTransition(Model $model, string $oldStatus, string $newStatus, array $options): void
    {
        // Khi chuyển sang ready_for_return:
        if ($newStatus === 'ready_for_return') {
            // Cho phép KTV nghiệm thu trực tiếp khi chuyển thẳng từ in_repair, assigned, hoặc rework_needed sang ready_for_return
            if (in_array($oldStatus, ['in_repair', 'assigned', 'rework_needed'], true)) {
                $hasPassedQc = QcInspection::where('repair_order_id', $model->id)
                    ->where('result', 'pass')
                    ->exists();

                if (! $hasPassedQc) {
                    $inspectorId = $options['user']?->id 
                        ?? ($options['admin_id'] 
                        ?? ($options['technician_id'] 
                        ?? ($model->technician_id 
                        ?? auth()->id())));

                    QcInspection::create([
                        'tenant_id'       => $model->tenant_id,
                        'repair_order_id' => $model->id,
                        'inspector_id'    => $inspectorId,
                        'result'          => 'pass',
                        'notes'           => $options['repair_note'] ?? 'Kỹ thuật viên nghiệm thu trực tiếp',
                    ]);
                }
            } else {
                $hasPassedQc = QcInspection::where('repair_order_id', $model->id)
                    ->where('result', 'pass')
                    ->exists();

                if (! $hasPassedQc) {
                    throw new \DomainException(
                        'Đơn hàng chưa có biên bản kiểm định chất lượng đạt chuẩn (QC Pass). Không thể chuyển sang trạng thái sẵn sàng giao trả.'
                    );
                }
            }
        }
    }

    /**
     * Hook sau khi chuyển trạng thái: cập nhật timestamps kiểm toán, bảo hành, doanh số.
     */
    protected function afterTransition(Model $model, string $oldStatus, string $newStatus, array $options): void
    {
        $now = Carbon::now();
        $updates = [];

        switch ($newStatus) {
            case 'inspecting':
                break;
            case 'waiting_tech':
                $updates['customer_approved_at'] = $now;
                break;
            case 'rejected':
                $updates['customer_declined_at'] = $now;
                $updates['decline_reason'] = $options['decline_reason'] ?? null;
                break;
            case 'assigned':
                $user = $options['user'] ?? auth()->user();
                $updates['technician_id'] = $options['technician_id'] ?? ($user?->id ?? $model->technician_id);
                $updates['tech_accepted_at'] = $now;
                break;
            case 'in_repair':
                if (! $model->repair_started_at) {
                    $updates['repair_started_at'] = $now;
                }
                if (! empty($options['technician_id'])) {
                    $updates['technician_id'] = $options['technician_id'];
                    $updates['tech_accepted_at'] = $now;
                } elseif (! empty($options['user']) && in_array($options['user']->role ?? '', ['tech', 'technician'], true)) {
                    $updates['technician_id'] = $options['user']->id;
                    $updates['tech_accepted_at'] = $now;
                }
                break;
            case 'waiting_qc':
            case 'qc_pending':
            case 'qc_inspecting':
                $updates['repair_completed_at'] = $now;
                if (! empty($options['repair_note'])) {
                    $updates['repair_note'] = $options['repair_note'];
                }
                if (! empty($options['parts_used'])) {
                    $updates['parts_used_summary'] = $options['parts_used'];
                }
                break;
            case 'ready_for_return':
                $updates['qc_passed_at'] = $now;
                if (in_array($oldStatus, ['in_repair', 'assigned', 'rework_needed'], true)) {
                    if (! $model->repair_started_at) {
                        $updates['repair_started_at'] = $now;
                    }
                    if (! $model->technician_id) {
                        $updates['technician_id'] = $options['technician_id'] 
                            ?? ($options['user']?->id 
                            ?? (auth()->id() ?? $model->technician_id));
                    }
                    if (! $model->repair_completed_at) {
                        $updates['repair_completed_at'] = $now;
                    }
                    if (! empty($options['repair_note'])) {
                        $updates['repair_note'] = $options['repair_note'];
                    }
                    if (! empty($options['parts_used'])) {
                        $updates['parts_used_summary'] = $options['parts_used'];
                    }
                }
                break;
            case 'waiting_pickup':
                $updates['customer_notified_at'] = $now;
                break;
            case 'completed':
                $updates['handed_over_at'] = $now;
                $updates['delivered_at'] = $now;
                $adminId = $options['admin_id'] ?? ($options['user']?->id ?? auth()->id());
                $updates['handed_over_by_user_id'] = $adminId;

                // Tự động kích hoạt sổ bảo hành điện tử
                if ($model->warranty_terms_days > 0 && ! $model->warranties()->exists()) {
                    $year = date('y');
                    $randomCode = str_pad((string) random_int(100, 9999), 4, '0', STR_PAD_LEFT);
                    Warranty::create([
                        'warranty_code'   => "FX{$year}-WR-{$randomCode}",
                        'repair_order_id' => $model->id,
                        'customer_id'     => $model->customer_id,
                        'device_model_id' => $model->device_model_id,
                        'coverage_item'   => $model->price_note ?? 'Dịch vụ sửa chữa',
                        'start_date'      => $now->toDateString(),
                        'duration_days'   => $model->warranty_terms_days,
                        'end_date'        => $now->copy()->addDays($model->warranty_terms_days)->toDateString(),
                        'status'          => 'active',
                    ]);
                } elseif ($model->warranties()->exists()) {
                    foreach ($model->warranties as $warranty) {
                        $duration = $warranty->duration_days ?: ($model->warranty_terms_days ?: 90);
                        $warranty->update([
                            'status'     => 'active',
                            'start_date' => $now->toDateString(),
                            'end_date'   => $now->copy()->addDays($duration)->toDateString(),
                        ]);
                    }
                }

                // Tích lũy doanh số khách hàng
                $customer = $model->customer;
                if ($customer) {
                    $customer->increment('orders_count');
                    $customer->increment('total_spent', $model->total_price);
                }
                break;
        }

        if (! empty($updates)) {
            $model->update($updates);
        }
    }

    /**
     * Ghi nhận Audit Log chuyển trạng thái đơn hàng.
     */
    protected function recordAuditLog(Model $model, string $oldStatus, string $newStatus, array $options): void
    {
        $adminId = $options['admin_id'] ?? (isset($options['user']) ? $options['user']->id : auth()->id());
        $adminName = $options['admin_name'] ?? (isset($options['user']) ? $options['user']->name : (auth()->user()?->name ?? 'Hệ thống'));

        AuditLog::create([
            'user_id'        => $adminId,
            'user_name'      => $adminName,
            'action'         => "Đổi trạng thái: {$oldStatus} -> {$newStatus}",
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $model->id,
            'details'        => "Đơn {$model->order_code} chuyển sang {$newStatus}" . (! empty($options['reason']) ? " ({$options['reason']})" : ''),
            'ip_address'     => $options['ip'] ?? request()->ip(),
        ]);
    }

    /**
     * Phát sinh thông báo vận hành và broadcast event realtime.
     */
    protected function handleSideEffects(Model $model, string $oldStatus, string $newStatus, array $options): void
    {
        $notificationData = match ($newStatus) {
            'waiting_approval', 'quote_pending' => [
                'title'      => 'Chờ khách duyệt báo giá',
                'message'    => "Đơn {$model->order_code} đã hoàn tất kiểm tra và đang chờ khách duyệt báo giá.",
                'severity'   => 'warning',
                'type'       => 'quote_action',
                'role'       => 'cskh',
                'event'      => 'quote.waiting_approval',
            ],
            'waiting_tech' => [
                'title'      => 'Đơn chờ kỹ thuật viên tiếp nhận',
                'message'    => "Đơn {$model->order_code} đã được duyệt và đang chờ kỹ thuật viên tiếp nhận.",
                'severity'   => 'info',
                'type'       => 'order_assigned',
                'role'       => 'technician',
                'event'      => 'order.waiting_tech',
            ],
            'assigned' => [
                'title'      => 'Kỹ thuật viên đã nhận đơn',
                'message'    => "Đơn {$model->order_code} đã được kỹ thuật viên tiếp nhận xử lý.",
                'severity'   => 'info',
                'type'       => 'order_assigned',
                'role'       => 'technician',
                'event'      => 'order.assigned',
            ],
            'in_repair' => [
                'title'      => 'Bắt đầu tiến trình sửa chữa',
                'message'    => "Đơn {$model->order_code} đang được kỹ thuật viên tiến hành sửa chữa.",
                'severity'   => 'info',
                'type'       => 'order_in_repair',
                'role'       => 'technician',
                'event'      => 'order.in_repair',
            ],
            'waiting_parts' => [
                'title'      => 'Đơn chờ linh kiện',
                'message'    => "Đơn {$model->order_code} tạm dừng để chờ linh kiện thay thế.",
                'severity'   => 'warning',
                'type'       => 'order_status',
                'role'       => null,
                'event'      => 'order.waiting_parts',
            ],
            'waiting_qc', 'qc_pending', 'qc_inspecting' => [
                'title'      => 'Đơn chờ kiểm định chất lượng (QC)',
                'message'    => "Đơn {$model->order_code} đã hoàn tất sửa chữa và chuyển sang bước kiểm định QC.",
                'severity'   => 'info',
                'type'       => 'qc_action',
                'role'       => 'qc',
                'event'      => 'qc.pending',
            ],
            'ready_for_return' => [
                'title'      => 'Đơn hàng sẵn sàng giao trả',
                'message'    => in_array($oldStatus, ['in_repair', 'assigned', 'rework_needed'], true)
                    ? "Đơn {$model->order_code} đã hoàn tất sửa chữa và sẵn sàng bàn giao cho khách."
                    : "Đơn {$model->order_code} đã hoàn tất kiểm định và sẵn sàng bàn giao cho khách.",
                'severity'   => 'success',
                'type'       => 'order_ready_delivery',
                'role'       => 'cskh',
                'event'      => 'order.ready_for_return',
            ],
            'waiting_pickup' => [
                'title'      => 'Khách chuẩn bị nhận máy',
                'message'    => "Đã thông báo khách hàng cho đơn {$model->order_code}, chờ khách tới nhận máy.",
                'severity'   => 'info',
                'type'       => 'order_status',
                'role'       => 'cskh',
                'event'      => 'order.waiting_pickup',
            ],
            'completed' => [
                'title'      => 'Đơn hàng hoàn tất bàn giao',
                'message'    => "Đơn {$model->order_code} đã bàn giao thành công cho khách hàng.",
                'severity'   => 'success',
                'type'       => 'order_completed',
                'role'       => null,
                'event'      => 'order.completed',
            ],
            'rejected' => [
                'title'      => 'Khách từ chối sửa chữa',
                'message'    => "Khách hàng từ chối sửa đơn {$model->order_code}" . (! empty($options['decline_reason']) ? ": {$options['decline_reason']}." : '.'),
                'severity'   => 'danger',
                'type'       => 'quote_action',
                'role'       => 'cskh',
                'event'      => 'order.rejected',
            ],
            'rework_needed' => [
                'title'      => 'QC yêu cầu làm lại (Rework)',
                'message'    => "Đơn {$model->order_code} không đạt chuẩn QC: " . (! empty($options['rework_reason']) ? $options['rework_reason'] : 'Cần kỹ thuật kiểm tra và làm lại.'),
                'severity'   => 'danger',
                'type'       => 'qc_action',
                'role'       => 'technician',
                'event'      => 'qc.rework_needed',
            ],
            'cancelled' => [
                'title'      => 'Đơn sửa chữa đã hủy',
                'message'    => "Đơn {$model->order_code} đã bị hủy trên hệ thống.",
                'severity'   => 'danger',
                'type'       => 'order_cancelled',
                'role'       => null,
                'event'      => 'order.cancelled',
            ],
            default => [
                'title'      => "Cập nhật trạng thái đơn {$model->order_code}",
                'message'    => "Đơn {$model->order_code} chuyển sang trạng thái {$newStatus}.",
                'severity'   => 'info',
                'type'       => 'order_status',
                'role'       => null,
                'event'      => 'order.status_updated',
            ],
        };

        $notif = Notification::create([
            'branch_id'  => $model->branch_id,
            'order_id'   => $model->id,
            'user_id'    => ($newStatus === 'assigned' ? ($model->technician_id ?? null) : null),
            'type'       => $notificationData['type'],
            'title'      => $notificationData['title'],
            'message'    => $notificationData['message'],
            'severity'   => $notificationData['severity'],
            'action_url' => "/repairs?id={$model->id}",
        ]);

        OrderOperationalEvent::dispatch(
            $notif->id,
            $model->id,
            $model->order_code,
            $notificationData['title'],
            $notificationData['message'],
            $notificationData['severity'],
            now()->toIso8601String(),
            "/repairs?id={$model->id}",
            $model->branch_id,
            $notificationData['role'],
            $notif->user_id,
            $notificationData['type'],
            $notificationData['event']
        );
    }
}
