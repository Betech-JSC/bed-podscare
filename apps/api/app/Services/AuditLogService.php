<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class AuditLogService
{
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
        $ip = request()?->ip() ?? '127.0.0.1';
        $channel = request()?->header('X-Channel', 'portal');

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
            'metadata' => $metadata,
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
        $ip = request()?->ip() ?? '127.0.0.1';
        $channel = request()?->header('X-Channel', 'portal');

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
            'metadata' => $metadata,
            'ip_address' => $ip,
            'channel' => $channel,
        ]);
    }
}
