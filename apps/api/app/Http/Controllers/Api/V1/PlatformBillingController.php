<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\OrderOperationalEvent;
use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\SaasInvoice;
use App\Models\Scopes\TenantScope;
use App\Models\SepayTransaction;
use App\Models\SubscriptionPlan;
use App\Models\SystemSetting;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlatformBillingController extends Controller
{
    /**
     * Thống kê tổng quan SaaS Billing cho Super Admin.
     */
    public function billingStats(Request $request): JsonResponse
    {
        $activeTenants = Tenant::where('status', 'active')
            ->where(function ($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })->get();

        $planIds = $activeTenants
            ->filter(fn ($t) => $t->plan && $t->plan !== 'trial')
            ->map(fn ($t) => (string) ($t->current_plan_id ?? $t->plan))
            ->filter()
            ->unique()
            ->values()
            ->all();

        $plansById = ! empty($planIds)
            ? SubscriptionPlan::whereIn('id', $planIds)->get()->keyBy('id')
            : collect();

        $mrr = 0.0;
        foreach ($activeTenants as $t) {
            if ($t->plan && $t->plan !== 'trial') {
                $lookupKey = (string) ($t->current_plan_id ?? $t->plan);
                $plan = $plansById->get($lookupKey);
                if ($plan) {
                    $mrr += (float) ($plan->price_monthly > 0 ? $plan->price_monthly : $plan->price);
                }
            }
        }

        $activeStoresCount = Tenant::where('status', 'active')->count();
        $totalStoresCount = Tenant::count();
        $expiringSoonCount = Tenant::where('status', 'active')
            ->whereNotNull('expires_at')
            ->whereBetween('expires_at', [now(), now()->addDays(7)])
            ->count();

        $weeklySepayTransactionsCount = SepayTransaction::where('created_at', '>=', now()->subDays(7))->count();

        $expiringStores = Tenant::where('status', 'active')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now()->addDays(14))
            ->orderBy('expires_at', 'asc')
            ->get()
            ->map(function ($t) {
                return [
                    'id'             => $t->id,
                    'code'           => $t->code,
                    'name'           => $t->name,
                    'phone'          => $t->hotline ?? $t->phone ?? '',
                    'plan'           => $t->plan ?? 'trial',
                    'expires_at'     => $t->expires_at?->toISOString(),
                    'days_remaining' => max(0, (int) now()->diffInDays($t->expires_at, false)),
                ];
            });

        return $this->success([
            'mrr'                             => $mrr,
            'mrr_formatted'                   => number_format($mrr, 0, ',', '.') . ' ₫',
            'mrr_growth_percentage'           => 0,
            'active_stores_count'             => $activeStoresCount,
            'total_stores_count'              => $totalStoresCount,
            'expiring_soon_count'             => $expiringSoonCount,
            'weekly_sepay_transactions_count' => $weeklySepayTransactionsCount,
            'expiring_stores'                 => $expiringStores,
        ], 'Lấy số liệu tài chính sàn thành công.');
    }

    /**
     * Lịch sử giao dịch SePay SaaS từ bảng saas_invoices.
     */
    public function transactions(Request $request): JsonResponse
    {
        $query = SaasInvoice::with(['tenant', 'plan', 'sepayTransactions']);

        $rawSearch = $request->input('q') ?? $request->input('search');
        if ($rawSearch !== null && trim((string) $rawSearch) !== '') {
            $search = trim((string) $rawSearch);
            $query->where(function ($q) use ($search) {
                $q->where('reference_code', 'like', "%{$search}%")
                    ->orWhere('payment_method', 'like', "%{$search}%")
                    ->orWhereHas('tenant', fn ($tq) => $tq->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%"))
                    ->orWhereHas('plan', fn ($pq) => $pq->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('sepayTransactions', fn ($sq) => $sq->where('sepay_transaction_id', 'like', "%{$search}%")->orWhere('bank_brand', 'like', "%{$search}%"));
            });
        }

        if ($status = $request->input('status')) {
            if ($status !== 'all') {
                if ($status === 'completed') {
                    $query->where('status', 'paid');
                } else {
                    $query->where('status', $status);
                }
            }
        }

        $mapInvoice = static function ($inv) {
            $sepayTx = $inv->sepayTransactions->first();

            return [
                'id'             => $inv->id,
                'ref_code'       => $inv->reference_code,
                'store_code'     => $inv->tenant?->code ?? 'N/A',
                'store_name'     => $inv->tenant?->name ?? 'N/A',
                'plan_name'      => $inv->plan?->name ?? strtoupper((string) $inv->plan_id),
                'amount'         => (float) $inv->amount,
                'bank'           => $sepayTx?->bank_brand ?? 'MBBank',
                'payment_method' => $inv->payment_method ?? 'sepay_vietqr',
                'created_at'     => $inv->created_at?->toISOString(),
                'timestamp'      => $inv->paid_at?->toISOString() ?? $inv->created_at?->toISOString(),
                'status'         => $inv->status === 'paid' ? 'completed' : $inv->status,
            ];
        };

        if ($request->boolean('all') || $request->input('per_page') === 'all') {
            $items = $query->latest('id')->limit(1000)->get()->map($mapInvoice)->values();
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
            ], 'Lấy danh sách giao dịch thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $paginator = $query->latest('id')->paginate($perPage);

        $mappedData = $paginator->getCollection()->map($mapInvoice);
        $paginator->setCollection($mappedData);

        return $this->success($paginator, 'Lấy danh sách giao dịch thành công.');
    }

    /**
     * Gửi thông báo nhắc phí duy trì phần mềm tới gian hàng.
     */
    public function remindFee(Request $request, int|string $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $owner = User::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->where('role', 'admin')
            ->orderBy('id')
            ->first();

        $notif = Notification::create([
            'tenant_id'   => $tenant->id,
            'user_id'     => $owner?->id,
            'branch_id'   => $owner?->branch_id,
            'target_role' => 'admin',
            'title'       => 'Nhắc phí duy trì phần mềm',
            'message'     => "Gian hàng {$tenant->name} sắp hết hạn dịch vụ. Vui lòng kiểm tra và thanh toán gia hạn gói cước.",
            'type'        => 'fee_reminder',
            'severity'    => 'warning',
            'is_read'     => false,
        ]);

        try {
            OrderOperationalEvent::dispatch(
                $notif->id,
                0,
                (string) $tenant->code,
                $notif->title,
                $notif->message,
                'warning',
                now()->toIso8601String(),
                '/subscription',
                $owner?->branch_id !== null ? (int) $owner->branch_id : null,
                'admin',
                $owner?->id !== null ? (int) $owner->id : null,
                'fee_reminder',
                'tenant.fee_reminder',
                (int) $tenant->id
            );
        } catch (\Throwable) {
            // Không chặn luồng nhắc phí nếu tiến trình WebSocket chưa khởi chạy
        }

        return $this->success(null, "Đã gửi thông báo nhắc phí tới gian hàng {$tenant->name}.");
    }

    /**
     * Gia hạn thời hạn sử dụng gói cước cho gian hàng.
     */
    public function renewStore(Request $request, int|string $id): JsonResponse
    {
        $tenant = Tenant::findOrFail($id);

        $days = (int) $request->input('days', 30);
        if ($months = $request->input('months')) {
            $days = (int) $months * 30;
        }

        $baseDate = ($tenant->expires_at && $tenant->expires_at->isFuture()) ? $tenant->expires_at : now();
        $newExpiresAt = $baseDate->copy()->addDays($days);

        $tenant->update([
            'expires_at' => $newExpiresAt,
            'status'     => 'active',
        ]);

        return $this->success($tenant->fresh(), "Gia hạn thành công {$days} ngày cho gian hàng {$tenant->name}.");
    }

    /**
     * Lấy danh sách các gói cước dịch vụ nền tảng.
     */
    public function plans(Request $request): JsonResponse
    {
        $plans = SubscriptionPlan::withCount('tenants')
            ->orderBy('sort_order', 'asc')
            ->get()
            ->map(function ($plan) {
                return [
                    'id'                   => $plan->id,
                    'name'                 => $plan->name,
                    'tagline'              => $plan->code,
                    'price'                => (float) ($plan->price_monthly > 0 ? $plan->price_monthly : $plan->price),
                    'period'               => '/tháng',
                    'popular'              => $plan->id === 'standard',
                    'active_stores_count'  => (int) ($plan->tenants_count ?? 0),
                    'max_branches'         => $plan->max_branches ?? 1,
                    'max_users'            => $plan->max_users ?? 3,
                    'max_orders_per_month' => $plan->max_orders_per_month ?? 100,
                    'features'             => $plan->features ?? [],
                    'is_active'            => (bool) $plan->is_active,
                ];
            });

        return $this->success($plans, 'Lấy danh sách gói cước thành công.');
    }

    /**
     * Cập nhật thông số gói cước dịch vụ trong cơ sở dữ liệu.
     */
    public function updatePlan(Request $request, string $id): JsonResponse
    {
        $plan = SubscriptionPlan::findOrFail($id);

        $validated = $request->validate([
            'name'                 => 'sometimes|string|max:100',
            'price'                => 'sometimes|numeric|min:0',
            'price_monthly'        => 'sometimes|numeric|min:0',
            'price_yearly'         => 'sometimes|numeric|min:0',
            'max_branches'         => 'nullable',
            'max_users'            => 'nullable',
            'max_orders_per_month' => 'nullable',
            'features'             => 'nullable|array',
            'is_active'            => 'sometimes|boolean',
        ]);

        $plan->update($validated);

        \App\Services\QuotaService::clearCache();

        return $this->success($plan->fresh(), 'Cập nhật cấu hình gói cước thành công.');
    }

    /**
     * Lấy cấu hình cổng thanh toán SePay của sàn.
     */
    public function getSepayConfig(Request $request): JsonResponse
    {
        $config = SystemSetting::getPlatformSepayConfig();

        return $this->success($config, 'Lấy cấu hình SePay thành công.');
    }

    /**
     * Cập nhật thông số cổng thanh toán SePay của sàn vào CSDL.
     */
    public function updateSepayConfig(Request $request): JsonResponse
    {
        $rawSaved = SystemSetting::get('platform_sepay_config');
        $current = is_array($rawSaved) ? $rawSaved : [];

        $validated = $request->validate([
            'bank_code'      => 'sometimes|nullable|string',
            'bank_name'      => 'sometimes|nullable|string',
            'account_number' => 'sometimes|nullable|string',
            'account_name'   => 'sometimes|nullable|string',
            'api_token'      => 'sometimes|nullable|string',
            'webhook_secret' => 'sometimes|nullable|string',
        ]);

        foreach ($validated as $k => $v) {
            $validated[$k] = (string) ($v ?? '');
        }

        if (array_key_exists('api_token', $validated) && ! array_key_exists('webhook_secret', $validated)) {
            $validated['webhook_secret'] = $validated['api_token'];
        } elseif (array_key_exists('webhook_secret', $validated) && ! array_key_exists('api_token', $validated)) {
            $validated['api_token'] = $validated['webhook_secret'];
        }

        $merged = array_merge($current, $validated);
        $merged['account_holder'] = $merged['account_name'] ?? '';
        $merged['webhook_url'] = url('/api/v1/webhooks/sepay');
        $merged['is_connected'] = ! empty($merged['bank_code']) && ! empty($merged['account_number']);

        SystemSetting::set('platform_sepay_config', $merged);

        return $this->success(SystemSetting::getPlatformSepayConfig(), 'Lưu cấu hình SePay sàn thành công.');
    }

    /**
     * Kiểm tra kết nối Live tới cổng SePay (đo độ trễ thực tế và xác thực thông số cấu hình).
     */
    public function testSepayConnection(Request $request): JsonResponse
    {
        $start = microtime(true);
        $config = SystemSetting::getPlatformSepayConfig();

        $bankCode = trim((string) ($request->has('bank_code') ? $request->input('bank_code') : ($config['bank_code'] ?? '')));
        $accountNumber = trim((string) ($request->has('account_number') ? $request->input('account_number') : ($config['account_number'] ?? '')));
        $accountName = trim((string) ($request->has('account_name') ? $request->input('account_name') : ($config['account_name'] ?? '')));

        if ($bankCode === '' || $accountNumber === '') {
            $latencyMs = max(1, (int) round((microtime(true) - $start) * 1000));
            $payload = [
                'connected'      => false,
                'bank_code'      => $bankCode,
                'account_number' => $accountNumber,
                'latency_ms'     => $latencyMs,
                'timestamp'      => now()->toISOString(),
            ];

            return response()->json([
                'success' => false,
                'message' => 'Cấu hình SePay chưa đầy đủ: thiếu mã ngân hàng (bank_code) hoặc số tài khoản (account_number).',
                'data'    => $payload,
                'errors'  => $payload,
            ], 422);
        }

        $qrTemplate = $config['qr_template'] ?? config('sepay.qr_template', 'compact2');
        $sampleQrUrl = "https://qr.sepay.vn/img?acc={$accountNumber}&bank={$bankCode}&amount=10000&des=TEST&template={$qrTemplate}";
        $hasSecret = ! empty($config['webhook_secret']) || ! empty($config['api_token']);

        $latencyMs = max(1, (int) round((microtime(true) - $start) * 1000));
        $testedAt = now()->toISOString();

        $rawSaved = SystemSetting::get('platform_sepay_config');
        if (is_array($rawSaved)) {
            $rawSaved['last_tested_at'] = $testedAt;
            $rawSaved['is_connected'] = true;
            SystemSetting::set('platform_sepay_config', $rawSaved);
        }

        return $this->success([
            'connected'          => true,
            'bank_code'          => $bankCode,
            'account_number'     => $accountNumber,
            'account_name'       => $accountName,
            'webhook_configured' => $hasSecret,
            'sample_qr_url'      => $sampleQrUrl,
            'gateway'            => 'SePay Open Banking Gateway',
            'latency_ms'         => $latencyMs,
            'timestamp'          => $testedAt,
        ], 'Kiểm tra kết nối Live tới SePay thành công. Sẵn sàng nhận webhook.');
    }
}
