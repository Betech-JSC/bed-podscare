<?php

namespace App\Models;

use App\Models\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkShift extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'shift_code',
        'cashier_id',
        'opened_at',
        'closed_at',
        'status',
        'opening_cash',
        'system_cash_in',
        'system_cash_out',
        'expected_cash',
        'actual_cash',
        'difference_amount',
        'carried_over_cash',
        'deposited_cash',
        'reconciliation_notes',
        'closed_by_user_id',
    ];

    protected $appends = [
        'vietqr_total',
        'orders_completed_count',
        'has_active_shift',
    ];

    public function getVietqrTotalAttribute(): float
    {
        return (float) ($this->attributes['vietqr_total'] ?? 0.0);
    }

    public function getOrdersCompletedCountAttribute(): int
    {
        return (int) ($this->attributes['orders_completed_count'] ?? 0);
    }

    public function getHasActiveShiftAttribute(): bool
    {
        return (bool) ($this->attributes['has_active_shift'] ?? ($this->status === 'open'));
    }

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
            'opening_cash' => 'decimal:2',
            'system_cash_in' => 'decimal:2',
            'system_cash_out' => 'decimal:2',
            'expected_cash' => 'decimal:2',
            'actual_cash' => 'decimal:2',
            'difference_amount' => 'decimal:2',
            'carried_over_cash' => 'decimal:2',
            'deposited_cash' => 'decimal:2',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cashier_id');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by_user_id');
    }

    public function cashTransactions(): HasMany
    {
        return $this->hasMany(CashTransaction::class, 'shift_id');
    }

    public function scopeForTenant(Builder $query, int $tenantId): Builder
    {
        return $query->where('tenant_id', $tenantId);
    }

    public function scopeForBranch(Builder $query, int $branchId): Builder
    {
        return $query->where('branch_id', $branchId);
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', 'open');
    }

    public function scopeClosed(Builder $query): Builder
    {
        return $query->where('status', 'closed');
    }
}
