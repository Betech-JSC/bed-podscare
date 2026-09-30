<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Partner extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'service_type',
        'contact_person',
        'phone',
        'status',
        'api_config',
    ];

    protected $hidden = [
        'api_config',
    ];

    protected function casts(): array
    {
        return [
            'api_config' => 'array',
        ];
    }

    public function shipments(): HasMany
    {
        return $this->hasMany(Shipment::class);
    }
}
