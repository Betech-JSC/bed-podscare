<?php

namespace App\Models;

use App\Models\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'phone',
        'name',
        'email',
        'customer_type',
        'source',
        'notes',
        'orders_count',
        'total_spent',
    ];

    protected function casts(): array
    {
        return [
            'orders_count' => 'integer',
            'total_spent' => 'decimal:2',
        ];
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
