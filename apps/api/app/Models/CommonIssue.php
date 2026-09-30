<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommonIssue extends Model
{
    use HasFactory;

    protected $fillable = [
        'device_model_id',
        'category',
        'issue_name',
        'solution',
        'estimated_time',
        'suggested_service_id',
        'estimated_cost',
        'order_index',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'estimated_cost' => 'decimal:2',
            'order_index' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function deviceModel(): BelongsTo
    {
        return $this->belongsTo(DeviceModel::class);
    }

    public function suggestedService(): BelongsTo
    {
        return $this->belongsTo(RepairService::class, 'suggested_service_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeForCategory(Builder $query, ?string $category): Builder
    {
        return $category ? $query->where('category', $category) : $query;
    }

    public function scopeForDeviceModel(Builder $query, ?int $modelId): Builder
    {
        return $modelId ? $query->where('device_model_id', $modelId) : $query;
    }
}
