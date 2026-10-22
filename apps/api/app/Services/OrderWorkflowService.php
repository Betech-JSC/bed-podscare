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
        'waiting_tech'     => ['assigned', 'in_repair', 'ready_for_return'],
        'assigned'         => ['in_repair', 'ready_for_return', 'waiting_parts', 'waiting_tech', 'assigned'],
        'in_repair'        => ['waiting_parts', 'waiting_qc', 'qc_pending', 'qc_inspecting', 'ready_for_return', 'waiting_tech', 'assigned'],
        'waiting_parts'    => ['in_repair', 'waiting_tech', 'assigned', 'ready_for_return'],
        'rework_needed'    => ['in_repair', 'ready_for_return', 'waiting_parts', 'waiting_tech', 'assigned'],
        'waiting_qc'       => ['ready_for_return', 'rework_needed'],
        'qc_pending'       => ['ready_for_return', 'rework_needed'],
        'qc_inspecting'    => ['ready_for_return', 'rework_needed'],
        'ready_for_return' => ['waiting_pickup', 'completed', 'cancelled'],
        'waiting_pickup'   => ['completed', 'cancelled'],
        'completed'        => ['cancelled'],
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
                // Từ bước waiting_qc chuyển sang ready_for_return vẫn yêu cầu biên bản QC Pass
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

        // Khi chuyển sang completed: tự động đảm bảo có QcInspection (result = 'pass') cho cả đơn thường lẫn đơn bảo hành
        if ($newStatus === 'completed') {
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
                $updates['repair_completed_at'] = $now;
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
                $updates['handed_over_at'] = $now;
                $updates['delivered_at'] = $now;
                $adminId = $options['admin_id'] ?? ($user?->id ?? auth()->id());
                $updates['handed_over_by_user_id'] = $adminId;

                // Bảo toàn timestamps kỹ thuật & QC
                if (! $model->repair_started_at) {
                    $updates['repair_started_at'] = $model->tech_accepted_at ?? $model->customer_approved_at ?? $model->created_at ?? $now;
                }
                if (! $model->repair_completed_at) {
                    $updates['repair_completed_at'] = $model->qc_passed_at ?? $now;
                }
                if (! $model->qc_passed_at) {
                    $updates['qc_passed_at'] = $now;
                }

                // Bảo toàn technician_id (chỉ cập nhật nếu truyền technician_id hợp lệ hoặc đơn chưa có mà actor là KTV)
                if (! empty($options['technician_id'])) {
                    $techUser = \App\Models\User::find($options['technician_id']);
                    if ($techUser && $this->isTechnicianUser($techUser)) {
                        $updates['technician_id'] = $techUser->id;
                    }
                } elseif (! $model->technician_id && $this->isTechnicianUser($user)) {
                    $updates['technician_id'] = $user->id;
                }

                $isWarrantyOrder = ($model->order_type === 'warranty') || ! empty($model->claim_id);

                if ($isWarrantyOrder) {
                    // Đồng bộ đóng WarrantyClaim liên kết sang resolved
                    $claimQuery = \App\Models\WarrantyClaim::query()->where('rework_order_id', $model->id);
                    if (! empty($model->claim_id)) {
                        $claimQuery->orWhere('id', $model->claim_id);
                    }
                    $claimQuery->update(['status' => 'resolved']);

                    // Đơn bảo hành: không tạo chồng sổ bảo hành mới và không cộng trùng orders_count
                    if ($model->customer_id && (float) $model->total_price > 0) {
                        $priceDelta = (float) $model->total_price;
                        \App\Models\Customer::whereKey($model->customer_id)->increment('total_spent', $priceDelta);
                        if ($model->relationLoaded('customer') && $model->customer) {
                            $model->customer->total_spent = (float) ($model->customer->total_spent ?? 0) + $priceDelta;
                        }
                    }
                } else {
                    // Tự động kích hoạt sổ bảo hành điện tử cho đơn thường (chỉ query warranties 1 lần)
                    $existingWarranties = $model->warranties()->get();
                    if ($model->warranty_terms_days > 0 && $existingWarranties->isEmpty()) {
                        $year = date('y');
                        do {
                            $randomCode = str_pad((string) random_int(100, 999999), 6, '0', STR_PAD_LEFT);
                            $warrantyCode = "FX{$year}-WR-{$randomCode}";
                        } while (Warranty::withoutGlobalScopes()->where('warranty_code', $warrantyCode)->exists());

                        Warranty::create([
                            'warranty_code'   => $warrantyCode,
                            'repair_order_id' => $model->id,
                            'customer_id'     => $model->customer_id,
                            'device_model_id' => $model->device_model_id,
                            'coverage_item'   => $model->price_note ?? 'Dịch vụ sửa chữa',
                            'start_date'      => $now->toDateString(),
                            'duration_days'   => $model->warranty_terms_days,
                            'end_date'        => $now->copy()->addDays($model->warranty_terms_days)->toDateString(),
                            'status'          => 'active',
                        ]);
                    } elseif ($existingWarranties->isNotEmpty()) {
                        foreach ($existingWarranties as $warranty) {
                            $duration = $warranty->duration_days ?: ($model->warranty_terms_days ?: 90);
                            $warranty->update([
                                'status'     => 'active',
                                'start_date' => $now->toDateString(),
                                'end_date'   => $now->copy()->addDays($duration)->toDateString(),
                            ]);
                        }
                    }

                    // Tích lũy doanh số khách hàng cho đơn thường (gộp 1 câu lệnh UPDATE duy nhất)
                    if ($model->customer_id) {
                        $priceDelta = (float) ($model->total_price ?? 0);
                        \App\Models\Customer::whereKey($model->customer_id)->update([
                            'orders_count' => DB::raw('COALESCE(orders_count, 0) + 1'),
                            'total_spent'  => DB::raw('COALESCE(total_spent, 0) + ' . $priceDelta),
                            'updated_at'   => $now,
                        ]);

                        if ($model->relationLoaded('customer') && $model->customer) {
                            $model->customer->orders_count = (int) ($model->customer->orders_count ?? 0) + 1;
                            $model->customer->total_spent = (float) ($model->customer->total_spent ?? 0) + $priceDelta;
                        }
                    }
                }

                // Tự động trừ tồn kho linh kiện đã sử dụng (export_repair)
                $this->deductInventoryForOrder($model, $adminId);
                break;

            case 'cancelled':
                $adminId = $options['admin_id'] ?? ($user?->id ?? auth()->id());
                // Tự động hoàn kho nếu đơn đã từng xuất linh kiện
                $this->reverseInventoryForOrder($model, $adminId, 'cancelled');
                break;
        }

        if (! empty($updates)) {
            $model->update($updates);
        }
    }

    /**
     * Tự động trừ tồn kho linh kiện khi đơn hàng hoàn tất (export_repair).
     * Đảm bảo Idempotency: không trừ lần hai nếu đã từng xuất linh kiện cho đơn này.
     */
    public function deductInventoryForOrder(RepairOrder $order, ?int $userId = null): void
    {
        DB::transaction(function () use ($order, $userId) {
            // Idempotency check: Chỉ xuất kho nếu chưa từng có export_repair cho đơn này
            $alreadyExported = \App\Models\InventoryTransaction::where('repair_order_id', $order->id)
                ->where('transaction_type', 'export_repair')
                ->exists();

            if ($alreadyExported) {
                return;
            }

            // Lấy danh sách linh kiện từ quote_items của báo giá approved
            $quoteItems = \App\Models\QuoteItem::whereHas('quote', function ($q) use ($order) {
                $q->where('repair_order_id', $order->id)
                  ->where(function ($sq) {
                      $sq->where('status', 'approved')
                         ->orWhereNull('status');
                  });
            })->whereNotNull('part_id')
              ->where('quantity', '>', 0)
              ->get();

            if ($quoteItems->isEmpty()) {
                return;
            }

            $partIds = $quoteItems->pluck('part_id')->filter()->unique()->values()->all();
            if (empty($partIds)) {
                return;
            }

            $partsById = \App\Models\Part::whereIn('id', $partIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $branchPartsByPartId = \App\Models\BranchPart::where('branch_id', $order->branch_id)
                ->whereIn('part_id', $partIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('part_id');

            $date = date('Ymd');
            $actorId = $userId ?? $order->handed_over_by_user_id ?? $order->technician_id ?? 1;

            $existingTxCodes = \App\Models\InventoryTransaction::where('transaction_code', 'like', "TX-{$date}-%")
                ->pluck('transaction_code')
                ->flip();

            foreach ($quoteItems as $item) {
                $part = $partsById->get($item->part_id);
                if (! $part) {
                    continue;
                }

                $branchPart = $branchPartsByPartId->get($item->part_id);

                if (! $branchPart) {
                    $branchPart = \App\Models\BranchPart::create([
                        'branch_id'       => $order->branch_id,
                        'part_id'         => $item->part_id,
                        'stock_quantity'  => 0,
                        'min_stock_alert' => $part->min_stock_alert ?? 5,
                    ]);
                    $branchPartsByPartId->put($item->part_id, $branchPart);
                }

                $qty = (int) $item->quantity;

                do {
                    $rand = str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
                    $txCode = "TX-{$date}-{$rand}";
                } while ($existingTxCodes->has($txCode));
                $existingTxCodes->put($txCode, true);

                \App\Models\InventoryTransaction::create([
                    'transaction_code'   => $txCode,
                    'part_id'            => $item->part_id,
                    'branch_id'          => $order->branch_id,
                    'repair_order_id'    => $order->id,
                    'transaction_type'   => 'export_repair',
                    'quantity'           => -$qty,
                    'unit_cost'          => (float) ($part->cost_price ?? 0),
                    'notes'              => "Xuất kho tự động cho đơn sửa chữa {$order->order_code}",
                    'created_by_user_id' => $actorId,
                ]);

                $branchPart->decrement('stock_quantity', $qty);
                $part->decrement('stock_quantity', $qty);
            }
        });
    }

    /**
     * Tự động hoàn kho linh kiện khi đơn hàng bị hủy hoặc xóa (import_reversal).
     * Đảm bảo Idempotency: không hoàn trả lần hai nếu đã từng hoàn kho cho đơn này.
     */
    public function reverseInventoryForOrder(RepairOrder $order, ?int $userId = null, string $reason = 'cancelled'): void
    {
        DB::transaction(function () use ($order, $userId, $reason) {
            $exportTxs = \App\Models\InventoryTransaction::where('repair_order_id', $order->id)
                ->where('transaction_type', 'export_repair')
                ->get();

            if ($exportTxs->isEmpty()) {
                return;
            }

            // Idempotency check: Chỉ hoàn kho nếu chưa từng có import_reversal cho đơn này
            $alreadyReversed = \App\Models\InventoryTransaction::where('repair_order_id', $order->id)
                ->where('transaction_type', 'import_reversal')
                ->exists();

            if ($alreadyReversed) {
                return;
            }

            $partIds = $exportTxs->pluck('part_id')->filter()->unique()->values()->all();
            $branchIds = $exportTxs->pluck('branch_id')->filter()->unique()->values()->all();

            $partsById = ! empty($partIds)
                ? \App\Models\Part::whereIn('id', $partIds)->lockForUpdate()->get()->keyBy('id')
                : collect();

            $branchPartsByKey = (! empty($branchIds) && ! empty($partIds))
                ? \App\Models\BranchPart::whereIn('branch_id', $branchIds)
                    ->whereIn('part_id', $partIds)
                    ->lockForUpdate()
                    ->get()
                    ->keyBy(fn ($bp) => $bp->branch_id . ':' . $bp->part_id)
                : collect();

            $date = date('Ymd');
            $actorId = $userId ?? 1;

            $existingTxCodes = \App\Models\InventoryTransaction::where('transaction_code', 'like', "TX-{$date}-%")
                ->pluck('transaction_code')
                ->flip();

            foreach ($exportTxs as $tx) {
                $reverseQty = abs($tx->quantity);

                $branchPart = $branchPartsByKey->get($tx->branch_id . ':' . $tx->part_id);
                if ($branchPart) {
                    $branchPart->increment('stock_quantity', $reverseQty);
                }

                $part = $partsById->get($tx->part_id);
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
                    : "Hoàn kho tự động do hủy đơn sửa chữa {$order->order_code}";

                \App\Models\InventoryTransaction::create([
                    'transaction_code'   => $txCode,
                    'part_id'            => $tx->part_id,
                    'branch_id'          => $tx->branch_id,
                    'repair_order_id'    => $order->id,
                    'transaction_type'   => 'import_reversal',
                    'quantity'           => $reverseQty,
                    'unit_cost'          => $tx->unit_cost,
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
            $actorId = $userId ?? 1;

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
            'branch_id'  => $model->branch_id,
            'order_id'   => $model->id,
            'user_id'    => ($newStatus === 'assigned' ? ($model->technician_id ?? null) : null),
            'type'       => $notificationData['type'],
            'title'      => $notificationData['title'],
            'message'    => $notificationData['message'],
            'severity'   => $notificationData['severity'],
            'action_url' => "/repairs?id={$model->id}",
        ]);

        $eventTimestamp = now()->toIso8601String();
        DB::afterCommit(function () use ($notif, $model, $notificationData, $eventTimestamp) {
            OrderOperationalEvent::dispatch(
                $notif->id,
                $model->id,
                $model->order_code,
                $notificationData['title'],
                $notificationData['message'],
                $notificationData['severity'],
                $eventTimestamp,
                "/repairs?id={$model->id}",
                $model->branch_id,
                $notificationData['role'],
                $notif->user_id,
                $notificationData['type'],
                $notificationData['event']
            );
        });
    }
}
