<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ThreadsSeedingJob extends Model
{
    use HasFactory;

    public const STATUS_QUEUED = 'queued';
    public const STATUS_PROCESSING = 'processing';
    public const STATUS_PUBLISHED = 'published';
    public const STATUS_FAILED = 'failed';
    public const STATUS_SKIPPED = 'skipped';

    protected $table = 'threads_seeding_jobs';

    protected $fillable = [
        'campaign_id',
        'account_id',
        'target_post_id',
        'target_post_url',
        'target_author_username',
        'target_post_caption',
        'target_velocity_score',
        'target_post_metrics',
        'reply_text',
        'content_hash',
        'cluster_order',
        'scheduled_at',
        'status',
        'container_id',
        'threads_media_id',
        'permalink',
        'published_at',
        'retry_count',
        'error_code',
        'error_message',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'target_velocity_score' => 'integer',
            'target_post_metrics' => 'array',
            'cluster_order' => 'integer',
            'scheduled_at' => 'datetime',
            'published_at' => 'datetime',
            'retry_count' => 'integer',
        ];
    }

    /**
     * Chuẩn hóa văn bản và sinh mã SHA-256 chống dẫm chân nội dung (Anti-Collision).
     */
    public static function computeContentHash(string $text): string
    {
        $normalized = mb_strtolower(trim(preg_replace('/\s+/u', ' ', $text) ?? ''));
        return hash('sha256', $normalized);
    }

    /**
     * Chiến dịch sở hữu job này.
     */
    public function campaign(): BelongsTo
    {
        return $this->belongsTo(ThreadsSeedingCampaign::class, 'campaign_id');
    }

    /**
     * Tài khoản Threads được gán thực thi job này.
     */
    public function account(): BelongsTo
    {
        return $this->belongsTo(ThreadsAccount::class, 'account_id');
    }

    /**
     * Scope lọc job đang trong hàng đợi chờ xử lý.
     */
    public function scopeQueued(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_QUEUED);
    }

    /**
     * Scope lọc job sẵn sàng xuất bản (đến lịch scheduled_at hoặc không hẹn giờ).
     */
    public function scopeReadyToPublish(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_QUEUED)
            ->where(function (Builder $q) {
                $q->whereNull('scheduled_at')
                    ->orWhere('scheduled_at', '<=', now());
            });
    }
}
