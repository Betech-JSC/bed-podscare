<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\OrderOperationalEvent;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\IntakeChecklist;
use App\Models\IntakePhoto;
use App\Models\Notification;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\Warranty;
use App\Services\OrderWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class OrderController extends Controller
{
    public function __construct(
        protected OrderWorkflowService $workflowService
    ) {}
    /**
     * Danh sách đơn sửa chữa với bộ lọc.
     */
    public function index(Request $request): JsonResponse
    {
        $query = RepairOrder::with(['customer', 'deviceModel', 'branch', 'technician', 'qcInspector']);

        if ($status = $request->input('status')) {
            $normalized = $this->normalizeStatus($status);
            if ($normalized === 'waiting_qc') {
                $query->whereIn('status', ['waiting_qc', 'qc_pending', 'qc_inspecting']);
            } elseif ($normalized === 'waiting_approval') {
                $query->whereIn('status', ['waiting_approval', 'quote_pending']);
            } else {
                $query->where('status', $status);
            }
        }

        $user = $request->user();
        if ($user && $user->role !== 'admin') {
            $query->where('branch_id', $user->branch_id);
        } elseif ($branchId = $request->input('branch_id')) {
            if ($branchId !== 'all') {
                $query->where('branch_id', $branchId);
            }
        }

        if ($techId = $request->input('technician_id')) {
            if ($techId === 'unassigned') {
                $query->whereNull('technician_id');
            } else {
                $query->where('technician_id', (int) $techId);
            }
        }

        if ($batchCode = $request->input('intake_batch_code')) {
            $query->where('intake_batch_code', $batchCode);
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
        $user = $request->user();
        $isStaff = $user && $user->role !== 'admin';

        $tenant = $user?->tenant;
        if ($tenant) {
            $quotaService = app(\App\Services\QuotaService::class);
            $quotaService->checkSubscriptionActive($tenant);
            $quotaService->checkOrderQuota($tenant);
        }

        $rules = [
            'branch_id'             => ($isStaff && $user->branch_id) ? 'nullable|exists:branches,id' : 'required|exists:branches,id',
            'customer_id'           => 'required_without:customer_phone|nullable|exists:customers,id',
            'customer_name'         => 'required_with:customer_phone|string|max:255',
            'customer_phone'        => 'nullable|string|max:20',
            'device_model_id'       => 'required|exists:device_models,id',
            'serial_number'         => 'nullable|string|max:100',
            'intake_battery_level'  => 'nullable|string|max:50',
            'accessories'           => 'nullable|string|max:255',
            'issue_description'     => 'required|string',
            'appearance_notes'      => 'nullable|string',
            'intake_batch_code'     => 'nullable|string|max:50',
            'estimated_price'       => 'required|numeric|gt:0',
            'warranty_terms_days'   => 'nullable|integer|min:0',
            'status'                => 'nullable|string',
            'checklists'            => 'nullable|array',
            'checklists.*.item_name'=> 'required_with:checklists|string',
            'checklists.*.status'   => 'required_with:checklists|in:pass,fail,not_tested',
            'checklists.*.note'     => 'nullable|string',
        ];

        $validated = $request->validate($rules);

        if ($isStaff && $user->branch_id) {
            $validated['branch_id'] = $user->branch_id;
        }

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

            // 2. Tự động sinh mã đơn FX26-xxxxx (đảm bảo duy nhất)
            $year = date('y');
            $attempts = 0;
            do {
                $randomNum = str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT);
                $orderCode = "FX{$year}-{$randomNum}";
                $attempts++;
            } while (RepairOrder::where('order_code', $orderCode)->exists() && $attempts < 20);

            // 3. Tạo RepairOrder: mặc định trạng thái waiting_tech để KTV nhận đơn tức thì
            $initialStatus = $validated['status'] ?? 'waiting_tech';

            $order = RepairOrder::create([
                'order_code'            => $orderCode,
                'intake_batch_code'     => $validated['intake_batch_code'] ?? null,
                'branch_id'             => $validated['branch_id'],
                'customer_id'           => $customerId,
                'device_model_id'       => $validated['device_model_id'],
                'serial_number'         => $validated['serial_number'] ?? null,
                'intake_battery_level'  => $validated['intake_battery_level'] ?? null,
                'accessories'           => $validated['accessories'] ?? null,
                'issue_description'     => $validated['issue_description'],
                'appearance_notes'      => $validated['appearance_notes'] ?? null,
                'status'                => $initialStatus,
                'customer_approved_at'  => $initialStatus === 'waiting_tech' ? now() : null,
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

            // 6. Tạo thông báo vận hành và phát sự kiện realtime tức thì cho kỹ thuật viên
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
                'technician',
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

        $code = (string) $id;
        $altCode = str_starts_with($code, 'PC')
            ? 'FX' . substr($code, 2)
            : (str_starts_with($code, 'FX') ? 'PC' . substr($code, 2) : null);

        return $query->where(function ($q) use ($code, $altCode) {
            $q->where('order_code', $code);
            if ($altCode) {
                $q->orWhere('order_code', $altCode);
            }
        })->first();
    }

    /**
     * Kiểm tra phân quyền chi nhánh tập trung.
     */
    protected function authorizeOrderBranch(RepairOrder $order, $user): void
    {
        if ($user && $user->role !== 'admin' && (int) $order->branch_id !== (int) $user->branch_id) {
            abort(403, 'Bạn không có quyền truy cập đơn hàng thuộc chi nhánh khác.');
        }
    }

    /**
     * Chi tiết đơn sửa chữa toàn diện.
     */
    public function show(Request $request, int|string $id): JsonResponse
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
            'tenant:id,name,code,logo_url,hotline,receipt_footer_note',
        ]);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        if ($order->intake_batch_code) {
            $order->load(['batchOrders.deviceModel', 'batchOrders.customer']);
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

        $this->authorizeOrderBranch($order, $request->user());

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
     * Chuyển trạng thái quy trình sửa chữa theo FSM (State Machine) thông qua OrderWorkflowService.
     */
    public function transition(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        $validated = $request->validate([
            'status'              => 'required_without:transition|nullable|string',
            'transition'          => 'required_without:status|nullable|string',
            'expected_updated_at' => 'nullable|string',
            'decline_reason'      => 'nullable|string',
            'repair_note'         => 'nullable|string',
            'parts_used'          => 'nullable|string',
            'rework_reason'       => 'nullable|string',
            'technician_id'       => 'nullable|exists:users,id',
        ]);

        $rawStatus = (string) ($validated['transition'] ?? $validated['status']);
        $normalizedStatus = $this->normalizeStatus($rawStatus);

        try {
            $updatedOrder = $this->workflowService->transition($order, $normalizedStatus, [
                'expected_updated_at' => $validated['expected_updated_at'] ?? null,
                'user'                => $request->user(),
                'admin_id'            => $request->user()?->id,
                'admin_name'          => $request->user()?->name,
                'technician_id'       => $validated['technician_id'] ?? null,
                'decline_reason'      => $validated['decline_reason'] ?? null,
                'repair_note'         => $validated['repair_note'] ?? null,
                'parts_used'          => $validated['parts_used'] ?? null,
                'rework_reason'       => $validated['rework_reason'] ?? null,
                'ip'                  => $request->ip(),
                'user_agent'          => $request->userAgent(),
            ]);

            return $this->success($updatedOrder, "Chuyển trạng thái đơn sang '{$updatedOrder->status}' thành công.");
        } catch (ConflictHttpException $e) {
            return $this->failure($e->getMessage(), 409);
        } catch (\DomainException $e) {
            return $this->failure($e->getMessage(), 422);
        }
    }

    /**
     * Phân công kỹ thuật viên cho đơn sửa chữa.
     */
    public function assignTechnician(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        $validated = $request->validate([
            'technician_id' => 'required|exists:users,id',
        ]);

        $order->update(['technician_id' => $validated['technician_id']]);

        return $this->success($order, 'Phân công kỹ thuật viên thành công.');
    }

    /**
     * Lấy danh sách các trạng thái tiếp theo được phép chuyển kèm nhãn tiếng Việt cho đơn hàng.
     */
    public function allowedTransitions(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        $allowed = $this->workflowService->getNextAllowedStatusesWithLabels($order->status);

        return $this->success([
            'order_id'          => $order->id,
            'current_status'    => $order->status,
            'current_label'     => $this->workflowService->getStatusLabel($order->status),
            'allowed_statuses'  => $allowed,
        ], 'Lấy danh sách trạng thái tiếp theo hợp lệ thành công.');
    }

    /**
     * Chuẩn hóa trạng thái / alias trước khi đưa vào FSM Workflow hoặc bộ lọc.
     */
    public function normalizeStatus(?string $status): ?string
    {
        if (! $status) {
            return $status;
        }

        return match ($status) {
            'quote_pending'               => 'waiting_approval',
            'qc_inspecting', 'qc_pending' => 'waiting_qc',
            default                       => $status,
        };
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

        $this->authorizeOrderBranch($order, $request->user());

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

        $this->authorizeOrderBranch($order, $request->user());

        $validated = $request->validate([
            'file'      => 'nullable|file|mimes:jpeg,png,jpg,webp|max:10240',
            'photo'     => 'nullable|file|mimes:jpeg,png,jpg,webp|max:10240',
            'photo_url' => 'nullable|string',
            'caption'   => 'nullable|string|max:255',
        ]);

        $uploadedFile = $request->file('photo') ?? $request->file('file');
        $photoUrl = $validated['photo_url'] ?? null;

        if (! $uploadedFile && ! $photoUrl) {
            return $this->failure('Vui lòng tải lên tệp ảnh (photo/file) hoặc cung cấp đường dẫn ảnh (photo_url).', 422);
        }

        if ($uploadedFile) {
            $path = $uploadedFile->store("orders/{$order->id}", 'public');
            $photoUrl = url(Storage::url($path));
        }

        $photo = IntakePhoto::create([
            'repair_order_id'     => $order->id,
            'photo_url'           => $photoUrl,
            'caption'             => $validated['caption'] ?? 'Ảnh hiện trạng tiếp nhận',
            'uploaded_by_user_id' => $request->user()->id,
        ]);

        return $this->success($photo, 'Tải ảnh hiện trạng tiếp nhận thành công.', 201);
    }
}
