<?php

namespace App\Models;

use App\Services\Threads\ThreadsTokenCipher;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ThreadsPublishLog extends Model
{
    use HasFactory;

    public const ACTION_OAUTH_EXCHANGE = 'oauth_exchange';
    public const ACTION_TOKEN_REFRESH = 'token_refresh';
    public const ACTION_CREATE_CONTAINER = 'create_container';
    public const ACTION_POLL_CONTAINER = 'poll_container';
    public const ACTION_PUBLISH = 'publish';
    public const ACTION_QUOTA_CHECK = 'quota_check';
    public const ACTION_FETCH_PERMALINK = 'fetch_permalink';
    public const ACTION_ALERT_SENT = 'alert_sent';

    protected $table = 'threads_publish_logs';

    public $timestamps = false;

    protected $fillable = [
        'account_id',
        'post_id',
        'action',
        'http_status',
        'request_payload',
        'response_payload',
        'duration_ms',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'account_id' => 'integer',
            'post_id' => 'integer',
            'http_status' => 'integer',
            'request_payload' => 'array',
            'response_payload' => 'array',
            'duration_ms' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (ThreadsPublishLog $log) {
            if ($log->created_at === null) {
                $log->created_at = now();
            }

            if ($log->request_payload !== null) {
                $log->request_payload = ThreadsTokenCipher::redact($log->request_payload);
            }

            if ($log->response_payload !== null) {
                $log->response_payload = ThreadsTokenCipher::redact($log->response_payload);
            }
        });
    }

    /**
     * Tài khoản Threads liên quan tới bản ghi log.
     */
    public function account(): BelongsTo
    {
        return $this->belongsTo(ThreadsAccount::class, 'account_id');
    }

    /**
     * Bài đăng Threads liên quan tới bản ghi log (nếu có).
     */
    public function post(): BelongsTo
    {
        return $this->belongsTo(ThreadsPost::class, 'post_id');
    }

    /**
     * Helper ghi nhanh một bản ghi log đã tự động redact token nhạy cảm.
     */
    public static function record(array $attributes): self
    {
        return static::create($attributes);
    }
}
