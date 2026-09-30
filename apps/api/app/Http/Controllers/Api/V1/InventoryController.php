<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\InventoryTransaction;
use App\Models\Part;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryController extends Controller
{
    /**
     * Danh sách linh kiện kho, kiểm tra tồn kho & cảnh báo sắp hết.
     */
    public function parts(Request $request): JsonResponse
    {
        $query = Part::where('is_active', true);

        if ($cat = $request->input('category')) {
            $query->where('category', $cat);
        }

        if ($request->boolean('low_stock')) {
            $query->whereColumn('stock_quantity', '<=', 'min_stock_alert');
        }

        if ($search = $request->input('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('sku', 'like', "%{$search}%")
                  ->orWhere('compatible_models', 'like', "%{$search}%");
            });
        }

        $parts = $query->orderBy('name')->paginate($request->input('per_page', 20));

        return $this->success($parts, 'Lấy danh sách linh kiện kho thành công.');
    }

    /**
     * Chi tiết linh kiện kèm lịch sử nhập xuất gần nhất.
     */
    public function showPart(int $id): JsonResponse
    {
        $part = Part::with(['inventoryTransactions' => function ($q) {
            $q->latest()->limit(10)->with(['branch', 'createdByUser:id,name']);
        }])->find($id);

        if (! $part) {
            return $this->empty('Không tìm thấy linh kiện.');
        }

        return $this->success($part, 'Lấy chi tiết linh kiện thành công.');
    }

    /**
     * Danh sách lịch sử giao dịch nhập/xuất kho.
     */
    public function transactions(Request $request): JsonResponse
    {
        $query = InventoryTransaction::with(['part', 'branch', 'repairOrder', 'createdByUser:id,name']);

        if ($partId = $request->input('part_id')) {
            $query->where('part_id', $partId);
        }

        if ($type = $request->input('transaction_type')) {
            $query->where('transaction_type', $type);
        }

        if ($branchId = $request->input('branch_id')) {
            $query->where('branch_id', $branchId);
        }

        $transactions = $query->latest('id')->paginate($request->input('per_page', 20));

        return $this->success($transactions, 'Lấy lịch sử giao dịch kho thành công.');
    }

    /**
     * Tạo phiếu nhập / xuất kho linh kiện.
     */
    public function createTransaction(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'part_id'          => 'required|exists:parts,id',
            'branch_id'        => 'required|exists:branches,id',
            'repair_order_id'  => 'nullable|exists:repair_orders,id',
            'transaction_type' => 'required|in:import,export_repair,export_damage,adjust_inventory',
            'quantity'         => 'required|integer',
            'unit_cost'        => 'nullable|numeric|min:0',
            'supplier_name'    => 'nullable|string|max:255',
            'notes'            => 'nullable|string',
        ]);

        return DB::transaction(function () use ($request, $validated) {
            $part = Part::findOrFail($validated['part_id']);

            $date = date('Ymd');
            $rand = str_pad((string) random_int(1, 999), 3, '0', STR_PAD_LEFT);
            $txCode = "TX-{$date}-{$rand}";

            $qty = $validated['quantity'];
            // Nếu là xuất thì số lượng âm
            if (in_array($validated['transaction_type'], ['export_repair', 'export_damage'], true) && $qty > 0) {
                $qty = -$qty;
            }

            $tx = InventoryTransaction::create([
                'transaction_code'   => $txCode,
                'part_id'            => $part->id,
                'branch_id'          => $validated['branch_id'],
                'repair_order_id'    => $validated['repair_order_id'] ?? null,
                'transaction_type'   => $validated['transaction_type'],
                'quantity'           => $qty,
                'unit_cost'          => $validated['unit_cost'] ?? $part->cost_price,
                'supplier_name'      => $validated['supplier_name'] ?? null,
                'notes'              => $validated['notes'] ?? null,
                'created_by_user_id' => $request->user()->id,
            ]);

            // Cập nhật số lượng tồn kho
            $part->increment('stock_quantity', $qty);

            AuditLog::create([
                'user_id'        => $request->user()->id,
                'user_name'      => $request->user()->name,
                'action'         => 'Giao dịch kho: ' . $validated['transaction_type'],
                'auditable_type' => 'InventoryTransaction',
                'auditable_id'   => $tx->id,
                'details'        => "Mã {$txCode} · Linh kiện {$part->sku} (SL: {$qty})",
                'ip_address'     => $request->ip(),
            ]);

            return $this->success($tx->load(['part', 'branch']), 'Tạo phiếu giao dịch kho thành công.', 201);
        });
    }
}
