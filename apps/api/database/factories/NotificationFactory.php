<?php

namespace Database\Factories;

use App\Models\Notification;
use App\Models\Scopes\TenantScope;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Notification>
 */
class NotificationFactory extends Factory
{
    protected $model = Notification::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => null,
            'branch_id' => null,
            'order_id' => null,
            'type' => fake()->randomElement(['order_status', 'sla_warning', 'qc_action', 'quote_action']),
            'target_role' => function (array $attributes): ?string {
                if (in_array((string) ($attributes['type'] ?? ''), Notification::PLATFORM_TYPES, true)) {
                    return 'super_admin';
                }

                if (! empty($attributes['user_id'])) {
                    $role = User::withoutGlobalScopes()
                        ->whereKey($attributes['user_id'])
                        ->value('role');

                    if ($role === 'super_admin') {
                        return 'super_admin';
                    }
                }

                return null;
            },
            'tenant_id' => function (array $attributes): ?int {
                $targetRole = $attributes['target_role'] ?? null;
                $type = (string) ($attributes['type'] ?? '');

                if ($targetRole === 'super_admin' || in_array($type, Notification::PLATFORM_TYPES, true)) {
                    return null;
                }

                $inferredTenantId = Notification::inferTenantIdFromRelations(
                    ! empty($attributes['order_id']) ? (int) $attributes['order_id'] : null,
                    ! empty($attributes['branch_id']) ? (int) $attributes['branch_id'] : null,
                    ! empty($attributes['user_id']) ? (int) $attributes['user_id'] : null
                );

                if ($inferredTenantId !== null) {
                    return $inferredTenantId;
                }

                if (! empty($attributes['user_id'])) {
                    $role = User::withoutGlobalScopes()
                        ->whereKey($attributes['user_id'])
                        ->value('role');

                    if ($role === 'super_admin') {
                        return null;
                    }
                }

                $authUser = TenantScope::resolveAuthenticatedUser();
                if ($authUser && ($authUser->role ?? null) !== 'super_admin' && ! empty($authUser->tenant_id)) {
                    return (int) $authUser->tenant_id;
                }

                $masterTenantId = TenantScope::resolveMasterTenantId();
                if ($masterTenantId !== null) {
                    return $masterTenantId;
                }

                $firstTenantId = Tenant::query()->value('id');

                return $firstTenantId !== null ? (int) $firstTenantId : null;
            },
            'title' => fake()->sentence(4),
            'message' => fake()->paragraph(1),
            'severity' => fake()->randomElement(['info', 'warning', 'danger', 'success']),
            'is_read' => false,
            'read_at' => null,
        ];
    }

    /**
     * State thông báo cấp Quản trị Nền tảng (FIXO Super Admin: tenant_id = null, target_role = 'super_admin').
     */
    public function forPlatformSuperAdmin(): static
    {
        return $this->state(fn (array $attributes): array => [
            'tenant_id' => null,
            'branch_id' => null,
            'order_id' => null,
            'target_role' => 'super_admin',
            'type' => in_array((string) ($attributes['type'] ?? ''), Notification::PLATFORM_TYPES, true)
                ? $attributes['type']
                : 'tenant_registered',
        ]);
    }

    /**
     * State gắn thông báo vào một Gian hàng cụ thể kèm vai trò đích tùy chọn.
     */
    public function forTenant(Tenant|int $tenant, ?string $targetRole = null): static
    {
        $tenantId = $tenant instanceof Tenant ? (int) $tenant->id : (int) $tenant;
        $hasExplicitTargetRole = func_num_args() >= 2;

        return $this->state(function (array $attributes) use ($tenantId, $targetRole, $hasExplicitTargetRole): array {
            $state = [
                'tenant_id' => $tenantId,
            ];

            if ($hasExplicitTargetRole) {
                $state['target_role'] = $targetRole;
            } elseif (($attributes['target_role'] ?? null) === 'super_admin') {
                $state['target_role'] = null;
            }

            return $state;
        });
    }

    /**
     * Indicate that the notification is read.
     */
    public function read(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_read' => true,
            'read_at' => now(),
        ]);
    }
}
