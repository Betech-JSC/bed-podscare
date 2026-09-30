<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\QuoteItem;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class QuoteController extends Controller
{
    /**
     * Danh sách báo giá.
     */
    public function index(Request $request): JsonResponse
    {
        $query = RepairQuote::with(['repairOrder.customer', 'items', 'sentByUser:id,name']);

        if ($orderId = $request->input('repair_order_id')) {
            $query->where('repair_order_id', $orderId);
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $quotes = $query->latest('id')->paginate($request->input('per_page', 15));

        return $this->success($quotes, 'Lấy danh sách báo giá thành công.');
    }

    /**
     * Tạo báo giá kèm các hạng mục chi phí chi tiết.
     */
    public function store(Request $request): JsonResponse
    {
        $inputOrderId = $request->input('repair_order_id');
        if ($inputOrderId && ! is_numeric($inputOrderId)) {
            $foundOrder = RepairOrder::where('order_code', $inputOrderId)->first();
            if ($foundOrder) {
                $request->merge(['repair_order_id' => $foundOrder->id]);
            }
        }

        $validated = $request->validate([
            'repair_order_id'       => 'required|exists:repair_orders,id',
            'note'                  => 'required|string',
            'warranty_terms_days'   => 'nullable|integer|min:0',
            'items'                 => 'required|array|min:1',
            'items.*.service_id'    => 'nullable|exists:repair_services,id',
            'items.*.part_id'       => 'nullable|exists:parts,id',
            'items.*.description'   => 'required|string|max:255',
            'items.*.quantity'      => 'required|integer|min:1',
            'items.*.unit_price'    => 'required|numeric|min:0',
        ]);

        return DB::transaction(function () use ($request, $validated) {
            $order = RepairOrder::findOrFail($validated['repair_order_id']);

            $year = date('y');
            $randomNum = str_pad((string) random_int(100, 99999), 5, '0', STR_PAD_LEFT);
            $quoteNumber = "PC{$year}-QT-{$randomNum}";

            // Tính tổng tiền
            $totalAmount = 0;
            foreach ($validated['items'] as $item) {
                $totalAmount += $item['quantity'] * $item['unit_price'];
            }

            $quote = RepairQuote::create([
                'repair_order_id'     => $order->id,
                'quote_number'        => $quoteNumber,
                'total_amount'        => $totalAmount,
                'warranty_terms_days' => $validated['warranty_terms_days'] ?? 90,
                'note'                => $validated['note'],
                'status'              => 'pending',
                'sent_by_user_id'     => $request->user()?->id ?? 1,
                'sent_at'             => Carbon::now(),
            ]);

            foreach ($validated['items'] as $item) {
                QuoteItem::create([
                    'quote_id'    => $quote->id,
                    'service_id'  => $item['service_id'] ?? null,
                    'part_id'     => $item['part_id'] ?? null,
                    'description' => $item['description'],
                    'quantity'    => $item['quantity'],
                    'unit_price'  => $item['unit_price'],
                    'amount'      => $item['quantity'] * $item['unit_price'],
                ]);
            }

            // Cập nhật giá trên đơn hàng
            $order->update([
                'total_price' => $totalAmount,
                'status'      => 'waiting_approval',
            ]);

            return $this->success($quote->load('items'), 'Tạo báo giá thành công.', 201);
        });
    }

    /**
     * Khách hàng / CSKH duyệt báo giá.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $quote = RepairQuote::with('repairOrder')->find($id);

        if (! $quote) {
            return $this->empty('Không tìm thấy báo giá.');
        }

        return DB::transaction(function () use ($quote, $request) {
            $quote->update([
                'status'       => 'approved',
                'responded_at' => Carbon::now(),
            ]);

            $order = $quote->repairOrder;
            if ($order) {
                $order->update([
                    'status'               => 'waiting_tech',
                    'customer_approved_at' => Carbon::now(),
                    'total_price'          => $quote->total_amount,
                ]);

                AuditLog::create([
                    'user_id'        => $request->user()?->id,
                    'user_name'      => $request->user()?->name ?? 'Khách hàng',
                    'action'         => 'Duyệt báo giá',
                    'auditable_type' => 'RepairQuote',
                    'auditable_id'   => $quote->id,
                    'details'        => "Khách đã duyệt báo giá {$quote->quote_number} trị giá " . number_format($quote->total_amount) . " ₫",
                ]);
            }

            return $this->success($quote, 'Đã phê duyệt báo giá.');
        });
    }

    /**
     * Khách hàng từ chối báo giá.
     */
    public function reject(Request $request, int $id): JsonResponse
    {
        $quote = RepairQuote::with('repairOrder')->find($id);

        if (! $quote) {
            return $this->empty('Không tìm thấy báo giá.');
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        return DB::transaction(function () use ($quote, $validated, $request) {
            $quote->update([
                'status'         => 'declined',
                'responded_at'   => Carbon::now(),
                'decline_reason' => $validated['reason'],
            ]);

            $order = $quote->repairOrder;
            if ($order) {
                $order->update([
                    'status'               => 'rejected',
                    'customer_declined_at' => Carbon::now(),
                    'decline_reason'       => $validated['reason'],
                ]);

                AuditLog::create([
                    'user_id'        => $request->user()?->id,
                    'user_name'      => $request->user()?->name ?? 'Khách hàng',
                    'action'         => 'Từ chối báo giá',
                    'auditable_type' => 'RepairQuote',
                    'auditable_id'   => $quote->id,
                    'details'        => "Khách từ chối báo giá {$quote->quote_number}. Lý do: {$validated['reason']}",
                ]);
            }

            return $this->success($quote, 'Đã ghi nhận từ chối báo giá.');
        });
    }
}
