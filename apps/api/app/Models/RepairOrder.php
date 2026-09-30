<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RepairOrder extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_code',
        'branch_id',
        'customer_id',
        'device_model_id',
        'serial_number',
        'intake_battery_level',
        'accessories',
        'issue_description',
        'appearance_notes',
        'status',
        'total_price',
        'price_note',
        'warranty_terms_days',
        'created_by_user_id',
        'technician_id',
        'qc_inspector_id',
        'handed_over_by_user_id',
        'customer_approved_at',
        'customer_declined_at',
        'decline_reason',
        'tech_accepted_at',
        'repair_started_at',
        'repair_completed_at',
        'repair_note',
        'parts_used_summary',
        'final_check_result',
        'qc_passed_at',
        'qc_note',
        'customer_notified_at',
        'handed_over_at',
        'delivered_at',
    ];

    protected $appends = [
        'delivered_at',
    ];

    public function getDeliveredAtAttribute()
    {
        return $this->handed_over_at;
    }

    public function setDeliveredAtAttribute($value): void
    {
        $this->attributes['handed_over_at'] = $value;
    }

    protected function casts(): array
    {
        return [
            'total_price' => 'decimal:2',
            'warranty_terms_days' => 'integer',
            'customer_approved_at' => 'datetime',
            'customer_declined_at' => 'datetime',
            'tech_accepted_at' => 'datetime',
            'repair_started_at' => 'datetime',
            'repair_completed_at' => 'datetime',
            'qc_passed_at' => 'datetime',
            'customer_notified_at' => 'datetime',
            'handed_over_at' => 'datetime',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function deviceModel(): BelongsTo
    {
        return $this->belongsTo(DeviceModel::class);
    }

    public function createdByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technician_id');
    }

    public function qcInspector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'qc_inspector_id');
    }

    public function handedOverByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handed_over_by_user_id');
    }

    public function intakeChecklists(): HasMany
    {
        return $this->hasMany(IntakeChecklist::class);
    }

    public function intakePhotos(): HasMany
    {
        return $this->hasMany(IntakePhoto::class);
    }

    public function quotes(): HasMany
    {
        return $this->hasMany(RepairQuote::class);
    }

    public function qcInspections(): HasMany
    {
        return $this->hasMany(QcInspection::class);
    }

    public function inventoryTransactions(): HasMany
    {
        return $this->hasMany(InventoryTransaction::class);
    }

    public function shipments(): HasMany
    {
        return $this->hasMany(Shipment::class);
    }

    public function warranties(): HasMany
    {
        return $this->hasMany(Warranty::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
