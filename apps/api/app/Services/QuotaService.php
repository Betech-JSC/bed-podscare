<?php

namespace App\Services;

use App\Exceptions\QuotaExceededException;
use App\Exceptions\SubscriptionExpiredException;
use App\Models\Branch;
use App\Models\RepairOrder;
use App\Models\Scopes\TenantScope;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\User;

class QuotaService
{
    /**
     * Tìm thông tin gói cước của Tenant.
     */
    public function resolvePlan(Tenant $tenant): SubscriptionPlan
    {
        $planId = $tenant->current_plan_id ?? $tenant->plan ?? 'trial';

        $plan = SubscriptionPlan::find($planId);

        if (! $plan) {
            $plan = SubscriptionPlan::find('trial');
        }

        // Fallback an toàn nếu chưa seed
        if (! $plan) {
            $plan = new SubscriptionPlan([
                'id'                   => 'trial',
                'code'                 => 'trial',
                'name'                 => 'Dùng thử miễn phí',
                'max_branches'         => 1,
                'max_users'            => 2,
                'max_orders_per_month' => 50,
            ]);
        }

        return $plan;
    }

    /**
     * Kiểm tra trạng thái bản quyền của Tenant.
     */
    public function isSubscriptionActive(Tenant $tenant): bool
    {
        if ($tenant->status !== 'active') {
            return false;
        }

        if ($tenant->expires_at === null) {
            return true;
        }

        return $tenant->expires_at->isFuture();
    }

    /**
     * Kiểm tra Tenant có thể tạo thêm Chi nhánh hay không.
     */
    public function canCreateBranch(Tenant $tenant): bool
    {
        $plan = $this->resolvePlan($tenant);

        if ($plan->max_branches === null || $plan->max_branches === -1) {
            return true;
        }

        $currentCount = Branch::where('tenant_id', $tenant->id)->count();

        return $currentCount < $plan->max_branches;
    }

    /**
     * Kiểm tra Tenant có thể tạo thêm Nhân viên hay không.
     */
    public function canCreateUser(Tenant $tenant): bool
    {
        $plan = $this->resolvePlan($tenant);

        if ($plan->max_users === null || $plan->max_users === -1) {
            return true;
        }

        $currentCount = User::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->count();

        return $currentCount < $plan->max_users;
    }

    /**
     * Kiểm tra Tenant có thể tạo thêm Đơn sửa chữa trong tháng hay không.
     */
    public function canCreateOrder(Tenant $tenant): bool
    {
        $plan = $this->resolvePlan($tenant);

        if ($plan->max_orders_per_month === null || $plan->max_orders_per_month === -1) {
            return true;
        }

        $startOfMonth = now()->startOfMonth();
        $endOfMonth = now()->endOfMonth();

        $currentCount = RepairOrder::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->whereBetween('created_at', [$startOfMonth, $endOfMonth])
            ->count();

        return $currentCount < $plan->max_orders_per_month;
    }

    /**
     * Guard: Kiểm tra bản quyền còn hạn (ném ngoại lệ nếu hết hạn).
     */
    public function checkSubscriptionActive(Tenant $tenant): void
    {
        if (! $this->isSubscriptionActive($tenant)) {
            throw new SubscriptionExpiredException();
        }
    }

    /**
     * Guard: Kiểm tra hạn mức chi nhánh (ném ngoại lệ nếu vượt).
     */
    public function checkBranchQuota(Tenant $tenant): void
    {
        if (! $this->canCreateBranch($tenant)) {
            throw new QuotaExceededException(
                'QUOTA_EXCEEDED_BRANCHES',
                'Vượt quá số lượng chi nhánh cho phép của gói cước hiện tại. Vui lòng nâng cấp gói.'
            );
        }
    }

    /**
     * Guard: Kiểm tra hạn mức nhân viên (ném ngoại lệ nếu vượt).
     */
    public function checkUserQuota(Tenant $tenant): void
    {
        if (! $this->canCreateUser($tenant)) {
            throw new QuotaExceededException(
                'QUOTA_EXCEEDED_USERS',
                'Vượt quá số lượng nhân sự cho phép của gói cước hiện tại. Vui lòng nâng cấp gói.'
            );
        }
    }

    /**
     * Guard: Kiểm tra hạn mức đơn hàng trong tháng (ném ngoại lệ nếu vượt).
     */
    public function checkOrderQuota(Tenant $tenant): void
    {
        if (! $this->canCreateOrder($tenant)) {
            throw new QuotaExceededException(
                'QUOTA_EXCEEDED_ORDERS',
                'Vượt quá số lượng đơn hàng cho phép trong tháng của gói cước hiện tại. Vui lòng nâng cấp gói.'
            );
        }
    }

    /**
     * Lấy dữ liệu chi tiết sử dụng hạn mức.
     */
    public function getUsage(Tenant $tenant): array
    {
        $plan = $this->resolvePlan($tenant);

        $branchCount = Branch::where('tenant_id', $tenant->id)->count();
        $userCount = User::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->count();

        $orderCount = RepairOrder::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()])
            ->count();

        $daysRemaining = $tenant->expires_at
            ? max(0, (int) now()->diffInDays($tenant->expires_at, false))
            : null;

        return [
            'branches' => [
                'used'       => $branchCount,
                'limit'      => $plan->max_branches,
                'unlimited'  => $plan->max_branches === null || $plan->max_branches === -1,
                'percentage' => ($plan->max_branches && $plan->max_branches > 0)
                    ? min(100, round(($branchCount / $plan->max_branches) * 100, 1))
                    : 0,
            ],
            'users' => [
                'used'       => $userCount,
                'limit'      => $plan->max_users,
                'unlimited'  => $plan->max_users === null || $plan->max_users === -1,
                'percentage' => ($plan->max_users && $plan->max_users > 0)
                    ? min(100, round(($userCount / $plan->max_users) * 100, 1))
                    : 0,
            ],
            'orders' => [
                'used'       => $orderCount,
                'limit'      => $plan->max_orders_per_month,
                'unlimited'  => $plan->max_orders_per_month === null || $plan->max_orders_per_month === -1,
                'percentage' => ($plan->max_orders_per_month && $plan->max_orders_per_month > 0)
                    ? min(100, round(($orderCount / $plan->max_orders_per_month) * 100, 1))
                    : 0,
            ],
            'subscription' => [
                'plan_id'        => $plan->id,
                'plan_name'      => $plan->name,
                'status'         => $tenant->status,
                'expires_at'     => $tenant->expires_at?->toISOString(),
                'trial_ends_at'  => $tenant->trial_ends_at?->toISOString(),
                'days_remaining' => $daysRemaining,
                'is_active'      => $this->isSubscriptionActive($tenant),
                'is_expired'     => $tenant->expires_at ? $tenant->expires_at->isPast() : false,
            ],
        ];
    }
}
