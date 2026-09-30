<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RepairService extends Model
{
    use HasFactory;

    protected $fillable = [
        'device_model_id',
        'name',
        'code',
        'category',
        'base_price',
        'default_warranty_days',
        'description',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'base_price' => 'decimal:2',
            'default_warranty_days' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function deviceModel(): BelongsTo
    {
        return $this->belongsTo(DeviceModel::class);
    }

    public function quoteItems(): HasMany
    {
        return $this->hasMany(QuoteItem::class, 'service_id');
    }

    public function commonIssues(): HasMany
    {
        return $this->hasMany(CommonIssue::class, 'suggested_service_id');
    }
}
