<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubscriptionPlan extends Model
{
    use HasFactory;

    protected $table = 'subscription_plans';

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'code',
        'name',
        'price',
        'price_monthly',
        'price_yearly',
        'billing_cycle',
        'max_branches',
        'max_users',
        'max_orders_per_month',
        'features',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'price_monthly' => 'decimal:2',
            'price_yearly' => 'decimal:2',
            'max_branches' => 'integer',
            'max_users' => 'integer',
            'max_orders_per_month' => 'integer',
            'features' => 'array',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(SaasInvoice::class, 'plan_id');
    }

    public function tenants(): HasMany
    {
        return $this->hasMany(Tenant::class, 'current_plan_id');
    }
}
