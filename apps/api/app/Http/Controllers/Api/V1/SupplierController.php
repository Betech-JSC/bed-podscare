<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Services\SupplierDebtService;
use App\Services\SupplierService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class SupplierController extends Controller
{
    public function __construct(
        protected SupplierService $supplierService,
        protected SupplierDebtService $supplierDebtService
    ) {}

    /**
     * Danh sách nhà cung cấp.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'super_admin', 'manager'], true)) {
            return $this->forbidden('Bạn không có quyền truy cập danh sách nhà cung cấp.');
        }

        $suppliers = $this->supplierService->getSuppliers($user->tenant_id, $request->all());

        $statsRow = Supplier::where('tenant_id', $user->tenant_id)
            ->selectRaw('
                COUNT(*) as total_suppliers,
                COALESCE(SUM(CASE WHEN is_active = 1 THEN debt_balance ELSE 0 END), 0) as total_debt_amount,
                COALESCE(SUM(CASE WHEN debt_balance > 0 THEN 1 ELSE 0 END), 0) as suppliers_with_debt_count,
                COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) as active_suppliers_count
            ')
            ->first();

        $toNum = static fn ($val): int|float => ((float) $val == (int) round((float) $val))
            ? (int) round((float) $val)
            : (float) $val;

        $totalSuppliers = (int) ($statsRow->total_suppliers ?? 0);
        $totalDebtAmount = $toNum($statsRow->total_debt_amount ?? 0);
        $suppliersWithDebtCount = (int) ($statsRow->suppliers_with_debt_count ?? 0);
        $activeSuppliersCount = (int) ($statsRow->active_suppliers_count ?? 0);

        $summary = [
            'total_suppliers'           => $totalSuppliers,
            'total_count'               => $totalSuppliers,
            'active_suppliers_count'    => $activeSuppliersCount,
            'total_debt_amount'         => $totalDebtAmount,
            'total_accounts_payable'    => $totalDebtAmount,
            'total_debt'                => $totalDebtAmount,
            'suppliers_with_debt_count' => $suppliersWithDebtCount,
            'debt_suppliers_count'      => $suppliersWithDebtCount,
        ];

        $payload = $suppliers instanceof \Illuminate\Pagination\LengthAwarePaginator
            ? $suppliers->toArray()
            : [
                'current_page'   => 1,
                'data'           => $suppliers,
                'first_page_url' => $request->fullUrlWithQuery(['page' => 1]),
                'from'           => $suppliers->count() > 0 ? 1 : null,
                'last_page'      => 1,
                'last_page_url'  => $request->fullUrlWithQuery(['page' => 1]),
                'next_page_url'  => null,
                'path'           => $request->url(),
                'per_page'       => max($suppliers->count(), 1),
                'prev_page_url'  => null,
                'to'             => $suppliers->count() > 0 ? $suppliers->count() : null,
                'total'          => $suppliers->count(),
            ];

        $payload['summary'] = $summary;

        return $this->success($payload, 'Lấy danh sách nhà cung cấp thành công.');
    }

    /**
     * Tạo mới nhà cung cấp.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'super_admin', 'manager'], true)) {
            return $this->forbidden('Bạn không có quyền tạo nhà cung cấp.');
        }

        $validator = Validator::make($request->all(), [
            'name'      => 'required|string|max:255',
            'phone'     => 'required|string|max:20',
            'email'     => 'nullable|email|max:255',
            'address'   => 'nullable|string',
            'tax_code'  => 'nullable|string|max:50',
            'code'      => 'nullable|string|max:50',
            'notes'     => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ], [
            'name.required'  => 'Tên nhà cung cấp không được để trống.',
            'phone.required' => 'Số điện thoại nhà cung cấp không được để trống.',
            'email.email'    => 'Địa chỉ email không đúng định dạng.',
        ]);

        if ($validator->fails()) {
            return $this->failure('Thông tin không hợp lệ.', 422, $validator->errors());
        }

        try {
            $supplier = $this->supplierService->createSupplier($user->tenant_id, $validator->validated());
            return $this->created($supplier, 'Tạo nhà cung cấp thành công.');
        } catch (\Throwable $e) {
            return $this->failure($e->getMessage(), 422);
        }
    }

    /**
     * Chi tiết nhà cung cấp.
     */
    public function show(Request $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'super_admin', 'manager'], true)) {
            return $this->forbidden('Bạn không có quyền xem thông tin nhà cung cấp.');
        }

        $supplier = Supplier::where('tenant_id', $user->tenant_id)->find($id);
        if (! $supplier) {
            return $this->empty('Không tìm thấy nhà cung cấp.');
        }

        $supplier->loadCount('goodsReceipts');

        return $this->success($supplier, 'Lấy chi tiết nhà cung cấp thành công.');
    }

    /**
     * Cập nhật thông tin nhà cung cấp.
     */
    public function update(Request $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'super_admin', 'manager'], true)) {
            return $this->forbidden('Bạn không có quyền cập nhật nhà cung cấp.');
        }

        $supplier = Supplier::where('tenant_id', $user->tenant_id)->find($id);
        if (! $supplier) {
            return $this->empty('Không tìm thấy nhà cung cấp.');
        }

        $validator = Validator::make($request->all(), [
            'name'      => 'sometimes|required|string|max:255',
            'phone'     => 'sometimes|required|string|max:20',
            'email'     => 'nullable|email|max:255',
            'address'   => 'nullable|string',
            'tax_code'  => 'nullable|string|max:50',
            'code'      => 'nullable|string|max:50',
            'notes'     => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return $this->failure('Thông tin không hợp lệ.', 422, $validator->errors());
        }

        try {
            $updated = $this->supplierService->updateSupplier($supplier, $validator->validated());
            return $this->success($updated, 'Cập nhật thông tin nhà cung cấp thành công.');
        } catch (\Throwable $e) {
            return $this->failure($e->getMessage(), 422);
        }
    }

    /**
     * Xóa hoặc ngừng kích hoạt nhà cung cấp.
     */
    public function destroy(Request $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'super_admin', 'manager'], true)) {
            return $this->forbidden('Bạn không có quyền xóa nhà cung cấp.');
        }

        $supplier = Supplier::where('tenant_id', $user->tenant_id)->find($id);
        if (! $supplier) {
            return $this->empty('Không tìm thấy nhà cung cấp.');
        }

        try {
            $this->supplierService->deleteSupplier($supplier);
            return $this->success(null, 'Xóa hoặc ngừng hoạt động nhà cung cấp thành công.');
        } catch (\DomainException $e) {
            return $this->failure($e->getMessage(), 422);
        }
    }

    /**
     * Lập phiếu chi trả nợ nhà cung cấp: POST /api/v1/suppliers/{id}/payments
     */
    public function recordPayment(Request $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'super_admin', 'manager'], true)) {
            return $this->forbidden('Bạn không có quyền thực hiện chi trả nợ nhà cung cấp.');
        }

        $supplier = Supplier::where('tenant_id', $user->tenant_id)->find($id);
        if (! $supplier) {
            return $this->empty('Không tìm thấy nhà cung cấp.');
        }

        $validator = Validator::make($request->all(), [
            'amount'          => 'required_without:payment_amount|numeric|min:1',
            'payment_amount'  => 'required_without:amount|numeric|min:1',
            'payment_method'  => 'required|in:cash,bank_transfer',
            'branch_id'       => 'nullable|exists:branches,id',
            'notes'           => 'nullable|string|max:500',
        ], [
            'amount.required_without'         => 'Số tiền thanh toán không được để trống.',
            'payment_amount.required_without' => 'Số tiền thanh toán không được để trống.',
            'payment_method.required'         => 'Phương thức thanh toán là bắt buộc.',
            'payment_method.in'               => 'Phương thức thanh toán phải là cash hoặc bank_transfer.',
        ]);

        if ($validator->fails()) {
            return $this->failure('Thông tin thanh toán không hợp lệ.', 422, $validator->errors());
        }

        $branchId = (int) ($request->input('branch_id') ?? $user->branch_id);
        if (! $branchId) {
            return $this->failure('Vui lòng chỉ định chi nhánh thanh toán.', 422);
        }

        try {
            $debtTx = $this->supplierDebtService->repayDebt(
                $user->tenant_id,
                $branchId,
                $user->id,
                $supplier->id,
                $validator->validated()
            );

            $debtTx->load(['cashTransaction', 'supplier']);

            return $this->created($debtTx, 'Thanh toán trả nợ nhà cung cấp thành công.');
        } catch (\DomainException $e) {
            return $this->failure($e->getMessage(), 422);
        } catch (\Throwable $e) {
            return $this->failure('Đã xảy ra lỗi khi xử lý trả nợ: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Lịch sử giao dịch nợ NCC: GET /api/v1/suppliers/{id}/debt-transactions
     */
    public function debtTransactions(Request $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'super_admin', 'manager'], true)) {
            return $this->forbidden('Bạn không có quyền xem sổ nợ nhà cung cấp.');
        }

        $supplier = Supplier::where('tenant_id', $user->tenant_id)->find($id);
        if (! $supplier) {
            return $this->empty('Không tìm thấy nhà cung cấp.');
        }

        $history = $this->supplierDebtService->getDebtHistory(
            $user->tenant_id,
            $supplier->id,
            $request->all()
        );

        return $this->success($history, 'Lấy lịch sử công nợ nhà cung cấp thành công.');
    }
}
