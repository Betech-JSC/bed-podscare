<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\User;
use App\Services\RefundService;
use App\Support\PhoneHelper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class PaymentController extends Controller
{
    /**
     * Danh sách phiếu thu / thanh toán.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Payment::with([
            'repairOrder.customer',
            'repairOrder.deviceModel',
            'repairOrder.branch',
            'receivedByUser:id,name',
            'refundedByUser:id,name',
        ]);

        if ($user) {
            $query->whereHas('repairOrder', function ($q) use ($user, $request) {
                if ($user->role !== 'super_admin') {
                    $q->where('tenant_id', $user->tenant_id);
                }
                if (! in_array($user->role, ['admin', 'super_admin'], true)) {
                    $q->where('branch_id', $user->branch_id);
                } elseif ($branchId = $request->input('branch_id')) {
                    if ($branchId !== 'all') {
                        $q->where('branch_id', $branchId);
                    }
                }
            });
        }

        if ($orderIdentifier = $request->input('repair_order_id') ?? $request->input('order_code')) {
            $cleanOrderId = PhoneHelper::sanitizeText((string) $orderIdentifier);
            if (is_numeric($cleanOrderId)) {
                $query->where('repair_order_id', (int) $cleanOrderId);
            } else {
                $query->whereHas('repairOrder', fn ($q) => $q->where('order_code', $cleanOrderId));
            }
        }

        $rawSearch = $request->input('q') ?? $request->input('search');
        $search = PhoneHelper::sanitizeText($rawSearch);
        if ($search !== '') {
            $searchLower = mb_strtolower($search, 'UTF-8');
            $matchedMethods = [];
            if (str_contains($searchLower, 'tiền mặt') || str_contains($searchLower, 'tien mat') || str_contains($searchLower, 'cash')) {
                $matchedMethods[] = 'cash';
            }
            if (
                str_contains($searchLower, 'vietqr')
                || str_contains($searchLower, 'chuyển khoản')
                || str_contains($searchLower, 'chuyen khoan')
                || str_contains($searchLower, 'sepay')
                || str_contains($searchLower, 'bank_transfer')
                || str_contains($searchLower, 'transfer')
            ) {
                array_push($matchedMethods, 'bank_transfer', 'transfer', 'vietqr', 'sepay');
            }
            if (str_contains($searchLower, 'thẻ') || str_contains($searchLower, 'pos') || str_contains($searchLower, 'card')) {
                array_push($matchedMethods, 'card', 'card_pos');
            }
            if (str_contains($searchLower, 'ví') || str_contains($searchLower, 'wallet')) {
                $matchedMethods[] = 'wallet';
            }

            $query->where(function ($q) use ($search, $matchedMethods) {
                $q->where('payment_code', 'like', "%{$search}%")
                  ->orWhere('transaction_ref', 'like', "%{$search}%")
                  ->orWhere('notes', 'like', "%{$search}%")
                  ->orWhere('payment_method', 'like', "%{$search}%");

                if (! empty($matchedMethods)) {
                    $q->orWhereIn('payment_method', array_values(array_unique($matchedMethods)));
                }

                $q->orWhereHas('repairOrder', function ($rq) use ($search) {
                    $rq->where('order_code', 'like', "%{$search}%")
                       ->orWhere('serial_number', 'like', "%{$search}%")
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

        if ($status = $request->input('status')) {
            if (is_array($status) || (is_string($status) && str_contains($status, ','))) {
                $rawStatuses = is_array($status) ? $status : array_map('trim', explode(',', $status));
                $expandedStatuses = [];
                foreach (array_filter($rawStatuses) as $st) {
                    if (in_array($st, ['paid', 'completed'], true)) {
                        array_push($expandedStatuses, 'paid', 'completed');
                    } else {
                        $expandedStatuses[] = $st;
                    }
                }
                $query->whereIn('status', array_values(array_unique($expandedStatuses)));
            } elseif ($status !== 'all') {
                if (in_array($status, ['paid', 'completed'], true)) {
                    $query->whereIn('status', ['paid', 'completed']);
                } else {
                    $query->where('status', $status);
                }
            }
        }

        if ($method = $request->input('payment_method')) {
            if ($method !== 'all') {
                if (in_array($method, ['transfer', 'vietqr', 'sepay', 'bank_transfer'], true)) {
                    $query->whereIn('payment_method', ['transfer', 'vietqr', 'sepay', 'bank_transfer']);
                } elseif (in_array($method, ['card', 'card_pos'], true)) {
                    $query->whereIn('payment_method', ['card', 'card_pos']);
                } else {
                    $query->where('payment_method', $method);
                }
            }
        }

        if ($date = $request->input('date')) {
            if (is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                $startOfDay = Carbon::parse($date)->startOfDay();
                $endOfDay = Carbon::parse($date)->endOfDay();

                $query->where(function ($dq) use ($startOfDay, $endOfDay) {
                    $dq->whereBetween('paid_at', [$startOfDay, $endOfDay])
                        ->orWhere(function ($fallbackQ) use ($startOfDay, $endOfDay) {
                            $fallbackQ->whereNull('paid_at')
                                ->whereBetween('created_at', [$startOfDay, $endOfDay]);
                        });
                });
            }
        } else {
            $fromDate = $request->input('from_date');
            $toDate = $request->input('to_date');

            if ($fromDate && is_string($fromDate) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fromDate)) {
                $start = Carbon::parse($fromDate)->startOfDay();
                $query->where(function ($dq) use ($start) {
                    $dq->where('paid_at', '>=', $start)
                        ->orWhere(function ($fallbackQ) use ($start) {
                            $fallbackQ->whereNull('paid_at')
                                ->where('created_at', '>=', $start);
                        });
                });
            }

            if ($toDate && is_string($toDate) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $toDate)) {
                $end = Carbon::parse($toDate)->endOfDay();
                $query->where(function ($dq) use ($end) {
                    $dq->where('paid_at', '<=', $end)
                        ->orWhere(function ($fallbackQ) use ($end) {
                            $fallbackQ->whereNull('paid_at')
                                ->where('created_at', '<=', $end);
                        });
                });
            }
        }

        // Tính thống kê tổng (summary) trên toàn bộ tập dữ liệu khớp bộ lọc trước khi cắt trang
        $statsRow = (clone $query)->withOnly([])->reorder()->selectRaw("
            COUNT(*) as total_count,
            SUM(CASE WHEN status IN ('paid', 'completed') THEN 1 ELSE 0 END) as completed_count,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) as refunded_count,
            SUM(CASE WHEN status IN ('paid', 'completed') THEN amount ELSE 0 END) as total_collected,
            SUM(CASE WHEN status IN ('paid', 'completed') AND payment_method IN ('transfer', 'vietqr', 'sepay', 'bank_transfer') THEN amount ELSE 0 END) as transfer_collected,
            SUM(CASE WHEN status IN ('paid', 'completed') AND payment_method = 'cash' THEN amount ELSE 0 END) as cash_collected,
            SUM(CASE WHEN status IN ('paid', 'completed') AND payment_method IN ('card', 'card_pos') THEN amount ELSE 0 END) as card_collected,
            SUM(CASE WHEN status IN ('paid', 'completed') AND payment_method = 'wallet' THEN amount ELSE 0 END) as wallet_collected,
            SUM(CASE WHEN status = 'refunded' THEN (CASE WHEN COALESCE(refund_amount, 0) > 0 THEN refund_amount ELSE amount END) ELSE COALESCE(refund_amount, 0) END) as refunded_amount,
            SUM(CASE WHEN status IN ('paid', 'completed') AND payment_method IN ('transfer', 'vietqr', 'sepay', 'bank_transfer') THEN 1 ELSE 0 END) as transfer_count,
            SUM(CASE WHEN status IN ('paid', 'completed') AND payment_method = 'cash' THEN 1 ELSE 0 END) as cash_count,
            SUM(CASE WHEN status IN ('paid', 'completed') AND payment_method IN ('card', 'card_pos') THEN 1 ELSE 0 END) as card_count
        ")->first();

        $toNum = static fn ($val): int|float => ((float) $val == (int) round((float) $val))
            ? (int) round((float) $val)
            : (float) $val;

        $totalCollected = $toNum($statsRow->total_collected ?? 0);
        $transferCollected = $toNum($statsRow->transfer_collected ?? 0);
        $cashCollected = $toNum($statsRow->cash_collected ?? 0);
        $cardCollected = $toNum($statsRow->card_collected ?? 0);
        $walletCollected = $toNum($statsRow->wallet_collected ?? 0);
        $refundedAmount = $toNum($statsRow->refunded_amount ?? 0);
        $totalCount = (int) ($statsRow->total_count ?? 0);
        $completedCount = (int) ($statsRow->completed_count ?? 0);
        $pendingCount = (int) ($statsRow->pending_count ?? 0);
        $refundedCount = (int) ($statsRow->refunded_count ?? 0);
        $transferCount = (int) ($statsRow->transfer_count ?? 0);
        $cashCount = (int) ($statsRow->cash_count ?? 0);
        $cardCount = (int) ($statsRow->card_count ?? 0);

        $summary = [
            'total_amount'       => $totalCollected,
            'total_revenue'      => $totalCollected,
            'total_collected'    => $totalCollected,
            'transfer_amount'    => $transferCollected,
            'transfer_collected' => $transferCollected,
            'vietqr_amount'      => $transferCollected,
            'sepay_amount'       => $transferCollected,
            'cash_amount'        => $cashCollected,
            'cash_collected'     => $cashCollected,
            'card_amount'        => $cardCollected,
            'card_collected'     => $cardCollected,
            'wallet_amount'      => $walletCollected,
            'refunded_amount'    => $refundedAmount,
            'refund_amount'      => $refundedAmount,
            'total_count'        => $totalCount,
            'completed_count'    => $completedCount,
            'paid_count'         => $completedCount,
            'pending_count'      => $pendingCount,
            'refunded_count'     => $refundedCount,
            'transfer_count'     => $transferCount,
            'cash_count'         => $cashCount,
            'card_count'         => $cardCount,
        ];

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
                'summary'        => $summary,
            ], 'Lấy danh sách phiếu thanh toán thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $payments = $query->latest('id')->paginate($perPage);
        $paginated = $payments->toArray();
        $paginated['summary'] = $summary;

        return $this->success($paginated, 'Lấy danh sách phiếu thanh toán thành công.');
    }

    /**
     * Lập phiếu thu thanh toán cho đơn sửa chữa.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $allowedRoles = ['admin', 'super_admin', 'cskh', 'receptionist', 'cashier'];
        if (! $user || ! in_array($user->role, $allowedRoles, true)) {
            return $this->failure('Bạn không có quyền lập phiếu thu thanh toán.', 403);
        }

        $orderIdentifier = $request->input('repair_order_id') ?? $request->input('order_code');
        if ($orderIdentifier !== null) {
            if (is_numeric($orderIdentifier)) {
                $foundOrder = RepairOrder::find((int) $orderIdentifier);
            } else {
                $foundOrder = RepairOrder::where('order_code', (string) $orderIdentifier)->first();
            }
            if ($foundOrder) {
                $request->merge(['repair_order_id' => $foundOrder->id]);
            }
        }

        $validated = $request->validate([
            'repair_order_id'     => 'required|exists:repair_orders,id',
            'amount'              => 'required|numeric|min:0',
            'service_price'       => 'nullable|numeric|min:0',
            'payment_method'      => 'required|in:cash,bank_transfer,card_pos,wallet',
            'transaction_ref'     => 'nullable|string|max:100',
            'notes'               => 'nullable|string',
            'auto_confirm'        => 'nullable|boolean',
            'discount_type'       => 'nullable|in:none,percent,fixed',
            'discount_value'      => 'nullable|numeric|min:0',
            'discount_amount'     => 'nullable|numeric|min:0',
            'warranty_months'     => 'nullable|integer|in:3,6,9,12',
            'warranty_terms_days' => 'nullable|integer|min:1',
        ]);

        $validated['amount'] = RepairOrder::normalizeVndAmount($validated['amount']);

        return DB::transaction(function () use ($request, $validated, $user) {
            $order = RepairOrder::with(['customer', 'warranties'])->lockForUpdate()->findOrFail($validated['repair_order_id']);

            if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && ! empty($user->branch_id) && (int) $order->branch_id !== (int) $user->branch_id) {
                return $this->failure('Bạn không có quyền tạo phiếu thanh toán cho đơn hàng thuộc chi nhánh khác.', 403);
            }

            if ($order->status === 'completed') {
                return $this->failure('Đơn hàng đã hoàn tất hoặc đã được thanh toán.', 422);
            }

            if (! in_array($order->status, ['ready_for_return', 'waiting_pickup', 'in_repair', 'waiting_qc', 'qc_pending', 'qc_inspecting'], true)) {
                return $this->failure('Chỉ có thể tạo phiếu thanh toán cho đơn hàng đang sửa chữa, chờ QC, sẵn sàng giao trả hoặc chờ khách nhận.', 422);
            }

            if ($request->has('service_price')) {
                $newPrice = RepairOrder::normalizeVndAmount($request->input('service_price'));
                $order->total_price = $newPrice;
                if (! $order->initial_price || (float) $order->initial_price <= 1) {
                    $additionalSum = 0.0;
                    foreach (($order->additional_services ?? []) as $srv) {
                        $additionalSum += RepairOrder::normalizeVndAmount($srv['price'] ?? 0);
                    }
                    $order->initial_price = max(0.0, RepairOrder::normalizeVndAmount($newPrice - $additionalSum));
                }
            } elseif ($order->initial_price !== null && (float) $order->initial_price <= 1) {
                $order->initial_price = 0.0;
                $order->recalculateTotalPrice();
            }

            // Xử lý thông tin chiết khấu / giảm giá
            $discountAmount = isset($validated['discount_amount']) ? RepairOrder::normalizeVndAmount($validated['discount_amount']) : 0.0;
            $discountType = $validated['discount_type'] ?? null;
            $discountValue = $validated['discount_value'] ?? null;

            $paidPaymentsQuery = $order->payments()->where('status', 'paid')->lockForUpdate();
            $hasPaidPayment = (clone $paidPaymentsQuery)->exists();
            $paidSum = RepairOrder::normalizeVndAmount($paidPaymentsQuery->sum('amount'));
            $orderTotal = RepairOrder::normalizeVndAmount($order->total_price ?? 0);
            $effectiveTotal = max(0.0, $orderTotal - $discountAmount);
            $remaining = max(0.0, $effectiveTotal - $paidSum);

            if (($effectiveTotal > 0 && $paidSum >= $effectiveTotal) || ($effectiveTotal <= 0 && $hasPaidPayment)) {
                return $this->failure('Đơn hàng đã hoàn tất hoặc đã có phiếu thanh toán thành công.', 422);
            }

            if ($validated['amount'] > $remaining) {
                return $this->failure('Số tiền thu vượt quá số tiền còn phải thanh toán của đơn hàng.', 422);
            }

            if (! empty($validated['transaction_ref'])) {
                $duplicateRefExists = Payment::where('transaction_ref', $validated['transaction_ref'])
                    ->whereHas('repairOrder', fn ($q) => $q->withoutGlobalScopes()->where('tenant_id', $order->tenant_id))
                    ->exists();

                if ($duplicateRefExists) {
                    return $this->failure('Mã giao dịch tham chiếu (transaction_ref) đã được sử dụng cho một phiếu thu khác trong cửa hàng.', 422);
                }
            }

            $year = date('y');
            do {
                $randomNum = str_pad((string) random_int(100, 999999), 6, '0', STR_PAD_LEFT);
                $paymentCode = "FX{$year}-PY-{$randomNum}";
            } while (Payment::where('payment_code', $paymentCode)->exists());

            $isBankTransfer = $validated['payment_method'] === 'bank_transfer';
            $isAutoConfirm = $request->boolean('auto_confirm') || $request->input('status') === 'paid';
            $status = ($isBankTransfer && ! $isAutoConfirm) ? 'pending' : 'paid';
            $paidAt = $status === 'paid' ? Carbon::now() : null;

            $paymentNotes = $validated['notes'] ?? null;
            if ($discountAmount > 0) {
                $discountDesc = $discountType === 'percent'
                    ? "Chiết khấu {$discountValue}%: -" . number_format($discountAmount) . " ₫"
                    : "Giảm giá: -" . number_format($discountAmount) . " ₫";
                $paymentNotes = $paymentNotes
                    ? "[{$discountDesc}] {$paymentNotes}"
                    : "[{$discountDesc}]";
            }

            // Xử lý thời hạn bảo hành điện tử (3, 6, 9, 12 tháng hoặc số ngày cụ thể)
            $warrantyDays = $validated['warranty_terms_days']
                ?? (isset($validated['warranty_months']) && $validated['warranty_months'] ? ($validated['warranty_months'] == 12 ? 365 : $validated['warranty_months'] * 30) : null)
                ?? $order->warranty_terms_days
                ?? 90;

            $order->warranty_terms_days = $warrantyDays;

            $payment = Payment::create([
                'payment_code'        => $paymentCode,
                'repair_order_id'     => $order->id,
                'amount'              => $validated['amount'],
                'payment_method'      => $validated['payment_method'],
                'transaction_ref'     => $validated['transaction_ref'] ?? null,
                'status'              => $status,
                'paid_at'             => $paidAt,
                'received_by_user_id' => $request->user()->id,
                'notes'               => $paymentNotes,
            ]);

            // Tự động hoàn tất đơn hàng, kích hoạt bảo hành điện tử và tích lũy doanh số khi thu đủ tiền trực tiếp
            if ($status === 'paid' && ($isAutoConfirm || $validated['payment_method'] === 'cash')) {
                // Đồng bộ vào sổ quỹ và két ca trực khi thu tiền mặt
                if ($validated['payment_method'] === 'cash') {
                    app(\App\Services\CashTransactionService::class)->recordRepairOrderCashPayment(
                        (int) $order->tenant_id,
                        (int) $order->branch_id,
                        (int) $request->user()->id,
                        $payment,
                        $order
                    );
                }

                if (($paidSum + $validated['amount']) >= $effectiveTotal) {
                    app(\App\Services\OrderWorkflowService::class)->completeOrderLifecycle($order, [
                        'actor_id'       => (int) $request->user()->id,
                        'user'           => $request->user(),
                        'revenue_amount' => (float) ($paidSum + $validated['amount']),
                        'warranty_days'  => (int) $warrantyDays,
                    ]);
                } else {
                    $order->save();
                }
            } else {
                $order->save();
            }

            $discountInfo = $discountAmount > 0 ? " (Đã giảm: " . number_format($discountAmount) . " ₫)" : "";
            AuditLog::create([
                'user_id'        => $request->user()->id,
                'user_name'      => $request->user()->name,
                'action'         => 'Thu tiền',
                'auditable_type' => 'Payment',
                'auditable_id'   => $payment->id,
                'details'        => "Thu tiền đơn {$order->order_code}: Thực thu " . number_format($validated['amount']) . " ₫{$discountInfo} qua {$validated['payment_method']}" . ($status === 'paid' ? ' (Đã xác nhận)' : ' (Chờ thanh toán)'),
                'ip_address'     => $request->ip(),
            ]);

            return $this->success($payment->load('repairOrder'), 'Lập phiếu thu thành công.', 201);
        });
    }

    /**
     * Xem chi tiết phiếu thu / thanh toán (phục vụ Polling và biên nhận).
     */
    public function show(Request $request, int|string $id): JsonResponse
    {
        $payment = Payment::with(['repairOrder.customer', 'receivedByUser:id,name'])->findOrFail($id);
        $this->authorizePaymentAccess($payment, $request->user());

        return $this->success($payment, 'Lấy thông tin phiếu thanh toán thành công.');
    }

    /**
     * Sinh mã VietQR cho phiếu thanh toán / đơn sửa chữa tại quầy.
     */
    public function vietqr(Request $request, int|string $id): JsonResponse
    {
        $payment = Payment::with('repairOrder.tenant')->findOrFail($id);
        $user = $request->user();
        $user?->loadMissing('tenant');
        $this->authorizePaymentAccess($payment, $user);
        $order = $payment->repairOrder;

        // Ưu tiên lấy thông tin tài khoản ngân hàng của Tenant thuộc đơn hàng
        $tenant = $order?->tenant ?? $user?->tenant;

        $hasTenantBank = $tenant && ! empty($tenant->bank_account_number) && ! empty($tenant->bank_code);

        $accNumber = $hasTenantBank ? $tenant->bank_account_number : config('sepay.account_number');
        $bankCode = $hasTenantBank ? $tenant->bank_code : config('sepay.bank_code');
        $accountHolder = $hasTenantBank ? $tenant->bank_account_holder : config('sepay.account_holder');
        $template = config('sepay.qr_template', 'compact2');

        $amount = (int) $payment->amount;
        $transferContent = $order ? $order->order_code : $payment->payment_code;

        $qrUrl = (! empty($accNumber) && ! empty($bankCode))
            ? "https://qr.sepay.vn/img?acc={$accNumber}&bank={$bankCode}&amount={$amount}&des={$transferContent}&template={$template}"
            : null;

        $message = $hasTenantBank
            ? 'Sinh mã VietQR thành công theo tài khoản cửa hàng.'
            : 'Cửa hàng chưa cài đặt tài khoản ngân hàng. Vui lòng cấu hình trong Cài đặt thương hiệu.';

        return $this->success([
            'payment_id'       => $payment->id,
            'payment_code'     => $payment->payment_code,
            'order_id'         => $order?->id,
            'order_code'       => $order?->order_code,
            'amount'           => (float) $payment->amount,
            'account_number'   => $accNumber,
            'bank_code'        => $bankCode,
            'account_holder'   => $accountHolder,
            'transfer_content' => $transferContent,
            'qr_url'           => $qrUrl,
            'is_custom_bank'   => $hasTenantBank,
            'status'           => $payment->status,
        ], $message);
    }

    /**
     * Alias duyệt thanh toán tiền mặt / chuyển khoản.
     */
    public function confirmCash(Request $request, int|string $id): JsonResponse
    {
        return $this->confirm($request, $id);
    }

    /**
     * Xác nhận duyệt phiếu thanh toán chuyển khoản (CSKH / Thu ngân / Admin).
     */
    public function confirm(Request $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return $this->failure('Chưa xác thực danh tính.', 401);
        }

        $allowedRoles = ['admin', 'super_admin', 'cskh', 'receptionist', 'cashier'];
        if (! in_array($user->role, $allowedRoles, true)) {
            return $this->failure('Bạn không có quyền duyệt thanh toán này.', 403);
        }

        $validated = $request->validate([
            'transaction_ref' => 'nullable|string|max:100',
            'notes'           => 'nullable|string|max:500',
        ]);

        return DB::transaction(function () use ($request, $id, $user, $validated) {
            $payment = Payment::with(['repairOrder.customer', 'repairOrder.warranties'])->lockForUpdate()->findOrFail($id);
            $this->authorizePaymentAccess($payment, $user);

            if ($payment->status === 'paid') {
                return $this->failure('Phiếu thanh toán này đã được duyệt thanh toán trước đó.', 422);
            }

            if ($payment->status !== 'pending') {
                return $this->failure('Chỉ có thể duyệt phiếu thanh toán đang ở trạng thái chờ xử lý (pending).', 422);
            }

            $order = $payment->repair_order_id
                ? RepairOrder::with(['customer', 'warranties'])->lockForUpdate()->find($payment->repair_order_id)
                : $payment->repairOrder;
            $order?->loadMissing(['customer', 'warranties']);

            $effectiveRef = ! empty($validated['transaction_ref'])
                ? $validated['transaction_ref']
                : $payment->transaction_ref;
            $tenantId = $order?->tenant_id ?? $user->tenant_id;

            if (! empty($effectiveRef) && $tenantId) {
                $duplicateRefExists = Payment::where('id', '!=', $payment->id)
                    ->where('transaction_ref', $effectiveRef)
                    ->whereHas('repairOrder', fn ($q) => $q->withoutGlobalScopes()->where('tenant_id', $tenantId))
                    ->exists();

                if ($duplicateRefExists) {
                    return $this->failure('Mã giao dịch tham chiếu (transaction_ref) đã được sử dụng cho một phiếu thu khác trong cửa hàng.', 422);
                }
            }

            if ($order) {
                $paidSum = RepairOrder::normalizeVndAmount(
                    $order->payments()
                        ->where('status', 'paid')
                        ->where('id', '!=', $payment->id)
                        ->lockForUpdate()
                        ->sum('amount')
                );
                $orderTotal = RepairOrder::normalizeVndAmount($order->total_price ?? 0);
                $remaining = max(0.0, $orderTotal - $paidSum);
                $paymentAmount = RepairOrder::normalizeVndAmount($payment->amount ?? 0);

                if (($orderTotal > 0 && $paidSum >= $orderTotal) || $paymentAmount > $remaining) {
                    return $this->failure('Số tiền thu vượt quá số tiền còn phải thanh toán của đơn hàng.', 422);
                }
            }

            $now = Carbon::now();
            $payment->status = 'paid';
            $payment->paid_at = $now;
            $payment->received_by_user_id = $user->id;

            if (! empty($validated['transaction_ref'])) {
                $payment->transaction_ref = $validated['transaction_ref'];
            }
            if (! empty($validated['notes'])) {
                $payment->notes = $validated['notes'];
            }

            $payment->save();

            if ($order) {
                // Đồng bộ vào sổ quỹ và két ca trực khi duyệt thanh toán tiền mặt
                if ($payment->payment_method === 'cash') {
                    app(\App\Services\CashTransactionService::class)->recordRepairOrderCashPayment(
                        (int) $order->tenant_id,
                        (int) $order->branch_id,
                        (int) $user->id,
                        $payment,
                        $order
                    );
                }

                app(\App\Services\OrderWorkflowService::class)->completeOrderLifecycle($order, [
                    'actor_id'              => (int) $user->id,
                    'user'                  => $user,
                    'revenue_amount'        => (float) $payment->amount,
                    'default_warranty_days' => 90,
                ]);
            }

            AuditLog::create([
                'tenant_id'      => $order?->tenant_id ?? $user->tenant_id,
                'user_id'        => $user->id,
                'user_name'      => $user->name,
                'action'         => 'Duyệt thanh toán',
                'auditable_type' => 'Payment',
                'auditable_id'   => $payment->id,
                'details'        => "CSKH {$user->name} đã duyệt thanh toán " . number_format((float) $payment->amount) . " ₫" . ($order ? " cho đơn {$order->order_code}" : '') . ($payment->transaction_ref ? " (Mã GD: {$payment->transaction_ref})" : ''),
                'ip_address'     => $request->ip(),
            ]);

            return $this->success(
                $payment->fresh(['repairOrder.customer', 'receivedByUser:id,name']),
                'Duyệt thanh toán thành công.'
            );
        });
    }

    /**
     * Hoàn tiền cho phiếu thanh toán đã thu.
     */
    public function refund(Request $request, int|string $id, RefundService $refundService): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user?->role, ['admin', 'super_admin', 'cashier', 'cskh'], true)) {
            return $this->failure('Bạn không có quyền thực hiện hoàn tiền đơn hàng.', 403);
        }

        $payment = Payment::with(['repairOrder.customer'])->findOrFail($id);
        $this->authorizePaymentAccess($payment, $user);

        $validated = $request->validate([
            'refund_amount'   => 'nullable|numeric|min:1',
            'refund_method'   => 'required|in:cash,bank_transfer',
            'refund_reason'   => 'required|string|max:500',
            'transaction_ref' => 'nullable|string|max:100',
        ], [
            'refund_method.required' => 'Vui lòng chọn phương thức hoàn tiền (tiền mặt hoặc chuyển khoản).',
            'refund_method.in'       => 'Phương thức hoàn tiền không hợp lệ.',
            'refund_reason.required' => 'Vui lòng nhập lý do hoàn tiền.',
        ]);

        try {
            $refundedPayment = $refundService->processRefund($payment, $user, $validated);

            return $this->success(
                $refundedPayment,
                'Hoàn tiền đơn hàng thành công.'
            );
        } catch (\DomainException $e) {
            return $this->failure($e->getMessage(), 422);
        }
    }

    /**
     * Hoàn tiền cho đơn hàng thông qua mã đơn hoặc ID đơn hàng.
     */
    public function refundOrder(Request $request, int|string $id, RefundService $refundService): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user?->role, ['admin', 'super_admin', 'cashier', 'cskh'], true)) {
            return $this->failure('Bạn không có quyền thực hiện hoàn tiền đơn hàng.', 403);
        }

        $order = is_numeric($id)
            ? RepairOrder::find((int) $id)
            : RepairOrder::where('order_code', (string) $id)->first();

        if (! $order) {
            return $this->failure('Không tìm thấy đơn hàng cần hoàn tiền.', 404);
        }

        $payment = Payment::where('repair_order_id', $order->id)
            ->where('status', 'paid')
            ->latest('id')
            ->first();

        if (! $payment) {
            return $this->failure('Đơn hàng không có giao dịch thanh toán hợp lệ (paid) để hoàn tiền.', 422);
        }

        return $this->refund($request, $payment->id, $refundService);
    }

    /**
     * Kiểm tra phân quyền đa tenant và chi nhánh đối với phiếu thanh toán.
     */
    protected function authorizePaymentAccess(Payment $payment, ?User $user): void
    {
        if (! $user) {
            abort(401, 'Chưa xác thực danh tính.');
        }

        if ($user->role === 'super_admin') {
            return;
        }

        $order = ($payment->relationLoaded('repairOrder') && $payment->repairOrder !== null)
            ? $payment->repairOrder
            : $payment->repairOrder()->withoutGlobalScopes()->first();
        if (! $order) {
            abort(404, 'Không tìm thấy đơn hàng liên kết với phiếu thanh toán.');
        }

        if ((int) $order->tenant_id !== (int) $user->tenant_id) {
            abort(403, 'Bạn không có quyền truy cập phiếu thanh toán thuộc cửa hàng khác.');
        }

        if (! in_array($user->role, ['admin', 'super_admin'], true) && ! empty($user->branch_id) && (int) $order->branch_id !== (int) $user->branch_id) {
            abort(403, 'Bạn không có quyền truy cập phiếu thanh toán thuộc chi nhánh khác.');
        }
    }
}
