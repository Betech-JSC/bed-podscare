<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class QcInspection extends Model
{
    use HasFactory;

    protected $fillable = [
        'repair_order_id',
        'inspector_id',
        'result',
        'notes',
        'rework_reason',
    ];

    public function repairOrder(): BelongsTo
    {
        return $this->belongsTo(RepairOrder::class);
    }

    public function inspector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'inspector_id');
    }

    public function checklistResults(): HasMany
    {
        return $this->hasMany(QcChecklistResult::class, 'qc_inspection_id');
    }
}
