<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ThreadsSeedingCampaign extends Model
{
    use HasFactory;

    public const TYPE_DISCOVERY = 'discovery';
    public const TYPE_DIRECT = 'direct';

    public const STRATEGY_ROUND_ROBIN = 'round_robin';
    public const STRATEGY_MANUAL = 'manual';
    public const STRATEGY_CLUSTER = 'cluster';

    public const STATUS_DRAFT = 'draft';
    public const STATUS_QUEUED = 'queued';
    public const STATUS_PROCESSING = 'processing';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_PARTIALLY_FAILED = 'partially_failed';
    public const STATUS_FAILED = 'failed';

    protected $table = 'threads_seeding_campaigns';

    protected $fillable = [
        'name',
        'type',
        'keyword',
        'dispatch_strategy',
        'content_template',
        'status',
        'total_jobs',
        'completed_jobs',
        'failed_jobs',
        'settings',
        'created_by',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'total_jobs' => 'integer',
            'completed_jobs' => 'integer',
            'failed_jobs' => 'integer',
            'settings' => 'array',
        ];
    }

    /**
     * Danh sách jobs seeding trực thuộc chiến dịch.
     */
    public function jobs(): HasMany
    {
        return $this->hasMany(ThreadsSeedingJob::class, 'campaign_id');
    }

    /**
     * Người dùng tạo chiến dịch.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Scope lọc theo trạng thái chiến dịch.
     */
    public function scopeStatus(Builder $query, string $status): Builder
    {
        return $query->where('status', $status);
    }

    /**
     * Scope lọc theo phân loại chiến dịch.
     */
    public function scopeType(Builder $query, string $type): Builder
    {
        return $query->where('type', $type);
    }
}
