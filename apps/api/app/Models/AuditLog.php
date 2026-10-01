<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class AuditLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'user_id',
        'user_name',
        'action',
        'auditable_type',
        'auditable_id',
        'details',
        'ip_address',
        'channel',
        'module',
        'description',
        'metadata',
    ];

    protected static function booted(): void
    {
        static::creating(function (AuditLog $log) {
            if (empty($log->user_name) && $log->user_id) {
                $user = User::find($log->user_id);
                $log->user_name = $user?->name ?? 'System';
            } elseif (empty($log->user_name)) {
                $log->user_name = 'System';
            }
        });
    }

    public function setModuleAttribute($value): void
    {
        $this->attributes['auditable_type'] = $value;
    }

    public function getModuleAttribute(): ?string
    {
        return $this->attributes['auditable_type'] ?? null;
    }

    public function setDescriptionAttribute($value): void
    {
        $this->attributes['details'] = $value;
    }

    public function getDescriptionAttribute(): ?string
    {
        return $this->attributes['details'] ?? null;
    }

    public function setMetadataAttribute($value): void
    {
        if (is_array($value)) {
            if (isset($value['branch_id']) && empty($this->attributes['auditable_id'])) {
                $this->attributes['auditable_id'] = $value['branch_id'];
            }
        }
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function auditable(): MorphTo
    {
        return $this->morphTo();
    }
}
