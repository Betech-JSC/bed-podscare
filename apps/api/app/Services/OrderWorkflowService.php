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
use Illuminate\Support\Facades\DB;

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
        'waiting_tech'     => ['assigned', 'in_repair', 'waiting_qc', 'ready_for_return', 'cancelled'],
        'assigned'         => ['in_repair', 'waiting_qc', 'ready_for_return', 'waiting_parts', 'waiting_tech', 'assigned', 'cancelled'],
        'in_repair'        => ['waiting_parts', 'waiting_qc', 'qc_pending', 'qc_inspecting', 'ready_for_return', 'waiting_tech', 'assigned', 'cancelled'],
        'waiting_parts'    => ['in_repair', 'waiting_tech', 'assigned', 'waiting_qc', 'ready_for_return', 'cancelled'],
        'rework_needed'    => ['in_repair', 'waiting_qc', 'ready_for_return', 'waiting_parts', 'waiting_tech', 'assigned', 'cancelled'],
        'waiting_qc'       => ['ready_for_return', 'rework_needed', 'cancelled'],
        'qc_pending'       => ['ready_for_return', 'rework_needed', 'cancelled'],
        'qc_inspecting'    => ['ready_for_return', 'rework_needed', 'cancelled'],
        'ready_for_return' => ['waiting_pickup', 'completed', 'cancelled'],
        'waiting_pickup'   => ['completed', 'cancelled'],
        'completed'        => ['cancelled'],
        'cancelled'        => ['waiting_tech', 'in_repair'],
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
    protected function normalizeWorkflowStatus(string $status): string
    {
        return match ($status) {
            'qc_pending', 'qc_inspecting' => 'waiting_qc',
            'quote_pending'               => 'waiting_approval',
            default                       => $status,
        };
    }

    public function transition(Model $model, string $newStatus, array $options = []): Model
    {
        $newStatus = $this->normalizeWorkflowStatus($newStatus);
        $model->status = $this->normalizeWorkflowStatus((string) $model->status);

        // Tái phân công trong trạng thái assigned (KTV bàn giao cho KTV khác)
        if ($model->status === 'assigned' && $newStatus === 'assigned' && ! empty($options['technician_id'])) {
            $model->technician_id = $options['technician_id'];
            $model->tech_accepted_at = Carbon::now();
            $model->save();
            return $model->fresh();
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
     * Trích xuất tên role của user an toàn.
     */
    protected function resolveUserRole(mixed $user): string
    {
        if (! $user) {
            return '';
        }

        if (is_string($user->role ?? null)) {
            return $user->role;
        }

        return (string) ($user->role?->name ?? '');
    }

    /**
     * Kiểm tra user có thuộc nhóm Kỹ thuật viên hay không.
     */
    protected function isTechnicianUser(mixed $user): bool
    {
        return in_array($this->resolveUserRole($user), ['technician', 'tech'], true);
    }

    /**
     * Hook trước khi chuyển trạng thái: xác thực điều kiện nghiệp vụ.
     */
    protected function beforeTransition(Model $model, string $oldStatus, string $newStatus, array $options): void
    {
        $user = $options['user'] ?? auth()->user();
        $techStatuses = ['waiting_tech', 'assigned', 'in_repair', 'waiting_parts', 'rework_needed'];

        // Khi chuyển sang waiting_qc từ các bước kỹ thuật: bắt buộc xác thực KTV thực hiện
        if ($newStatus === 'waiting_qc' && in_array($oldStatus, $techStatuses, true)) {
            $passedTechId = $options['technician_id'] ?? null;
            if (! empty($passedTechId)) {
                $techUser = \App\Models\User::find($passedTechId);
                if (! $techUser || ! $this->isTechnicianUser($techUser)) {
                    throw new \DomainException(
                        'Kỹ thuật viên được chọn không hợp lệ. Vui lòng chọn đúng nhân sự có vai trò Kỹ thuật viên.'
                    );
                }
            }

            $effectiveTechId = ! empty($passedTechId)
                ? $passedTechId
                : ($model->technician_id ?: ($this->isTechnicianUser($user) ? $user?->id : null));

            if (! $effectiveTechId && ($oldStatus !== 'in_repair' || $this->resolveUserRole($user) === 'cskh')) {
                throw new \DomainException(
                    'Vui lòng chọn kỹ thuật viên thực hiện trước khi hoàn thành sửa chữa.'
                );
            }
        }

        // Khi chuyển sang ready_for_return:
        if ($newStatus === 'ready_for_return') {
            $passedTechId = $options['technician_id'] ?? null;
            if (! empty($passedTechId)) {
                $techUser = \App\Models\User::find($passedTechId);
                if (! $techUser || ! $this->isTechnicianUser($techUser)) {
                    throw new \DomainException(
                        'Kỹ thuật viên được chọn không hợp lệ. Vui lòng chọn đúng nhân sự có vai trò Kỹ thuật viên.'
                    );
                }
            }

            if (in_array($oldStatus, $techStatuses, true)) {
                $effectiveTechId = ! empty($passedTechId)
                    ? $passedTechId
                    : ($model->technician_id ?: ($this->isTechnicianUser($user) ? $user?->id : null));

                if (! $effectiveTechId) {
                    throw new \DomainException(
                        'Vui lòng chọn kỹ thuật viên thực hiện trước khi hoàn thành sửa chữa.'
                    );
                }

                // Tự động tạo QcInspection (pass) cho cả đơn thường lẫn đơn bảo hành trong luồng nghiệm thu 2 chặng
                $hasPassedQc = QcInspection::where('repair_order_id', $model->id)
                    ->where('result', 'pass')
                    ->exists();

                if (! $hasPassedQc) {
                    $inspectorId = $user?->id
                        ?? ($options['admin_id']
                        ?? ($effectiveTechId
                        ?? ($model->technician_id
                        ?? auth()->id())));

                    $defaultNote = $model->order_type === 'warranty'
                        ? 'Nghiệm thu hoàn thành sửa chữa bảo hành'
                        : 'Kỹ thuật viên nghiệm thu trực tiếp';

                    QcInspection::create([
                        'tenant_id'       => $model->tenant_id,
                        'repair_order_id' => $model->id,
                        'inspector_id'    => $inspectorId,
                        'result'          => 'pass',
                        'notes'           => $options['repair_note'] ?? ($model->repair_note ?? $defaultNote),
                    ]);
                }
            } else {
                // Từ bước waiting_qc chuyển sang ready_for_return: tự động tạo biên bản QC Pass cho mọi vai trò (CSKH, KTV, Admin) nếu chưa có
                $hasPassedQc = QcInspection::where('repair_order_id', $model->id)
                    ->where('result', 'pass')
                    ->exists();

                if (! $hasPassedQc) {
                    $inspectorId = $user?->id
                        ?? ($options['admin_id']
                        ?? ($passedTechId
                        ?? ($model->technician_id
                        ?? ($model->created_by_user_id
                        ?? auth()->id()))));

                    if ($inspectorId) {
                        $defaultNote = $model->order_type === 'warranty'
                            ? 'Nghiệm thu hoàn thành sửa chữa bảo hành'
                            : 'Nghiệm thu kiểm định chất lượng (QC Pass)';

                        QcInspection::create([
                            'tenant_id'       => $model->tenant_id,
                            'repair_order_id' => $model->id,
                            'inspector_id'    => $inspectorId,
                            'result'          => 'pass',
                            'notes'           => $options['repair_note'] ?? ($model->repair_note ?? $defaultNote),
                        ]);
                    }
                }
            }
        }

        // Khi chuyển sang completed: kiểm tra cổng thanh toán (Payment Gate) và đảm bảo có QcInspection (result = 'pass')
        if ($newStatus === 'completed') {
            $orderTotal = RepairOrder::normalizeVndAmount($model->total_price ?? 0);
            if ($orderTotal > 0) {
                $paidSum = RepairOrder::normalizeVndAmount($model->payments()->where('status', 'paid')->sum('amount'));
                if ($paidSum < $orderTotal) {
                    throw new \DomainException(
                        'Đơn hàng có chi phí sửa chữa (' . number_format($orderTotal, 0, ',', '.') . ' ₫) chưa được thanh toán đủ. Vui lòng thực hiện Thu tiền & Trả máy trước khi hoàn tất đơn.'
                    );
                }
            }

            $hasPassedQc = QcInspection::where('repair_order_id', $model->id)
                ->where('result', 'pass')
                ->exists();

            if (! $hasPassedQc) {
                $inspectorId = $user?->id
                    ?? ($options['admin_id']
                    ?? ($options['technician_id']
                    ?? ($model->technician_id
                    ?? ($model->created_by_user_id
                    ?? auth()->id()))));

                if ($inspectorId) {
                    $defaultNote = $model->order_type === 'warranty'
                        ? 'Nghiệm thu hoàn tất đơn bảo hành'
                        : 'Nghiệm thu hoàn tất đơn sửa chữa';

                    QcInspection::create([
                        'tenant_id'       => $model->tenant_id,
                        'repair_order_id' => $model->id,
                        'inspector_id'    => $inspectorId,
                        'result'          => 'pass',
                        'notes'           => $options['repair_note'] ?? ($model->repair_note ?? $defaultNote),
                    ]);
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
        $user = $options['user'] ?? auth()->user();
        $techStatuses = ['waiting_tech', 'assigned', 'in_repair', 'waiting_parts', 'rework_needed'];

        switch ($newStatus) {
            case 'inspecting':
                break;
            case 'waiting_tech':
                $updates['customer_approved_at'] = $now;
                $updates['technician_id'] = null;
                $updates['tech_accepted_at'] = null;
                break;
            case 'rejected':
                $updates['customer_declined_at'] = $now;
                $updates['decline_reason'] = $options['decline_reason'] ?? null;
                break;
            case 'assigned':
                if (! empty($options['technician_id'])) {
                    $updates['technician_id'] = $options['technician_id'];
                    $updates['tech_accepted_at'] = $now;
                } elseif ($this->isTechnicianUser($user)) {
                    $updates['technician_id'] = $user->id;
                    $updates['tech_accepted_at'] = $now;
                }
                break;
            case 'in_repair':
                if (! $model->repair_started_at) {
                    $updates['repair_started_at'] = $now;
                }
                if ($oldStatus === 'waiting_parts') {
                    $updates['paused_at'] = null;
                }
                if (! empty($options['technician_id'])) {
                    $updates['technician_id'] = $options['technician_id'];
                    $updates['tech_accepted_at'] = $now;
                } elseif ($this->isTechnicianUser($user)) {
                    $updates['technician_id'] = $user->id;
                    $updates['tech_accepted_at'] = $now;
                }
                break;
            case 'waiting_parts':
                $updates['paused_at'] = $now;
                if (! empty($options['parts_needed'])) {
                    $updates['parts_needed'] = $options['parts_needed'];
                }
                if (! empty($options['repair_note'])) {
                    $updates['repair_note'] = $options['repair_note'];
                }
                break;
            case 'waiting_qc':
            case 'qc_pending':
            case 'qc_inspecting':
                if ($oldStatus === 'waiting_parts') {
                    $updates['paused_at'] = null;
                }

                // Bảo vệ và gán technician_id hợp lệ khi chuyển sang waiting_qc từ các bước kỹ thuật
                if (! empty($options['technician_id'])) {
                    $techUser = \App\Models\User::find($options['technician_id']);
                    if ($techUser && $this->isTechnicianUser($techUser)) {
                        $updates['technician_id'] = $techUser->id;
                        if (! $model->tech_accepted_at) {
                            $updates['tech_accepted_at'] = $now;
                        }
                    }
                } elseif (! $model->technician_id && $this->isTechnicianUser($user)) {
                    $updates['technician_id'] = $user->id;
                    if (! $model->tech_accepted_at) {
                        $updates['tech_accepted_at'] = $now;
                    }
                }

                if (! $model->repair_started_at) {
                    $updates['repair_started_at'] = $model->tech_accepted_at ?? ($updates['tech_accepted_at'] ?? $now);
                }
                $updates['repair_completed_at'] = $now;
                if (! empty($options['repair_note'])) {
                    $updates['repair_note'] = $options['repair_note'];
                }
                if (! empty($options['parts_used'])) {
                    $updates['parts_used_summary'] = $options['parts_used'];
                } elseif (! empty($options['parts_used_summary'])) {
                    $updates['parts_used_summary'] = $options['parts_used_summary'];
                }
                if (! empty($options['final_check_result'])) {
                    $updates['final_check_result'] = mb_substr((string) $options['final_check_result'], 0, 255);
                }
                break;
            case 'ready_for_return':
                $updates['qc_passed_at'] = $now;
                if ($oldStatus === 'waiting_parts') {
                    $updates['paused_at'] = null;
                }

                // Bảo vệ và gán technician_id hợp lệ (chỉ gán ID của kỹ thuật viên, tuyệt đối không gán ID CSKH/Admin)
                if (! empty($options['technician_id'])) {
                    $techUser = \App\Models\User::find($options['technician_id']);
                    if ($techUser && $this->isTechnicianUser($techUser)) {
                        $updates['technician_id'] = $techUser->id;
                        if (! $model->tech_accepted_at) {
                            $updates['tech_accepted_at'] = $now;
                        }
                    }
                } elseif (! $model->technician_id && $this->isTechnicianUser($user)) {
                    $updates['technician_id'] = $user->id;
                    if (! $model->tech_accepted_at) {
                        $updates['tech_accepted_at'] = $now;
                    }
                }

                if (in_array($oldStatus, $techStatuses, true)) {
                    if (! $model->repair_started_at) {
                        $updates['repair_started_at'] = $now;
                    }
                    if (! $model->repair_completed_at) {
                        $updates['repair_completed_at'] = $now;
                    }
                } else {
                    if (! $model->repair_started_at) {
                        $updates['repair_started_at'] = $model->tech_accepted_at ?? $model->customer_approved_at ?? $model->created_at ?? $now;
                    }
                    if (! $model->repair_completed_at) {
                        $updates['repair_completed_at'] = $now;
                    }
                }

                if (! empty($options['repair_note'])) {
                    $updates['repair_note'] = $options['repair_note'];
                }
                if (! empty($options['parts_used'])) {
                    $updates['parts_used_summary'] = $options['parts_used'];
                }
                if (! empty($options['final_check_result'])) {
                    $updates['final_check_result'] = mb_substr((string) $options['final_check_result'], 0, 255);
                }
                break;
            case 'waiting_pickup':
                $updates['customer_notified_at'] = $now;
                break;
            case 'completed':
                $adminId = $options['admin_id'] ?? ($user?->id ?? auth()->id());
                if ($model instanceof RepairOrder) {
                    $this->completeOrderLifecycle($model, [
                        'actor_id'                 => $adminId,
                        'user'                     => $user,
                        'technician_id'            => $options['technician_id'] ?? null,
                        'repair_note'              => $options['repair_note'] ?? null,
                        'overwrite_handed_over_by' => true,
                    ]);
                }
                break;

            case 'cancelled':
                $adminId = $options['admin_id'] ?? ($user?->id ?? auth()->id());
                // Tự động hoàn kho nếu đơn đã từng xuất linh kiện
                $this->reverseInventoryForOrder($model, $adminId ? (int) $adminId : null, 'cancelled');
                break;
        }

        if (! empty($updates)) {
            $model->update($updates);
        }

        // Tự động trừ kho ngay khi bắt đầu sửa chữa (in_repair) hoặc khi nghiệm thu kỹ thuật (idempotent theo lượng ròng)
        if (in_array($newStatus, ['in_repair', 'waiting_qc', 'qc_pending', 'qc_inspecting', 'ready_for_return'], true) && $model instanceof RepairOrder) {
            $actorId = $options['admin_id']
                ?? ($user?->id
                ?? ($updates['technician_id']
                ?? ($model->technician_id
                ?? auth()->id())));
            $this->deductInventoryForOrder($model, $actorId ? (int) $actorId : null);
        }
    }

    /**
     * Hoàn tất toàn bộ vòng đời đơn sửa chữa tại một nơi duy nhất (Single Source of Truth):
     * - Đảm bảo biên bản QcInspection (result = 'pass')
     * - Cập nhật timestamps (repair_started_at, repair_completed_at, qc_passed_at, handed_over_at, delivered_at) và status = 'completed'
     * - Tự động trừ kho linh kiện (idempotent export_repair)
     * - Kích hoạt sổ bảo hành điện tử (hoặc đóng WarrantyClaim nếu là đơn bảo hành)
     * - Cộng dồn orders_count và total_spent nguyên tử cho khách hàng
     */
    public function completeOrderLifecycle(RepairOrder $order, array $context = []): RepairOrder
    {
        $now = Carbon::now();
        $user = $context['user'] ?? auth()->user();
        $actorId = $context['actor_id'] ?? ($context['admin_id'] ?? ($user?->id ?? auth()->id()));
        $isWarrantyOrder = ($order->order_type === 'warranty') || ! empty($order->claim_id);

        // 1. Đảm bảo có bản ghi QcInspection (result = 'pass') trước khi hoàn tất
        $hasPassedQc = QcInspection::where('repair_order_id', $order->id)
            ->where('result', 'pass')
            ->exists();

        if (! $hasPassedQc) {
            $inspectorId = $order->technician_id
                ?? ($context['technician_id']
                ?? ($actorId
                ?? $order->created_by_user_id));

            if ($inspectorId) {
                $defaultNote = $isWarrantyOrder
                    ? 'Nghiệm thu hoàn tất đơn bảo hành'
                    : 'Nghiệm thu hoàn tất đơn sửa chữa';

                QcInspection::create([
                    'tenant_id'       => $order->tenant_id,
                    'repair_order_id' => $order->id,
                    'inspector_id'    => $inspectorId,
                    'result'          => 'pass',
                    'notes'           => $context['repair_note'] ?? ($order->repair_note ?? $defaultNote),
                ]);
            }
        }

        $wasAlreadyCompleted = $order->getOriginal('status') === 'completed' && ! empty($order->getOriginal('handed_over_at'));

        // 2. Cập nhật trạng thái, timestamps kiểm toán và bảo toàn technician_id
        $order->status = 'completed';
        if (! $order->repair_started_at) {
            $order->repair_started_at = $order->tech_accepted_at ?? $order->customer_approved_at ?? $order->created_at ?? $now;
        }
        if (! $order->repair_completed_at) {
            $order->repair_completed_at = $order->qc_passed_at ?? $now;
        }
        if (! $order->qc_passed_at) {
            $order->qc_passed_at = $now;
        }
        if (! $order->handed_over_at) {
            $order->handed_over_at = $now;
        }
        if (! $order->delivered_at) {
            $order->delivered_at = $now;
        }
        if ((! $order->handed_over_by_user_id || ! empty($context['overwrite_handed_over_by'])) && $actorId) {
            $order->handed_over_by_user_id = $actorId;
        }

        if (! empty($context['technician_id'])) {
            $techUser = \App\Models\User::find($context['technician_id']);
            if ($techUser && $this->isTechnicianUser($techUser)) {
                $order->technician_id = $techUser->id;
            }
        } elseif (! $order->technician_id && $this->isTechnicianUser($user)) {
            $order->technician_id = $user->id;
        }

        if (array_key_exists('warranty_days', $context) && $context['warranty_days'] !== null) {
            $order->warranty_terms_days = (int) $context['warranty_days'];
        }

        $order->save();

        // 3. Tự động trừ tồn kho linh kiện đã sử dụng (export_repair - idempotent)
        $this->deductInventoryForOrder($order, $actorId ? (int) $actorId : null);

        // 4. Xử lý bảo hành & cộng dồn doanh số khách hàng (idempotent nếu đơn đã hoàn tất trước đó)
        $revenueAmount = array_key_exists('revenue_amount', $context) && $context['revenue_amount'] !== null
            ? (float) $context['revenue_amount']
            : (float) ($order->total_price ?? 0);

        if ($isWarrantyOrder) {
            $claimQuery = \App\Models\WarrantyClaim::query()->where('rework_order_id', $order->id);
            if (! empty($order->claim_id)) {
                $claimQuery->orWhere('id', $order->claim_id);
            }
            $claimQuery->update(['status' => 'resolved']);

            if (! $wasAlreadyCompleted && $order->customer_id && $revenueAmount > 0) {
                \App\Models\Customer::whereKey($order->customer_id)->increment('total_spent', $revenueAmount);
                if ($order->relationLoaded('customer') && $order->customer) {
                    $order->customer->total_spent = (float) ($order->customer->total_spent ?? 0) + $revenueAmount;
                }
            }
        } else {
            $warrantyDays = (int) ($context['warranty_days']
                ?? ($order->warranty_terms_days ?: ($context['default_warranty_days'] ?? 0)));

            $existingWarranties = $order->relationLoaded('warranties')
                ? $order->warranties
                : $order->warranties()->get();

            if ($warrantyDays > 0 && $existingWarranties->isEmpty()) {
                $year = date('y');
                do {
                    $randomCode = str_pad((string) random_int(100, 999999), 6, '0', STR_PAD_LEFT);
                    $warrantyCode = "FX{$year}-WR-{$randomCode}";
                } while (Warranty::withoutGlobalScopes()->where('warranty_code', $warrantyCode)->exists());

                Warranty::create([
                    'warranty_code'   => $warrantyCode,
                    'repair_order_id' => $order->id,
                    'customer_id'     => $order->customer_id,
                    'device_model_id' => $order->device_model_id,
                    'coverage_item'   => $order->price_note ?? 'Dịch vụ sửa chữa',
                    'start_date'      => $now->toDateString(),
                    'duration_days'   => $warrantyDays,
                    'end_date'        => $now->copy()->addDays($warrantyDays)->toDateString(),
                    'status'          => 'active',
                ]);
            } elseif ($existingWarranties->isNotEmpty()) {
                foreach ($existingWarranties as $warranty) {
                    $duration = (int) ($context['warranty_days']
                        ?? (! empty($context['default_warranty_days'])
                            ? ($order->warranty_terms_days ?: $context['default_warranty_days'])
                            : ($warranty->duration_days ?: ($order->warranty_terms_days ?: 90))));
                    $warranty->update([
                        'status'        => 'active',
                        'start_date'    => $now->toDateString(),
                        'duration_days' => $duration,
                        'end_date'      => $now->copy()->addDays($duration)->toDateString(),
                    ]);
                }
            }

            if (! $wasAlreadyCompleted && $order->customer_id) {
                \App\Models\Customer::whereKey($order->customer_id)->update([
                    'orders_count' => DB::raw('COALESCE(orders_count, 0) + 1'),
                    'total_spent'  => DB::raw('COALESCE(total_spent, 0) + ' . $revenueAmount),
                    'updated_at'   => $now,
                ]);

                if ($order->relationLoaded('customer') && $order->customer) {
                    $order->customer->orders_count = (int) ($order->customer->orders_count ?? 0) + 1;
                    $order->customer->total_spent = (float) ($order->customer->total_spent ?? 0) + $revenueAmount;
                }
            }
        }

        return $order;
    }

    /**
     * Phân giải toàn bộ linh kiện gắn với đơn sửa chữa thành mảng [part_id => total_quantity].
     * Hỗ trợ đồng thời:
     * 1. quote_items (thuộc báo giá approved / sent / draft của đơn)
     * 2. additional_services[].linked_parts, parts_used_summary, parts_needed (ánh xạ qua part_id, sku hoặc tên)
     */
    protected function resolveOrderPartsForInventory(RepairOrder $order): array
    {
        $requiredByPartId = [];

        // 1. Nguồn chuẩn từ bảng quote_items
        $quoteItems = \App\Models\QuoteItem::whereHas('quote', function ($q) use ($order) {
            $q->withoutGlobalScopes()
              ->where('repair_order_id', $order->id)
              ->where(function ($sq) {
                  $sq->whereIn('status', ['approved', 'sent', 'draft'])
                     ->orWhereNull('status');
              });
        })->whereNotNull('part_id')
          ->where('quantity', '>', 0)
          ->get();

        foreach ($quoteItems as $item) {
            $pid = (int) $item->part_id;
            $qty = max(1, (int) $item->quantity);
            $requiredByPartId[$pid] = ($requiredByPartId[$pid] ?? 0) + $qty;
        }

        // 2. Nguồn linh kiện gắn trực tiếp trên đơn (additional_services, parts_used_summary, parts_needed)
        $extractCandidates = function (mixed $raw): array {
            if (empty($raw)) {
                return [];
            }

            if (is_string($raw)) {
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) {
                    $raw = $decoded;
                } else {
                    // Hỗ trợ chuỗi chứa mã SKU (ví dụ: "Pin tai nghe (BAT-APP2C-L) x2", "LK-AP-PIN-CAP (x2)", "[BAT-APP2-01] x2")
                    $matches = [];
                    if (preg_match_all('/\b([A-Z0-9]{2,}(?:-[A-Z0-9]+)+)\b[\)\]]?(?:\s*(?:\(\s*[x×*]?(\d+)\s*\)|[x×*]\s*(\d+)))?/iu', $raw, $matches, PREG_SET_ORDER)) {
                        $items = [];
                        foreach ($matches as $m) {
                            $qty = ! empty($m[2]) ? (int) $m[2] : (! empty($m[3]) ? (int) $m[3] : 1);
                            $items[] = [
                                'sku'      => strtoupper(trim($m[1])),
                                'quantity' => max(1, $qty),
                            ];
                        }
                        return $items;
                    }
                    return [];
                }
            }

            if (! is_array($raw)) {
                return [];
            }

            $entries = [];
            foreach ($raw as $entry) {
                if (! is_array($entry)) {
                    if (is_string($entry) && preg_match_all('/\b([A-Z0-9]{2,}(?:-[A-Z0-9]+)+)\b[\)\]]?(?:\s*(?:\(\s*[x×*]?(\d+)\s*\)|[x×*]\s*(\d+)))?/iu', $entry, $entryMatches, PREG_SET_ORDER)) {
                        foreach ($entryMatches as $m) {
                            $qty = ! empty($m[2]) ? (int) $m[2] : (! empty($m[3]) ? (int) $m[3] : 1);
                            $entries[] = [
                                'sku'      => strtoupper(trim($m[1])),
                                'quantity' => max(1, $qty),
                            ];
                        }
                    }
                    continue;
                }

                // Nếu phần tử là một service chứa mảng linked_parts
                if (! empty($entry['linked_parts']) && is_array($entry['linked_parts'])) {
                    foreach ($entry['linked_parts'] as $lp) {
                        if (is_array($lp)) {
                            $entries[] = [
                                'part_id'  => $lp['part_id'] ?? ($lp['id'] ?? null),
                                'sku'      => $lp['part_sku'] ?? ($lp['sku'] ?? null),
                                'name'     => $lp['part_name'] ?? ($lp['name'] ?? null),
                                'quantity' => max(1, (int) ($lp['quantity'] ?? ($lp['qty'] ?? 1))),
                            ];
                        }
                    }
                    continue;
                }

                if (! empty($entry['part_id']) || ! empty($entry['part_sku']) || ! empty($entry['sku']) || ! empty($entry['part_name'])) {
                    $entries[] = [
                        'part_id'  => $entry['part_id'] ?? null,
                        'sku'      => $entry['part_sku'] ?? ($entry['sku'] ?? null),
                        'name'     => $entry['part_name'] ?? ($entry['name'] ?? null),
                        'quantity' => max(1, (int) ($entry['quantity'] ?? ($entry['qty'] ?? 1))),
                    ];
                }
            }

            return $entries;
        };

        $sourceGroups = [
            $extractCandidates($order->additional_services),
            $extractCandidates($order->parts_used_summary),
            $extractCandidates($order->parts_needed),
        ];

        $skuAliases = [
            'LK-AP-PIN-CAP'     => 'BAT-APP2-01',
            'LK-AP-SEAL-KEO'    => 'MESH-APP-02',
            'LK-AP-MIC-ANC'     => 'MESH-APP-02',
            'LK-AP-LOA-ANC'     => 'MESH-APP-02',
            'LK-AP-DRIVER'      => 'MESH-APP-02',
            'LK-AP-MESH'        => 'MESH-APP-02',
            'LK-AP-CASE-FLEX'   => 'FLEX-CASE-01',
            'LK-AP-CASE-PIN'    => 'CASE-APP2-04',
            'MIC-APP-ANC'       => 'MESH-APP-02',
            'DRV-APP-TITAN'     => 'MESH-APP-02',
            'CAP-FLEX-APP'      => 'FLEX-CASE-01',
            'BAT-CASE-APP'      => 'CASE-APP2-04',
            'IC-CHG-APP'        => 'CASE-APP2-04',
            'LK-AW-PIN'         => 'AW-BAT-01',
            'AW-PIN-STD'        => 'AW-BAT-01',
            'BAT-AW-STD'        => 'AW-BAT-01',
            'LK-AW-SEAL'        => 'AW-BAT-01',
            'SEAL-AW-WP'        => 'AW-BAT-01',
            'LK-AW-GLASS-TOUCH' => 'AW-GLASS-01',
            'AW-GLASS-TOUCH'    => 'AW-GLASS-01',
            'GLS-AW-OCA'        => 'AW-GLASS-01',
            'TP-AW-ZIN'         => 'AW-GLASS-01',
            'FLEX-AW-CROWN'     => 'AW-GLASS-01',
            'TAP-AW-ENG'        => 'AW-GLASS-01',
            'LK-PEN-TIP-COIL'   => 'APEN-TIP-01',
            'PEN-BAT-CELL'      => 'APEN-TIP-01',
            'PEN-TIP-COIL'      => 'APEN-TIP-01',
        ];

        $resolveEntriesToPartQuantities = function (array $entries) use ($order, $skuAliases): array {
            if (empty($entries)) {
                return [];
            }

            $partIds = [];
            $skus = [];
            $names = [];
            foreach ($entries as $e) {
                if (! empty($e['part_id']) && is_numeric($e['part_id'])) {
                    $partIds[] = (int) $e['part_id'];
                }
                if (! empty($e['sku']) && is_string($e['sku'])) {
                    $upperSku = strtoupper(trim($e['sku']));
                    $skus[] = $upperSku;
                    if (isset($skuAliases[$upperSku])) {
                        $skus[] = $skuAliases[$upperSku];
                    }
                }
                if (empty($e['part_id']) && empty($e['sku']) && ! empty($e['name']) && is_string($e['name'])) {
                    $names[] = trim($e['name']);
                }
            }

            $query = \App\Models\Part::withoutGlobalScopes();
            if (! empty($order->tenant_id)) {
                $query->where(function ($q) use ($order) {
                    $q->where('tenant_id', $order->tenant_id)
                      ->orWhereNull('tenant_id');
                });
            }

            $query->where(function ($q) use ($partIds, $skus, $names) {
                if (! empty($partIds)) {
                    $q->orWhereIn('id', array_unique($partIds));
                }
                if (! empty($skus)) {
                    $q->orWhereIn('sku', array_unique($skus));
                }
                if (! empty($names)) {
                    $q->orWhereIn('name', array_unique($names));
                }
            });

            $matchedParts = $query->get();
            if ($matchedParts->isEmpty()) {
                return [];
            }

            $byId = $matchedParts->keyBy('id');
            $bySku = $matchedParts->keyBy(fn ($p) => strtoupper((string) $p->sku));
            $byName = $matchedParts->keyBy(fn ($p) => mb_strtolower(trim((string) $p->name)));

            $resolved = [];
            foreach ($entries as $e) {
                $part = null;
                if (! empty($e['part_id']) && is_numeric($e['part_id'])) {
                    $part = $byId->get((int) $e['part_id']);
                }
                if (! $part && ! empty($e['sku'])) {
                    $upperSku = strtoupper(trim((string) $e['sku']));
                    $part = $bySku->get($upperSku);
                    if (! $part && isset($skuAliases[$upperSku])) {
                        $part = $bySku->get($skuAliases[$upperSku]);
                    }
                }
                if (! $part && ! empty($e['name'])) {
                    $part = $byName->get(mb_strtolower(trim((string) $e['name'])));
                }

                if ($part) {
                    $pid = (int) $part->id;
                    $qty = max(1, (int) ($e['quantity'] ?? 1));
                    $resolved[$pid] = ($resolved[$pid] ?? 0) + $qty;
                }
            }

            return $resolved;
        };

        foreach ($sourceGroups as $candidateGroup) {
            $groupResolved = $resolveEntriesToPartQuantities($candidateGroup);
            foreach ($groupResolved as $pid => $qty) {
                // Chỉ bổ sung nếu part_id này chưa được khai báo ở nguồn có độ ưu tiên cao hơn (tránh nhân đôi giữa QuoteItem, additional_services và parts_needed)
                if (! isset($requiredByPartId[$pid])) {
                    $requiredByPartId[$pid] = $qty;
                }
            }
        }

        if (empty($requiredByPartId) && $quoteItems->isEmpty()) {
            $standardParts = $this->resolveStandardPartsFromIssueDescription($order);
            foreach ($standardParts as $stdPart) {
                $qty = max(1, (int) ($stdPart->resolved_quantity ?? 1));
                $requiredByPartId[(int) $stdPart->id] = ($requiredByPartId[(int) $stdPart->id] ?? 0) + $qty;
            }
        }

        return $requiredByPartId;
    }

    /**
     * Tự động tra cứu Linh kiện Kho chuẩn (parts) theo mô tả lỗi phổ biến (issue_description) của đơn hàng thuộc đúng tenant.
     * Hỗ trợ phân biệt rõ dòng máy và 3 phạm vi Tai Trái (L), Tai Phải (R), Cả 2 tai (L + R).
     *
     * @return \Illuminate\Support\Collection<int, \App\Models\Part>
     */
    public function resolveStandardPartsFromIssueDescription(RepairOrder $order): \Illuminate\Support\Collection
    {
        $issueText = mb_strtolower(trim((string) ($order->issue_description ?? '')));
        if ($issueText === '' || (str_contains($issueText, 'vệ sinh') && ! str_contains($issueText, 'lưới')) || empty($order->tenant_id)) {
            return collect();
        }

        $order->loadMissing('deviceModel');
        $category = mb_strtolower((string) ($order->deviceModel?->category ?? ''));
        $modelName = mb_strtolower((string) ($order->deviceModel?->name ?? ''));
        $modelCode = mb_strtolower((string) ($order->deviceModel?->model_code ?? ''));
        $combinedModel = $modelName . ' ' . $modelCode . ' ' . $issueText;

        $primarySkuQuantities = [];
        $fallbackSkuQuantities = [];

        if (
            str_contains($category, 'watch')
            || str_contains($issueText, 'apple watch')
            || str_contains($issueText, 'digital crown')
            || str_contains($issueText, 'taptic')
            || str_contains($issueText, 'ép kính')
            || str_contains($issueText, 'ép mặt kính')
            || str_contains($issueText, 'vỡ mặt kính')
        ) {
            $watchPrefix = null;
            if (str_contains($combinedModel, 'ultra 2') || str_contains($combinedModel, 'mreg3')) {
                $watchPrefix = 'AWU2-49';
            } elseif (str_contains($combinedModel, 'ultra') || str_contains($combinedModel, 'a2622')) {
                $watchPrefix = 'AWU1-49';
            } elseif (str_contains($combinedModel, 'series 9') || str_contains($combinedModel, 's9') || str_contains($combinedModel, 'mr993')) {
                $watchPrefix = 'AWS9-45';
            } elseif (str_contains($combinedModel, 'series 8') || str_contains($combinedModel, 's8') || str_contains($combinedModel, 'a2771')) {
                $watchPrefix = 'AWS8-45';
            } elseif (str_contains($combinedModel, 'series 7') || str_contains($combinedModel, 's7') || str_contains($combinedModel, 'a2474')) {
                $watchPrefix = 'AWS7-45';
            }

            if (str_contains($issueText, 'pin') || str_contains($issueText, 'nguồn')) {
                $primarySkuQuantities = $watchPrefix ? ["BAT-{$watchPrefix}" => 1] : ['AW-BAT-01' => 1];
                $fallbackSkuQuantities = ['AW-BAT-01' => 1];
            } elseif (str_contains($issueText, 'oled') || str_contains($issueText, 'nguyên bộ')) {
                $primarySkuQuantities = $watchPrefix ? ["SCR-{$watchPrefix}" => 1] : ['AW-GLASS-01' => 1];
                $fallbackSkuQuantities = ['AW-GLASS-01' => 1];
            } elseif (str_contains($issueText, 'crown') || str_contains($issueText, 'nút xoay')) {
                $primarySkuQuantities = $watchPrefix ? ["CRW-{$watchPrefix}" => 1] : ['AW-GLASS-01' => 1];
                $fallbackSkuQuantities = ['AW-GLASS-01' => 1];
            } elseif (str_contains($issueText, 'taptic') || str_contains($issueText, 'cục rung')) {
                $primarySkuQuantities = $watchPrefix ? ["TAP-{$watchPrefix}" => 1] : ['AW-GLASS-01' => 1];
                $fallbackSkuQuantities = ['AW-GLASS-01' => 1];
            } elseif (str_contains($issueText, 'kính') || str_contains($issueText, 'cảm ứng') || str_contains($issueText, 'liệt') || str_contains($issueText, 'nút') || str_contains($issueText, 'màn hình')) {
                $primarySkuQuantities = $watchPrefix ? ["GLS-{$watchPrefix}" => 1] : ['AW-GLASS-01' => 1];
                $fallbackSkuQuantities = ['AW-GLASS-01' => 1];
            }
        } elseif (str_contains($category, 'pencil') || str_contains($issueText, 'pencil') || str_contains($issueText, 'đầu ngòi')) {
            $penPrefix = null;
            if (str_contains($combinedModel, 'pencil pro') || str_contains($combinedModel, 'mx2d3')) {
                $penPrefix = 'PENPRO';
            } elseif (str_contains($combinedModel, 'pencil 2') || str_contains($combinedModel, 'mu8f2')) {
                $penPrefix = 'PEN2';
            }

            if ($penPrefix && (str_contains($issueText, 'pin') || str_contains($issueText, 'sập nguồn'))) {
                $primarySkuQuantities = ["BAT-{$penPrefix}" => 1];
                $fallbackSkuQuantities = ['APEN-TIP-01' => 1];
            } elseif ($penPrefix && (str_contains($issueText, 'bluetooth') || str_contains($issueText, 'cuộn sạc') || str_contains($issueText, 'mạch'))) {
                $primarySkuQuantities = ["PCB-{$penPrefix}" => 1];
                $fallbackSkuQuantities = ['APEN-TIP-01' => 1];
            } elseif ($penPrefix) {
                $primarySkuQuantities = ["TIP-{$penPrefix}" => 1];
                $fallbackSkuQuantities = ['APEN-TIP-01' => 1];
            } else {
                $primarySkuQuantities = ['APEN-TIP-01' => 1];
            }
        } else {
            // AirPods
            $apPrefix = 'APP2C';
            if (str_contains($combinedModel, 'airpods max') || str_contains($combinedModel, 'a2096') || str_contains($combinedModel, 'mgyh3')) {
                $apPrefix = 'APM';
            } elseif (
                str_contains($combinedModel, 'pro 2')
                || str_contains($combinedModel, 'a2698')
                || str_contains($combinedModel, 'a2699')
                || str_contains($combinedModel, 'a3047')
                || str_contains($combinedModel, 'a3048')
                || str_contains($combinedModel, 'mtjv3')
                || str_contains($combinedModel, 'mqd83')
            ) {
                $apPrefix = (str_contains($combinedModel, 'lightning') || str_contains($combinedModel, 'a2698') || str_contains($combinedModel, 'a2699') || str_contains($combinedModel, 'mqd83'))
                    ? 'APP2L'
                    : 'APP2C';
            } elseif (str_contains($combinedModel, 'airpods pro') || str_contains($combinedModel, 'a2083') || str_contains($combinedModel, 'a2084') || str_contains($combinedModel, 'mlwk3')) {
                $apPrefix = 'APP1';
            } elseif (str_contains($combinedModel, 'airpods 3') || str_contains($combinedModel, 'a2564') || str_contains($combinedModel, 'a2565') || str_contains($combinedModel, 'mme73')) {
                $apPrefix = 'AP3';
            } elseif (str_contains($combinedModel, 'airpods 2') || str_contains($combinedModel, 'a2031') || str_contains($combinedModel, 'a2032') || str_contains($combinedModel, 'mv7n2')) {
                $apPrefix = 'AP2';
            }

            $scope = 'GENERIC';
            if (
                str_contains($issueText, 'cả 2 tai')
                || str_contains($issueText, '2 tai')
                || str_contains($issueText, 'hai tai')
                || str_contains($issueText, 'cả hai tai')
                || str_contains($issueText, 'cả 2 bên')
                || str_contains($issueText, '2 bên')
                || str_contains($issueText, 'l + r')
                || str_contains($issueText, 'l+r')
            ) {
                $scope = 'LR';
            } elseif (str_contains($issueText, 'tai trái') || str_contains($issueText, 'bên trái') || preg_match('/\(\s*l\s*\)/i', $issueText)) {
                $scope = 'L';
            } elseif (str_contains($issueText, 'tai phải') || str_contains($issueText, 'bên phải') || preg_match('/\(\s*r\s*\)/i', $issueText)) {
                $scope = 'R';
            }

            if (str_contains($issueText, 'xoay') || str_contains($issueText, 'headband')) {
                $primarySkuQuantities = ['FLEX-SWIVEL-APM' => 1];
                $fallbackSkuQuantities = ['FLEX-CASE-01' => 1];
            } elseif ($apPrefix === 'APM' && (str_contains($issueText, 'chân sạc') || str_contains($issueText, 'cổng sạc'))) {
                $primarySkuQuantities = ['FLEX-PORT-APM' => 1];
                $fallbackSkuQuantities = ['FLEX-CASE-01' => 1];
            } elseif (str_contains($issueText, 'hộp sạc') || str_contains($issueText, 'case') || str_contains($issueText, 'chân tiếp xúc') || str_contains($issueText, 'không nhận sạc')) {
                $casePrefix = $apPrefix === 'APM' ? 'APP2C' : $apPrefix;
                if (str_contains($issueText, 'pin hộp sạc') || (str_contains($issueText, 'pin') && ! str_contains($issueText, 'cáp'))) {
                    $primarySkuQuantities = ["BAT-CASE-{$casePrefix}" => 1];
                    $fallbackSkuQuantities = ['CASE-APP2-04' => 1];
                } elseif (str_contains($issueText, 'cáp flex') || str_contains($issueText, 'chân tiếp xúc')) {
                    $primarySkuQuantities = ["FLEX-CASE-{$casePrefix}" => 1];
                    $fallbackSkuQuantities = ['FLEX-CASE-01' => 1];
                } else {
                    $primarySkuQuantities = ['FLEX-CASE-01' => 1, 'CASE-APP2-04' => 1];
                    $fallbackSkuQuantities = ["BAT-CASE-{$casePrefix}" => 1, "FLEX-CASE-{$casePrefix}" => 1];
                }
            } else {
                $partType = null;
                $legacyFallback = [];

                if (str_contains($issueText, 'lưới')) {
                    $partType = 'MESH';
                    $legacyFallback = ['MESH-APP-02' => 1];
                } elseif (str_contains($issueText, 'mic') && ! str_contains($issueText, 'loa')) {
                    $partType = 'MIC';
                    $legacyFallback = ['MESH-APP-02' => 1, 'FLEX-CASE-01' => 1];
                } elseif (
                    str_contains($issueText, 'loa')
                    || str_contains($issueText, 'anc')
                    || str_contains($issueText, 'chống ồn')
                    || str_contains($issueText, 'rít')
                    || str_contains($issueText, 'xuyên âm')
                    || str_contains($issueText, 'nhỏ tiếng')
                    || str_contains($issueText, 'bass')
                    || str_contains($issueText, 'rè')
                ) {
                    $partType = 'SPK';
                    $legacyFallback = (str_contains($issueText, 'anc') || str_contains($issueText, 'chống ồn') || str_contains($issueText, 'rít') || str_contains($issueText, 'xuyên âm'))
                        ? ['MESH-APP-02' => 1, 'FLEX-CASE-01' => 1]
                        : ['MESH-APP-02' => 1];
                } elseif (str_contains($issueText, 'pin') || str_contains($issueText, 'chai') || str_contains($issueText, 'tụt')) {
                    $partType = 'BAT';
                    $legacyFallback = ['BAT-APP2-01' => 1];
                }

                if ($partType !== null) {
                    if ($scope === 'L') {
                        $primarySkuQuantities = ["{$partType}-{$apPrefix}-L" => 1];
                        $fallbackSkuQuantities = $legacyFallback;
                    } elseif ($scope === 'R') {
                        $primarySkuQuantities = ["{$partType}-{$apPrefix}-R" => 1];
                        $fallbackSkuQuantities = $legacyFallback;
                    } elseif ($scope === 'LR') {
                        $primarySkuQuantities = [
                            "{$partType}-{$apPrefix}-L" => 1,
                            "{$partType}-{$apPrefix}-R" => 1,
                        ];
                        $fallbackSkuQuantities = array_map(fn () => 2, $legacyFallback);
                    } else {
                        $primarySkuQuantities = $legacyFallback;
                        $fallbackSkuQuantities = ["{$partType}-{$apPrefix}-L" => 1];
                    }
                }
            }
        }

        if (empty($primarySkuQuantities) && empty($fallbackSkuQuantities)) {
            return collect();
        }

        $fetchBySkuMap = function (array $skuQtyMap) use ($order): \Illuminate\Support\Collection {
            if (empty($skuQtyMap)) {
                return collect();
            }

            $parts = \App\Models\Part::withoutGlobalScopes()
                ->where('tenant_id', $order->tenant_id)
                ->whereIn('sku', array_keys($skuQtyMap))
                ->get();

            foreach ($parts as $p) {
                $upper = strtoupper((string) $p->sku);
                $p->setAttribute('resolved_quantity', max(1, (int) ($skuQtyMap[$upper] ?? 1)));
            }

            return $parts;
        };

        $matchedPrimary = $fetchBySkuMap($primarySkuQuantities);
        if ($matchedPrimary->isNotEmpty()) {
            return $matchedPrimary;
        }

        return $fetchBySkuMap($fallbackSkuQuantities);
    }

    /**
     * Tự động trừ tồn kho linh kiện khi kỹ thuật bắt đầu sửa chữa (in_repair) hoặc khi hoàn tất (export_repair).
     * Đảm bảo Net Idempotency: chỉ trừ phần chênh lệch giữa số lượng cần dùng và số lượng ròng đã xuất (export_repair trừ import_reversal/import_return).
     */
    public function deductInventoryForOrder(RepairOrder $order, ?int $userId = null): void
    {
        DB::transaction(function () use ($order, $userId) {
            $requiredByPartId = $this->resolveOrderPartsForInventory($order);
            if (empty($requiredByPartId)) {
                return;
            }

            $partIds = array_keys($requiredByPartId);

            $partsById = \App\Models\Part::withoutGlobalScopes()
                ->whereIn('id', $partIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $branchPartsByPartId = \App\Models\BranchPart::where('branch_id', $order->branch_id)
                ->whereIn('part_id', $partIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('part_id');

            $existingOrderTxs = \App\Models\InventoryTransaction::where('repair_order_id', $order->id)
                ->whereIn('part_id', $partIds)
                ->whereIn('transaction_type', ['export_repair', 'import_reversal', 'import_return'])
                ->lockForUpdate()
                ->get();

            $date = date('Ymd');
            $actorId = $userId ?? $order->handed_over_by_user_id ?? $order->technician_id ?? $order->created_by_user_id ?? auth()->id();

            $existingTxCodes = \App\Models\InventoryTransaction::where('transaction_code', 'like', "TX-{$date}-%")
                ->pluck('transaction_code')
                ->flip();

            foreach ($requiredByPartId as $partId => $requiredQty) {
                $part = $partsById->get($partId);
                if (! $part) {
                    continue;
                }

                $partTxs = $existingOrderTxs->where('part_id', $partId);
                $exportedQty = (int) $partTxs
                    ->where('transaction_type', 'export_repair')
                    ->sum(fn ($tx) => abs((int) $tx->quantity));
                $reversedQty = (int) $partTxs
                    ->whereIn('transaction_type', ['import_reversal', 'import_return'])
                    ->sum(fn ($tx) => abs((int) $tx->quantity));

                $netDeductedQty = max(0, $exportedQty - $reversedQty);
                $qtyToDeduct = (int) $requiredQty - $netDeductedQty;

                if ($qtyToDeduct <= 0) {
                    continue;
                }

                $branchPart = $branchPartsByPartId->get($partId);

                if (! $branchPart) {
                    $branchPart = \App\Models\BranchPart::create([
                        'branch_id'       => $order->branch_id,
                        'part_id'         => $partId,
                        'stock_quantity'  => 0,
                        'min_stock_alert' => $part->min_stock_alert ?? 5,
                    ]);
                    $branchPartsByPartId->put($partId, $branchPart);
                }

                do {
                    $rand = str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
                    $txCode = "TX-{$date}-{$rand}";
                } while ($existingTxCodes->has($txCode));
                $existingTxCodes->put($txCode, true);

                \App\Models\InventoryTransaction::create([
                    'transaction_code'   => $txCode,
                    'part_id'            => $partId,
                    'branch_id'          => $order->branch_id,
                    'repair_order_id'    => $order->id,
                    'transaction_type'   => 'export_repair',
                    'quantity'           => -$qtyToDeduct,
                    'unit_cost'          => (float) ($part->cost_price ?? 0),
                    'notes'              => "Xuất kho tự động cho đơn sửa chữa {$order->order_code}",
                    'created_by_user_id' => $actorId,
                ]);

                $branchPart->decrement('stock_quantity', $qtyToDeduct);
                $part->decrement('stock_quantity', $qtyToDeduct);
            }
        });
    }

    /**
     * Tự động hoàn kho linh kiện khi đơn hàng bị hoàn trả, hủy hoặc xóa (import_reversal).
     * Đảm bảo Net Idempotency: chỉ hoàn trả phần chênh lệch ròng (export_repair trừ import_reversal/import_return) chưa được hoàn.
     */
    public function reverseInventoryForOrder(RepairOrder $order, ?int $userId = null, string $reason = 'cancelled'): void
    {
        DB::transaction(function () use ($order, $userId, $reason) {
            $orderTxs = \App\Models\InventoryTransaction::where('repair_order_id', $order->id)
                ->whereIn('transaction_type', ['export_repair', 'import_reversal', 'import_return'])
                ->lockForUpdate()
                ->get();

            $exportTxs = $orderTxs->where('transaction_type', 'export_repair');
            if ($exportTxs->isEmpty()) {
                return;
            }

            $partIds = $exportTxs->pluck('part_id')->filter()->unique()->values()->all();
            $branchIds = $exportTxs->pluck('branch_id')->filter()->unique()->values()->all();

            $partsById = ! empty($partIds)
                ? \App\Models\Part::withoutGlobalScopes()->whereIn('id', $partIds)->lockForUpdate()->get()->keyBy('id')
                : collect();

            $branchPartsByKey = (! empty($branchIds) && ! empty($partIds))
                ? \App\Models\BranchPart::whereIn('branch_id', $branchIds)
                    ->whereIn('part_id', $partIds)
                    ->lockForUpdate()
                    ->get()
                    ->keyBy(fn ($bp) => $bp->branch_id . ':' . $bp->part_id)
                : collect();

            $date = date('Ymd');
            $actorId = $userId ?? $order->handed_over_by_user_id ?? $order->technician_id ?? $order->created_by_user_id ?? auth()->id();

            $existingTxCodes = \App\Models\InventoryTransaction::where('transaction_code', 'like', "TX-{$date}-%")
                ->pluck('transaction_code')
                ->flip();

            $groupedExports = $exportTxs->groupBy(fn ($tx) => $tx->branch_id . ':' . $tx->part_id);

            foreach ($groupedExports as $groupKey => $groupExportTxs) {
                $firstExport = $groupExportTxs->first();
                $branchId = (int) $firstExport->branch_id;
                $partId = (int) $firstExport->part_id;

                $exportedQty = (int) $groupExportTxs->sum(fn ($tx) => abs((int) $tx->quantity));
                $alreadyRestoredQty = (int) $orderTxs
                    ->where('branch_id', $branchId)
                    ->where('part_id', $partId)
                    ->whereIn('transaction_type', ['import_reversal', 'import_return'])
                    ->sum(fn ($tx) => abs((int) $tx->quantity));

                $reverseQty = max(0, $exportedQty - $alreadyRestoredQty);
                if ($reverseQty <= 0) {
                    continue;
                }

                $branchPart = $branchPartsByKey->get($groupKey);
                if ($branchPart) {
                    $branchPart->increment('stock_quantity', $reverseQty);
                }

                $part = $partsById->get($partId);
                if ($part) {
                    $part->increment('stock_quantity', $reverseQty);
                }

                do {
                    $rand = str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
                    $txCode = "TX-{$date}-{$rand}";
                } while ($existingTxCodes->has($txCode));
                $existingTxCodes->put($txCode, true);

                $note = $reason === 'deleted'
                    ? "Hoàn kho tự động do xóa đơn sửa chữa {$order->order_code}"
                    : "Hoàn kho tự động do hoàn trả / hủy đơn sửa chữa {$order->order_code}";

                \App\Models\InventoryTransaction::create([
                    'transaction_code'   => $txCode,
                    'part_id'            => $partId,
                    'branch_id'          => $branchId,
                    'repair_order_id'    => $order->id,
                    'transaction_type'   => 'import_reversal',
                    'quantity'           => $reverseQty,
                    'unit_cost'          => $firstExport->unit_cost,
                    'notes'              => $note,
                    'created_by_user_id' => $actorId,
                ]);
            }
        });
    }

    /**
     * Tự động hoàn kho linh kiện khi đơn hàng bị hoàn tiền (import_return).
     * Đảm bảo Idempotency: không hoàn trả lần hai nếu đã từng hoàn kho (import_return hoặc import_reversal) cho đơn này.
     */
    public function restockInventoryForOrder(RepairOrder $order, ?int $userId = null, string $reason = 'refund'): void
    {
        DB::transaction(function () use ($order, $userId, $reason) {
            $exportTxs = \App\Models\InventoryTransaction::where('repair_order_id', $order->id)
                ->where('transaction_type', 'export_repair')
                ->get();

            if ($exportTxs->isEmpty()) {
                return;
            }

            // Idempotency check: Chỉ hoàn kho nếu chưa từng có import_return hoặc import_reversal cho đơn này
            $alreadyRestocked = \App\Models\InventoryTransaction::where('repair_order_id', $order->id)
                ->whereIn('transaction_type', ['import_return', 'import_reversal'])
                ->exists();

            if ($alreadyRestocked) {
                return;
            }

            $partIds = $exportTxs->pluck('part_id')->filter()->unique()->values()->all();
            $branchIds = $exportTxs->pluck('branch_id')->filter()->unique()->values()->all();

            $partsById = ! empty($partIds)
                ? \App\Models\Part::withoutGlobalScopes()->whereIn('id', $partIds)->lockForUpdate()->get()->keyBy('id')
                : collect();

            $branchPartsByKey = (! empty($branchIds) && ! empty($partIds))
                ? \App\Models\BranchPart::whereIn('branch_id', $branchIds)
                    ->whereIn('part_id', $partIds)
                    ->lockForUpdate()
                    ->get()
                    ->keyBy(fn ($bp) => $bp->branch_id . ':' . $bp->part_id)
                : collect();

            $date = date('Ymd');
            $actorId = $userId ?? $order->handed_over_by_user_id ?? $order->technician_id ?? $order->created_by_user_id ?? auth()->id();

            $existingTxCodes = \App\Models\InventoryTransaction::where('transaction_code', 'like', "TX-{$date}-%")
                ->pluck('transaction_code')
                ->flip();

            foreach ($exportTxs as $tx) {
                $returnQty = abs($tx->quantity);

                $branchPart = $branchPartsByKey->get($tx->branch_id . ':' . $tx->part_id);
                if ($branchPart) {
                    $branchPart->increment('stock_quantity', $returnQty);
                }

                $part = $partsById->get($tx->part_id);
                if ($part) {
                    $part->increment('stock_quantity', $returnQty);
                }

                do {
                    $rand = str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
                    $txCode = "TX-{$date}-{$rand}";
                } while ($existingTxCodes->has($txCode));
                $existingTxCodes->put($txCode, true);

                $note = "Hoàn kho tự động (import_return) do hoàn tiền đơn sửa chữa {$order->order_code}: {$reason}";

                \App\Models\InventoryTransaction::create([
                    'transaction_code'   => $txCode,
                    'part_id'            => $tx->part_id,
                    'branch_id'          => $tx->branch_id,
                    'repair_order_id'    => $order->id,
                    'transaction_type'   => 'import_return',
                    'quantity'           => $returnQty,
                    'unit_cost'          => $tx->unit_cost,
                    'notes'              => $note,
                    'created_by_user_id' => $actorId,
                ]);
            }
        });
    }

    /**
     * Ghi nhận Audit Log chuyển trạng thái đơn hàng.
     */
    protected function recordAuditLog(Model $model, string $oldStatus, string $newStatus, array $options): void
    {
        $adminId = $options['admin_id'] ?? (isset($options['user']) ? $options['user']->id : auth()->id());
        $adminName = $options['admin_name'] ?? (isset($options['user']) ? $options['user']->name : (auth()->user()?->name ?? 'Hệ thống'));

        $details = "Đơn {$model->order_code} chuyển sang {$newStatus}" . (! empty($options['reason']) ? " ({$options['reason']})" : '');
        if ($oldStatus === 'waiting_parts' && $newStatus === 'in_repair') {
            $details = "Admin/CSKH {$adminName} đã xác nhận có linh kiện và báo KTV tiếp tục sửa" . (! empty($options['reason']) ? " ({$options['reason']})" : '');
        } elseif ($newStatus === 'waiting_parts') {
            $parts = $options['parts_needed'] ?? $model->parts_needed;
            $details = "Đơn {$model->order_code} tạm dừng chờ linh kiện: " . ($parts ?: 'Chưa ghi rõ') . (! empty($options['repair_note']) ? " | Ghi chú: {$options['repair_note']}" : '');
        }

        AuditLog::create([
            'user_id'        => $adminId,
            'user_name'      => $adminName,
            'action'         => "Đổi trạng thái: {$oldStatus} -> {$newStatus}",
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $model->id,
            'details'        => $details,
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
                'title'      => $oldStatus === 'waiting_parts' ? 'Đã có linh kiện - Tiếp tục sửa chữa' : 'Bắt đầu tiến trình sửa chữa',
                'message'    => $oldStatus === 'waiting_parts'
                    ? "Đơn {$model->order_code} đã có linh kiện, KTV tiếp tục sửa chữa."
                    : "Đơn {$model->order_code} đang được kỹ thuật viên tiến hành sửa chữa.",
                'severity'   => 'info',
                'type'       => $oldStatus === 'waiting_parts' ? 'order_resumed' : 'order_in_repair',
                'role'       => 'technician',
                'event'      => 'order.in_repair',
            ],
            'waiting_parts' => [
                'title'      => 'Đơn chờ linh kiện',
                'message'    => ! empty($model->parts_needed)
                    ? "Đơn {$model->order_code} tạm dừng chờ linh kiện: {$model->parts_needed}."
                    : "Đơn {$model->order_code} tạm dừng để chờ linh kiện thay thế.",
                'severity'   => 'warning',
                'type'       => 'order_waiting_parts',
                'role'       => 'cskh',
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
                'message'    => in_array($oldStatus, ['waiting_tech', 'in_repair', 'assigned', 'waiting_parts', 'rework_needed'], true)
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
            'tenant_id'   => $model->tenant_id,
            'branch_id'   => $model->branch_id,
            'order_id'    => $model->id,
            'user_id'     => ($newStatus === 'assigned' ? ($model->technician_id ?? null) : null),
            'target_role' => $notificationData['role'],
            'type'        => $notificationData['type'],
            'title'       => $notificationData['title'],
            'message'     => $notificationData['message'],
            'severity'    => $notificationData['severity'],
            'action_url'  => "/repairs?id={$model->id}",
        ]);

        $eventTimestamp = now()->toIso8601String();
        DB::afterCommit(function () use ($notif, $model, $notificationData, $eventTimestamp) {
            $resolvedTenantId = $notif->tenant_id !== null
                ? (int) $notif->tenant_id
                : ($model->tenant_id !== null ? (int) $model->tenant_id : null);

            OrderOperationalEvent::dispatch(
                $notif->id,
                $model->id,
                $model->order_code,
                $notificationData['title'],
                $notificationData['message'],
                $notificationData['severity'],
                $eventTimestamp,
                "/repairs?id={$model->id}",
                $model->branch_id !== null ? (int) $model->branch_id : null,
                $notificationData['role'],
                $notif->user_id !== null ? (int) $notif->user_id : null,
                $notificationData['type'],
                $notificationData['event'],
                $resolvedTenantId
            );
        });
    }
}
