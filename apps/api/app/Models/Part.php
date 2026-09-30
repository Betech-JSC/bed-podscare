<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Part extends Model
{
    use HasFactory;

    protected $fillable = [
        'sku',
        'name',
        'category',
        'compatible_models',
        'storage_location',
        'stock_quantity',
        'min_stock_alert',
        'cost_price',
        'retail_price',
        'unit',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'stock_quantity' => 'integer',
            'min_stock_alert' => 'integer',
            'cost_price' => 'decimal:2',
            'retail_price' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    public function inventoryTransactions(): HasMany
    {
        return $this->hasMany(InventoryTransaction::class);
    }

    public function quoteItems(): HasMany
    {
        return $this->hasMany(QuoteItem::class, 'part_id');
    }

    public function branchParts(): HasMany
    {
        return $this->hasMany(BranchPart::class);
    }
}
