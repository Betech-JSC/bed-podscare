<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\OrderOperationalEvent;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Notification;
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
        $user = $request->user();
        $query = RepairQuote::with(['repairOrder.customer', 'items', 'sentByUser:id,name']);

        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && $user->branch_id) {
            $query->whereHas('repairOrder', function ($q) use ($user) {
                $q->where('branch_id', $user->branch_id);
            });
        } else {
            $query->whereHas('repairOrder');
        }

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
            $user = $request->user();
            if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && $user->branch_id && (int) $order->branch_id !== (int) $user->branch_id) {
                return $this->failure('Bạn không có quyền tạo báo giá cho đơn hàng thuộc chi nhánh khác.', 403);
            }

            $date = date('Ym');
            do {
                $rand = str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
                $quoteNumber = "Q-{$date}-{$rand}";
            } while (RepairQuote::where('quote_number', $quoteNumber)->exists());

            // Tính tổng tiền
            $totalAmount = 0;
            foreach ($validated['items'] as $item) {
                $totalAmount += $item['quantity'] * RepairOrder::normalizeVndAmount($item['unit_price']);
            }
            $totalAmount = RepairOrder::normalizeVndAmount($totalAmount);

            $quote = RepairQuote::create([
                'repair_order_id'     => $order->id,
                'quote_number'        => $quoteNumber,
                'total_amount'        => $totalAmount,
                'warranty_terms_days' => $validated['warranty_terms_days'] ?? 90,
                'note'                => $validated['note'],
                'status'              => 'pending',
                'sent_by_user_id'     => $request->user()->id,
                'sent_at'             => Carbon::now(),
            ]);

            $now = now();
            $quoteItemRows = [];
            foreach ($validated['items'] as $item) {
                $unitPrice = RepairOrder::normalizeVndAmount($item['unit_price']);
                $quoteItemRows[] = [
                    'quote_id'    => $quote->id,
                    'service_id'  => $item['service_id'] ?? null,
                    'part_id'     => $item['part_id'] ?? null,
                    'description' => $item['description'],
                    'quantity'    => $item['quantity'],
                    'unit_price'  => $unitPrice,
                    'amount'      => RepairOrder::normalizeVndAmount($item['quantity'] * $unitPrice),
                    'created_at'  => $now,
                    'updated_at'  => $now,
                ];
            }
            if (! empty($quoteItemRows)) {
                QuoteItem::insert($quoteItemRows);
            }

            // Cập nhật giá trên đơn hàng
            $orderUpdates = [
                'total_price' => $totalAmount,
                'status'      => 'waiting_approval',
            ];
            if ($order->initial_price === null || (float) $order->initial_price <= 1) {
                $orderUpdates['initial_price'] = $totalAmount;
            }
            $order->update($orderUpdates);

            // Tạo thông báo vận hành khi lập báo giá
            $notif = Notification::create([
                'branch_id'  => $order->branch_id,
                'order_id'   => $order->id,
                'type'       => 'quote_action',
                'title'      => 'Đã tạo báo giá mới',
                'message'    => "Báo giá {$quoteNumber} cho đơn {$order->order_code} trị giá " . number_format($totalAmount) . " ₫ đã được tạo và chờ duyệt.",
                'severity'   => 'info',
                'action_url' => "/repairs?id={$order->id}",
            ]);

            $eventTimestamp = now()->toIso8601String();
            DB::afterCommit(function () use ($notif, $order, $eventTimestamp) {
                OrderOperationalEvent::dispatch(
                    $notif->id,
                    $order->id,
                    $order->order_code,
                    $notif->title,
                    $notif->message,
                    'info',
                    $eventTimestamp,
                    "/repairs?id={$order->id}",
                    $order->branch_id,
                    'cskh',
                    null,
                    'quote_action',
                    'quote.created'
                );
            });

            return $this->success($quote->load('items'), 'Tạo báo giá thành công.', 201);
        });
    }

    /**
     * Khách hàng / CSKH duyệt báo giá.
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $quote = RepairQuote::with('repairOrder')->find($id);

        if (! $quote || ! $quote->repairOrder) {
            return $this->empty('Không tìm thấy báo giá.');
        }

        $user = $request->user();
        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && $user->branch_id && (int) $quote->repairOrder->branch_id !== (int) $user->branch_id) {
            return $this->failure('Bạn không có quyền duyệt báo giá của chi nhánh khác.', 403);
        }

        return DB::transaction(function () use ($quote, $request) {
            $lockedQuote = RepairQuote::with('repairOrder')->lockForUpdate()->find($quote->id) ?? $quote;
            $order = $lockedQuote->repairOrder;

            if (in_array($lockedQuote->status, ['approved', 'declined', 'rejected'], true)) {
                return $this->failure('Báo giá này đã được xử lý phản hồi trước đó.', 422);
            }

            if ($order && in_array($order->status, ['completed', 'cancelled'], true)) {
                return $this->failure('Không thể duyệt báo giá của đơn hàng đã hoàn tất hoặc đã hủy.', 422);
            }

            $lockedQuote->update([
                'status'       => 'approved',
                'responded_at' => Carbon::now(),
            ]);

            if ($order) {
                $normalizedQuoteAmount = RepairOrder::normalizeVndAmount($lockedQuote->total_amount);
                $orderUpdates = [
                    'status'               => 'waiting_tech',
                    'customer_approved_at' => Carbon::now(),
                    'total_price'          => $normalizedQuoteAmount,
                ];
                if ($order->initial_price === null || (float) $order->initial_price <= 1) {
                    $orderUpdates['initial_price'] = $normalizedQuoteAmount;
                }
                $order->update($orderUpdates);

                AuditLog::create([
                    'user_id'        => $request->user()->id,
                    'user_name'      => $request->user()->name,
                    'action'         => 'Duyệt báo giá',
                    'auditable_type' => 'RepairQuote',
                    'auditable_id'   => $lockedQuote->id,
                    'details'        => "Khách đã duyệt báo giá {$lockedQuote->quote_number} trị giá " . number_format($lockedQuote->total_amount) . " ₫",
                ]);

                // Tạo thông báo vận hành khi duyệt báo giá
                $notif = Notification::create([
                    'branch_id'  => $order->branch_id,
                    'order_id'   => $order->id,
                    'type'       => 'quote_action',
                    'title'      => 'Khách hàng duyệt báo giá',
                    'message'    => "Báo giá {$lockedQuote->quote_number} của đơn {$order->order_code} (" . number_format($lockedQuote->total_amount) . " ₫) đã được phê duyệt.",
                    'severity'   => 'success',
                    'action_url' => "/repairs?id={$order->id}",
                ]);

                $eventTimestamp = now()->toIso8601String();
                DB::afterCommit(function () use ($notif, $order, $eventTimestamp) {
                    OrderOperationalEvent::dispatch(
                        $notif->id,
                        $order->id,
                        $order->order_code,
                        $notif->title,
                        $notif->message,
                        'success',
                        $eventTimestamp,
                        "/repairs?id={$order->id}",
                        $order->branch_id,
                        'technician',
                        null,
                        'quote_action',
                        'quote.approved'
                    );
                });
            }

            return $this->success($lockedQuote, 'Đã phê duyệt báo giá.');
        });
    }

    /**
     * Khách hàng từ chối báo giá.
     */
    public function reject(Request $request, int $id): JsonResponse
    {
        $quote = RepairQuote::with('repairOrder')->find($id);

        if (! $quote || ! $quote->repairOrder) {
            return $this->empty('Không tìm thấy báo giá.');
        }

        $user = $request->user();
        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && $user->branch_id && (int) $quote->repairOrder->branch_id !== (int) $user->branch_id) {
            return $this->failure('Bạn không có quyền từ chối báo giá của chi nhánh khác.', 403);
        }

        if (! $request->filled('reason') && $request->filled('decline_reason')) {
            $request->merge(['reason' => $request->input('decline_reason')]);
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        return DB::transaction(function () use ($quote, $validated, $request) {
            $lockedQuote = RepairQuote::with('repairOrder')->lockForUpdate()->find($quote->id) ?? $quote;
            $order = $lockedQuote->repairOrder;

            if (in_array($lockedQuote->status, ['approved', 'declined', 'rejected'], true)) {
                return $this->failure('Báo giá này đã được xử lý phản hồi trước đó.', 422);
            }

            if ($order && in_array($order->status, ['completed', 'cancelled'], true)) {
                return $this->failure('Không thể từ chối báo giá của đơn hàng đã hoàn tất hoặc đã hủy.', 422);
            }

            $lockedQuote->update([
                'status'         => 'declined',
                'responded_at'   => Carbon::now(),
                'decline_reason' => $validated['reason'],
            ]);

            if ($order) {
                $order->update([
                    'status'               => 'rejected',
                    'customer_declined_at' => Carbon::now(),
                    'decline_reason'       => $validated['reason'],
                ]);

                AuditLog::create([
                    'user_id'        => $request->user()->id,
                    'user_name'      => $request->user()->name,
                    'action'         => 'Từ chối báo giá',
                    'auditable_type' => 'RepairQuote',
                    'auditable_id'   => $quote->id,
                    'details'        => "Khách từ chối báo giá {$quote->quote_number}. Lý do: {$validated['reason']}",
                ]);

                // Tạo thông báo vận hành khi từ chối báo giá
                $notif = Notification::create([
                    'branch_id'  => $order->branch_id,
                    'order_id'   => $order->id,
                    'type'       => 'quote_action',
                    'title'      => 'Khách hàng từ chối báo giá',
                    'message'    => "Khách từ chối báo giá {$quote->quote_number} của đơn {$order->order_code}. Lý do: {$validated['reason']}",
                    'severity'   => 'danger',
                    'action_url' => "/repairs?id={$order->id}",
                ]);

                $eventTimestamp = now()->toIso8601String();
                DB::afterCommit(function () use ($notif, $order, $eventTimestamp) {
                    OrderOperationalEvent::dispatch(
                        $notif->id,
                        $order->id,
                        $order->order_code,
                        $notif->title,
                        $notif->message,
                        'danger',
                        $eventTimestamp,
                        "/repairs?id={$order->id}",
                        $order->branch_id,
                        'cskh',
                        null,
                        'quote_action',
                        'quote.rejected'
                    );
                });
            }

            return $this->success($lockedQuote, 'Đã ghi nhận từ chối báo giá.');
        });
    }
}
