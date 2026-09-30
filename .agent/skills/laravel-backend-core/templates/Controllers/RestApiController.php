<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOrderRequest;
use App\Http\Requests\UpdateOrderRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Services\OrderWorkflowService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Controller REST API mẫu tuân thủ nghiêm ngặt Thin Controller & Fat Service.
 * Sử dụng Trait ApiResponse để chuẩn hóa định dạng dữ liệu trả về cho Frontend / Mobile App.
 */
class RestApiController extends Controller
{
    use ApiResponse;

    /**
     * Inject Service nghiệp vụ qua Constructor Promotion (PHP 8.1+).
     */
    public function __construct(
        private readonly OrderWorkflowService $workflowService
    ) {}

    /**
     * Lấy danh sách tài nguyên kèm phân trang & lọc.
     * GET /api/v1/orders
     */
    public function index(Request $request): JsonResponse
    {
        $limit = (int) $request->input('limit', 15);

        $orders = Order::query()
            ->with(['items', 'customer'])
            ->when($request->query('status'), fn($q, $status) => $q->where('status', $status))
            ->when($request->query('search'), fn($q, $s) => $q->where('order_code', 'LIKE', "%{$s}%"))
            ->latest('id')
            ->paginate($limit);

        return $this->success(
            data: [
                'items' => OrderResource::collection($orders->items()),
                'pagination' => [
                    'current_page' => $orders->currentPage(),
                    'last_page'    => $orders->lastPage(),
                    'per_page'     => $orders->perPage(),
                    'total'        => $orders->total(),
                ],
            ],
            message: 'Lấy danh sách đơn hàng thành công'
        );
    }

    /**
     * Lấy chi tiết một tài nguyên.
     * GET /api/v1/orders/{id}
     */
    public function show(int $id): JsonResponse
    {
        $order = Order::with(['items', 'statusLogs'])->find($id);

        if (!$order) {
            return $this->empty('Không tìm thấy thông tin đơn hàng yêu cầu');
        }

        return $this->success(
            data: new OrderResource($order),
            message: 'Lấy chi tiết đơn hàng thành công'
        );
    }

    /**
     * Tạo mới tài nguyên.
     * POST /api/v1/orders
     */
    public function store(StoreOrderRequest $request): JsonResponse
    {
        $validated = $request->validated();

        try {
            $order = $this->workflowService->createOrder($validated);

            return $this->success(
                data: new OrderResource($order),
                message: 'Tạo đơn hàng mới thành công',
                status: 201
            );
        } catch (\DomainException $e) {
            return $this->failure($e->getMessage(), 422);
        } catch (\Throwable $e) {
            report($e);
            return $this->failure('Không thể tạo đơn hàng vào lúc này. Vui lòng thử lại sau.', 500);
        }
    }

    /**
     * Cập nhật thông tin tài nguyên.
     * PUT /api/v1/orders/{id}
     */
    public function update(UpdateOrderRequest $request, int $id): JsonResponse
    {
        $order = Order::find($id);

        if (!$order) {
            return $this->empty('Không tìm thấy đơn hàng cần cập nhật');
        }

        $validated = $request->validated();
        $order->update($validated);

        return $this->success(
            data: new OrderResource($order->fresh()),
            message: 'Cập nhật đơn hàng thành công'
        );
    }

    /**
     * Cập nhật trạng thái thông qua State Machine Service (Hỗ trợ Optimistic Lock).
     * POST /api/v1/orders/{id}/transition
     */
    public function transition(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'status'              => 'required|string',
            'reason'              => 'nullable|string|max:500',
            'expected_updated_at' => 'nullable|string',
        ]);

        $order = Order::find($id);

        if (!$order) {
            return $this->empty('Không tìm thấy đơn hàng');
        }

        try {
            $updated = $this->workflowService->transition($order, $request->input('status'), [
                'reason'              => $request->input('reason'),
                'expected_updated_at' => $request->input('expected_updated_at'),
                'admin_id'            => auth()->id(),
            ]);

            return $this->success(
                data: new OrderResource($updated),
                message: 'Chuyển trạng thái đơn hàng thành công'
            );
        } catch (ConflictHttpException $e) {
            return $this->failure($e->getMessage(), 409, null, 'ERR_CONCURRENT_CONFLICT');
        } catch (\DomainException $e) {
            return $this->failure($e->getMessage(), 422, null, 'ERR_INVALID_TRANSITION');
        } catch (\Throwable $e) {
            report($e);
            return $this->failure('Lỗi hệ thống khi cập nhật trạng thái', 500);
        }
    }

    /**
     * Xóa tài nguyên (Soft delete).
     * DELETE /api/v1/orders/{id}
     */
    public function destroy(int $id): JsonResponse
    {
        $order = Order::find($id);

        if (!$order) {
            return $this->empty('Không tìm thấy đơn hàng');
        }

        $order->delete();

        return $this->delete();
    }
}
