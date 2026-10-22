<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\CloseShiftRequest;
use App\Http\Requests\OpenShiftRequest;
use App\Models\WorkShift;
use App\Services\ShiftService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShiftController extends Controller
{
    public function __construct(
        protected ShiftService $shiftService
    ) {}

    /**
     * Danh sách ca làm việc theo chi nhánh và tenant.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = WorkShift::with([
            'cashier:id,name,role,phone',
            'closedBy:id,name,role',
            'branch:id,name,code',
        ]);

        if ($user && $user->role !== 'super_admin') {
            $query->where('tenant_id', $user->tenant_id);
        }

        $branchId = $request->input('branch_id') ?? ($user && ! in_array($user->role, ['admin', 'super_admin'], true) ? $user->branch_id : null);
        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($fromDate = $request->input('from_date')) {
            $query->where('opened_at', '>=', \Illuminate\Support\Carbon::parse($fromDate)->startOfDay());
        }

        if ($toDate = $request->input('to_date')) {
            $query->where('opened_at', '<=', \Illuminate\Support\Carbon::parse($toDate)->endOfDay());
        }

        $shifts = $query->latest('id')->paginate($request->input('per_page', 15));

        return $this->success($shifts, 'Lấy danh sách ca làm việc thành công.');
    }

    /**
     * Ca đang mở của chi nhánh hiện tại kèm snapshot tài chính & vận hành.
     */
    public function current(Request $request): JsonResponse
    {
        $user = $request->user();
        $branchId = $request->input('branch_id') ?? $user->branch_id;

        if (! $branchId) {
            return $this->failure('Không xác định được chi nhánh làm việc.', 422);
        }

        $shift = $this->shiftService->getActiveShift($user->tenant_id, (int) $branchId);

        if (! $shift) {
            return response()->json([
                'success'          => true,
                'message'          => 'Chi nhánh hiện chưa có ca làm việc nào đang mở.',
                'data'             => null,
                'has_active_shift' => false,
            ], 200);
        }

        return response()->json([
            'success'          => true,
            'message'          => 'Lấy thông tin ca hiện tại thành công.',
            'data'             => $shift,
            'has_active_shift' => true,
        ], 200);
    }

    /**
     * Mở ca làm việc mới.
     */
    public function open(OpenShiftRequest $request): JsonResponse
    {
        $user = $request->user();
        $branchId = $request->validated('branch_id') ?? $user->branch_id;

        if (! $branchId) {
            return $this->failure('Vui lòng chọn chi nhánh để mở ca.', 422);
        }

        // Chặn nhân viên không thuộc chi nhánh mở ca cho chi nhánh khác (trừ admin)
        if (! in_array($user->role, ['admin', 'super_admin'], true) && ! empty($user->branch_id) && (int) $user->branch_id !== (int) $branchId) {
            return $this->forbidden('Bạn chỉ có thể mở ca cho chi nhánh được phân công.');
        }

        $openingCash = (float) $request->validated('opening_cash');
        $notes = $request->validated('notes');

        $shift = $this->shiftService->openShift(
            $user->tenant_id,
            (int) $branchId,
            $user->id,
            $openingCash,
            $notes
        );

        $shift->load(['cashier:id,name,role', 'branch:id,name,code']);

        return $this->created($shift, 'Mở ca làm việc thành công.');
    }

    /**
     * Đóng ca & đối soát két tiền mặt.
     */
    public function close(CloseShiftRequest $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        $shift = WorkShift::find($id);

        if (! $shift) {
            return $this->empty('Không tìm thấy ca làm việc.');
        }

        if ($user->role !== 'super_admin' && (int) $shift->tenant_id !== (int) $user->tenant_id) {
            return $this->forbidden('Bạn không có quyền thao tác trên ca làm việc của doanh nghiệp khác.');
        }

        // Kiểm tra quyền đóng ca
        if (! in_array($user->role, ['admin', 'super_admin'], true) && (int) $shift->cashier_id !== (int) $user->id) {
            return $this->forbidden('Chỉ thu ngân mở ca hoặc Quản lý chi nhánh mới có quyền đóng ca này.');
        }

        $actualCash = (float) $request->validated('actual_cash');
        $carriedOverCash = (float) ($request->validated('carried_over_cash') ?? 0);
        $notes = $request->validated('notes');

        $closedShift = $this->shiftService->closeShift(
            (int) $id,
            $user->id,
            $actualCash,
            $carriedOverCash,
            $notes
        );

        return $this->success($closedShift, 'Đóng ca và đối soát két thành công.');
    }

    /**
     * Chi tiết ca làm việc.
     */
    public function show(int|string $id): JsonResponse
    {
        $user = request()->user();
        $shift = WorkShift::with([
            'cashier:id,name,role,phone',
            'closedBy:id,name,role',
            'branch:id,name,code,address,phone',
            'cashTransactions.createdByUser:id,name',
        ])->find($id);

        if (! $shift) {
            return $this->empty('Không tìm thấy ca làm việc.');
        }

        if ($user && $user->role !== 'super_admin' && (int) $shift->tenant_id !== (int) $user->tenant_id) {
            return $this->forbidden('Bạn không có quyền truy cập ca làm việc này.');
        }

        return $this->success($shift, 'Lấy chi tiết ca làm việc thành công.');
    }

    /**
     * Lấy dữ liệu biên bản chốt ca (hỗ trợ in nhiệt K80 và in A4).
     */
    public function summary(int|string $id): JsonResponse
    {
        $user = request()->user();
        $shift = WorkShift::find($id);

        if (! $shift) {
            return $this->empty('Không tìm thấy ca làm việc.');
        }

        if ($user && $user->role !== 'super_admin' && (int) $shift->tenant_id !== (int) $user->tenant_id) {
            return $this->forbidden('Bạn không có quyền truy cập biên bản ca này.');
        }

        $summary = $this->shiftService->getShiftSummary((int) $id);

        return $this->success($summary, 'Lấy dữ liệu biên bản chốt ca thành công.');
    }

    /**
     * Alias endpoint cho việc in ấn phiếu ca.
     */
    public function print(int|string $id): JsonResponse
    {
        return $this->summary($id);
    }
}
