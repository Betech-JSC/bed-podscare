<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class AuditLogService
{
    /**
     * Trích xuất địa chỉ IP thực của client theo thứ tự ưu tiên proxy:
     * CF-Connecting-IP -> X-Forwarded-For -> request()->ip() -> '127.0.0.1'.
     */
    public function resolveClientIp(?Request $request = null): string
    {
        $req = $request ?? request();
        if (! $req) {
            return '127.0.0.1';
        }

        $cfIp = $req->header('CF-Connecting-IP');
        if (is_string($cfIp) && trim($cfIp) !== '') {
            $candidate = trim($cfIp);
            if (filter_var($candidate, FILTER_VALIDATE_IP)) {
                return $candidate;
            }
        }

        $xff = $req->header('X-Forwarded-For');
        if (is_string($xff) && trim($xff) !== '') {
            foreach (explode(',', $xff) as $part) {
                $candidate = trim($part);
                if ($candidate !== '' && filter_var($candidate, FILTER_VALIDATE_IP)) {
                    return $candidate;
                }
            }
        }

        $fallbackIp = $req->ip();
        if (is_string($fallbackIp) && filter_var($fallbackIp, FILTER_VALIDATE_IP)) {
            return $fallbackIp;
        }

        return '127.0.0.1';
    }

    /**
     * Phân tích chuỗi User-Agent thành nhãn Thiết bị & Trình duyệt ngắn gọn, dễ đọc.
     */
    public function parseDeviceSummary(?string $userAgent): string
    {
        if ($userAgent === null || trim($userAgent) === '') {
            return 'Không xác định';
        }

        $ua = trim($userAgent);

        // 1. Nhận diện Thiết bị / Hệ điều hành (ưu tiên thiết bị di động trước Desktop OS)
        if (stripos($ua, 'iPhone') !== false) {
            $os = 'iPhone (iOS)';
        } elseif (stripos($ua, 'iPad') !== false) {
            $os = 'iPad (iPadOS)';
        } elseif (stripos($ua, 'Android') !== false) {
            $os = 'Android';
        } elseif (stripos($ua, 'Macintosh') !== false || stripos($ua, 'Mac OS X') !== false) {
            $os = 'macOS';
        } elseif (stripos($ua, 'Windows') !== false) {
            $os = 'Windows';
        } elseif (stripos($ua, 'Linux') !== false) {
            $os = 'Linux';
        } else {
            $os = 'Thiết bị khác';
        }

        // 2. Nhận diện Trình duyệt / Client (ưu tiên Edge/Opera trước Chrome/Safari)
        if (
            stripos($ua, 'Edg/') !== false
            || stripos($ua, 'EdgA/') !== false
            || stripos($ua, 'EdgiOS/') !== false
            || stripos($ua, 'Edge/') !== false
        ) {
            $browser = 'Edge';
        } elseif (
            stripos($ua, 'OPR/') !== false
            || stripos($ua, 'Opera') !== false
            || stripos($ua, 'OPT/') !== false
        ) {
            $browser = 'Opera';
        } elseif (
            stripos($ua, 'Chrome/') !== false
            || stripos($ua, 'CriOS/') !== false
            || stripos($ua, 'Chromium/') !== false
        ) {
            $browser = 'Chrome';
        } elseif (
            stripos($ua, 'Firefox/') !== false
            || stripos($ua, 'FxiOS/') !== false
        ) {
            $browser = 'Firefox';
        } elseif (stripos($ua, 'Safari/') !== false) {
            $browser = 'Safari';
        } elseif (
            stripos($ua, 'Postman') !== false
            || stripos($ua, 'Insomnia') !== false
            || stripos($ua, 'curl/') !== false
            || stripos($ua, 'GuzzleHttp') !== false
            || stripos($ua, 'Symfony') !== false
        ) {
            $browser = 'Postman / API Client';
        } else {
            $browser = 'Trình duyệt khác';
        }

        return "{$os} • {$browser}";
    }

    /**
     * Bổ sung tự động user_agent và device_summary vào metadata mà không ghi đè khóa tùy chỉnh.
     */
    public function enrichMetadata(?array $metadata = null, ?Request $request = null): array
    {
        $req = $request ?? request();
        $enriched = $metadata ?? [];

        $rawUa = $req?->userAgent() ?? $req?->header('User-Agent');
        $ua = is_string($rawUa) ? mb_substr(trim($rawUa), 0, 500) : '';

        if (! array_key_exists('user_agent', $enriched)) {
            $enriched['user_agent'] = $ua !== '' ? $ua : null;
        }

        if (! array_key_exists('device_summary', $enriched)) {
            $enriched['device_summary'] = $this->parseDeviceSummary($ua);
        }

        return $enriched;
    }
    /**
     * Compute field-level diff between two associative arrays.
     */
    public function computeDiff(array $oldValues, array $newValues): array
    {
        $diffOld = [];
        $diffNew = [];
        $allKeys = array_unique(array_merge(array_keys($oldValues), array_keys($newValues)));

        foreach ($allKeys as $key) {
            $hasOld = array_key_exists($key, $oldValues);
            $hasNew = array_key_exists($key, $newValues);

            $oldVal = $hasOld ? $oldValues[$key] : null;
            $newVal = $hasNew ? $newValues[$key] : null;

            // Handle floats / decimals or loose type matching
            $isSame = false;
            if ($oldVal === $newVal) {
                $isSame = true;
            } elseif (is_numeric($oldVal) && is_numeric($newVal) && (float) $oldVal === (float) $newVal) {
                $isSame = true;
            }

            if (! $isSame) {
                $diffOld[$key] = $oldVal;
                $diffNew[$key] = $newVal;
            }
        }

        return [$diffOld, $diffNew];
    }

    /**
     * Format a readable string from diffs.
     */
    public function formatDiffDetails(array $diffOld, array $diffNew): string
    {
        if (empty($diffOld) && empty($diffNew)) {
            return 'Không có thay đổi dữ liệu';
        }

        $parts = [];
        $keys = array_unique(array_merge(array_keys($diffOld), array_keys($diffNew)));
        foreach ($keys as $k) {
            $from = isset($diffOld[$k]) ? (is_array($diffOld[$k]) ? json_encode($diffOld[$k], JSON_UNESCAPED_UNICODE) : (string) $diffOld[$k]) : 'null';
            $to = isset($diffNew[$k]) ? (is_array($diffNew[$k]) ? json_encode($diffNew[$k], JSON_UNESCAPED_UNICODE) : (string) $diffNew[$k]) : 'null';
            $parts[] = "{$k}: {$from} -> {$to}";
        }

        return 'Cập nhật: ' . implode(', ', $parts);
    }

    /**
     * Log a field-level difference between old and new state.
     */
    public function logFieldDiff(
        ?int $tenantId,
        ?User $user,
        string $action,
        Model|string $auditable,
        array $oldValues,
        array $newValues,
        ?string $details = null,
        ?array $metadata = null
    ): AuditLog {
        [$diffOld, $diffNew] = $this->computeDiff($oldValues, $newValues);

        if ($details === null || trim($details) === '') {
            $details = $this->formatDiffDetails($diffOld, $diffNew);
        }

        $auditableType = $auditable instanceof Model ? $auditable->getMorphClass() : (string) $auditable;
        $auditableId = $auditable instanceof Model ? $auditable->getKey() : (int) ($metadata['auditable_id'] ?? $metadata['id'] ?? 0);

        if (! $tenantId) {
            if ($user && isset($user->tenant_id)) {
                $tenantId = $user->tenant_id;
            } elseif ($auditable instanceof Model && isset($auditable->tenant_id)) {
                $tenantId = $auditable->tenant_id;
            }
        }

        $userId = $user?->id ?? auth()->id();
        $userName = $user?->name ?? auth()->user()?->name ?? 'System';
        $ip = $this->resolveClientIp();
        $channel = request()?->header('X-Channel', 'portal');
        $enrichedMetadata = $this->enrichMetadata($metadata);

        return AuditLog::create([
            'tenant_id' => $tenantId,
            'user_id' => $userId,
            'user_name' => $userName,
            'action' => $action,
            'auditable_type' => $auditableType,
            'auditable_id' => $auditableId,
            'details' => $details,
            'old_values' => ! empty($diffOld) ? $diffOld : $oldValues,
            'new_values' => ! empty($diffNew) ? $diffNew : $newValues,
            'metadata' => $enrichedMetadata,
            'ip_address' => $ip,
            'channel' => $channel,
        ]);
    }

    /**
     * General purpose audit logging with optional old/new values.
     */
    public function log(
        ?int $tenantId,
        ?User $user,
        string $action,
        Model|string $auditable,
        string $details,
        ?array $metadata = null,
        ?array $oldValues = null,
        ?array $newValues = null
    ): AuditLog {
        $auditableType = $auditable instanceof Model ? $auditable->getMorphClass() : (string) $auditable;
        $auditableId = $auditable instanceof Model ? $auditable->getKey() : (int) ($metadata['auditable_id'] ?? $metadata['id'] ?? 0);

        if (! $tenantId) {
            if ($user && isset($user->tenant_id)) {
                $tenantId = $user->tenant_id;
            } elseif ($auditable instanceof Model && isset($auditable->tenant_id)) {
                $tenantId = $auditable->tenant_id;
            }
        }

        $userId = $user?->id ?? auth()->id();
        $userName = $user?->name ?? auth()->user()?->name ?? 'System';
        $ip = $this->resolveClientIp();
        $channel = request()?->header('X-Channel', 'portal');
        $enrichedMetadata = $this->enrichMetadata($metadata);

        return AuditLog::create([
            'tenant_id' => $tenantId,
            'user_id' => $userId,
            'user_name' => $userName,
            'action' => $action,
            'auditable_type' => $auditableType,
            'auditable_id' => $auditableId,
            'details' => $details,
            'old_values' => $oldValues,
            'new_values' => $newValues,
            'metadata' => $enrichedMetadata,
            'ip_address' => $ip,
            'channel' => $channel,
        ]);
    }
}
