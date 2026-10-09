<?php

namespace App\Models;

use App\Models\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RepairOrder extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'order_code',
        'intake_batch_code',
        'branch_id',
        'customer_id',
        'device_model_id',
        'serial_number',
        'intake_battery_level',
        'accessories',
        'issue_description',
        'appearance_notes',
        'status',
        'order_type',
        'total_price',
        'initial_price',
        'price_note',
        'additional_services',
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
        'parts_needed',
        'paused_at',
        'final_check_result',
        'qc_passed_at',
        'qc_note',
        'customer_notified_at',
        'handed_over_at',
        'delivered_at',
    ];

    protected $appends = [
        'delivered_at',
        'estimated_price',
    ];

    public function getEstimatedPriceAttribute()
    {
        return (float) ($this->total_price ?? 0);
    }

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
            'initial_price' => 'decimal:2',
            'additional_services' => 'array',
            'warranty_terms_days' => 'integer',
            'customer_approved_at' => 'datetime',
            'customer_declined_at' => 'datetime',
            'tech_accepted_at' => 'datetime',
            'repair_started_at' => 'datetime',
            'paused_at' => 'datetime',
            'repair_completed_at' => 'datetime',
            'qc_passed_at' => 'datetime',
            'customer_notified_at' => 'datetime',
            'handed_over_at' => 'datetime',
        ];
    }

    public function isCod(): bool
    {
        return ($this->order_type ?? 'in_store') === 'cod';
    }

    public function isInStore(): bool
    {
        return ($this->order_type ?? 'in_store') === 'in_store';
    }

    public function scopeOrderType($query, ?string $type)
    {
        if (! empty($type) && $type !== 'all') {
            return $query->where('order_type', $type);
        }
        return $query;
    }

    public function recalculateTotalPrice(): float
    {
        $base = $this->initial_price !== null ? (float) $this->initial_price : (float) $this->total_price;
        $services = $this->additional_services ?? [];
        $additionalSum = 0.0;
        foreach ($services as $srv) {
            $additionalSum += (float) ($srv['price'] ?? 0);
        }
        $newTotal = $base + $additionalSum;
        $this->total_price = $newTotal;
        return $newTotal;
    }

    public function addAdditionalService(array $serviceData, ?User $user = null): array
    {
        if ($this->initial_price === null) {
            $this->initial_price = $this->total_price ?? 0.00;
        }

        $services = $this->additional_services ?? [];
        $serviceId = $serviceData['id'] ?? ('srv_' . (string) \Illuminate\Support\Str::uuid());

        $newItem = [
            'id' => $serviceId,
            'name' => $serviceData['name'],
            'price' => (float) $serviceData['price'],
            'service_id' => isset($serviceData['service_id']) && $serviceData['service_id'] !== '' ? (int) $serviceData['service_id'] : null,
            'note' => $serviceData['note'] ?? null,
            'created_at' => now()->toIso8601String(),
            'created_by_user_id' => $user?->id ?? $serviceData['created_by_user_id'] ?? null,
            'created_by_name' => $user?->name ?? $serviceData['created_by_name'] ?? 'CSKH',
        ];

        $services[] = $newItem;
        $this->additional_services = array_values($services);
        $this->recalculateTotalPrice();
        $this->save();

        return $newItem;
    }

    public function removeAdditionalService(string $serviceId): bool
    {
        $services = $this->additional_services ?? [];
        $found = false;
        $filtered = [];

        foreach ($services as $item) {
            if (($item['id'] ?? null) === $serviceId) {
                $found = true;
            } else {
                $filtered[] = $item;
            }
        }

        if (! $found) {
            return false;
        }

        $this->additional_services = array_values($filtered);
        $this->recalculateTotalPrice();
        $this->save();

        return true;
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

    public function batchOrders(): HasMany
    {
        return $this->hasMany(RepairOrder::class, 'intake_batch_code', 'intake_batch_code')
            ->whereNotNull('intake_batch_code');
    }
}
