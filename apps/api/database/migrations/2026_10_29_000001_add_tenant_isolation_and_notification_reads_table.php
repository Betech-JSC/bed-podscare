<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Danh sách các loại thông báo thuộc cấp Quản trị Nền tảng (FIXO Super Admin).
     *
     * @var list<string>
     */
    protected array $platformTypes = [
        'tenant_registered',
        'saas_payment_received',
    ];

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('notifications')) {
            if (! Schema::hasColumn('notifications', 'tenant_id')) {
                Schema::table('notifications', function (Blueprint $table) {
                    $table->foreignId('tenant_id')
                        ->nullable()
                        ->after('id')
                        ->constrained('tenants')
                        ->nullOnDelete();
                });
            }

            if (! Schema::hasColumn('notifications', 'target_role')) {
                Schema::table('notifications', function (Blueprint $table) {
                    $table->string('target_role', 30)
                        ->nullable()
                        ->after('branch_id');
                });
            }

            if (! Schema::hasIndex('notifications', 'idx_notifications_target_role')) {
                Schema::table('notifications', function (Blueprint $table) {
                    $table->index('target_role', 'idx_notifications_target_role');
                });
            }

            if (! Schema::hasIndex('notifications', 'idx_notifications_tenant_branch_role')) {
                Schema::table('notifications', function (Blueprint $table) {
                    $table->index(
                        ['tenant_id', 'branch_id', 'target_role'],
                        'idx_notifications_tenant_branch_role'
                    );
                });
            }

            if (! Schema::hasIndex('notifications', 'idx_notifications_tenant_user')) {
                Schema::table('notifications', function (Blueprint $table) {
                    $table->index(
                        ['tenant_id', 'user_id'],
                        'idx_notifications_tenant_user'
                    );
                });
            }
        }

        if (! Schema::hasTable('notification_reads')) {
            Schema::create('notification_reads', function (Blueprint $table) {
                $table->id();
                $table->foreignId('notification_id')
                    ->constrained('notifications')
                    ->cascadeOnDelete();
                $table->foreignId('user_id')
                    ->constrained('users')
                    ->cascadeOnDelete();
                $table->timestamp('read_at')->useCurrent();

                $table->unique(['notification_id', 'user_id'], 'uq_notification_reads_notif_user');
                $table->index(['user_id', 'read_at'], 'idx_notification_reads_user_read_at');
            });
        }

        if (Schema::hasTable('notifications')) {
            $this->runSafeBackfill();
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notification_reads');

        if (! Schema::hasTable('notifications')) {
            return;
        }

        foreach ([
            'idx_notifications_tenant_branch_role',
            'idx_notifications_tenant_user',
            'idx_notifications_target_role',
        ] as $indexName) {
            if (Schema::hasIndex('notifications', $indexName)) {
                Schema::table('notifications', function (Blueprint $table) use ($indexName) {
                    $table->dropIndex($indexName);
                });
            }
        }

        if (Schema::hasColumn('notifications', 'tenant_id')) {
            Schema::table('notifications', function (Blueprint $table) {
                $table->dropConstrainedForeignId('tenant_id');
            });
        }

        if (Schema::hasColumn('notifications', 'target_role')) {
            Schema::table('notifications', function (Blueprint $table) {
                $table->dropColumn('target_role');
            });
        }
    }

    /**
     * Thực thi backfill idempotent 4 bước tương thích cả MySQL/MariaDB và SQLite.
     */
    protected function runSafeBackfill(): void
    {
        $superAdminIds = Schema::hasTable('users')
            ? DB::table('users')
                ->where('role', 'super_admin')
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all()
            : [];

        // Bước A: Gán tenant_id = NULL và target_role = 'super_admin' cho thông báo cấp Nền tảng
        DB::table('notifications')
            ->where(function ($query) use ($superAdminIds) {
                $query->whereIn('type', $this->platformTypes);
                if (! empty($superAdminIds)) {
                    $query->orWhereIn('user_id', $superAdminIds);
                }
            })
            ->update([
                'tenant_id' => null,
                'target_role' => 'super_admin',
            ]);

        // Bước B: Suy diễn tenant_id cho thông báo Gian hàng theo thứ tự repair_orders -> branches -> users
        $hasOrdersTable = Schema::hasTable('repair_orders') && Schema::hasColumn('repair_orders', 'tenant_id');
        $hasBranchesTable = Schema::hasTable('branches') && Schema::hasColumn('branches', 'tenant_id');
        $hasUsersTable = Schema::hasTable('users') && Schema::hasColumn('users', 'tenant_id');

        DB::table('notifications')
            ->whereNull('tenant_id')
            ->where(function ($query) {
                $query->whereNull('target_role')
                    ->orWhere('target_role', '!=', 'super_admin');
            })
            ->whereNotIn('type', $this->platformTypes)
            ->when(! empty($superAdminIds), function ($query) use ($superAdminIds) {
                $query->where(function ($sub) use ($superAdminIds) {
                    $sub->whereNull('user_id')
                        ->orWhereNotIn('user_id', $superAdminIds);
                });
            })
            ->select(['id', 'order_id', 'branch_id', 'user_id'])
            ->orderBy('id')
            ->chunkById(500, function ($rows) use ($hasOrdersTable, $hasBranchesTable, $hasUsersTable) {
                $orderIds = $rows->pluck('order_id')->filter()->unique()->values()->all();
                $branchIds = $rows->pluck('branch_id')->filter()->unique()->values()->all();
                $userIds = $rows->pluck('user_id')->filter()->unique()->values()->all();

                $orderTenants = ($hasOrdersTable && ! empty($orderIds))
                    ? DB::table('repair_orders')
                        ->whereIn('id', $orderIds)
                        ->whereNotNull('tenant_id')
                        ->pluck('tenant_id', 'id')
                        ->all()
                    : [];

                $branchTenants = ($hasBranchesTable && ! empty($branchIds))
                    ? DB::table('branches')
                        ->whereIn('id', $branchIds)
                        ->whereNotNull('tenant_id')
                        ->pluck('tenant_id', 'id')
                        ->all()
                    : [];

                $userTenants = ($hasUsersTable && ! empty($userIds))
                    ? DB::table('users')
                        ->whereIn('id', $userIds)
                        ->where('role', '!=', 'super_admin')
                        ->whereNotNull('tenant_id')
                        ->pluck('tenant_id', 'id')
                        ->all()
                    : [];

                $idsByTenant = [];

                foreach ($rows as $row) {
                    $resolvedTenantId = null;

                    if ($row->order_id !== null && isset($orderTenants[$row->order_id])) {
                        $resolvedTenantId = (int) $orderTenants[$row->order_id];
                    } elseif ($row->branch_id !== null && isset($branchTenants[$row->branch_id])) {
                        $resolvedTenantId = (int) $branchTenants[$row->branch_id];
                    } elseif ($row->user_id !== null && isset($userTenants[$row->user_id])) {
                        $resolvedTenantId = (int) $userTenants[$row->user_id];
                    }

                    if ($resolvedTenantId !== null) {
                        $idsByTenant[$resolvedTenantId][] = (int) $row->id;
                    }
                }

                foreach ($idsByTenant as $tenantId => $notificationIds) {
                    DB::table('notifications')
                        ->whereIn('id', $notificationIds)
                        ->update(['tenant_id' => (int) $tenantId]);
                }
            });

        // Bước C: Bảo vệ ẩn giá trên dữ liệu lịch sử (fee_reminder -> admin; quote_action / có ký hiệu tiền tệ -> cskh)
        DB::table('notifications')
            ->whereNull('target_role')
            ->where('type', 'fee_reminder')
            ->update(['target_role' => 'admin']);

        DB::table('notifications')
            ->whereNull('target_role')
            ->where('type', 'quote_action')
            ->update(['target_role' => 'cskh']);

        DB::table('notifications')
            ->whereNull('target_role')
            ->select(['id', 'title', 'message'])
            ->orderBy('id')
            ->chunkById(500, function ($rows) {
                $priceNotificationIds = [];

                foreach ($rows as $row) {
                    $combinedText = trim(((string) ($row->title ?? '')) . ' ' . ((string) ($row->message ?? '')));
                    if ($combinedText !== '' && $this->containsCurrencyIndicator($combinedText)) {
                        $priceNotificationIds[] = (int) $row->id;
                    }
                }

                if (! empty($priceNotificationIds)) {
                    DB::table('notifications')
                        ->whereIn('id', $priceNotificationIds)
                        ->update(['target_role' => 'cskh']);
                }
            });

        // Bước D: Di chuyển trạng thái đã đọc cá nhân (is_read = 1 AND user_id IS NOT NULL) sang notification_reads
        if (Schema::hasTable('notification_reads')) {
            $checkUsersTable = Schema::hasTable('users');

            DB::table('notifications')
                ->where('is_read', true)
                ->whereNotNull('user_id')
                ->select(['id', 'user_id', 'read_at', 'updated_at', 'created_at'])
                ->orderBy('id')
                ->chunkById(500, function ($rows) use ($checkUsersTable) {
                    $validUserMap = null;
                    if ($checkUsersTable) {
                        $chunkUserIds = $rows->pluck('user_id')->filter()->unique()->values()->all();
                        $existingUserIds = ! empty($chunkUserIds)
                            ? DB::table('users')->whereIn('id', $chunkUserIds)->pluck('id')->all()
                            : [];
                        $validUserMap = array_flip(array_map('intval', $existingUserIds));
                    }

                    $now = now();
                    $insertPayload = [];

                    foreach ($rows as $row) {
                        $uid = (int) $row->user_id;
                        if ($validUserMap !== null && ! isset($validUserMap[$uid])) {
                            continue;
                        }

                        $insertPayload[] = [
                            'notification_id' => (int) $row->id,
                            'user_id' => $uid,
                            'read_at' => $row->read_at ?? $row->updated_at ?? $row->created_at ?? $now,
                        ];
                    }

                    if (! empty($insertPayload)) {
                        DB::table('notification_reads')->insertOrIgnore($insertPayload);
                    }
                });
        }
    }

    /**
     * Nhận diện an toàn chuỗi chứa ký hiệu hoặc định dạng tiền tệ VNĐ (tránh nhầm chữ 'đ' trong từ tiếng Việt thường).
     */
    protected function containsCurrencyIndicator(string $text): bool
    {
        if (str_contains($text, '₫') || str_contains($text, ' đ)')) {
            return true;
        }

        if (mb_stripos($text, 'VNĐ') !== false) {
            return true;
        }

        return preg_match('/(?:\+\s*|\b)\d{1,3}(?:[.,]\d{3})+\s*(?:đ|vnd)(?![\p{L}\p{N}_])/iu', $text) === 1;
    }
};
