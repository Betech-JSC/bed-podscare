<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptItem;
use App\Models\InventoryTransaction;
use App\Models\Part;
use App\Models\Supplier;
use App\Models\SupplierDebtTransaction;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GoodsReceiptService
{
    public function __construct(
        protected CashTransactionService $cashTransactionService
    ) {}

    /**
     * Lấy danh sách phiếu nhập kho phân trang.
     */
    public function getReceipts(int $tenantId, array $filters = []): LengthAwarePaginator
    {
        $query = GoodsReceipt::where('tenant_id', $tenantId)
            ->with(['supplier', 'branch', 'createdByUser', 'items.part']);

        if (! empty($filters['branch_id']) && $filters['branch_id'] !== 'all') {
            $query->where('branch_id', $filters['branch_id']);
        }

        if (! empty($filters['supplier_id'])) {
            $query->where('supplier_id', $filters['supplier_id']);
        }

        if (! empty($filters['search'])) {
            $search = trim($filters['search']);
            $query->where(function ($q) use ($search) {
                $q->where('receipt_code', 'like', "%{$search}%")
                  ->orWhereHas('supplier', function ($sq) use ($search) {
                      $sq->where('name', 'like', "%{$search}%")
                        ->orWhere('code', 'like', "%{$search}%");
                  });
            });
        }

        $query->orderBy('id', 'desc');

        $perPage = (int) ($filters['per_page'] ?? 15);
        return $query->paginate($perPage);
    }

    /**
     * Tạo phiếu nhập kho linh kiện, tính MAC, cập nhật kho, công nợ và sổ quỹ.
     */
    public function createReceipt(
        int $tenantId,
        int $branchId,
        int $userId,
        array $data
    ): GoodsReceipt {
        return DB::transaction(function () use ($tenantId, $branchId, $userId, $data) {
            $supplierId = (int) $data['supplier_id'];
            $itemsData = $data['items'] ?? [];

            if (empty($itemsData)) {
                throw new \DomainException('Phiếu nhập kho phải có ít nhất một linh kiện.');
            }

            // 1. Khóa tài nguyên theo thứ tự an toàn chống Deadlock:
            // Khóa NCC -> Khóa các linh kiện theo thứ tự ID tăng dần
            /** @var Supplier $supplier */
            $supplier = Supplier::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('id', $supplierId)
                ->lockForUpdate()
                ->firstOrFail();

            $partIds = array_unique(array_map(fn($item) => (int) $item['part_id'], $itemsData));
            sort($partIds);

            $parts = Part::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->whereIn('id', $partIds)
                ->orderBy('id', 'asc')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            foreach ($partIds as $pid) {
                if (! $parts->has($pid)) {
                    throw new \DomainException("Linh kiện ID {$pid} không tồn tại hoặc không thuộc quyền quản lý.");
                }
            }

            // 2. Tính toán tiền hàng
            $totalAmount = 0.0;
            $preparedItems = [];
            foreach ($itemsData as $item) {
                $quantity = (int) ($item['quantity'] ?? 0);
                $unitPrice = (float) ($item['unit_price'] ?? 0);

                if ($quantity <= 0) {
                    throw new \DomainException('Số lượng linh kiện nhập phải lớn hơn 0.');
                }
                if ($unitPrice < 0) {
                    throw new \DomainException('Đơn giá linh kiện không được âm.');
                }

                $itemTotalPrice = round($quantity * $unitPrice, 2);
                $totalAmount += $itemTotalPrice;

                $preparedItems[] = [
                    'part_id'     => (int) $item['part_id'],
                    'quantity'    => $quantity,
                    'unit_price'  => $unitPrice,
                    'total_price' => $itemTotalPrice,
                ];
            }

            $discountAmount = max(0.0, (float) ($data['discount_amount'] ?? 0));
            $finalAmount = max(0.0, $totalAmount - $discountAmount);

            $paidAmount = max(0.0, (float) ($data['paid_amount'] ?? 0));
            if ($paidAmount > $finalAmount) {
                throw new \DomainException("Số tiền thanh toán ({$paidAmount} ₫) không thể lớn hơn số tiền sau chiết khấu ({$finalAmount} ₫).");
            }

            $debtAmount = round($finalAmount - $paidAmount, 2);
            $paymentMethod = $data['payment_method'] ?? ($paidAmount > 0 ? 'cash' : 'none');

            $receiptCode = $this->generateReceiptCode($tenantId);

            // 3. Xử lý thanh toán tiền hàng ngay (nếu paid_amount > 0)
            $cashTransactionId = null;
            if ($paidAmount > 0) {
                if (! in_array($paymentMethod, ['cash', 'bank_transfer'], true)) {
                    throw new \DomainException('Phương thức thanh toán phải là tiền mặt (cash) hoặc chuyển khoản (bank_transfer).');
                }

                $notesPrefix = $paymentMethod === 'cash' ? 'Thanh toán tiền mặt' : 'Chuyển khoản thanh toán';
                $cashTx = $this->cashTransactionService->createExpense(
                    $tenantId,
                    $branchId,
                    $userId,
                    [
                        'category'        => 'purchasing_parts',
                        'payment_method'  => $paymentMethod,
                        'amount'          => $paidAmount,
                        'recipient_payer' => $supplier->name,
                        'notes'           => "{$notesPrefix} phiếu nhập kho {$receiptCode}",
                    ]
                );
                $cashTransactionId = $cashTx->id;
            }

            // 4. Tạo bản ghi GoodsReceipt
            $receipt = GoodsReceipt::create([
                'tenant_id'           => $tenantId,
                'branch_id'           => $branchId,
                'supplier_id'         => $supplier->id,
                'receipt_code'        => $receiptCode,
                'status'              => 'completed',
                'total_amount'        => $totalAmount,
                'discount_amount'     => $discountAmount,
                'final_amount'        => $finalAmount,
                'paid_amount'         => $paidAmount,
                'debt_amount'         => $debtAmount,
                'payment_method'      => $paidAmount > 0 ? $paymentMethod : 'none',
                'cash_transaction_id' => $cashTransactionId,
                'notes'               => $data['notes'] ?? null,
                'created_by_user_id'  => $userId,
            ]);

            // 5. Tạo chi tiết GoodsReceiptItem & Cập nhật MAC & Kho
            foreach ($preparedItems as $prep) {
                GoodsReceiptItem::create([
                    'goods_receipt_id' => $receipt->id,
                    'part_id'          => $prep['part_id'],
                    'quantity'         => $prep['quantity'],
                    'unit_price'       => $prep['unit_price'],
                    'total_price'      => $prep['total_price'],
                ]);

                /** @var Part $part */
                $part = $parts->get($prep['part_id']);
                $oldStock = (int) $part->stock_quantity;
                $oldCost = (float) $part->cost_price;
                $inQty = (int) $prep['quantity'];
                $inPrice = (float) $prep['unit_price'];

                // Thuật toán Moving Average Cost (MAC)
                if ($oldStock <= 0) {
                    $newCost = round($inPrice, 2);
                } else {
                    $totalStock = $oldStock + $inQty;
                    $newCost = round((($oldStock * $oldCost) + ($inQty * $inPrice)) / $totalStock, 2);
                }

                $part->cost_price = $newCost;
                $part->stock_quantity = $oldStock + $inQty;
                $part->save();

                // Cập nhật tồn kho theo chi nhánh (branch_parts)
                $branchPart = BranchPart::withoutGlobalScopes()
                    ->where('branch_id', $branchId)
                    ->where('part_id', $part->id)
                    ->lockForUpdate()
                    ->first();

                if (! $branchPart) {
                    $branchPart = BranchPart::create([
                        'branch_id'       => $branchId,
                        'part_id'         => $part->id,
                        'stock_quantity'  => $inQty,
                        'min_stock_alert' => $part->min_stock_alert ?? 5,
                    ]);
                } else {
                    $branchPart->stock_quantity = (int) $branchPart->stock_quantity + $inQty;
                    $branchPart->save();
                }

                // Ghi nhận giao dịch kho inventory_transactions
                InventoryTransaction::create([
                    'transaction_code'   => $this->generateInventoryCode(),
                    'part_id'            => $part->id,
                    'branch_id'          => $branchId,
                    'repair_order_id'    => null,
                    'transaction_type'   => 'import_supplier',
                    'quantity'           => $inQty,
                    'unit_cost'          => $inPrice,
                    'supplier_name'      => $supplier->name,
                    'notes'              => "Nhập kho linh kiện theo phiếu {$receiptCode}",
                    'created_by_user_id' => $userId,
                ]);
            }

            // 6. Ghi nhận công nợ NCC nếu còn thiếu tiền (debt_amount > 0)
            if ($debtAmount > 0) {
                $debtBefore = (float) $supplier->debt_balance;
                $debtAfter = round($debtBefore + $debtAmount, 2);

                $supplier->debt_balance = $debtAfter;
                $supplier->save();

                SupplierDebtTransaction::create([
                    'tenant_id'          => $tenantId,
                    'branch_id'          => $branchId,
                    'supplier_id'        => $supplier->id,
                    'goods_receipt_id'   => $receipt->id,
                    'cash_transaction_id'=> null,
                    'transaction_code'   => $this->generateDebtCode($tenantId, 'DEBT'),
                    'transaction_type'   => 'purchase_debt',
                    'amount'             => $debtAmount,
                    'debt_before'        => $debtBefore,
                    'debt_after'         => $debtAfter,
                    'payment_method'     => null,
                    'notes'              => "Ghi nhận công nợ phiếu nhập kho {$receiptCode}",
                    'created_by_user_id' => $userId,
                ]);
            }

            return $receipt->load(['supplier', 'branch', 'items.part', 'cashTransaction']);
        });
    }

    /**
     * Sinh mã phiếu nhập kho duy nhất trong tenant: GR-yymmdd-XXXX.
     */
    public function generateReceiptCode(int $tenantId): string
    {
        $prefix = 'GR-' . date('ymd') . '-';
        do {
            $code = $prefix . strtoupper(Str::random(4));
        } while (GoodsReceipt::withoutGlobalScopes()->where('tenant_id', $tenantId)->where('receipt_code', $code)->exists());

        return $code;
    }

    /**
     * Sinh mã giao dịch kho: INV-yymmdd-XXXX.
     */
    protected function generateInventoryCode(): string
    {
        $prefix = 'INV-' . date('ymd') . '-';
        do {
            $code = $prefix . strtoupper(Str::random(4));
        } while (InventoryTransaction::where('transaction_code', $code)->exists());

        return $code;
    }

    /**
     * Sinh mã biến động nợ NCC: DEBT-yymmdd-XXXX hoặc PAY-yymmdd-XXXX.
     */
    public function generateDebtCode(int $tenantId, string $prefix = 'DEBT'): string
    {
        $fullPrefix = $prefix . '-' . date('ymd') . '-';
        do {
            $code = $fullPrefix . strtoupper(Str::random(4));
        } while (SupplierDebtTransaction::withoutGlobalScopes()->where('tenant_id', $tenantId)->where('transaction_code', $code)->exists());

        return $code;
    }
}
