<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ThreadsPost extends Model
{
    use HasFactory;

    public const STATUS_DRAFT = 'draft';
    public const STATUS_SCHEDULED = 'scheduled';
    public const STATUS_PUBLISHING = 'publishing';
    public const STATUS_PUBLISHED = 'published';
    public const STATUS_FAILED = 'failed';
    public const STATUS_CANCELLED = 'cancelled';

    public const MEDIA_TEXT = 'TEXT';
    public const MEDIA_IMAGE = 'IMAGE';
    public const MEDIA_VIDEO = 'VIDEO';
    public const MEDIA_CAROUSEL = 'CAROUSEL';

    protected $table = 'threads_posts';

    protected $fillable = [
        'account_id',
        'reply_to_post_id',
        'thread_group_key',
        'reply_order',
        'content_text',
        'media_type',
        'media_urls',
        'link_attachment',
        'topic_tag',
        'reply_control',
        'is_sponsored',
        'sponsored_suffix',
        'client_ref',
        'content_hash',
        'import_batch_id',
        'scheduled_at',
        'status',
        'container_id',
        'threads_media_id',
        'permalink',
        'published_at',
        'retry_count',
        'next_retry_at',
        'error_code',
        'error_message',
    ];

    protected function casts(): array
    {
        return [
            'account_id' => 'integer',
            'reply_to_post_id' => 'integer',
            'reply_order' => 'integer',
            'media_urls' => 'array',
            'is_sponsored' => 'boolean',
            'scheduled_at' => 'datetime',
            'published_at' => 'datetime',
            'retry_count' => 'integer',
            'next_retry_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (ThreadsPost $post) {
            if (empty($post->content_hash) && is_string($post->content_text) && trim($post->content_text) !== '') {
                $normalized = preg_replace('/\s+/u', ' ', mb_strtolower(trim($post->content_text), 'UTF-8')) ?? '';
                $post->content_hash = hash('sha256', $normalized);
            }
        });
    }

    /**
     * Tài khoản Threads sở hữu bài đăng này.
     */
    public function account(): BelongsTo
    {
        return $this->belongsTo(ThreadsAccount::class, 'account_id');
    }

    /**
     * Bài đăng cha trong chuỗi bài nối tiếp (Multi-post Thread).
     */
    public function parentPost(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reply_to_post_id');
    }

    /**
     * Alias của parentPost().
     */
    public function parent(): BelongsTo
    {
        return $this->parentPost();
    }

    /**
     * Danh sách các bài trả lời nối tiếp trực tiếp vào bài này.
     */
    public function replies(): HasMany
    {
        return $this->hasMany(self::class, 'reply_to_post_id')
            ->orderBy('reply_order')
            ->orderBy('id');
    }

    /**
     * Alias của replies().
     */
    public function children(): HasMany
    {
        return $this->replies();
    }

    /**
     * Nhật ký gọi API xuất bản của bài đăng này.
     */
    public function publishLogs(): HasMany
    {
        return $this->hasMany(ThreadsPublishLog::class, 'post_id');
    }

    /**
     * Kiểm tra bài đăng có đang ở chế độ Auto-chain (có bài cha nhưng để trống scheduled_at) hay không.
     */
    public function isAutoChainReply(): bool
    {
        return $this->reply_to_post_id !== null && $this->scheduled_at === null;
    }

    /**
     * Scope lọc bài đăng theo trạng thái.
     */
    public function scopeStatus(Builder $query, string $status): Builder
    {
        return $query->where('status', $status);
    }

    /**
     * Scope lọc các bài đăng đã tới hạn xuất bản.
     */
    public function scopeDueForPublishing(Builder $query): Builder
    {
        return $query
            ->where('status', self::STATUS_SCHEDULED)
            ->whereNotNull('scheduled_at')
            ->where('scheduled_at', '<=', now())
            ->where(function (Builder $q) {
                $q->whereNull('next_retry_at')
                    ->orWhere('next_retry_at', '<=', now());
            });
    }
}
