<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\OrderOperationalEvent;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\IntakeChecklist;
use App\Models\IntakePhoto;
use App\Models\Notification;
use App\Models\RepairOrder;
use App\Models\Warranty;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OrderController extends Controller
{
    /**
     * Danh sách đơn sửa chữa với bộ lọc.
     */
    public function index(Request $request): JsonResponse
    {
        $query = RepairOrder::with(['customer', 'deviceModel', 'branch', 'technician', 'qcInspector']);

        if ($status = $request->input('status')) {
            if ($status === 'qc_pending' || $status === 'waiting_qc') {
                $query->whereIn('status', ['waiting_qc', 'qc_pending']);
            } else {
                $query->where('status', $status);
            }
        }

        if ($branchId = $request->input('branch_id')) {
            $query->where('branch_id', $branchId);
        }

        if ($techId = $request->input('technician_id')) {
            $query->where('technician_id', $techId);
        }

        if ($search = $request->input('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('order_code', 'like', "%{$search}%")
                  ->orWhere('serial_number', 'like', "%{$search}%")
                  ->orWhereHas('customer', function ($sq) use ($search) {
                      $sq->where('phone', 'like', "%{$search}%")
                         ->orWhere('name', 'like', "%{$search}%");
                  });
            });
        }

        $orders = $query->latest('id')->paginate($request->input('per_page', 15));

        return $this->success($orders, 'Lấy danh sách đơn sửa chữa thành công.');
    }

    /**
     * Tạo mới đơn sửa chữa tiếp nhận tại quầy.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'branch_id'             => 'required|exists:branches,id',
            'customer_id'           => 'required_without:customer_phone|nullable|exists:customers,id',
            'customer_name'         => 'required_with:customer_phone|string|max:255',
            'customer_phone'        => 'nullable|string|max:20',
            'device_model_id'       => 'required|exists:device_models,id',
            'serial_number'         => 'nullable|string|max:100',
            'intake_battery_level'  => 'nullable|string|max:50',
            'accessories'           => 'nullable|string|max:255',
            'issue_description'     => 'required|string',
            'appearance_notes'      => 'nullable|string',
            'estimated_price'       => 'nullable|numeric|min:0',
            'warranty_terms_days'   => 'nullable|integer|min:0',
            'checklists'            => 'nullable|array',
            'checklists.*.item_name'=> 'required_with:checklists|string',
            'checklists.*.status'   => 'required_with:checklists|in:pass,fail,not_tested',
            'checklists.*.note'     => 'nullable|string',
        ]);

        return DB::transaction(function () use ($request, $validated) {
            // 1. Tìm hoặc tạo khách hàng
            $customerId = $validated['customer_id'] ?? null;
            if (! $customerId && ! empty($validated['customer_phone'])) {
                $customer = Customer::firstOrCreate(
                    ['phone' => $validated['customer_phone']],
                    ['name' => $validated['customer_name'] ?? 'Khách lẻ']
                );
                $customerId = $customer->id;
            }

            // 2. Tự động sinh mã đơn PC26-xxxxx
            $year = date('y');
            $randomNum = str_pad((string) random_int(100, 99999), 5, '0', STR_PAD_LEFT);
            $orderCode = "PC{$year}-{$randomNum}";

            // 3. Tạo RepairOrder
            $order = RepairOrder::create([
                'order_code'            => $orderCode,
                'branch_id'             => $validated['branch_id'],
                'customer_id'           => $customerId,
                'device_model_id'       => $validated['device_model_id'],
                'serial_number'         => $validated['serial_number'] ?? null,
                'intake_battery_level'  => $validated['intake_battery_level'] ?? null,
                'accessories'           => $validated['accessories'] ?? null,
                'issue_description'     => $validated['issue_description'],
                'appearance_notes'      => $validated['appearance_notes'] ?? null,
                'status'                => 'inspecting',
                'total_price'           => $validated['estimated_price'] ?? 0.00,
                'warranty_terms_days'   => $validated['warranty_terms_days'] ?? 90,
                'created_by_user_id'    => $request->user()->id,
            ]);

            // 4. Lưu checklists nếu có
            if (! empty($validated['checklists'])) {
                foreach ($validated['checklists'] as $item) {
                    IntakeChecklist::create([
                        'repair_order_id' => $order->id,
                        'item_name'       => $item['item_name'],
                        'status'          => $item['status'] ?? 'not_tested',
                        'note'            => $item['note'] ?? null,
                    ]);
                }
            }

            // 5. Ghi Audit Log
            AuditLog::create([
                'user_id'        => $request->user()->id,
                'user_name'      => $request->user()->name,
                'action'         => 'Tiếp nhận đơn mới',
                'auditable_type' => 'RepairOrder',
                'auditable_id'   => $order->id,
                'details'        => "Tiếp nhận đơn {$orderCode} tại chi nhánh",
                'ip_address'     => $request->ip(),
            ]);

            // 6. Tạo thông báo vận hành và phát sự kiện realtime tức thì
            $order->loadMissing('branch');
            $branchName = $order->branch?->name ?? 'chi nhánh';

            $notification = Notification::create([
                'branch_id'  => $order->branch_id,
                'order_id'   => $order->id,
                'type'       => 'order_created',
                'title'      => 'Tiếp nhận đơn mới',
                'message'    => "Đơn {$order->order_code} đã được tiếp nhận tại {$branchName}.",
                'severity'   => 'info',
                'action_url' => "/repairs?id={$order->id}",
            ]);

            OrderOperationalEvent::dispatch(
                $notification->id,
                $order->id,
                $order->order_code,
                'Tiếp nhận đơn mới',
                "Đơn {$order->order_code} đã được tiếp nhận tại {$branchName}.",
                'info',
                now()->toIso8601String(),
                "/repairs?id={$order->id}",
                $order->branch_id,
                null,
                null,
                'order_created',
                'order.created'
            );

            return $this->success(
                $order->load(['customer', 'deviceModel', 'intakeChecklists']),
                'Tạo đơn sửa chữa thành công.',
                201
            );
        });
    }

    /**
     * Tìm kiếm đơn sửa chữa linh hoạt theo cả ID số nguyên và mã chuỗi order_code.
     */
    protected function resolveOrder(string|int $id, array $with = []): ?RepairOrder
    {
        $query = ! empty($with) ? RepairOrder::with($with) : RepairOrder::query();

        if (is_numeric($id)) {
            $order = (clone $query)->find((int) $id);
            if ($order) {
                return $order;
            }
        }

        return $query->where('order_code', (string) $id)->first();
    }

    /**
     * Chi tiết đơn sửa chữa toàn diện.
     */
    public function show(int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id, [
            'customer',
            'deviceModel',
            'branch',
            'createdByUser:id,name,role',
            'technician:id,name,phone,avatar_url',
            'qcInspector:id,name,role',
            'intakeChecklists',
            'intakePhotos',
            'quotes.items',
            'qcInspections.checklistResults',
            'inventoryTransactions.part',
            'shipments.proofs',
            'payments',
            'warranties',
        ]);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        return $this->success($order, 'Lấy chi tiết đơn sửa chữa thành công.');
    }

    /**
     * Cập nhật thông tin cơ bản của đơn.
     */
    public function update(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $validated = $request->validate([
            'technician_id'         => 'nullable|exists:users,id',
            'serial_number'         => 'nullable|string|max:100',
            'accessories'           => 'nullable|string|max:255',
            'appearance_notes'      => 'nullable|string',
            'price_note'            => 'nullable|string|max:255',
            'repair_note'           => 'nullable|string',
            'parts_used_summary'    => 'nullable|string',
        ]);

        $order->update($validated);

        return $this->success($order, 'Cập nhật đơn sửa chữa thành công.');
    }

    /**
     * Chuyển trạng thái quy trình sửa chữa theo FSM (State Machine).
     */
    public function transition(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $validated = $request->validate([
            'status'         => 'required_without:transition|nullable|string',
            'transition'     => 'required_without:status|nullable|string',
            'decline_reason' => 'nullable|string',
            'repair_note'    => 'nullable|string',
            'parts_used'     => 'nullable|string',
            'rework_reason'  => 'nullable|string',
        ]);

        $rawStatus = $validated['transition'] ?? $validated['status'];

        // Chuẩn hóa trạng thái: map 2 chiều giữa qc_pending và waiting_qc
        $normalizeStatus = function (?string $st): ?string {
            if ($st === 'qc_pending') {
                return 'waiting_qc';
            }
            return $st;
        };

        $newStatus = $normalizeStatus($rawStatus);
        $currentStatus = $normalizeStatus($order->status);

        // Ma trận chuyển đổi trạng thái hợp lệ
        $validTransitions = [
            'inspecting'       => ['waiting_approval', 'waiting_tech', 'cancelled'],
            'waiting_approval' => ['waiting_tech', 'rejected', 'cancelled'],
            'rejected'         => ['waiting_pickup', 'completed', 'cancelled'],
            'waiting_tech'     => ['assigned', 'in_repair'],
            'assigned'         => ['in_repair'],
            'in_repair'        => ['waiting_parts', 'waiting_qc', 'qc_pending'],
            'waiting_parts'    => ['in_repair'],
            'rework_needed'    => ['in_repair'],
            'waiting_qc'       => ['ready_for_return', 'rework_needed'],
            'qc_pending'       => ['ready_for_return', 'rework_needed'],
            'ready_for_return' => ['waiting_pickup', 'completed'],
            'waiting_pickup'   => ['completed'],
        ];

        if (! isset($validTransitions[$currentStatus]) || ! in_array($newStatus, $validTransitions[$currentStatus], true)) {
            return $this->failure(
                "Không thể chuyển trạng thái từ '{$currentStatus}' sang '{$newStatus}'.",
                422
            );
        }

        return DB::transaction(function () use ($request, $order, $newStatus, $validated, $currentStatus) {
            $now = Carbon::now();
            $updates = ['status' => $newStatus];

            switch ($newStatus) {
                case 'waiting_tech':
                    $updates['customer_approved_at'] = $now;
                    break;
                case 'rejected':
                    $updates['customer_declined_at'] = $now;
                    $updates['decline_reason'] = $validated['decline_reason'] ?? null;
                    break;
                case 'assigned':
                    $updates['technician_id'] = $request->user()?->id ?? $order->technician_id;
                    $updates['tech_accepted_at'] = $now;
                    break;
                case 'in_repair':
                    if (! $order->repair_started_at) {
                        $updates['repair_started_at'] = $now;
                    }
                    break;
                case 'waiting_qc':
                case 'qc_pending':
                    $updates['status'] = 'waiting_qc';
                    $updates['repair_completed_at'] = $now;
                    if (! empty($validated['repair_note'])) {
                        $updates['repair_note'] = $validated['repair_note'];
                    }
                    if (! empty($validated['parts_used'])) {
                        $updates['parts_used_summary'] = $validated['parts_used'];
                    }
                    break;
                case 'ready_for_return':
                    $updates['qc_passed_at'] = $now;
                    break;
                case 'waiting_pickup':
                    $updates['customer_notified_at'] = $now;
                    break;
                case 'completed':
                    $updates['handed_over_at'] = $now;
                    $updates['delivered_at'] = $now;
                    $updates['handed_over_by_user_id'] = $request->user()->id;

                    // Tự động kích hoạt sổ bảo hành điện tử
                    if ($order->warranty_terms_days > 0 && ! $order->warranties()->exists()) {
                        $year = date('y');
                        $randomCode = str_pad((string) random_int(100, 9999), 4, '0', STR_PAD_LEFT);
                        Warranty::create([
                            'warranty_code'   => "PC{$year}-WR-{$randomCode}",
                            'repair_order_id' => $order->id,
                            'customer_id'     => $order->customer_id,
                            'device_model_id' => $order->device_model_id,
                            'coverage_item'   => $order->price_note ?? 'Dịch vụ sửa chữa',
                            'start_date'      => $now->toDateString(),
                            'duration_days'   => $order->warranty_terms_days,
                            'end_date'        => $now->copy()->addDays($order->warranty_terms_days)->toDateString(),
                            'status'          => 'active',
                        ]);
                    }

                    // Tích lũy doanh số khách hàng
                    $customer = $order->customer;
                    if ($customer) {
                        $customer->increment('orders_count');
                        $customer->increment('total_spent', $order->total_price);
                    }
                    break;
            }

            $order->update($updates);

            // Ghi Audit log
            AuditLog::create([
                'user_id'        => $request->user()->id,
                'user_name'      => $request->user()->name,
                'action'         => "Đổi trạng thái: {$currentStatus} -> {$newStatus}",
                'auditable_type' => 'RepairOrder',
                'auditable_id'   => $order->id,
                'details'        => "Đơn {$order->order_code} chuyển sang {$newStatus}",
                'ip_address'     => $request->ip(),
            ]);

            // Tạo thông báo vận hành tương ứng với trạng thái mới và broadcast realtime
            $notificationData = match ($newStatus) {
                'waiting_approval' => [
                    'title'      => 'Chờ khách duyệt báo giá',
                    'message'    => "Đơn {$order->order_code} đã hoàn tất kiểm tra và đang chờ khách duyệt báo giá.",
                    'severity'   => 'warning',
                    'type'       => 'quote_action',
                    'role'       => 'cskh',
                    'event'      => 'quote.waiting_approval',
                ],
                'waiting_tech' => [
                    'title'      => 'Đơn chờ kỹ thuật viên tiếp nhận',
                    'message'    => "Đơn {$order->order_code} đã được duyệt và đang chờ kỹ thuật viên tiếp nhận.",
                    'severity'   => 'info',
                    'type'       => 'order_assigned',
                    'role'       => 'technician',
                    'event'      => 'order.waiting_tech',
                ],
                'assigned' => [
                    'title'      => 'Kỹ thuật viên đã nhận đơn',
                    'message'    => "Đơn {$order->order_code} đã được kỹ thuật viên tiếp nhận xử lý.",
                    'severity'   => 'info',
                    'type'       => 'order_assigned',
                    'role'       => 'technician',
                    'event'      => 'order.assigned',
                ],
                'in_repair' => [
                    'title'      => 'Bắt đầu tiến trình sửa chữa',
                    'message'    => "Đơn {$order->order_code} đang được kỹ thuật viên tiến hành sửa chữa.",
                    'severity'   => 'info',
                    'type'       => 'order_in_repair',
                    'role'       => 'technician',
                    'event'      => 'order.in_repair',
                ],
                'waiting_parts' => [
                    'title'      => 'Đơn chờ linh kiện',
                    'message'    => "Đơn {$order->order_code} tạm dừng để chờ linh kiện thay thế.",
                    'severity'   => 'warning',
                    'type'       => 'order_status',
                    'role'       => null,
                    'event'      => 'order.waiting_parts',
                ],
                'waiting_qc', 'qc_pending' => [
                    'title'      => 'Đơn chờ kiểm định chất lượng (QC)',
                    'message'    => "Đơn {$order->order_code} đã hoàn tất sửa chữa và chuyển sang bước kiểm định QC.",
                    'severity'   => 'info',
                    'type'       => 'qc_action',
                    'role'       => 'qc',
                    'event'      => 'qc.pending',
                ],
                'ready_for_return' => [
                    'title'      => 'Đơn hàng sẵn sàng giao trả',
                    'message'    => "Đơn {$order->order_code} đã hoàn tất kiểm định và sẵn sàng bàn giao cho khách.",
                    'severity'   => 'success',
                    'type'       => 'order_ready_delivery',
                    'role'       => 'cskh',
                    'event'      => 'order.ready_for_return',
                ],
                'waiting_pickup' => [
                    'title'      => 'Khách chuẩn bị nhận máy',
                    'message'    => "Đã thông báo khách hàng cho đơn {$order->order_code}, chờ khách tới nhận máy.",
                    'severity'   => 'info',
                    'type'       => 'order_status',
                    'role'       => 'cskh',
                    'event'      => 'order.waiting_pickup',
                ],
                'completed' => [
                    'title'      => 'Đơn hàng hoàn tất bàn giao',
                    'message'    => "Đơn {$order->order_code} đã bàn giao thành công cho khách hàng.",
                    'severity'   => 'success',
                    'type'       => 'order_completed',
                    'role'       => null,
                    'event'      => 'order.completed',
                ],
                'rejected' => [
                    'title'      => 'Khách từ chối sửa chữa',
                    'message'    => "Khách hàng từ chối sửa đơn {$order->order_code}" . (! empty($validated['decline_reason']) ? ": {$validated['decline_reason']}." : "."),
                    'severity'   => 'danger',
                    'type'       => 'quote_action',
                    'role'       => 'cskh',
                    'event'      => 'order.rejected',
                ],
                'rework_needed' => [
                    'title'      => 'QC yêu cầu làm lại (Rework)',
                    'message'    => "Đơn {$order->order_code} không đạt chuẩn QC: " . (! empty($validated['rework_reason']) ? $validated['rework_reason'] : "Cần kỹ thuật kiểm tra và làm lại."),
                    'severity'   => 'danger',
                    'type'       => 'qc_action',
                    'role'       => 'technician',
                    'event'      => 'qc.rework_needed',
                ],
                'cancelled' => [
                    'title'      => 'Đơn sửa chữa đã hủy',
                    'message'    => "Đơn {$order->order_code} đã bị hủy trên hệ thống.",
                    'severity'   => 'danger',
                    'type'       => 'order_cancelled',
                    'role'       => null,
                    'event'      => 'order.cancelled',
                ],
                default => [
                    'title'      => "Cập nhật trạng thái đơn {$order->order_code}",
                    'message'    => "Đơn {$order->order_code} chuyển sang trạng thái {$newStatus}.",
                    'severity'   => 'info',
                    'type'       => 'order_status',
                    'role'       => null,
                    'event'      => 'order.status_updated',
                ],
            };

            $notif = Notification::create([
                'branch_id'  => $order->branch_id,
                'order_id'   => $order->id,
                'user_id'    => ($newStatus === 'assigned' ? ($updates['technician_id'] ?? null) : null),
                'type'       => $notificationData['type'],
                'title'      => $notificationData['title'],
                'message'    => $notificationData['message'],
                'severity'   => $notificationData['severity'],
                'action_url' => "/repairs?id={$order->id}",
            ]);

            OrderOperationalEvent::dispatch(
                $notif->id,
                $order->id,
                $order->order_code,
                $notificationData['title'],
                $notificationData['message'],
                $notificationData['severity'],
                now()->toIso8601String(),
                "/repairs?id={$order->id}",
                $order->branch_id,
                $notificationData['role'],
                $notif->user_id,
                $notificationData['type'],
                $notificationData['event']
            );

            return $this->success($order->fresh(), "Chuyển trạng thái đơn sang '{$newStatus}' thành công.");
        });
    }

    /**
     * Cập nhật / lưu checklist kiểm tra tại quầy.
     */
    public function storeChecklist(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $validated = $request->validate([
            'items'             => 'required|array',
            'items.*.item_name' => 'required|string',
            'items.*.status'    => 'required|in:pass,fail,not_tested',
            'items.*.note'      => 'nullable|string',
        ]);

        foreach ($validated['items'] as $item) {
            IntakeChecklist::updateOrCreate(
                ['repair_order_id' => $order->id, 'item_name' => $item['item_name']],
                ['status' => $item['status'], 'note' => $item['note'] ?? null]
            );
        }

        return $this->success(
            $order->intakeChecklists()->get(),
            'Lưu danh sách kiểm tra tiếp nhận thành công.'
        );
    }

    /**
     * Upload ảnh chụp hiện trạng thiết bị lúc tiếp nhận.
     */
    public function uploadPhoto(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $validated = $request->validate([
            'photo_url' => 'required|url',
            'caption'   => 'nullable|string|max:255',
        ]);

        $photo = IntakePhoto::create([
            'repair_order_id'     => $order->id,
            'photo_url'           => $validated['photo_url'],
            'caption'             => $validated['caption'] ?? 'Ảnh hiện trạng tiếp nhận',
            'uploaded_by_user_id' => $request->user()->id,
        ]);

        return $this->success($photo, 'Tải ảnh hiện trạng tiếp nhận thành công.', 201);
    }
}
