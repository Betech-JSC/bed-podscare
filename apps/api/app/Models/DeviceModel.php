<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DeviceModel extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'category',
        'model_code',
        'release_year',
        'manufacturer',
        'has_anc',
        'image_url',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'release_year' => 'integer',
            'has_anc' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function checklistTemplates(): HasMany
    {
        return $this->hasMany(ChecklistTemplate::class);
    }

    public function commonIssues(): HasMany
    {
        return $this->hasMany(CommonIssue::class);
    }

    public function repairServices(): HasMany
    {
        return $this->hasMany(RepairService::class);
    }

    public function repairOrders(): HasMany
    {
        return $this->hasMany(RepairOrder::class);
    }

    public function warranties(): HasMany
    {
        return $this->hasMany(Warranty::class);
    }
}
