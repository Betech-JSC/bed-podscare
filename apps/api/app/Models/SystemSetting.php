<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

class SystemSetting extends Model
{
    protected $table = 'system_settings';

    protected $fillable = [
        'key',
        'value',
    ];

    public static function get(string $key, mixed $default = null): mixed
    {
        try {
            if (! Schema::hasTable('system_settings')) {
                return $default;
            }

            $setting = static::where('key', $key)->first();
            if (! $setting) {
                return $default;
            }

            $decoded = json_decode((string) $setting->value, true);
            return json_last_error() === JSON_ERROR_NONE ? $decoded : $setting->value;
        } catch (\Throwable) {
            return $default;
        }
    }

    public static function set(string $key, mixed $value): void
    {
        try {
            if (! Schema::hasTable('system_settings')) {
                return;
            }

            $val = is_array($value) || is_object($value) ? json_encode($value) : (string) $value;

            static::updateOrCreate(
                ['key' => $key],
                ['value' => $val]
            );
        } catch (\Throwable) {
            // Silently handle if table is not available
        }
    }
}
