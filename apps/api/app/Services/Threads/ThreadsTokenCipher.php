<?php

namespace App\Services\Threads;

use RuntimeException;

class ThreadsTokenCipher
{
    public const CIPHER_ALGO = 'aes-256-gcm';
    public const IV_LENGTH = 12;
    public const TAG_LENGTH = 16;
    public const REDACTED_PLACEHOLDER = '[REDACTED_TOKEN]';

    /**
     * Mã hóa chuỗi plaintext (Access Token) bằng AES-256-GCM.
     * Đóng gói: Base64(12-byte IV + 16-byte Auth Tag + Ciphertext).
     */
    public static function encrypt(string $plainText, ?string $customKey = null): string
    {
        if ($plainText === '') {
            throw new RuntimeException('Cannot encrypt an empty access token.');
        }

        $key = self::resolveKey($customKey);
        $iv = random_bytes(self::IV_LENGTH);
        $tag = '';

        $cipherText = openssl_encrypt(
            $plainText,
            self::CIPHER_ALGO,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            self::TAG_LENGTH
        );

        if ($cipherText === false || strlen($tag) !== self::TAG_LENGTH) {
            throw new RuntimeException('AES-256-GCM encryption failed.');
        }

        return base64_encode($iv . $tag . $cipherText);
    }

    /**
     * Giải mã chuỗi Base64(12-byte IV + 16-byte Auth Tag + Ciphertext) bằng AES-256-GCM.
     * Ném RuntimeException nếu dữ liệu hoặc Authentication Tag bị giả mạo / can thiệp.
     */
    public static function decrypt(string $encryptedPayload, ?string $customKey = null): string
    {
        $trimmed = trim($encryptedPayload);
        if ($trimmed === '') {
            throw new RuntimeException('Encrypted token payload cannot be empty.');
        }

        $key = self::resolveKey($customKey);

        // Hỗ trợ cả định dạng JSON {iv, tag, ciphertext} nếu có
        if (str_starts_with($trimmed, '{')) {
            $decodedJson = json_decode($trimmed, true);
            if (is_array($decodedJson) && isset($decodedJson['iv'], $decodedJson['tag'], $decodedJson['ciphertext'])) {
                $iv = base64_decode((string) $decodedJson['iv'], true);
                $tag = base64_decode((string) $decodedJson['tag'], true);
                $cipherText = base64_decode((string) $decodedJson['ciphertext'], true);

                if (
                    $iv === false
                    || $tag === false
                    || $cipherText === false
                    || strlen($iv) !== self::IV_LENGTH
                    || strlen($tag) !== self::TAG_LENGTH
                ) {
                    throw new RuntimeException('Invalid AES-256-GCM JSON token structure.');
                }

                $plain = openssl_decrypt(
                    $cipherText,
                    self::CIPHER_ALGO,
                    $key,
                    OPENSSL_RAW_DATA,
                    $iv,
                    $tag,
                    ''
                );

                if ($plain === false) {
                    throw new RuntimeException('AES-256-GCM authentication tag verification failed.');
                }

                return $plain;
            }
        }

        $raw = base64_decode($trimmed, true);
        if ($raw === false || strlen($raw) <= (self::IV_LENGTH + self::TAG_LENGTH)) {
            throw new RuntimeException('Invalid base64 payload or truncated AES-256-GCM token.');
        }

        $iv = substr($raw, 0, self::IV_LENGTH);
        $tag = substr($raw, self::IV_LENGTH, self::TAG_LENGTH);
        $cipherText = substr($raw, self::IV_LENGTH + self::TAG_LENGTH);

        $plainText = openssl_decrypt(
            $cipherText,
            self::CIPHER_ALGO,
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            ''
        );

        if ($plainText === false) {
            throw new RuntimeException('AES-256-GCM decryption failed: authentication tag mismatch or corrupted ciphertext.');
        }

        return $plainText;
    }

