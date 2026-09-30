<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BranchPart extends Model
{
    use HasFactory;

    protected $table = 'branch_parts';

    protected $fillable = [
        'branch_id',
        'part_id',
        'stock_quantity',
        'min_stock_alert',
    ];

    protected function casts(): array
    {
        return [
            'branch_id' => 'integer',
            'part_id' => 'integer',
            'stock_quantity' => 'integer',
            'min_stock_alert' => 'integer',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function part(): BelongsTo
    {
        return $this->belongsTo(Part::class);
    }
}
