<?php

namespace App\Services;

use App\Models\RepairOrder;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use Carbon\Carbon;
use DomainException;
use Illuminate\Support\Facades\DB;

class WarrantyReworkService
{
    public function __construct(
        protected OrderCodeService $orderCodeService,
        protected AuditLogService $auditLogService
    ) {}

    /**
     * Create a rework repair order (order_type = 'warranty', price = 0) from a warranty claim.
     *
     * @param WarrantyClaim $claim
     * @param User $actor
     * @param array $params
     * @return RepairOrder
     * @throws DomainException
     */
    public function createReworkOrderFromClaim(WarrantyClaim $claim, User $actor, array $params = []): RepairOrder
    {
        return DB::transaction(function () use ($claim, $actor, $params) {
            $claim->loadMissing('warranty.repairOrder');

            /** @var Warranty $warranty */
            $warranty = $claim->warranty ?? Warranty::with('repairOrder')->findOrFail($claim->warranty_id);
            $warranty->loadMissing('repairOrder');

            // 1. Kiểm tra tính hợp lệ của sổ bảo hành
            if ($warranty->status === 'revoked') {
                throw new DomainException('Sổ bảo hành đã bị thu hồi do đơn hàng đã được hoàn tiền, không thể tiếp nhận khiếu nại.');
            }

            if ($warranty->status !== 'active' || Carbon::parse($warranty->end_date)->endOfDay()->isPast()) {
                throw new DomainException('Sổ bảo hành đã hết hạn hoặc không còn hiệu lực.');
            }

            $originalOrder = $warranty->repairOrder;
            $branchId = (int) ($params['branch_id'] ?? $originalOrder?->branch_id ?? $actor->branch_id ?? 1);
            $tenantId = $originalOrder?->tenant_id ?? $actor->tenant_id ?? 1;

            // 2. Tự động sinh mã đơn định danh
            $orderCode = $this->orderCodeService->generate($branchId);

            // 3. Tạo RepairOrder loại warranty với giá 0 ₫ và trạng thái waiting_tech
            $reworkOrder = RepairOrder::create([
                'tenant_id'          => $tenantId,
                'order_code'         => $orderCode,
                'order_type'         => 'warranty',
                'branch_id'          => $branchId,
                'customer_id'        => $warranty->customer_id,
                'device_model_id'    => $warranty->device_model_id,
                'serial_number'      => $originalOrder?->serial_number,
                'claim_id'           => $claim->id,
                'parent_order_id'    => $originalOrder?->id,
                'status'             => 'waiting_tech',
                'total_price'        => 0,
                'initial_price'      => 0,
                'issue_description'  => '[Bảo hành] ' . $claim->issue_description,
                'notes'              => $claim->notes,
                'created_by_user_id' => $actor->id,
            ]);

            // 4. Cập nhật claim với rework_order_id
            $claim->update([
                'rework_order_id' => $reworkOrder->id,
                'status'          => 'in_progress',
            ]);

            // 5. Ghi AuditLog
            $this->auditLogService->log(
                $tenantId,
                $actor,
                'Tạo đơn bảo hành làm lại',
                $reworkOrder,
                "Khởi tạo đơn sửa chữa bảo hành {$orderCode} (0 ₫) từ khiếu nại {$claim->claim_code} của sổ {$warranty->warranty_code}",
                [
                    'claim_id'          => $claim->id,
                    'claim_code'        => $claim->claim_code,
                    'warranty_id'       => $warranty->id,
                    'original_order_id' => $originalOrder?->id,
                ],
                [],
                [
                    'order_code'  => $orderCode,
                    'order_type'  => 'warranty',
                    'total_price' => 0,
                    'status'      => 'waiting_tech',
                ]
            );

            DB::afterCommit(function () use ($reworkOrder) {
                app(\App\Services\TelegramNotificationService::class)->notifyNewOrder($reworkOrder);
            });

            return $reworkOrder;
        });
    }
}
