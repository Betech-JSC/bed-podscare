<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class NotificationIsolationService
{
    /**
     * Chuẩn hóa tên vai trò hai chiều ('tech' <-> 'technician').
     */
    public function normalizeRole(?string $role): ?string
    {
        if ($role === null) {
            return null;
        }

        $normalized = strtolower(trim($role));
        if ($normalized === '') {
            return null;
        }

        if (in_array($normalized, ['tech', 'technician'], true)) {
            return 'technician';
        }

        return $normalized;
    }

    /**
     * Trả về danh sách toàn bộ bí danh vai trò tương đương để lọc SQL an toàn.
     *
     * @return list<string>
     */
    public function resolveRoleAliases(?string $role): array
    {
        $normalized = $this->normalizeRole($role);

        if ($normalized === null) {
            return [];
        }

        if ($normalized === 'technician') {
            return ['technician', 'tech'];
        }

        return [$normalized];
    }

    /**
     * Khởi tạo Builder đã gắn phạm vi cô lập 3 tầng cho tài khoản hiện tại.
     *
     * @param  array<string, mixed>  $filters
     */
    public function scopeForUser(?User $user, array $filters = []): Builder
    {
        return $this->applyVisibilityScope(Notification::query(), $user, $filters);
    }

    /**
     * Áp dụng ma trận cô lập phạm vi hiển thị thông báo 3 tầng (Fail-Closed).
     *
     * - Tầng 1 (super_admin): Chỉ thông báo cấp Nền tảng (tenant_id IS NULL).
     * - Tầng 2 (admin của Gian hàng): Khóa cứng tenant_id = user.tenant_id & (user_id IS NULL OR user_id = user.id).
     *   Xóa bỏ hoàn toàn ngoại lệ Master Tenant (orWhereNull).
     * - Tầng 3 (cskh, technician/tech, qc, inventory...): Khóa cứng tenant_id, branch_id, user_id và target_role;
     *   bỏ qua mọi tham số giả mạo ?branch_id=all|khác hoặc ?user_id=khác từ client.
     *
     * @param  array<string, mixed>  $filters
     */
    public function applyVisibilityScope(Builder $query, ?User $user, array $filters = []): Builder
    {
        if (! $user) {
            return $query->whereRaw('1 = 0');
        }

        $normalizedRole = $this->normalizeRole($user->role);

        // Fail-closed: mọi tài khoản không phải super_admin bắt buộc phải gắn tenant_id hợp lệ
        if ($normalizedRole !== 'super_admin' && empty($user->tenant_id)) {
            return $query->whereRaw('1 = 0');
        }

        $currentUserId = (int) $user->id;

        // Tầng 1: Quản trị Nền tảng (FIXO Platform Super Admin)
        if ($normalizedRole === 'super_admin') {
            $query->whereNull('notifications.tenant_id')
                ->where(function (Builder $q) use ($currentUserId): void {
                    $q->where('notifications.user_id', $currentUserId)
                        ->orWhere(function (Builder $sub): void {
                            $sub->whereNull('notifications.user_id')
                                ->where('notifications.target_role', 'super_admin');
                        });
                });

            return $query;
        }

        $tenantId = (int) $user->tenant_id;

        // Tầng 2: Chủ tiệm / Quản trị Gian hàng (role = 'admin')
        if ($normalizedRole === 'admin') {
            $query->where('notifications.tenant_id', $tenantId)
                ->where(function (Builder $q) use ($currentUserId): void {
                    $q->whereNull('notifications.user_id')
                        ->orWhere('notifications.user_id', $currentUserId);
                });

            $branchFilter = $filters['branch_id'] ?? $filters['branch'] ?? null;
            if ($branchFilter !== null && $branchFilter !== '' && $branchFilter !== 'all') {
                if (! is_numeric($branchFilter)) {
                    return $query->whereRaw('1 = 0');
                }

                $branchId = (int) $branchFilter;
                $belongsToTenant = Branch::withoutGlobalScopes()
                    ->whereKey($branchId)
                    ->where('tenant_id', $tenantId)
                    ->exists();

                if (! $belongsToTenant) {
                    return $query->whereRaw('1 = 0');
                }

                $query->where('notifications.branch_id', $branchId);
            }

            $userFilter = $filters['user_id'] ?? $filters['user'] ?? null;
            if ($userFilter !== null && $userFilter !== '') {
                if (! is_numeric($userFilter) || (int) $userFilter !== $currentUserId) {
                    return $query->whereRaw('1 = 0');
                }

                $query->where('notifications.user_id', $currentUserId);
            }

            return $query;
        }

        // Tầng 3: Nhân sự vận hành chi nhánh (cskh, technician/tech, qc, inventory...)
        // Bỏ qua hoàn toàn mọi query ?branch_id=... và ?user_id=... từ client
        $roleAliases = $this->resolveRoleAliases($normalizedRole);

        $query->where('notifications.tenant_id', $tenantId);

        if (! empty($user->branch_id)) {
            $staffBranchId = (int) $user->branch_id;
            $query->where(function (Builder $q) use ($staffBranchId, $currentUserId): void {
                $q->where('notifications.branch_id', $staffBranchId)
                    ->orWhere(function (Builder $sub) use ($currentUserId): void {
                        $sub->whereNull('notifications.branch_id')
                            ->where('notifications.user_id', $currentUserId);
                    });
            });
        } else {
            $query->where('notifications.user_id', $currentUserId);
        }

        $query->where(function (Builder $q) use ($currentUserId): void {
            $q->whereNull('notifications.user_id')
                ->orWhere('notifications.user_id', $currentUserId);
        });

        $query->where(function (Builder $q) use ($roleAliases): void {
            $q->whereNull('notifications.target_role');
            if (! empty($roleAliases)) {
                $q->orWhereIn('notifications.target_role', $roleAliases);
            }
        });

        return $query;
    }

    /**
     * Lấy danh sách thông báo phân trang kèm trạng thái đã đọc độc lập theo từng tài khoản.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listForUser(?User $user, array $filters = []): array
    {
        $perPage = max(1, min(200, (int) ($filters['per_page'] ?? 20)));

        $query = Notification::query()
            ->with([
                'repairOrder:id,order_code,status,customer_id',
                'user:id,name,role',
                'branch:id,name',
            ]);

        $this->applyVisibilityScope($query, $user, $filters);
        $this->applyReadJoin($query, $user);

        $query->select([
            'notifications.*',
            'nr.id as user_read_id',
            'nr.read_at as user_read_at',
        ]);

        if (array_key_exists('is_read', $filters) && $filters['is_read'] !== null && $filters['is_read'] !== '') {
            $parsedIsRead = filter_var($filters['is_read'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($parsedIsRead !== null) {
                $this->applyReadFilter($query, $user, $parsedIsRead);
            }
        }

        $paginator = $query->orderByDesc('notifications.id')->paginate($perPage);

        $paginator->setCollection(
            $paginator->getCollection()->map(function (Notification $notification) use ($user): Notification {
                return $this->hydrateReadStateForUser($notification, $user);
            })
        );

        $data = $paginator->toArray();
        $data['unread_count'] = $this->countUnread($user, $filters);

        return $data;
    }

    /**
     * Đếm tổng số thông báo chưa đọc trong phạm vi hiển thị hợp lệ của tài khoản hiện tại.
     *
     * @param  array<string, mixed>  $filters
     */
    public function countUnread(?User $user, array $filters = []): int
    {
        if (! $user) {
            return 0;
        }

        $unreadQuery = Notification::query();
        $this->applyVisibilityScope($unreadQuery, $user, $filters);
        $this->applyReadJoin($unreadQuery, $user);
        $this->applyReadFilter($unreadQuery, $user, false);

        return (int) $unreadQuery->count('notifications.id');
    }

    /**
     * Đánh dấu đã đọc idempotent một thông báo cho riêng tài khoản đang đăng nhập.
     * Trả về null nếu thông báo không tồn tại hoặc nằm ngoài phạm vi 3 tầng được phép xem.
     */
    public function markAsRead(User $user, int $notificationId): ?Notification
    {
        $query = Notification::query()->with(['repairOrder:id,order_code,status']);
        $this->applyVisibilityScope($query, $user);

        /** @var Notification|null $notification */
        $notification = $query->where('notifications.id', $notificationId)->first();

        if (! $notification) {
            return null;
        }

        $userId = (int) $user->id;

        return DB::transaction(function () use ($notification, $userId): Notification {
            $now = now();

            DB::table('notification_reads')->insertOrIgnore([
                'notification_id' => (int) $notification->id,
                'user_id'         => $userId,
                'read_at'         => $now,
            ]);

            $recordedReadAt = DB::table('notification_reads')
                ->where('notification_id', (int) $notification->id)
                ->where('user_id', $userId)
                ->value('read_at') ?? $now;

            $resolvedReadAt = $recordedReadAt instanceof Carbon
                ? $recordedReadAt
                : Carbon::parse((string) $recordedReadAt);

            // Chỉ đồng bộ cột legacy trên dòng gốc khi thông báo thuộc đích danh cá nhân người dùng này;
            // tuyệt đối KHÔNG ghi đè notifications.is_read trên các thông báo chung (user_id IS NULL).
            if ($notification->user_id !== null && (int) $notification->user_id === $userId && ! $notification->is_read) {
                $notification->update([
                    'is_read' => true,
                    'read_at' => $resolvedReadAt,
                ]);
            }

            $notification->setAttribute('is_read', true);
            $notification->setAttribute('read_at', $resolvedReadAt);

            return $notification;
        });
    }

    /**
     * Đánh dấu đã đọc tất cả thông báo chưa đọc trong phạm vi hợp lệ của tài khoản đang đăng nhập.
     *
     * @param  array<string, mixed>  $filters
     */
    public function markAllAsRead(User $user, array $filters = []): int
    {
        $query = Notification::query();
        $this->applyVisibilityScope($query, $user, $filters);
        $this->applyReadJoin($query, $user);
        $this->applyReadFilter($query, $user, false);

        $unreadRows = $query
            ->select(['notifications.id', 'notifications.user_id'])
            ->orderBy('notifications.id')
            ->get();

        if ($unreadRows->isEmpty()) {
            return 0;
        }

        $userId = (int) $user->id;
        $now = now();
        $updatedCount = 0;

        DB::transaction(function () use ($unreadRows, $userId, $now, &$updatedCount): void {
            foreach ($unreadRows->chunk(500) as $chunk) {
                $insertPayload = [];
                $personalNotificationIds = [];

                foreach ($chunk as $row) {
                    $notifId = (int) $row->id;
                    $insertPayload[] = [
                        'notification_id' => $notifId,
                        'user_id'         => $userId,
                        'read_at'         => $now,
                    ];

                    if ($row->user_id !== null && (int) $row->user_id === $userId) {
                        $personalNotificationIds[] = $notifId;
                    }
                }

                if (! empty($insertPayload)) {
                    $updatedCount += (int) DB::table('notification_reads')->insertOrIgnore($insertPayload);
                }

                if (! empty($personalNotificationIds)) {
                    Notification::query()
                        ->whereIn('id', $personalNotificationIds)
                        ->where('user_id', $userId)
                        ->where('is_read', false)
                        ->update([
                            'is_read' => true,
                            'read_at' => $now,
                        ]);
                }
            }
        });

        return $updatedCount;
    }

    /**
     * Kết nối bảng notification_reads theo user_id hiện tại để tính trạng thái đã đọc O(1) không phát sinh N+1.
     */
    protected function applyReadJoin(Builder $query, ?User $user): Builder
    {
        $userId = $user ? (int) $user->id : 0;

        return $query->leftJoin('notification_reads as nr', function ($join) use ($userId): void {
            $join->on('nr.notification_id', '=', 'notifications.id')
                ->where('nr.user_id', '=', $userId);
        });
    }

    /**
     * Áp dụng điều kiện lọc đã đọc / chưa đọc theo riêng tài khoản hiện tại.
     */
    protected function applyReadFilter(Builder $query, ?User $user, bool $isRead): Builder
    {
        $userId = $user ? (int) $user->id : 0;

        if ($isRead) {
            return $query->where(function (Builder $q) use ($userId): void {
                $q->whereNotNull('nr.id')
                    ->orWhere(function (Builder $sub) use ($userId): void {
                        $sub->where('notifications.user_id', $userId)
                            ->where('notifications.is_read', true);
                    });
            });
        }

        return $query->whereNull('nr.id')
            ->where(function (Builder $q) use ($userId): void {
                $q->whereNull('notifications.user_id')
                    ->orWhere('notifications.user_id', '!=', $userId)
                    ->orWhere('notifications.is_read', false);
            });
    }

    /**
     * Đồng bộ thuộc tính is_read và read_at trên instance Notification trả về JSON theo current_user.
     */
    protected function hydrateReadStateForUser(Notification $notification, ?User $user): Notification
    {
        $userId = $user ? (int) $user->id : 0;
        $hasReadRecord = $notification->getAttribute('user_read_id') !== null;
        $rawUserReadAt = $notification->getAttribute('user_read_at');

        $isPersonalLegacyRead = $userId > 0
            && $notification->user_id !== null
            && (int) $notification->user_id === $userId
            && (bool) $notification->getRawOriginal('is_read');

        $effectiveIsRead = $hasReadRecord || $isPersonalLegacyRead;

        $effectiveReadAt = null;
        if ($hasReadRecord && $rawUserReadAt !== null) {
            $effectiveReadAt = $rawUserReadAt instanceof Carbon
                ? $rawUserReadAt
                : Carbon::parse((string) $rawUserReadAt);
        } elseif ($isPersonalLegacyRead && $notification->getRawOriginal('read_at') !== null) {
            $rawLegacyReadAt = $notification->getRawOriginal('read_at');
            $effectiveReadAt = $rawLegacyReadAt instanceof Carbon
                ? $rawLegacyReadAt
                : Carbon::parse((string) $rawLegacyReadAt);
        }

        $notification->setAttribute('is_read', $effectiveIsRead);
        $notification->setAttribute('read_at', $effectiveReadAt);
        $notification->makeHidden(['user_read_id', 'user_read_at']);

        return $notification;
    }
}
