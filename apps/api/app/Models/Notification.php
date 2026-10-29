<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Notification extends Model
{
    use HasFactory;

    /**
     * Danh sách các loại thông báo thuộc cấp Quản trị Nền tảng (tenant_id luôn là NULL).
     *
     * @var list<string>
     */
    public const PLATFORM_TYPES = [
        'tenant_registered',
        'tenant_approval_pending',
        'tenant_approval',
        'saas_payment_received',
        'platform_billing',
    ];

    protected $fillable = [
        'tenant_id',
        'user_id',
        'branch_id',
        'target_role',
        'type',
        'title',
        'message',
        'order_id',
        'severity',
        'is_read',
        'read_at',
    ];

    protected $appends = [
        'action_url',
    ];

    protected static function booted(): void
    {
        static::creating(function (Notification $notification): void {
            if ($notification->isPlatformLevelNotification()) {
                return;
            }

            if (empty($notification->tenant_id)) {
                $resolvedTenantId = static::inferTenantIdFromRelations(
                    ! empty($notification->order_id) ? (int) $notification->order_id : null,
                    ! empty($notification->branch_id) ? (int) $notification->branch_id : null,
                    ! empty($notification->user_id) ? (int) $notification->user_id : null
                );

                if ($resolvedTenantId !== null) {
                    $notification->tenant_id = $resolvedTenantId;
                }
            }
        });
    }

    /**
     * Kiểm tra thông báo có thuộc cấp Quản trị Nền tảng (Super Admin) hay không.
     */
    public function isPlatformLevelNotification(): bool
    {
        if ($this->target_role === 'super_admin') {
            return true;
        }

        return in_array((string) $this->type, self::PLATFORM_TYPES, true);
    }

    /**
     * Suy diễn tenant_id an toàn từ order_id -> branch_id -> user_id (bỏ qua global scopes và super_admin).
     */
    public static function inferTenantIdFromRelations(?int $orderId, ?int $branchId, ?int $userId): ?int
    {
        if ($orderId !== null && $orderId > 0) {
            $orderTenantId = RepairOrder::withoutGlobalScopes()
                ->whereKey($orderId)
                ->value('tenant_id');

            if ($orderTenantId !== null) {
                return (int) $orderTenantId;
            }
        }

        if ($branchId !== null && $branchId > 0) {
            $branchTenantId = Branch::withoutGlobalScopes()
                ->whereKey($branchId)
                ->value('tenant_id');

            if ($branchTenantId !== null) {
                return (int) $branchTenantId;
            }
        }

        if ($userId !== null && $userId > 0) {
            $user = User::withoutGlobalScopes()
                ->select(['id', 'role', 'tenant_id'])
                ->find($userId);

            if ($user && $user->role !== 'super_admin' && $user->tenant_id !== null) {
                return (int) $user->tenant_id;
            }
        }

        return null;
    }

    public function getActionUrlAttribute(): string
    {
        return match ($this->type) {
            'tenant_registered' => '/platform/stores',
            'tenant_approval_pending', 'tenant_approval' => '/platform/approvals',
            'saas_payment_received', 'platform_billing' => '/platform/billing',
            'fee_reminder', 'saas_subscription_renewed' => '/subscription',
            default => $this->isPlatformLevelNotification()
                ? '/platform/stores'
                : ($this->order_id ? "/repairs?id={$this->order_id}" : '/repairs'),
        };
    }

    public function getBodyAttribute(): ?string
    {
        return $this->attributes['message'] ?? null;
    }

    public function setBodyAttribute(?string $value): void
    {
        $this->attributes['message'] = $value;
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'tenant_id' => 'integer',
            'is_read' => 'boolean',
            'read_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function repairOrder(): BelongsTo
    {
        return $this->belongsTo(RepairOrder::class, 'order_id');
    }

    public function order(): BelongsTo
    {
        return $this->repairOrder();
    }

    public function reads(): HasMany
    {
        return $this->hasMany(NotificationRead::class, 'notification_id');
    }

    public function markAsRead(): bool
    {
        return $this->update([
            'is_read' => true,
            'read_at' => now(),
        ]);
    }

    public function scopeUnread($query)
    {
        return $query->where('is_read', false);
    }

    public function scopeForTenant($query, int $tenantId)
    {
        return $query->where('tenant_id', $tenantId);
    }

    public function scopeForUser($query, int $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopeForBranch($query, int $branchId)
    {
        return $query->where('branch_id', $branchId);
    }
}
