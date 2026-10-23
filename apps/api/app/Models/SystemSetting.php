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

    /**
     * Lấy cấu hình SePay Platform thống nhất: ưu tiên SystemSetting('platform_sepay_config'),
     * sau đó fallback về config('sepay.*') / config('services.sepay.*').
     *
     * @return array<string, mixed>
     */
    public static function getPlatformSepayConfig(): array
    {
        $saved = static::get('platform_sepay_config');
        $saved = is_array($saved) ? $saved : [];

        $bankCode = array_key_exists('bank_code', $saved) && $saved['bank_code'] !== null
            ? (string) $saved['bank_code']
            : (string) config('sepay.bank_code', 'MB');

        $bankName = array_key_exists('bank_name', $saved) && $saved['bank_name'] !== null
            ? (string) $saved['bank_name']
            : 'MBBank - Ngân hàng Quân Đội';

        $accountNumber = array_key_exists('account_number', $saved) && $saved['account_number'] !== null
            ? (string) $saved['account_number']
            : (string) config('sepay.account_number', '0388960848');

        $accountName = array_key_exists('account_name', $saved) && $saved['account_name'] !== null
            ? (string) $saved['account_name']
            : (array_key_exists('account_holder', $saved) && $saved['account_holder'] !== null
                ? (string) $saved['account_holder']
                : (string) config('sepay.account_holder', 'CONG TY FIXO VIET NAM'));

        $apiToken = array_key_exists('api_token', $saved) && $saved['api_token'] !== null && $saved['api_token'] !== ''
            ? (string) $saved['api_token']
            : (string) (config('services.sepay.api_key') ?? '');

        $webhookSecret = array_key_exists('webhook_secret', $saved) && $saved['webhook_secret'] !== null && $saved['webhook_secret'] !== ''
            ? (string) $saved['webhook_secret']
            : (array_key_exists('api_token', $saved) && $saved['api_token'] !== null && $saved['api_token'] !== ''
                ? (string) $saved['api_token']
                : (string) (config('sepay.webhook_secret')
                    ?: config('services.sepay.webhook_secret')
                    ?: config('services.sepay.api_key')
                    ?: ''));

        return array_merge($saved, [
            'bank_code'      => $bankCode,
            'bank_name'      => $bankName,
            'account_number' => $accountNumber,
            'account_name'   => $accountName,
            'account_holder' => $accountName,
            'api_token'      => $apiToken,
            'webhook_secret' => $webhookSecret,
            'webhook_url'    => url('/api/v1/webhooks/sepay'),
            'qr_template'    => (string) ($saved['qr_template'] ?? config('sepay.qr_template', 'compact2')),
            'is_connected'   => $bankCode !== '' && $accountNumber !== '',
        ]);
    }
}
