<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GoodsReceipt;
use App\Services\GoodsReceiptService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class GoodsReceiptController extends Controller
{
    public function __construct(
        protected GoodsReceiptService $goodsReceiptService
    ) {}

    /**
     * Danh sách phiếu nhập kho linh kiện.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'super_admin', 'manager'], true)) {
            return $this->forbidden('Bạn không có quyền truy cập danh sách phiếu nhập kho.');
        }

        $receipts = $this->goodsReceiptService->getReceipts($user->tenant_id, $request->all());

        return $this->success($receipts, 'Lấy danh sách phiếu nhập kho thành công.');
    }

    /**
     * Lập phiếu nhập kho linh kiện và cập nhật giá vốn MAC, công nợ, quỹ.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'super_admin', 'manager'], true)) {
            return $this->forbidden('Bạn không có quyền tạo phiếu nhập kho linh kiện.');
        }

        $validator = Validator::make($request->all(), [
            'supplier_id'        => 'required|exists:suppliers,id',
            'branch_id'          => 'nullable|exists:branches,id',
            'items'              => 'required|array|min:1',
            'items.*.part_id'    => 'required|exists:parts,id',
            'items.*.quantity'   => 'required|integer|min:1',
            'items.*.unit_price' => 'required|numeric|min:0',
            'discount_amount'    => 'nullable|numeric|min:0',
            'paid_amount'        => 'nullable|numeric|min:0',
            'payment_method'     => 'nullable|in:cash,bank_transfer,none',
            'notes'              => 'nullable|string|max:1000',
        ], [
            'supplier_id.required'        => 'Vui lòng chọn nhà cung cấp.',
            'items.required'              => 'Phiếu nhập kho phải có ít nhất một linh kiện.',
            'items.*.quantity.min'        => 'Số lượng linh kiện nhập phải lớn hơn 0.',
            'items.*.unit_price.min'      => 'Đơn giá linh kiện không được âm.',
        ]);

        if ($validator->fails()) {
            return $this->failure('Thông tin phiếu nhập kho không hợp lệ.', 422, $validator->errors());
        }

        $branchId = (int) ($request->input('branch_id') ?? $user->branch_id);
        if (! $branchId) {
            return $this->failure('Vui lòng chỉ định chi nhánh nhập kho.', 422);
        }

        try {
            $receipt = $this->goodsReceiptService->createReceipt(
                $user->tenant_id,
                $branchId,
                $user->id,
                $validator->validated()
            );

            return $this->created($receipt, 'Lập phiếu nhập kho linh kiện thành công.');
        } catch (\DomainException $e) {
            return $this->failure($e->getMessage(), 422);
        } catch (\Throwable $e) {
            return $this->failure('Đã xảy ra lỗi khi tạo phiếu nhập kho: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Chi tiết phiếu nhập kho linh kiện.
     */
    public function show(Request $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'super_admin', 'manager'], true)) {
            return $this->forbidden('Bạn không có quyền xem phiếu nhập kho này.');
        }

        $receipt = GoodsReceipt::where('tenant_id', $user->tenant_id)
            ->with(['supplier', 'branch', 'createdByUser', 'items.part', 'cashTransaction', 'debtTransactions'])
            ->find($id);

        if (! $receipt) {
            return $this->empty('Không tìm thấy phiếu nhập kho.');
        }

        return $this->success($receipt, 'Lấy chi tiết phiếu nhập kho thành công.');
    }
}
