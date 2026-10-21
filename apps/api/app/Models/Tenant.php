<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Tenant extends Model
{
    use HasFactory;

    protected $attributes = [
        'status' => 'active',
        'plan'   => 'trial',
    ];

    protected $fillable = [
        'code',
        'name',
        'phone',
        'email',
        'status',
        'plan',
        'expires_at',
        'trial_ends_at',
        'billing_cycle',
        'current_plan_id',
        'intended_plan',
        'logo_url',
        'hotline',
        'receipt_footer_note',
        'bank_code',
        'bank_account_number',
        'bank_account_holder',
    ];

    protected function casts(): array
    {
        return [
            'expires_at'    => 'datetime',
            'trial_ends_at' => 'datetime',
        ];
    }

    public function branches(): HasMany
    {
        return $this->hasMany(Branch::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function repairOrders(): HasMany
    {
        return $this->hasMany(RepairOrder::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(SaasInvoice::class, 'tenant_id');
    }

    public function currentPlan(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class, 'current_plan_id');
    }

    public function planDetails(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class, 'current_plan_id');
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function isSuspended(): bool
    {
        return $this->status === 'suspended';
    }

    public function isSubscriptionActive(): bool
    {
        return $this->isActive() && ($this->expires_at === null || $this->expires_at->isFuture());
    }

    /**
     * Chuẩn hóa đường dẫn logo thương hiệu thành URL tuyệt đối hợp lệ khớp với host/port thực tế của request (hoặc giữ nguyên Data URI).
     */
    public function getLogoUrlAttribute(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        if (str_starts_with($trimmed, 'data:image/')) {
            return $trimmed;
        }

        $baseUrl = $this->resolveStorageBaseUrl();

        // Nếu là URL tuyệt đối (http:// hoặc https://)
        if (preg_match('#^https?://#i', $trimmed)) {
            // Nếu là URL trỏ tới /storage/ trên localhost hoặc 127.0.0.1 (ví dụ thiếu port :8000 do APP_URL=http://localhost),
            // chuẩn hóa lại origin theo $baseUrl thực tế của request hiện tại.
            if (preg_match('#^https?://(?:localhost|127\.0\.0\.1)(?::\d+)?/(storage/.*)$#i', $trimmed, $matches)) {
                $storagePath = preg_replace('#^(?:storage/)+#', 'storage/', ltrim($matches[1], '/'));
                return "{$baseUrl}/{$storagePath}";
            }

            return $trimmed;
        }

        // Xử lý đường dẫn tương đối: '/storage/tenants/...', 'storage/tenants/...', hoặc 'tenants/1/logo/...'
        $cleanPath = ltrim($trimmed, '/');
        $cleanPath = preg_replace('#^(?:storage/)+#', '', $cleanPath);

        return "{$baseUrl}/storage/{$cleanPath}";
    }

    /**
     * Xác định Base URL ưu tiên theo scheme + host + port thực tế của HTTP request hiện tại.
     */
    protected function resolveStorageBaseUrl(): string
    {
        $appUrl = rtrim((string) config('app.url', 'http://localhost'), '/');

        if (app()->bound('request')) {
            $req = request();
            if ($req instanceof \Illuminate\Http\Request) {
                $schemeAndHost = rtrim($req->getSchemeAndHttpHost(), '/');
                if ($schemeAndHost !== '') {
                    if (in_array($schemeAndHost, ['http://localhost', 'http://127.0.0.1'], true)
                        && preg_match('#^https?://(?:localhost|127\.0\.0\.1):\d+$#i', $appUrl)) {
                        return $appUrl;
                    }

                    return $schemeAndHost;
                }
            }
        }

        return $appUrl;
    }
}
