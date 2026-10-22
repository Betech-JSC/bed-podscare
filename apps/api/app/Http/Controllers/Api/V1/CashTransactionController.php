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
        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        if ($shiftId = $request->input('shift_id')) {
            $query->where('shift_id', $shiftId);
        }

        if ($type = $request->input('type')) {
            $query->where('type', $type);
        }

        if ($category = $request->input('category')) {
            $query->where('category', $category);
        }

        if ($fromDate = $request->input('from_date')) {
            $query->where('created_at', '>=', \Illuminate\Support\Carbon::parse($fromDate)->startOfDay());
        }

        if ($toDate = $request->input('to_date')) {
            $query->where('created_at', '<=', \Illuminate\Support\Carbon::parse($toDate)->endOfDay());
        }

        $transactions = $query->latest('id')->paginate($request->input('per_page', 15));

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