    /**
     * Giải quyết khóa 32 bytes cho AES-256-GCM từ THREADS_TOKEN_ENCRYPTION_KEY hoặc dẫn xuất SHA-256 từ APP_KEY.
     */
    public static function resolveKey(?string $customKey = null): string
    {
        $rawKey = $customKey;
        if ($rawKey === null || trim($rawKey) === '') {
            $rawKey = (string) (config('threads.token_encryption_key') ?: env('THREADS_TOKEN_ENCRYPTION_KEY', ''));
        }

        if (trim($rawKey) === '') {
            $rawKey = (string) (config('app.key') ?: env('APP_KEY', 'podscare-threads-default-fallback-key'));
        }

        $rawKey = trim($rawKey);
        if (str_starts_with($rawKey, 'base64:')) {
            $decoded = base64_decode(substr($rawKey, 7), true);
            if ($decoded !== false && strlen($decoded) === 32) {
                return $decoded;
            }
            if ($decoded !== false && $decoded !== '') {
                return hash('sha256', $decoded, true);
            }
        }

        if (strlen($rawKey) === 32) {
            return $rawKey;
        }

        return hash('sha256', $rawKey, true);
    }

    /**
     * Quét đệ quy mảng/chuỗi/object và thay thế mọi access_token, client_secret, app_secret hoặc Bearer token bằng [REDACTED_TOKEN].
     */
    public static function redact(mixed $payload, array $extraSecrets = []): mixed
    {
        if ($payload === null || is_bool($payload) || is_int($payload) || is_float($payload)) {
            return $payload;
        }

        if (is_string($payload)) {
            return self::redactString($payload, $extraSecrets);
        }

        if (is_object($payload)) {
            if (method_exists($payload, 'toArray')) {
                return self::redact($payload->toArray(), $extraSecrets);
            }
            $payload = (array) $payload;
        }

        if (is_array($payload)) {
            $redacted = [];
            foreach ($payload as $key => $value) {
                $normalizedKey = strtolower(trim((string) $key));
                if (self::isSensitiveKey($normalizedKey)) {
                    $redacted[$key] = self::REDACTED_PLACEHOLDER;
                } else {
                    $redacted[$key] = self::redact($value, $extraSecrets);
                }
            }

            return $redacted;
        }

        return $payload;
    }

    /**
     * Che giấu token nhạy cảm trong chuỗi URL, JSON hoặc thông báo lỗi.
     */
    public static function redactString(string $text, array $extraSecrets = []): string
    {
        if ($text === '') {
            return '';
        }

        // 1. Thay thế query params: access_token=..., client_secret=..., app_secret=...
        $sanitized = preg_replace(
            '/\b(access_token|client_secret|app_secret|access_token_encrypted)=([^&\s"\'<>]+)/i',
            '$1=' . self::REDACTED_PLACEHOLDER,
            $text
        ) ?? $text;

        // 2. Thay thế khóa JSON dạng chuỗi: "access_token": "..."
        $sanitized = preg_replace(
            '/"(access_token|client_secret|app_secret|access_token_encrypted)"\s*:\s*"([^"]*)"/i',
            '"$1":"' . self::REDACTED_PLACEHOLDER . '"',
            $sanitized
        ) ?? $sanitized;

        // 3. Thay thế Authorization: Bearer ...
        $sanitized = preg_replace(
            '/\bBearer\s+[A-Za-z0-9\-._~+\/]+=*/i',
            'Bearer ' . self::REDACTED_PLACEHOLDER,
            $sanitized
        ) ?? $sanitized;

        // 4. Thay thế các secret cụ thể nếu được truyền vào
        foreach ($extraSecrets as $secret) {
            if (is_string($secret) && strlen(trim($secret)) >= 6) {
                $sanitized = str_replace(trim($secret), self::REDACTED_PLACEHOLDER, $sanitized);
            }
        }

        return $sanitized;
    }

    /**
     * Kiểm tra tên trường có phải là trường chứa khóa/token nhạy cảm không.
     */
    protected static function isSensitiveKey(string $normalizedKey): bool
    {
        if (in_array($normalizedKey, [
            'access_token',
            'client_secret',
            'app_secret',
            'access_token_encrypted',
            'refresh_token',
            'authorization',
        ], true)) {
            return true;
        }

        return str_contains($normalizedKey, 'access_token')
            || str_contains($normalizedKey, 'client_secret')
            || str_contains($normalizedKey, 'app_secret');
    }
}
