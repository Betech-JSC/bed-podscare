<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Payment;
use App\Models\RepairOrder;
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
        $query = Payment::with(['repairOrder.customer', 'receivedByUser:id,name']);

        if ($orderIdentifier = $request->input('repair_order_id') ?? $request->input('order_code')) {
            if (is_numeric($orderIdentifier)) {
                $query->where('repair_order_id', (int) $orderIdentifier);
            } else {
                $query->whereHas('repairOrder', fn ($q) => $q->where('order_code', (string) $orderIdentifier));
            }
        }

        if ($method = $request->input('payment_method')) {
            $query->where('payment_method', $method);
        }

        $payments = $query->latest('id')->paginate($request->input('per_page', 15));

        return $this->success($payments, 'Lấy danh sách phiếu thanh toán thành công.');
    }

    /**
     * Lập phiếu thu thanh toán cho đơn sửa chữa.
     */
    public function store(Request $request): JsonResponse
    {
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
            'repair_order_id' => 'required|exists:repair_orders,id',
            'amount'          => 'required|numeric|min:1',
            'payment_method'  => 'required|in:cash,bank_transfer,card_pos,wallet',
            'transaction_ref' => 'nullable|string|max:100',
            'notes'           => 'nullable|string',
            'auto_confirm'    => 'nullable|boolean',
        ]);

        return DB::transaction(function () use ($request, $validated) {
            $order = RepairOrder::findOrFail($validated['repair_order_id']);

            $year = date('y');
            $randomNum = str_pad((string) random_int(100, 99999), 4, '0', STR_PAD_LEFT);
            $paymentCode = "FX{$year}-PY-{$randomNum}";

            $isBankTransfer = $validated['payment_method'] === 'bank_transfer';
            $isAutoConfirm = $request->boolean('auto_confirm') || $request->input('status') === 'paid';
            $status = ($isBankTransfer && ! $isAutoConfirm) ? 'pending' : 'paid';
            $paidAt = $status === 'paid' ? Carbon::now() : null;

            $payment = Payment::create([
                'payment_code'        => $paymentCode,
                'repair_order_id'     => $order->id,
                'amount'              => $validated['amount'],
                'payment_method'      => $validated['payment_method'],
                'transaction_ref'     => $validated['transaction_ref'] ?? null,
                'status'              => $status,
                'paid_at'             => $paidAt,
                'received_by_user_id' => $request->user()->id,
                'notes'               => $validated['notes'] ?? null,
            ]);

            // Tự động hoàn tất đơn hàng, kích hoạt bảo hành điện tử và tích lũy doanh số khi thu tiền trực tiếp
            if ($status === 'paid' && ($isAutoConfirm || $validated['payment_method'] === 'cash')) {
                $order->status = 'completed';
                if (! $order->handed_over_at) {
                    $order->handed_over_at = Carbon::now();
                }
                if (! $order->handed_over_by_user_id) {
                    $order->handed_over_by_user_id = $request->user()->id;
                }
                $order->save();

                // Kích hoạt bảo hành điện tử tự động
                if ($order->warranty_terms_days > 0 && ! $order->warranties()->exists()) {
                    $randomWr = str_pad((string) random_int(100, 9999), 4, '0', STR_PAD_LEFT);
                    \App\Models\Warranty::create([
                        'warranty_code'   => "FX{$year}-WR-{$randomWr}",
                        'repair_order_id' => $order->id,
                        'customer_id'     => $order->customer_id,
                        'device_model_id' => $order->device_model_id,
                        'coverage_item'   => $order->price_note ?? 'Dịch vụ sửa chữa',
                        'start_date'      => Carbon::now()->toDateString(),
                        'duration_days'   => $order->warranty_terms_days,
                        'end_date'        => Carbon::now()->addDays($order->warranty_terms_days)->toDateString(),
                        'status'          => 'active',
                    ]);
                } elseif ($order->warranties()->exists()) {
                    foreach ($order->warranties as $warranty) {
                        $duration = $warranty->duration_days ?: ($order->warranty_terms_days ?: 90);
                        $warranty->update([
                            'status'     => 'active',
                            'start_date' => Carbon::now()->toDateString(),
                            'end_date'   => Carbon::now()->addDays($duration)->toDateString(),
                        ]);
                    }
                }

                // Tích lũy doanh số khách hàng
                $customer = $order->customer;
                if ($customer) {
                    $customer->increment('orders_count');
                    $customer->increment('total_spent', $order->total_price);
                }
            }

            AuditLog::create([
                'user_id'        => $request->user()->id,
                'user_name'      => $request->user()->name,
                'action'         => 'Thu tiền',
                'auditable_type' => 'Payment',
                'auditable_id'   => $payment->id,
                'details'        => "Thu tiền đơn {$order->order_code}: " . number_format($validated['amount']) . " ₫ qua {$validated['payment_method']}" . ($status === 'paid' ? ' (Đã xác nhận)' : ' (Chờ thanh toán)'),
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

        return $this->success($payment, 'Lấy thông tin phiếu thanh toán thành công.');
    }

    /**
     * Sinh mã VietQR cho phiếu thanh toán / đơn sửa chữa tại quầy.
     */
    public function vietqr(Request $request, int|string $id): JsonResponse
    {
        $payment = Payment::with('repairOrder.tenant')->findOrFail($id);
        $order = $payment->repairOrder;

        // Ưu tiên lấy thông tin tài khoản ngân hàng của Tenant thuộc đơn hàng
        $tenant = $order?->tenant ?? $request->user()?->tenant;

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
     * Xác nhận duyệt phiếu thanh toán chuyển khoản (CSKH / Thu ngân / Admin).
     */
    public function confirm(Request $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return $this->failure('Chưa xác thực danh tính.', 401);
        }

        $allowedRoles = ['admin', 'super_admin', 'cskh', 'cashier'];
        if (! in_array($user->role, $allowedRoles, true)) {
            return $this->failure('Bạn không có quyền duyệt thanh toán này.', 403);
        }

        $payment = Payment::with('repairOrder')->findOrFail($id);

        if ($payment->status === 'paid') {
            return $this->failure('Phiếu thanh toán này đã được duyệt thanh toán trước đó.', 422);
        }

        if ($payment->status !== 'pending') {
            return $this->failure('Chỉ có thể duyệt phiếu thanh toán đang ở trạng thái chờ xử lý (pending).', 422);
        }

        $validated = $request->validate([
            'transaction_ref' => 'nullable|string|max:100',
            'notes'           => 'nullable|string|max:500',
        ]);

        return DB::transaction(function () use ($request, $payment, $user, $validated) {
            $payment->status = 'paid';
            $payment->paid_at = Carbon::now();
            $payment->received_by_user_id = $user->id;

            if (! empty($validated['transaction_ref'])) {
                $payment->transaction_ref = $validated['transaction_ref'];
            }
            if (! empty($validated['notes'])) {
                $payment->notes = $validated['notes'];
            }

            $payment->save();

            $order = $payment->repairOrder;
            if ($order) {
                $order->status = 'completed';
                if (! $order->handed_over_at) {
                    $order->handed_over_at = Carbon::now();
                }
                if (! $order->handed_over_by_user_id) {
                    $order->handed_over_by_user_id = $user->id;
                }
                $order->save();
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
}
