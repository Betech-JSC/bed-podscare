<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\RepairOrder;
use App\Models\Shipment;
use App\Models\ShipmentProof;
use App\Services\OrderWorkflowService;
use App\Support\PhoneHelper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ShipmentController extends Controller
{
    public function __construct(
        protected OrderWorkflowService $workflowService
    ) {}
    /**
     * Danh sách đơn giao nhận / vận chuyển.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Shipment::with(['repairOrder.customer', 'partner', 'proofs', 'createdByUser:id,name']);

        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && $user->branch_id) {
            $query->whereHas('repairOrder', function ($q) use ($user) {
                $q->where('branch_id', $user->branch_id);
            });
        } else {
            $query->whereHas('repairOrder');
        }

        if ($status = $request->input('status')) {
            if ($status !== 'all') {
                $query->where('status', $status);
            }
        }

        if ($method = $request->input('delivery_method')) {
            if ($method !== 'all') {
                $query->where('delivery_method', $method);
            }
        }

        $rawSearch = $request->input('q') ?? $request->input('search');
        $search = PhoneHelper::sanitizeText($rawSearch);
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('shipment_code', 'like', "%{$search}%")
                  ->orWhere('tracking_code', 'like', "%{$search}%")
                  ->orWhere('carrier_name', 'like', "%{$search}%")
                  ->orWhere('delivery_address', 'like', "%{$search}%")
                  ->orWhere('notes', 'like', "%{$search}%")
                  ->orWhereHas('partner', function ($pq) use ($search) {
                      $pq->where('name', 'like', "%{$search}%")
                         ->orWhere('code', 'like', "%{$search}%");
                      PhoneHelper::applyPhoneColumnSearch($pq, 'phone', $search, 'or');
                  })
                  ->orWhereHas('repairOrder', function ($rq) use ($search) {
                      $rq->where('order_code', 'like', "%{$search}%")
                         ->orWhere('serial_number', 'like', "%{$search}%")
                         ->orWhere('shipping_address', 'like', "%{$search}%")
                         ->orWhereHas('customer', function ($cq) use ($search) {
                             $cq->where('name', 'like', "%{$search}%");
                             PhoneHelper::applyPhoneColumnSearch($cq, 'phone', $search, 'or');
                         })
                         ->orWhereHas('deviceModel', function ($dq) use ($search) {
                             $dq->where('name', 'like', "%{$search}%");
                         });
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
            ], 'Lấy danh sách giao nhận thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $shipments = $query->latest('id')->paginate($perPage);

        return $this->success($shipments, 'Lấy danh sách giao nhận thành công.');
    }

    /**
     * Tạo vận đơn / phiếu giao nhận cho đơn sửa chữa.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'repair_order_id'  => 'required|exists:repair_orders,id',
            'partner_id'       => 'nullable|exists:partners,id',
            'delivery_method'  => 'required|in:store_pickup,home_delivery',
            'carrier_name'     => 'required|string|max:100',
            'tracking_code'    => 'nullable|string|max:100',
            'delivery_address' => 'nullable|string',
            'scheduled_at'     => 'nullable|string|max:100',
            'notes'            => 'nullable|string',
        ]);

        $order = RepairOrder::find($validated['repair_order_id']);
        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $user = $request->user();
        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && $user->branch_id && (int) $order->branch_id !== (int) $user->branch_id) {
            return $this->failure('Bạn không có quyền tạo vận đơn cho đơn hàng thuộc chi nhánh khác.', 403);
        }

        $date = date('Ymd');
        do {
            $rand = str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
            $shipmentCode = "SH-{$date}-{$rand}";
        } while (Shipment::where('shipment_code', $shipmentCode)->exists());

        $shipment = Shipment::create([
            'shipment_code'      => $shipmentCode,
            'repair_order_id'    => $order->id,
            'partner_id'         => $validated['partner_id'] ?? null,
            'delivery_method'    => $validated['delivery_method'],
            'carrier_name'       => $validated['carrier_name'],
            'tracking_code'      => $validated['tracking_code'] ?? null,
            'delivery_address'   => $validated['delivery_address'] ?? null,
            'scheduled_at'       => $validated['scheduled_at'] ?? null,
            'status'             => 'pending',
            'notes'              => $validated['notes'] ?? null,
            'created_by_user_id' => $request->user()->id,
        ]);

        return $this->success($shipment->load(['repairOrder', 'partner']), 'Tạo phiếu giao nhận thành công.', 201);
    }

    /**
     * Tải ảnh xác minh giao hàng thành công (Bằng chứng nhận máy).
     */
    public function uploadProof(Request $request, int $id): JsonResponse
    {
        $shipment = Shipment::with('repairOrder')->find($id);

        if (! $shipment || ! $shipment->repairOrder) {
            return $this->empty('Không tìm thấy phiếu giao nhận.');
        }

        $user = $request->user();
        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && $user->branch_id && (int) $shipment->repairOrder->branch_id !== (int) $user->branch_id) {
            return $this->failure('Bạn không có quyền cập nhật vận đơn thuộc chi nhánh khác.', 403);
        }

        $validated = $request->validate([
            'proof'     => 'nullable|file|mimes:jpeg,png,jpg,webp|max:10240',
            'photo'     => 'nullable|file|mimes:jpeg,png,jpg,webp|max:10240',
            'file'      => 'nullable|file|mimes:jpeg,png,jpg,webp|max:10240',
            'photo_url' => 'nullable|string',
            'caption'   => 'nullable|string|max:255',
        ]);

        $uploadedFile = $request->file('proof') ?? $request->file('photo') ?? $request->file('file');
        $photoUrl = $validated['photo_url'] ?? null;

        if (! $uploadedFile && ! $photoUrl) {
            return $this->failure('Vui lòng tải lên tệp ảnh (proof/photo/file) hoặc cung cấp đường dẫn ảnh (photo_url).', 422);
        }

        if ($uploadedFile) {
            $path = $uploadedFile->store("shipments/{$shipment->id}", 'public');
            $photoUrl = url(Storage::url($path));
        }

        $proof = ShipmentProof::create([
            'shipment_id' => $shipment->id,
            'photo_url'   => $photoUrl,
            'caption'     => $validated['caption'] ?? 'Ảnh xác minh giao hàng',
        ]);

        return $this->success($proof, 'Tải ảnh xác minh giao hàng thành công.', 201);
    }

    /**
     * Cập nhật trạng thái vận đơn.
     * Quy tắc: Nếu là `delivered`, bắt buộc phải có ít nhất 1 ảnh bằng chứng trong `shipment_proofs`.
     */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $shipment = Shipment::with(['proofs', 'repairOrder'])->find($id);

        if (! $shipment || ! $shipment->repairOrder) {
            return $this->empty('Không tìm thấy phiếu giao nhận.');
        }

        $user = $request->user();
        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && $user->branch_id && (int) $shipment->repairOrder->branch_id !== (int) $user->branch_id) {
            return $this->failure('Bạn không có quyền cập nhật vận đơn thuộc chi nhánh khác.', 403);
        }

        $validated = $request->validate([
            'status' => 'required|in:pending,in_transit,delivered,failed',
            'notes'  => 'nullable|string',
        ]);

        $newStatus = $validated['status'];

        if ($newStatus === 'delivered' && $shipment->proofs->isEmpty() && ! $request->has('proof_photo_url')) {
            return $this->failure(
                'Bắt buộc phải có ảnh chụp xác minh (Proof of Delivery) khi chuyển sang trạng thái đã giao thành công.',
                422
            );
        }

        try {
            return DB::transaction(function () use ($shipment, $validated, $newStatus, $request) {
                $order = null;
                if ($newStatus === 'delivered' && $shipment->repair_order_id) {
                    $order = RepairOrder::lockForUpdate()->find($shipment->repair_order_id);
                    if ($order && $order->status !== 'completed') {
                        if (! in_array($order->status, ['ready_for_return', 'waiting_pickup', 'shipping'], true)) {
                            throw new \DomainException(
                                'Đơn sửa chữa chưa ở trạng thái sẵn sàng giao trả hoặc chờ khách nhận nên không thể hoàn tất giao vận đơn.'
                            );
                        }

                        $orderTotal = RepairOrder::normalizeVndAmount($order->total_price ?? 0);
                        if ($orderTotal > 0) {
                            $paidSum = RepairOrder::normalizeVndAmount($order->payments()->where('status', 'paid')->sum('amount'));
                            if ($paidSum < $orderTotal) {
                                throw new \DomainException(
                                    'Đơn hàng có chi phí sửa chữa (' . number_format($orderTotal, 0, ',', '.') . ' ₫) chưa được thanh toán đủ. Vui lòng thực hiện Thu tiền & Trả máy trước khi hoàn tất đơn.'
                                );
                            }
                        }
                    }
                }

                if ($request->filled('proof_photo_url')) {
                    ShipmentProof::create([
                        'shipment_id' => $shipment->id,
                        'photo_url'   => $request->input('proof_photo_url'),
                        'caption'     => $request->input('proof_caption', 'Ảnh xác minh giao hàng'),
                    ]);
                }

                $shipment->update([
                    'status'       => $newStatus,
                    'delivered_at' => $newStatus === 'delivered' ? Carbon::now() : $shipment->delivered_at,
                    'notes'        => $validated['notes'] ?? $shipment->notes,
                ]);

                // Khi trạng thái chuyển sang delivered, tự động hoàn tất đơn sửa chữa liên quan qua workflowService
                if ($newStatus === 'delivered' && $order && $order->status !== 'completed') {
                    if ($order->status === 'shipping') {
                        $order->status = 'ready_for_return';
                        $order->save();
                    }

                    $this->workflowService->transition($order, 'completed', [
                        'user'       => $request->user(),
                        'admin_id'   => $request->user()?->id,
                        'admin_name' => $request->user()?->name,
                        'reason'     => 'Giao hàng thành công qua vận đơn ' . $shipment->shipment_code,
                        'ip'         => $request->ip(),
                        'user_agent' => $request->userAgent(),
                    ]);
                }

                AuditLog::create([
                    'user_id'        => $request->user()->id,
                    'user_name'      => $request->user()->name,
                    'action'         => "Cập nhật vận đơn: {$newStatus}",
                    'auditable_type' => 'Shipment',
                    'auditable_id'   => $shipment->id,
                    'details'        => "Vận đơn {$shipment->shipment_code} chuyển sang {$newStatus}",
                    'ip_address'     => $request->ip(),
                ]);

                return $this->success($shipment->fresh('proofs'), 'Cập nhật trạng thái giao nhận thành công.');
            });
        } catch (\DomainException $e) {
            return $this->failure($e->getMessage(), 422);
        }
    }
}
