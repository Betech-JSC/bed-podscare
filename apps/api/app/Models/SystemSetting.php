<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SystemSetting extends Model
{
    protected $table = 'system_settings';

    protected $fillable = [
        'key',
        'value',
    ];

    /**
     * Bộ nhớ đệm tĩnh trong vòng đời request cho các cấu hình hệ thống.
     *
     * @var array<string, mixed>
     */
    protected static array $memoryCache = [];

    public static function get(string $key, mixed $default = null): mixed
    {
        if (array_key_exists($key, self::$memoryCache)) {
            return self::$memoryCache[$key] ?? $default;
        }

        try {
            $setting = static::where('key', $key)->first();
            if (! $setting) {
                self::$memoryCache[$key] = null;

                return $default;
            }

            $decoded = json_decode((string) $setting->value, true);
            $resolved = json_last_error() === JSON_ERROR_NONE ? $decoded : $setting->value;
            self::$memoryCache[$key] = $resolved;

            return $resolved ?? $default;
        } catch (\Throwable) {
            return $default;
        }
    }

    public static function set(string $key, mixed $value): void
    {
        try {
            $val = is_array($value) || is_object($value) ? json_encode($value) : (string) $value;

            static::updateOrCreate(
                ['key' => $key],
                ['value' => $val]
            );

            $decoded = json_decode((string) $val, true);
            self::$memoryCache[$key] = json_last_error() === JSON_ERROR_NONE ? $decoded : $val;
        } catch (\Throwable) {
            // Silently handle if table is not available
        }
    }

    public static function clearCache(): void
    {
        self::$memoryCache = [];
    }
}
