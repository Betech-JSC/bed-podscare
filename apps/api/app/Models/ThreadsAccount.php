<?php

namespace App\Models;

use App\Services\Threads\ThreadsTokenCipher;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ThreadsAccount extends Model
{
    use HasFactory;

    public const STATUS_ACTIVE = 'active';
    public const STATUS_NEEDS_REAUTH = 'needs_reauth';
    public const STATUS_PAUSED = 'paused';
    public const STATUS_DISABLED = 'disabled';

    protected $table = 'threads_accounts';

    protected $fillable = [
        'display_name',
        'username',
        'threads_user_id',
        'app_group',
        'access_token_encrypted',
        'access_token',
        'token_expires_at',
        'last_refreshed_at',
        'status',
        'daily_post_cap',
        'active_hours_start',
        'active_hours_end',
        'quota_used_24h',
        'quota_total_24h',
        'last_error_message',
        'notes',
    ];

    /**
     * Tuyệt đối ẩn trường chứa token khỏi mọi JSON response / array serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'access_token_encrypted',
        'access_token',
    ];

    protected $appends = [
        'has_access_token',
    ];

    protected function casts(): array
    {
        return [
            'token_expires_at' => 'datetime',
            'last_refreshed_at' => 'datetime',
            'daily_post_cap' => 'integer',
            'quota_used_24h' => 'integer',
            'quota_total_24h' => 'integer',
        ];
    }

    /**
     * Quan hệ 1-n tới danh sách bài đăng Threads của tài khoản.
     */
    public function posts(): HasMany
    {
        return $this->hasMany(ThreadsPost::class, 'account_id');
    }

    /**
     * Quan hệ 1-n tới nhật ký xuất bản / gọi API của tài khoản.
     */
    public function publishLogs(): HasMany
    {
        return $this->hasMany(ThreadsPublishLog::class, 'account_id');
    }

    /**
     * Quan hệ 1-n tới danh sách seeding jobs của tài khoản.
     */
    public function seedingJobs(): HasMany
    {
        return $this->hasMany(ThreadsSeedingJob::class, 'account_id');
    }

    /**
     * Gán và mã hóa Access Token bằng AES-256-GCM.
     */
    public function setAccessToken(?string $plainToken): self
    {
        if ($plainToken === null || trim($plainToken) === '') {
            $this->attributes['access_token_encrypted'] = null;
        } else {
            $this->attributes['access_token_encrypted'] = ThreadsTokenCipher::encrypt(trim($plainToken));
        }

        return $this;
    }

    /**
     * Alias hỗ trợ mã hóa token.
     */
    public function encryptAccessToken(string $plainToken): self
    {
        return $this->setAccessToken($plainToken);
    }

    /**
     * Giải mã Access Token từ cột access_token_encrypted.
     */
    public function getAccessToken(): ?string
    {
        $encrypted = $this->attributes['access_token_encrypted'] ?? null;
        if (! is_string($encrypted) || trim($encrypted) === '') {
            return null;
        }

        return ThreadsTokenCipher::decrypt($encrypted);
    }

    /**
     * Alias giải mã Access Token.
     */
    public function getDecryptedAccessToken(): ?string
    {
        return $this->getAccessToken();
    }

    /**
     * Alias giải mã Access Token.
     */
    public function decryptAccessToken(): ?string
    {
        return $this->getAccessToken();
    }

    /**
     * Mutator cho thuộc tính ảo access_token (tự động mã hóa sang access_token_encrypted).
     */
    public function setAccessTokenAttribute(?string $value): void
    {
        $this->setAccessToken($value);
    }

    /**
     * Accessor cho thuộc tính ảo access_token (luôn nằm trong $hidden nên không bao giờ lộ ra JSON).
     */
    public function getAccessTokenAttribute(): ?string
    {
        return $this->getAccessToken();
    }

    /**
     * Cho biết tài khoản đã lưu token mã hóa hay chưa (an toàn cho UI).
     */
    public function getHasAccessTokenAttribute(): bool
    {
        return ! empty($this->attributes['access_token_encrypted']);
    }

    /**
     * Kiểm tra tài khoản có token hợp lệ và chưa hết hạn hay không.
     */
    public function hasValidToken(): bool
    {
        if (empty($this->attributes['access_token_encrypted'])) {
            return false;
        }

        if ($this->token_expires_at !== null && $this->token_expires_at->isPast()) {
            return false;
        }

        return true;
    }

    /**
     * Kiểm tra token có sắp hết hạn trong ngưỡng ngày cấu hình (mặc định < 14 ngày) không.
     */
    public function needsTokenRefresh(?int $thresholdDays = null): bool
    {
        if (empty($this->attributes['access_token_encrypted']) || $this->token_expires_at === null) {
            return false;
        }

        $days = $thresholdDays ?? (int) config('threads.token_refresh_threshold_days', 14);

        return $this->token_expires_at->lte(now()->addDays($days));
    }

    /**
     * Scope lọc các tài khoản đang hoạt động (active).
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_ACTIVE);
    }

    /**
     * Scope lọc các tài khoản cần kết nối lại OAuth (needs_reauth).
     */
    public function scopeNeedsReauth(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_NEEDS_REAUTH);
    }

    /**
     * Scope lọc các tài khoản active có token sắp hết hạn trong vòng $days ngày.
     */
    public function scopeExpiringSoon(Builder $query, ?int $days = null): Builder
    {
        $threshold = $days ?? (int) config('threads.token_refresh_threshold_days', 14);

        return $query
            ->where('status', self::STATUS_ACTIVE)
            ->whereNotNull('access_token_encrypted')
            ->whereNotNull('token_expires_at')
            ->where('token_expires_at', '<=', now()->addDays($threshold));
    }
}
