<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SaasInvoice;
use App\Models\SubscriptionPlan;
use App\Services\QuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaasBillingController extends Controller
{
    protected QuotaService $quotaService;

    public function __construct(QuotaService $quotaService)
    {
        $this->quotaService = $quotaService;
    }

    /**
     * Lấy thông tin gói cước hiện tại và tình hình sử dụng hạn mức.
     */
    public function current(Request $request): JsonResponse
    {
        $user = $request->user();
        $tenant = $user->tenant;

        if (! $tenant) {
            return $this->failure('Không tìm thấy thông tin cửa hàng.', 404);
        }

        $usage = $this->quotaService->getUsage($tenant);
        $availablePlans = SubscriptionPlan::where('is_active', true)
            ->where('id', '!=', 'trial')
            ->orderBy('sort_order')
            ->get();

        return $this->success([
            'tenant'          => [
                'id'             => $tenant->id,
                'code'           => $tenant->code,
                'name'           => $tenant->name,
                'status'         => $tenant->status,
                'plan'           => $tenant->plan,
                'expires_at'     => $tenant->expires_at?->toISOString(),
                'trial_ends_at'  => $tenant->trial_ends_at?->toISOString(),
                'billing_cycle'  => $tenant->billing_cycle,
                'days_remaining' => $usage['subscription']['days_remaining'],
            ],
            'current_plan'    => $this->quotaService->resolvePlan($tenant),
            'usage'           => $usage,
            'available_plans' => $availablePlans,
        ], 'Lấy thông tin gói dịch vụ thành công.');
    }

    /**
     * Danh sách tất cả các gói cước.
     */
    public function plans(): JsonResponse
    {
        $plans = SubscriptionPlan::where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        return $this->success($plans, 'Lấy danh sách gói cước thành công.');
    }

    /**
     * Khởi tạo yêu cầu nâng cấp gói / thanh toán hóa đơn.
     */
    public function subscribe(Request $request): JsonResponse
    {
        $user = $request->user();
        $tenant = $user->tenant;

        if (! $tenant) {
            return $this->failure('Không tìm thấy thông tin cửa hàng.', 404);
        }

        $validated = $request->validate([
            'plan_id'       => ['required', 'string', 'exists:subscription_plans,id'],
            'billing_cycle' => ['nullable', 'string', 'in:monthly,yearly'],
        ], [
            'plan_id.required'       => 'Vui lòng chọn gói cước.',
            'plan_id.exists'         => 'Gói cước không tồn tại.',
            'billing_cycle.in'       => 'Chu kỳ thanh toán chỉ chấp nhận hàng tháng hoặc hàng năm.',
        ]);

        $planId = $validated['plan_id'];
        if ($planId === 'trial') {
            return $this->failure('Không thể tạo hóa đơn thanh toán cho gói dùng thử.', 422);
        }

        $plan = SubscriptionPlan::findOrFail($planId);
        $billingCycle = $validated['billing_cycle'] ?? 'monthly';

        // Tính số tiền thanh toán
        $amount = ($billingCycle === 'yearly' && $plan->price_yearly > 0)
            ? (float) $plan->price_yearly
            : (float) ($plan->price_monthly > 0 ? $plan->price_monthly : $plan->price);

        // Tạo hóa đơn tạm để lấy ID
        $tempRef = 'TMP' . strtoupper(bin2hex(random_bytes(4)));
        $invoice = SaasInvoice::create([
            'tenant_id'      => $tenant->id,
            'plan_id'        => $plan->id,
            'billing_cycle'  => $billingCycle,
            'amount'         => $amount,
            'reference_code' => $tempRef,
            'status'         => 'pending',
            'payment_method' => 'sepay_vietqr',
            'expires_at'     => now()->addMinutes(30),
        ]);

        // Cập nhật mã chuẩn FIXSUB{id}
        $refCode = 'FIXSUB' . $invoice->id;
        $invoice->update(['reference_code' => $refCode]);

        // Sinh link QR SePay
        $accNumber = config('sepay.account_number');
        $bankCode = config('sepay.bank_code');
        $template = config('sepay.qr_template', 'compact2');
        $qrUrl = "https://qr.sepay.vn/img?acc={$accNumber}&bank={$bankCode}&amount={$amount}&des={$refCode}&template={$template}";

        return $this->created([
            'invoice_id'     => $invoice->id,
            'reference_code' => $refCode,
            'amount'         => $amount,
            'plan'           => [
                'id'   => $plan->id,
                'name' => $plan->name,
                'code' => $plan->code,
            ],
            'billing_cycle'  => $billingCycle,
            'account_number' => $accNumber,
            'bank_code'      => $bankCode,
            'account_holder' => config('sepay.account_holder'),
            'qr_url'         => $qrUrl,
            'expires_at'     => $invoice->expires_at?->toISOString(),
            'status'         => $invoice->status,
        ], 'Khởi tạo hóa đơn nâng cấp thành công.');
    }

    /**
     * Tra cứu trạng thái hóa đơn theo reference_code hoặc id (phục vụ Polling).
     */
    public function invoiceStatus(Request $request, string $refCode): JsonResponse
    {
        $invoice = SaasInvoice::with(['tenant', 'plan'])
            ->where('reference_code', $refCode)
            ->orWhere('id', is_numeric($refCode) ? (int) $refCode : 0)
            ->first();

        if (! $invoice) {
            return $this->empty('Không tìm thấy hóa đơn.');
        }

        $tenant = $invoice->tenant;

        return $this->success([
            'id'             => $invoice->id,
            'reference_code' => $invoice->reference_code,
            'status'         => $invoice->status,
            'amount'         => (float) $invoice->amount,
            'plan'           => $invoice->plan_id,
            'plan_name'      => $invoice->plan?->name,
            'paid_at'        => $invoice->paid_at?->toISOString(),
            'expires_at'     => $tenant?->expires_at?->toISOString(),
        ], 'Lấy trạng thái hóa đơn thành công.');
    }
}
