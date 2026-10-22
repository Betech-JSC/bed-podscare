<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
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
        'old_values',
        'new_values',
        'ip_address',
        'channel',
        'module',
        'description',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'old_values' => 'array',
            'new_values' => 'array',
            'metadata' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (AuditLog $log) {
            if (empty($log->user_name) && $log->user_id) {
                if (auth()->check() && (int) auth()->id() === (int) $log->user_id) {
                    $log->user_name = auth()->user()?->name ?? 'System';
                } else {
                    $user = User::withoutGlobalScopes()->find($log->user_id);
                    $log->user_name = $user?->name ?? 'System';
                }
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
            $this->attributes['metadata'] = json_encode($value);
        } elseif (is_string($value)) {
            $this->attributes['metadata'] = $value;
        } else {
            $this->attributes['metadata'] = null;
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
        $type = $this->getAttributeFromArray('auditable_type');
        if (! empty($type)) {
            $class = static::getActualClassNameForMorph($type);
            if (! class_exists($class)) {
                return $this->newMorphTo(
                    $this->newQuery()->whereRaw('1=0'),
                    $this,
                    $this->getAttributeFromArray('auditable_id'),
                    'id',
                    'auditable_type',
                    'auditable'
                );
            }
        }

        return $this->morphTo();
    }

    protected function newMorphTo(Builder $query, Model $parent, $foreignKey, $ownerKey, $type, $relation)
    {
        return new class($query, $parent, $foreignKey, $ownerKey, $type, $relation) extends MorphTo {
            public function getEager()
            {
                foreach (array_keys($this->dictionary) as $type) {
                    $class = Model::getActualClassNameForMorph($type);
                    if (! class_exists($class)) {
                        continue;
                    }
                    $this->matchToMorphParents($type, $this->getResultsByType($type));
                }

                return $this->models;
            }
        };
    }
}
