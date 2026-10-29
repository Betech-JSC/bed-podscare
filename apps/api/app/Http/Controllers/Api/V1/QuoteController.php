<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\OrderOperationalEvent;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Notification;
use App\Models\QuoteItem;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Support\PhoneHelper;
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
        $query = RepairQuote::with([
            'repairOrder.customer',
            'repairOrder.deviceModel',
            'repairOrder.branch',
            'items',
            'sentByUser:id,name',
        ]);

        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && $user->branch_id) {
            $query->whereHas('repairOrder', function ($q) use ($user) {
                $q->where('branch_id', $user->branch_id);
            });
        } elseif ($branchId = $request->input('branch_id')) {
            if ($branchId !== 'all') {
                $query->whereHas('repairOrder', function ($q) use ($branchId) {
                    $q->where('branch_id', $branchId);
                });
            } else {
                $query->whereHas('repairOrder');
            }
        } else {
            $query->whereHas('repairOrder');
        }

        if ($orderId = $request->input('repair_order_id')) {
            if (is_numeric($orderId)) {
                $query->where('repair_order_id', (int) $orderId);
            } else {
                $cleanOrderCode = PhoneHelper::sanitizeText((string) $orderId);
                $query->whereHas('repairOrder', fn ($rq) => $rq->where('order_code', $cleanOrderCode));
            }
        }

        if ($rawOrderIds = $request->input('repair_order_ids')) {
            $idList = is_array($rawOrderIds)
                ? $rawOrderIds
                : array_map('trim', explode(',', (string) $rawOrderIds));
            $idList = array_values(array_filter($idList, fn ($v) => $v !== null && $v !== ''));

            if (! empty($idList)) {
                $numericIds = array_values(array_map('intval', array_filter($idList, 'is_numeric')));
                $stringCodes = array_values(array_map(
                    fn ($v) => PhoneHelper::sanitizeText((string) $v),
                    array_filter($idList, fn ($v) => ! is_numeric($v))
                ));

                $query->where(function ($oq) use ($numericIds, $stringCodes) {
                    if (! empty($numericIds)) {
                        $oq->whereIn('repair_order_id', $numericIds);
                    }
                    if (! empty($stringCodes)) {
                        $method = ! empty($numericIds) ? 'orWhereHas' : 'whereHas';
                        $oq->{$method}('repairOrder', function ($rq) use ($stringCodes) {
                            $rq->whereIn('order_code', $stringCodes);
                        });
                    }
                });
            }
        }

        if ($status = $request->input('status')) {
            if (is_array($status) || (is_string($status) && str_contains($status, ','))) {
                $statusList = is_array($status)
                    ? $status
                    : array_map('trim', explode(',', $status));
                $query->whereIn('status', array_values(array_filter($statusList)));
            } elseif ($status !== 'all') {
                $query->where('status', $status);
            }
        }

        $rawSearch = $request->input('q') ?? $request->input('search');
        $search = PhoneHelper::sanitizeText($rawSearch);
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('quote_number', 'like', "%{$search}%")
                  ->orWhere('note', 'like', "%{$search}%")
                  ->orWhereHas('repairOrder', function ($rq) use ($search) {
                      $rq->where('order_code', 'like', "%{$search}%")
                         ->orWhere('serial_number', 'like', "%{$search}%")
                         ->orWhere('issue_description', 'like', "%{$search}%")
                         ->orWhereHas('customer', function ($cq) use ($search) {
                             $cq->where(function ($inner) use ($search) {
                                 $inner->where('name', 'like', "%{$search}%");
                                 PhoneHelper::applyPhoneColumnSearch($inner, 'phone', $search, 'or');
                             });
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
            ], 'Lấy danh sách báo giá thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $quotes = $query->latest('id')->paginate($perPage);

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

            // Tạo thông báo vận hành khi lập báo giá (chỉ dành cho quầy CSKH / Admin vì chứa giá tiền VNĐ)
            $notif = Notification::create([
                'tenant_id'   => $order->tenant_id,
                'branch_id'   => $order->branch_id,
                'order_id'    => $order->id,
                'target_role' => 'cskh',
                'type'        => 'quote_action',
                'title'       => 'Đã tạo báo giá mới',
                'message'     => "Báo giá {$quoteNumber} cho đơn {$order->order_code} trị giá " . number_format($totalAmount) . " ₫ đã được tạo và chờ duyệt.",
                'severity'    => 'info',
                'action_url'  => "/repairs?id={$order->id}",
            ]);

            $eventTimestamp = now()->toIso8601String();
            DB::afterCommit(function () use ($notif, $order, $eventTimestamp) {
                $resolvedTenantId = $notif->tenant_id !== null
                    ? (int) $notif->tenant_id
                    : ($order->tenant_id !== null ? (int) $order->tenant_id : null);

                OrderOperationalEvent::dispatch(
                    $notif->id,
                    $order->id,
                    $order->order_code,
                    $notif->title,
                    $notif->message,
                    'info',
                    $eventTimestamp,
                    "/repairs?id={$order->id}",
                    $order->branch_id !== null ? (int) $order->branch_id : null,
                    'cskh',
                    null,
                    'quote_action',
                    'quote.created',
                    $resolvedTenantId
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

                // 1. Thông báo tài chính cho quầy CSKH / Admin (có chứa số tiền báo giá VNĐ)
                $cskhNotif = Notification::create([
                    'tenant_id'   => $order->tenant_id,
                    'branch_id'   => $order->branch_id,
                    'order_id'    => $order->id,
                    'target_role' => 'cskh',
                    'type'        => 'quote_action',
                    'title'       => 'Khách hàng duyệt báo giá',
                    'message'     => "Báo giá {$lockedQuote->quote_number} của đơn {$order->order_code} (" . number_format($lockedQuote->total_amount) . " ₫) đã được phê duyệt.",
                    'severity'    => 'success',
                    'action_url'  => "/repairs?id={$order->id}",
                ]);

                // 2. Thông báo kỹ thuật độc lập cho xưởng (tuyệt đối không chứa số tiền VNĐ)
                $techNotif = Notification::create([
                    'tenant_id'   => $order->tenant_id,
                    'branch_id'   => $order->branch_id,
                    'order_id'    => $order->id,
                    'target_role' => 'technician',
                    'type'        => 'order_assigned',
                    'title'       => 'Đơn chờ kỹ thuật viên tiếp nhận',
                    'message'     => "Đơn {$order->order_code} đã được khách xác nhận phương án sửa chữa, sẵn sàng tiếp nhận xử lý.",
                    'severity'    => 'info',
                    'action_url'  => "/repairs?id={$order->id}",
                ]);

                $eventTimestamp = now()->toIso8601String();
                DB::afterCommit(function () use ($cskhNotif, $techNotif, $order, $eventTimestamp) {
                    $resolvedTenantId = $cskhNotif->tenant_id !== null
                        ? (int) $cskhNotif->tenant_id
                        : ($order->tenant_id !== null ? (int) $order->tenant_id : null);
                    $resolvedBranchId = $order->branch_id !== null ? (int) $order->branch_id : null;

                    OrderOperationalEvent::dispatch(
                        $cskhNotif->id,
                        $order->id,
                        $order->order_code,
                        $cskhNotif->title,
                        $cskhNotif->message,
                        'success',
                        $eventTimestamp,
                        "/repairs?id={$order->id}",
                        $resolvedBranchId,
                        'cskh',
                        null,
                        'quote_action',
                        'quote.approved',
                        $resolvedTenantId
                    );

                    OrderOperationalEvent::dispatch(
                        $techNotif->id,
                        $order->id,
                        $order->order_code,
                        $techNotif->title,
                        $techNotif->message,
                        'info',
                        $eventTimestamp,
                        "/repairs?id={$order->id}",
                        $resolvedBranchId,
                        'technician',
                        null,
                        'order_assigned',
                        'order.waiting_tech',
                        $resolvedTenantId
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
                    'tenant_id'   => $order->tenant_id,
                    'branch_id'   => $order->branch_id,
                    'order_id'    => $order->id,
                    'target_role' => 'cskh',
                    'type'        => 'quote_action',
                    'title'       => 'Khách hàng từ chối báo giá',
                    'message'     => "Khách từ chối báo giá {$quote->quote_number} của đơn {$order->order_code}. Lý do: {$validated['reason']}",
                    'severity'    => 'danger',
                    'action_url'  => "/repairs?id={$order->id}",
                ]);

                $eventTimestamp = now()->toIso8601String();
                DB::afterCommit(function () use ($notif, $order, $eventTimestamp) {
                    $resolvedTenantId = $notif->tenant_id !== null
                        ? (int) $notif->tenant_id
                        : ($order->tenant_id !== null ? (int) $order->tenant_id : null);

                    OrderOperationalEvent::dispatch(
                        $notif->id,
                        $order->id,
                        $order->order_code,
                        $notif->title,
                        $notif->message,
                        'danger',
                        $eventTimestamp,
                        "/repairs?id={$order->id}",
                        $order->branch_id !== null ? (int) $order->branch_id : null,
                        'cskh',
                        null,
                        'quote_action',
                        'quote.rejected',
                        $resolvedTenantId
                    );
                });
            }

            return $this->success($lockedQuote, 'Đã ghi nhận từ chối báo giá.');
        });
    }
}
