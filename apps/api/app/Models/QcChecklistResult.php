<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QcChecklistResult extends Model
{
    use HasFactory;

    protected $fillable = [
        'qc_inspection_id',
        'criterion',
        'is_passed',
    ];

    protected function casts(): array
    {
        return [
            'is_passed' => 'boolean',
        ];
    }

    public function qcInspection(): BelongsTo
    {
        return $this->belongsTo(QcInspection::class);
    }
}
