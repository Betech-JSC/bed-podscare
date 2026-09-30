<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WarrantyClaim extends Model
{
    use HasFactory;

    protected $fillable = [
        'claim_code',
        'warranty_id',
        'issue_description',
        'resolution_mode',
        'rework_order_id',
        'notes',
        'status',
        'received_by_user_id',
    ];

    public function warranty(): BelongsTo
    {
        return $this->belongsTo(Warranty::class);
    }

    public function reworkOrder(): BelongsTo
    {
        return $this->belongsTo(RepairOrder::class, 'rework_order_id');
    }

    public function receivedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by_user_id');
    }
}
