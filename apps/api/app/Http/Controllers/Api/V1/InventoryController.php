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
        $user = $request->user();
        $isAdmin = $user && in_array($user->role, ['admin', 'super_admin'], true);

        $targetBranchId = null;
        if ($isAdmin) {
            if ($request->has('branch_id') && $request->input('branch_id') !== 'all') {
                $targetBranchId = (int) $request->input('branch_id');
            } elseif ($user?->branch_id) {
                $targetBranchId = (int) $user->branch_id;
            }
        } else {
            if (empty($user?->branch_id)) {
                return $this->failure('Tài khoản nhân sự chưa được phân công chi nhánh làm việc.', 422);
            }
            $targetBranchId = (int) $user->branch_id;
        }

        $query = Part::where('parts.is_active', true);

        if ($targetBranchId) {
            $query->leftJoin('branch_parts', function ($join) use ($targetBranchId) {
                $join->on('parts.id', '=', 'branch_parts.part_id')
                     ->where('branch_parts.branch_id', '=', $targetBranchId);
            })->select(
                'parts.*',
                DB::raw('COALESCE(branch_parts.stock_quantity, 0) as stock_quantity'),
                DB::raw('COALESCE(branch_parts.min_stock_alert, parts.min_stock_alert, 5) as min_stock_alert')
            );

            if ($request->boolean('low_stock')) {
                $query->whereRaw('COALESCE(branch_parts.stock_quantity, 0) <= COALESCE(branch_parts.min_stock_alert, parts.min_stock_alert, 5)');
            }
        } else {
            if ($request->boolean('low_stock')) {
                $query->whereColumn('parts.stock_quantity', '<=', 'parts.min_stock_alert');
            }
        }

        if ($cat = $request->input('category')) {
            $query->where('parts.category', $cat);
        }

        if ($search = $request->input('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('parts.name', 'like', "%{$search}%")
                  ->orWhere('parts.sku', 'like', "%{$search}%")
                  ->orWhere('parts.compatible_models', 'like', "%{$search}%");
            });
        }

        $parts = $query->orderBy('parts.name')->paginate($request->input('per_page', 20));

        if (! $isAdmin) {
            $parts->getCollection()->each(function (Part $part) {
                $part->makeHidden('cost_price');
            });
        }

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

        $user = request()->user();
        $isAdmin = $user && in_array($user->role, ['admin', 'super_admin'], true);
        if (! $isAdmin) {
            $part->makeHidden('cost_price');
            if ($part->relationLoaded('inventoryTransactions')) {
                $part->inventoryTransactions->each(function (InventoryTransaction $tx) {
                    $tx->makeHidden('unit_cost');
                });
            }
        }

        return $this->success($part, 'Lấy chi tiết linh kiện thành công.');
    }

    /**
     * Danh sách lịch sử giao dịch nhập/xuất kho.
     */
    public function transactions(Request $request): JsonResponse
    {
        $user = $request->user();
        $isAdmin = $user && in_array($user->role, ['admin', 'super_admin'], true);

        $query = InventoryTransaction::with(['part', 'branch', 'repairOrder', 'createdByUser:id,name']);

        if ($user && $user->role !== 'super_admin' && ! empty($user->tenant_id)) {
            $masterTenantId = \App\Models\Scopes\TenantScope::resolveMasterTenantId();
            $isMaster = $masterTenantId && (int) $user->tenant_id === (int) $masterTenantId;

            $query->whereHas('part', function ($pq) use ($user, $isMaster) {
                $pq->withoutGlobalScopes()->where(function ($sub) use ($user, $isMaster) {
                    $sub->where('parts.tenant_id', $user->tenant_id);
                    if ($isMaster) {
                        $sub->orWhereNull('parts.tenant_id');
                    }
                });
            })->whereHas('branch', function ($bq) use ($user, $isMaster) {
                $bq->withoutGlobalScopes()->where(function ($sub) use ($user, $isMaster) {
                    $sub->where('branches.tenant_id', $user->tenant_id);
                    if ($user->branch_id) {
                        $sub->orWhere('branches.id', $user->branch_id);
                    }
                    if ($isMaster) {
                        $sub->orWhereNull('branches.tenant_id');
                    }
                });
            });
        }

        if ($partId = $request->input('part_id')) {
            $query->where('part_id', $partId);
        }

        if ($type = $request->input('transaction_type')) {
            $query->where('transaction_type', $type);
        }

        if ($user && ! $isAdmin) {
            $query->where('branch_id', $user->branch_id);
        } elseif ($branchId = $request->input('branch_id')) {
            if ($branchId !== 'all') {
                $query->where('branch_id', $branchId);
            }
        }

        $transactions = $query->latest('id')->paginate($request->input('per_page', 20));

        if (! $isAdmin) {
            $transactions->getCollection()->each(function (InventoryTransaction $tx) {
                $tx->makeHidden('unit_cost');
                if ($tx->relationLoaded('part') && $tx->part) {
                    $tx->part->makeHidden('cost_price');
                }
            });
        }

        return $this->success($transactions, 'Lấy lịch sử giao dịch kho thành công.');
    }

    /**
     * Tạo phiếu nhập / xuất kho linh kiện.
     */
    public function createTransaction(Request $request): JsonResponse
    {
        $user = $request->user();
        $isAdmin = $user && in_array($user->role, ['admin', 'super_admin'], true);

        if ($user && ! $isAdmin) {
            if ($request->has('branch_id') && (int) $request->input('branch_id') !== (int) $user->branch_id) {
                abort(403, 'Bạn không có quyền tạo giao dịch kho cho chi nhánh khác.');
            }
        }

        $validated = $request->validate([
            'part_id'          => 'required|exists:parts,id',
            'branch_id'        => ($user && ! $isAdmin && $user->branch_id) ? 'nullable|exists:branches,id' : 'required|exists:branches,id',
            'repair_order_id'  => 'nullable|exists:repair_orders,id',
            'transaction_type' => 'required|in:import,export_repair,export_damage,adjust_inventory,import_return',
            'quantity'         => 'required|integer',
            'unit_cost'        => 'nullable|numeric|min:0',
            'supplier_name'    => 'nullable|string|max:255',
            'notes'            => 'nullable|string',
        ]);

        if ($user && ! $isAdmin) {
            $validated['branch_id'] = $user->branch_id;
            unset($validated['unit_cost']); // Non-admin không được tự ý set unit_cost
        }

        return DB::transaction(function () use ($request, $validated, $user, $isAdmin) {
            $part = Part::where('id', $validated['part_id'])->lockForUpdate()->firstOrFail();

            // Lấy hoặc khởi tạo tồn kho chi nhánh với pessimistic lock
            $branchPart = \App\Models\BranchPart::where('branch_id', $validated['branch_id'])
                ->where('part_id', $validated['part_id'])
                ->lockForUpdate()
                ->first();

            if (! $branchPart) {
                $hasOtherBranchParts = \App\Models\BranchPart::where('part_id', $validated['part_id'])->exists();
                $initialStock = $hasOtherBranchParts ? 0 : $part->stock_quantity;

                $branchPart = \App\Models\BranchPart::create([
                    'branch_id'       => $validated['branch_id'],
                    'part_id'         => $validated['part_id'],
                    'stock_quantity'  => $initialStock,
                    'min_stock_alert' => $part->min_stock_alert ?? 5,
                ]);
            }

            $date = date('Ymd');
            do {
                $rand = str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
                $txCode = "TX-{$date}-{$rand}";
            } while (InventoryTransaction::where('transaction_code', $txCode)->exists());

            $qty = $validated['quantity'];
            // Nếu là xuất thì số lượng âm
            if (in_array($validated['transaction_type'], ['export_repair', 'export_damage'], true) && $qty > 0) {
                $qty = -$qty;
            }

            // Kiểm tra tồn kho tại chi nhánh
            if ($branchPart->stock_quantity + $qty < 0) {
                return $this->failure(
                    "Số lượng tồn kho tại chi nhánh không đủ để xuất linh kiện (Tồn chi nhánh: {$branchPart->stock_quantity}, Yêu cầu xuất: " . abs($qty) . ').',
                    422
                );
            }

            // Đồng bộ kiểm tra tồn tổng toàn cục
            if ($part->stock_quantity + $qty < 0) {
                return $this->failure(
                    "Số lượng tồn kho không đủ để xuất linh kiện (Tồn hiện tại: {$part->stock_quantity}, Yêu cầu xuất: " . abs($qty) . ').',
                    422
                );
            }

            $unitCost = ($isAdmin && array_key_exists('unit_cost', $validated) && $validated['unit_cost'] !== null)
                ? (float) $validated['unit_cost']
                : (float) $part->cost_price;

            $tx = InventoryTransaction::create([
                'transaction_code'   => $txCode,
                'part_id'            => $part->id,
                'branch_id'          => $validated['branch_id'],
                'repair_order_id'    => $validated['repair_order_id'] ?? null,
                'transaction_type'   => $validated['transaction_type'],
                'quantity'           => $qty,
                'unit_cost'          => $unitCost,
                'supplier_name'      => $validated['supplier_name'] ?? null,
                'notes'              => $validated['notes'] ?? null,
                'created_by_user_id' => $request->user()->id,
            ]);

            // Cập nhật số lượng tồn kho chi nhánh và tổng kho
            $branchPart->increment('stock_quantity', $qty);
            $part->increment('stock_quantity', $qty);

            AuditLog::create([
                'user_id'        => $request->user()->id,
                'user_name'      => $request->user()->name,
                'action'         => 'Giao dịch kho: ' . $validated['transaction_type'],
                'auditable_type' => 'InventoryTransaction',
                'auditable_id'   => $tx->id,
                'details'        => "Mã {$txCode} · Linh kiện {$part->sku} (SL: {$qty}) tại chi nhánh #{$validated['branch_id']}",
                'ip_address'     => $request->ip(),
            ]);

            $loadedTx = $tx->setRelation('part', $part)->load('branch');
            if (! $isAdmin) {
                $loadedTx->makeHidden('unit_cost');
                if ($loadedTx->part) {
                    $loadedTx->part->makeHidden('cost_price');
                }
            }

            return $this->success($loadedTx, 'Tạo phiếu giao dịch kho thành công.', 201);
        });
    }
}
