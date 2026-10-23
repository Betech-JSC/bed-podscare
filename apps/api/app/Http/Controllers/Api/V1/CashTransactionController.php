<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\CreateExpenseRequest;
use App\Models\CashTransaction;
use App\Services\CashTransactionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CashTransactionController extends Controller
{
    public function __construct(
        protected CashTransactionService $cashTransactionService
    ) {}

    /**
     * Danh sách phiếu thu/chi sổ quỹ tiền mặt.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = CashTransaction::with([
            'workShift:id,shift_code,status',
            'createdByUser:id,name,role',
            'branch:id,name,code',
        ]);

        if ($user && $user->role !== 'super_admin') {
            $query->where('tenant_id', $user->tenant_id);
        }

        $branchId = $request->input('branch_id') ?? ($user && ! in_array($user->role, ['admin', 'super_admin'], true) ? $user->branch_id : null);
        if ($branchId && $branchId !== 'all') {
            $query->where('branch_id', $branchId);
        }

        if ($shiftId = $request->input('shift_id')) {
            $query->where('shift_id', $shiftId);
        }

        if ($type = $request->input('type')) {
            if ($type !== 'all') {
                $query->where('type', $type);
            }
        }

        if ($category = $request->input('category')) {
            if ($category !== 'all') {
                $query->where('category', $category);
            }
        }

        if ($fromDate = $request->input('from_date')) {
            $query->where('created_at', '>=', \Illuminate\Support\Carbon::parse($fromDate)->startOfDay());
        }

        if ($toDate = $request->input('to_date')) {
            $query->where('created_at', '<=', \Illuminate\Support\Carbon::parse($toDate)->endOfDay());
        }

        $rawSearch = $request->input('q') ?? $request->input('search');
        if ($rawSearch !== null && trim((string) $rawSearch) !== '') {
            $search = trim((string) $rawSearch);
            $searchLower = mb_strtolower($search, 'UTF-8');

            $categoryAliases = [
                'purchasing_parts'  => ['mua linh kiện', 'mua linh kien', 'purchasing_parts'],
                'supplier_payable'  => ['chi trả nợ', 'trả nợ ncc', 'tra no', 'supplier_payable'],
                'shipping_cod'      => ['cước giao nhận', 'cod', 'shipping_cod'],
                'store_operations'  => ['vận hành', 'điện', 'nước', 'vpp', 'store_operations'],
                'refund'            => ['hoàn tiền', 'hoan tien', 'refund'],
                'other_expense'     => ['chi phí khác', 'chi phi khac', 'other_expense'],
                'opening_float'     => ['đầu ca', 'float', 'nạp quỹ', 'opening_float'],
                'repair_order_cash' => ['thu tiền mặt', 'sửa chữa', 'repair_order_cash', 'repair_payment'],
                'other_income'      => ['khoản thu khác', 'thu khác', 'other_income'],
            ];

            $matchedCategories = [];
            foreach ($categoryAliases as $catKey => $keywords) {
                foreach ($keywords as $kw) {
                    if (str_contains($searchLower, $kw) || str_contains($kw, $searchLower)) {
                        $matchedCategories[] = $catKey;
                        break;
                    }
                }
            }

            $query->where(function ($q) use ($search, $matchedCategories) {
                $q->where('transaction_code', 'like', "%{$search}%")
                  ->orWhere('category', 'like', "%{$search}%")
                  ->orWhere('notes', 'like', "%{$search}%")
                  ->orWhere('recipient_payer', 'like', "%{$search}%");

                if (! empty($matchedCategories)) {
                    $q->orWhereIn('category', array_values(array_unique($matchedCategories)));
                }

                $q->orWhereHas('workShift', function ($sq) use ($search) {
                    $sq->withoutGlobalScopes()->where('shift_code', 'like', "%{$search}%");
                })->orWhereHas('createdByUser', function ($uq) use ($search) {
                    $uq->withoutGlobalScopes()->where('name', 'like', "%{$search}%");
                })->orWhereHas('goodsReceipts', function ($gq) use ($search) {
                    $gq->withoutGlobalScopes()->where('receipt_code', 'like', "%{$search}%");
                })->orWhereHas('supplierDebtTransactions', function ($dq) use ($search) {
                    $dq->withoutGlobalScopes()->where('transaction_code', 'like', "%{$search}%");
                });
            });
        }

        if ($request->boolean('all') || $request->input('per_page') === 'all') {
            $items = $query->latest('id')->limit(1000)->get();
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
            ], 'Lấy danh sách phiếu thu/chi sổ quỹ thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $transactions = $query->latest('id')->paginate($perPage);

        return $this->success($transactions, 'Lấy danh sách phiếu thu/chi sổ quỹ thành công.');
    }

    /**
     * Lập phiếu chi tiền mặt ngoài (mua linh kiện, nước uống, vpp, cod...).
     */
    public function storeExpense(CreateExpenseRequest $request): JsonResponse
    {
        $user = $request->user();
        $branchId = $request->validated('branch_id') ?? $user->branch_id;

        if (! $branchId) {
            return $this->failure('Vui lòng chọn chi nhánh phát sinh chi phí.', 422);
        }

        // Chặn nhân viên không thuộc chi nhánh lập phiếu cho chi nhánh khác (trừ admin)
        if (! in_array($user->role, ['admin', 'super_admin'], true) && ! empty($user->branch_id) && (int) $user->branch_id !== (int) $branchId) {
            return $this->forbidden('Bạn chỉ có thể tạo phiếu chi cho chi nhánh được phân công.');
        }

        try {
            $transaction = $this->cashTransactionService->createExpense(
                $user->tenant_id,
                (int) $branchId,
                $user->id,
                $request->validated()
            );
        } catch (\DomainException $e) {
            return $this->failure($e->getMessage(), 422);
        }

        $transaction->load(['workShift:id,shift_code', 'createdByUser:id,name', 'branch:id,name,code']);

        return $this->created($transaction, 'Lập phiếu chi tiền mặt thành công.');
    }

    /**
     * Danh sách danh mục thu/chi chuẩn.
     */
    public function categories(): JsonResponse
    {
        $categories = $this->cashTransactionService->getCategories();

        return $this->success($categories, 'Lấy danh mục thu/chi thành công.');
    }

    /**
     * Lấy số dư và thông tin tồn quỹ tiền mặt của chi nhánh.
     */
    public function balance(Request $request): JsonResponse
    {
        $user = $request->user();
        $branchId = $request->input('branch_id') ?? $user->branch_id;

        if (! $branchId) {
            return $this->failure('Không xác định được chi nhánh.', 422);
        }

        $balance = $this->cashTransactionService->getBranchBalance($user->tenant_id, (int) $branchId);

        return $this->success($balance, 'Lấy thông tin tồn quỹ chi nhánh thành công.');
    }
}
