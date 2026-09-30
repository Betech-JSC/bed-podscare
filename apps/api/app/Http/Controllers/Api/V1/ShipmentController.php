<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\RepairOrder;
use App\Models\Shipment;
use App\Models\ShipmentProof;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ShipmentController extends Controller
{
    /**
     * Danh sách đơn giao nhận / vận chuyển.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Shipment::with(['repairOrder.customer', 'partner', 'proofs', 'createdByUser:id,name']);

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($method = $request->input('delivery_method')) {
            $query->where('delivery_method', $method);
        }

        $shipments = $query->latest('id')->paginate($request->input('per_page', 15));

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

        $year = date('y');
        $randomNum = str_pad((string) random_int(10, 999), 3, '0', STR_PAD_LEFT);
        $shipmentCode = "PC{$year}-SH-{$randomNum}";

        $shipment = Shipment::create([
            'shipment_code'      => $shipmentCode,
            'repair_order_id'    => $validated['repair_order_id'],
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
        $shipment = Shipment::find($id);

        if (! $shipment) {
            return $this->empty('Không tìm thấy phiếu giao nhận.');
        }

        $validated = $request->validate([
            'photo_url' => 'required|url',
            'caption'   => 'nullable|string|max:255',
        ]);

        $proof = ShipmentProof::create([
            'shipment_id' => $shipment->id,
            'photo_url'   => $validated['photo_url'],
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
        $shipment = Shipment::with('proofs')->find($id);

        if (! $shipment) {
            return $this->empty('Không tìm thấy phiếu giao nhận.');
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

        return DB::transaction(function () use ($shipment, $validated, $newStatus, $request) {
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
    }
}
