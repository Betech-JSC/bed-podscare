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
            if ($cat !== 'all') {
                $query->where('parts.category', $cat);
            }
        }

        if ($shelf = $request->input('shelf')) {
            if ($shelf !== 'all') {
                $query->where('parts.storage_location', 'like', "{$shelf}%");
            }
        }

        $rawSearch = $request->input('q') ?? $request->input('search');
        $search = trim((string) $rawSearch);
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('parts.name', 'like', "%{$search}%")
                  ->orWhere('parts.sku', 'like', "%{$search}%")
                  ->orWhere('parts.compatible_models', 'like', "%{$search}%")
                  ->orWhere('parts.storage_location', 'like', "%{$search}%");
            });
        }

        $stockExpr = $targetBranchId
            ? 'COALESCE(branch_parts.stock_quantity, 0)'
            : 'COALESCE(parts.stock_quantity, 0)';
        $minExpr = $targetBranchId
            ? 'COALESCE(branch_parts.min_stock_alert, parts.min_stock_alert, 5)'
            : 'COALESCE(parts.min_stock_alert, 5)';

        $summaryQuery = (clone $query)->reorder();
        $summaryQuery->getQuery()->columns = [];
        $statsRow = $summaryQuery->selectRaw("
            COUNT(*) as total_sku,
            COALESCE(SUM({$stockExpr}), 0) as total_stock_qty,
            COALESCE(SUM(({$stockExpr}) * COALESCE(parts.cost_price, 0)), 0) as total_stock_value,
            COALESCE(SUM(({$stockExpr}) * COALESCE(parts.retail_price, 0)), 0) as total_retail_value,
            COALESCE(SUM(CASE WHEN {$stockExpr} <= {$minExpr} THEN 1 ELSE 0 END), 0) as low_stock_count,
            COALESCE(SUM(CASE WHEN {$stockExpr} <= 0 THEN 1 ELSE 0 END), 0) as out_of_stock_count
        ")->first();

        $toNum = static fn ($val): int|float => ((float) $val == (int) round((float) $val))
            ? (int) round((float) $val)
            : (float) $val;

        $totalSku = (int) ($statsRow->total_sku ?? 0);
        $totalStockQty = (int) ($statsRow->total_stock_qty ?? 0);
        $totalStockValue = $isAdmin ? $toNum($statsRow->total_stock_value ?? 0) : 0;
        $totalRetailValue = $toNum($statsRow->total_retail_value ?? 0);
        $lowStockCount = (int) ($statsRow->low_stock_count ?? 0);
        $outOfStockCount = (int) ($statsRow->out_of_stock_count ?? 0);

        $summary = [
            'total_sku'            => $totalSku,
            'total_parts'          => $totalSku,
            'sku_count'            => $totalSku,
            'total_stock_qty'      => $totalStockQty,
            'total_stock_quantity' => $totalStockQty,
            'total_quantity'       => $totalStockQty,
            'total_items'          => $totalStockQty,
            'total_stock_value'    => $totalStockValue,
            'total_value'          => $totalStockValue,
            'total_cost_value'     => $totalStockValue,
            'total_retail_value'   => $totalRetailValue,
            'low_stock_count'      => $lowStockCount,
            'out_of_stock_count'   => $outOfStockCount,
        ];

        if ($request->boolean('all') || $request->input('per_page') === 'all') {
            $items = $query->orderBy('parts.name')->limit(1000)->get();
            if (! $isAdmin) {
                $items->each(function (Part $part) {
                    $part->makeHidden('cost_price');
                });
            }
            $total = $items->count();

            return $this->success([
                'current_page'   => 1,
                'data'           => $items,
                'first_page_url' => $request->fullUrlWithQuery(['page' => 1]),
                'from'           => $total > 0 ? 1 : null,
                'last_page'      => 1,
                'last_page_url'  => $request->fullUrlWithQuery(['page' => 1]),
                'next_page_url'  => null,
                'path'           => $request->url(),
                'per_page'       => max($total, 1),
                'prev_page_url'  => null,
                'to'             => $total > 0 ? $total : null,
                'total'          => $total,
                'summary'        => $summary,
            ], 'Lấy danh sách linh kiện kho thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $parts = $query->orderBy('parts.name')->paginate($perPage);

        if (! $isAdmin) {
            $parts->getCollection()->each(function (Part $part) {
                $part->makeHidden('cost_price');
            });
        }

        $paginated = $parts->toArray();
        $paginated['summary'] = $summary;

        return $this->success($paginated, 'Lấy danh sách linh kiện kho thành công.');
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

        if ($type = $request->input('transaction_type', $request->input('type'))) {
            if ($type !== 'all') {
                $query->where('transaction_type', $type);
            }
        }

        if ($user && ! $isAdmin) {
            $query->where('branch_id', $user->branch_id);
        } elseif ($branchId = $request->input('branch_id')) {
            if ($branchId !== 'all') {
                $query->where('branch_id', $branchId);
            }
        }

        if ($fromDate = $request->input('from_date')) {
            $query->where('created_at', '>=', \Illuminate\Support\Carbon::parse($fromDate)->startOfDay());
        }

        if ($toDate = $request->input('to_date')) {
            $query->where('created_at', '<=', \Illuminate\Support\Carbon::parse($toDate)->endOfDay());
        }

        $rawSearch = $request->input('q') ?? $request->input('search');
        $search = trim((string) $rawSearch);
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('transaction_code', 'like', "%{$search}%")
                  ->orWhere('notes', 'like', "%{$search}%")
                  ->orWhere('supplier_name', 'like', "%{$search}%")
                  ->orWhereHas('part', function ($pq) use ($search) {
                      $pq->withoutGlobalScopes()->where(function ($sub) use ($search) {
                          $sub->where('name', 'like', "%{$search}%")
                              ->orWhere('sku', 'like', "%{$search}%");
                      });
                  })
                  ->orWhereHas('repairOrder', function ($rq) use ($search) {
                      $rq->withoutGlobalScopes()->where('order_code', 'like', "%{$search}%");
                  })
                  ->orWhereHas('createdByUser', function ($uq) use ($search) {
                      $uq->withoutGlobalScopes()->where('name', 'like', "%{$search}%");
                  });
            });
        }

        if ($request->boolean('all') || $request->input('per_page') === 'all') {
            $items = $query->latest('id')->limit(1000)->get();
            if (! $isAdmin) {
                $items->each(function (InventoryTransaction $tx) {
                    $tx->makeHidden('unit_cost');
                    if ($tx->relationLoaded('part') && $tx->part) {
                        $tx->part->makeHidden('cost_price');
                    }
                });
            }
            $total = $items->count();

            return $this->success([
                'current_page'   => 1,
                'data'           => $items,
                'first_page_url' => $request->fullUrlWithQuery(['page' => 1]),
                'from'           => $total > 0 ? 1 : null,
                'last_page'      => 1,
                'last_page_url'  => $request->fullUrlWithQuery(['page' => 1]),
                'next_page_url'  => null,
                'path'           => $request->url(),
                'per_page'       => max($total, 1),
                'prev_page_url'  => null,
                'to'             => $total > 0 ? $total : null,
                'total'          => $total,
            ], 'Lấy lịch sử giao dịch kho thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $transactions = $query->latest('id')->paginate($perPage);

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
