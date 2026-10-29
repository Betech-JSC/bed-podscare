<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Notification;
use App\Models\Scopes\TenantScope;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class SuperAdminStoreAuditLogTest extends TestCase
{
    use DatabaseTransactions;

    protected User $superAdmin;
    protected User $secondSuperAdmin;
    protected User $inactiveSuperAdmin;
    protected Tenant $tenantA;
    protected User $adminA;
    protected Tenant $tenantB;
    protected User $adminB;

    protected function setUp(): void
    {
        parent::setUp();

        $suffix = uniqid();

        $this->superAdmin = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'Super Admin Primary ' . $suffix,
            'email'     => "sa_primary_{$suffix}@podscare.vn",
            'phone'     => '0901' . random_int(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'super_admin',
            'is_active' => true,
        ]);

        $this->secondSuperAdmin = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'Super Admin Secondary ' . $suffix,
            'email'     => "sa_secondary_{$suffix}@podscare.vn",
            'phone'     => '0902' . random_int(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'super_admin',
            'is_active' => true,
        ]);

        $this->inactiveSuperAdmin = User::forceCreate([
            'tenant_id' => null,
            'name'      => 'Super Admin Inactive ' . $suffix,
            'email'     => "sa_inactive_{$suffix}@podscare.vn",
            'phone'     => '0903' . random_int(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'super_admin',
            'is_active' => false,
        ]);

        $this->tenantA = Tenant::create([
            'code'       => 'pods-alpha-' . $suffix,
            'name'       => 'Pods Alpha Care',
            'phone'      => '0911' . random_int(100000, 999999),
            'email'      => "alpha_{$suffix}@podscare.vn",
            'status'     => 'active',
            'plan'       => 'pro',
            'expires_at' => now()->addYear(),
        ]);

        $this->adminA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Nguyễn Chủ Tiệm Alpha',
            'email'     => "owner_alpha_{$suffix}@podscare.vn",
            'phone'     => $this->tenantA->phone,
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->tenantB = Tenant::create([
            'code'       => 'pods-beta-' . $suffix,
            'name'       => 'Pods Beta Studio',
            'phone'      => '0912' . random_int(100000, 999999),
            'email'      => "beta_{$suffix}@podscare.vn",
            'status'     => 'active',
            'plan'       => 'standard',
            'expires_at' => now()->addYear(),
        ]);

        $this->adminB = User::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Trần Chủ Tiệm Beta',
            'email'     => "owner_beta_{$suffix}@podscare.vn",
            'phone'     => $this->tenantB->phone,
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    public function test_audit_log_service_extracts_real_ip_and_parses_device_summary(): void
    {
        $service = app(AuditLogService::class);

        $iphoneSafariUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
        $macChromeUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
        $windowsEdgeUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';
        $androidChromeUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36';

        // 1. Kiểm tra parseDeviceSummary với 4 nhóm thiết bị/trình duyệt phổ biến
        $this->assertSame('iPhone (iOS) • Safari', $service->parseDeviceSummary($iphoneSafariUa));
        $this->assertSame('macOS • Chrome', $service->parseDeviceSummary($macChromeUa));
        $this->assertSame('Windows • Edge', $service->parseDeviceSummary($windowsEdgeUa));
        $this->assertSame('Android • Chrome', $service->parseDeviceSummary($androidChromeUa));

        // 2. CF-Connecting-IP được ưu tiên cao nhất hơn X-Forwarded-For và lưu vào log() mà không ghi đè metadata tùy chỉnh
        $cfRequest = Request::create('/api/v1/test', 'POST', [], [], [], [
            'REMOTE_ADDR'            => '127.0.0.1',
            'HTTP_CF_CONNECTING_IP'  => '113.161.72.15',
            'HTTP_X_FORWARDED_FOR'   => '14.231.100.55, 10.0.0.1',
            'HTTP_USER_AGENT'        => $iphoneSafariUa,
        ]);
        $this->app->instance('request', $cfRequest);

        $log1 = $service->log(
            $this->tenantA->id,
            $this->adminA,
            'custom_test_action',
            $this->tenantA,
            'Thử nghiệm ghi log qua Cloudflare',
            ['custom_flag' => 'keep_me']
        );

        $this->assertSame('113.161.72.15', $log1->ip_address);
        $this->assertSame('iPhone (iOS) • Safari', $log1->metadata['device_summary']);
        $this->assertSame($iphoneSafariUa, $log1->metadata['user_agent']);
        $this->assertSame('keep_me', $log1->metadata['custom_flag']);

        // 3. Fallback sang IP hợp lệ đầu tiên trong X-Forwarded-For và lưu qua logFieldDiff()
        $xffRequest = Request::create('/api/v1/test-diff', 'PUT', [], [], [], [
            'REMOTE_ADDR'          => '10.0.0.2',
            'HTTP_X_FORWARDED_FOR' => '14.231.100.55, 10.0.0.1',
            'HTTP_USER_AGENT'      => $macChromeUa,
        ]);
        $this->app->instance('request', $xffRequest);

        $log2 = $service->logFieldDiff(
            $this->tenantA->id,
            $this->adminA,
            'custom_diff_action',
            $this->tenantA,
            ['plan' => 'standard'],
            ['plan' => 'pro'],
            null,
            ['source_screen' => 'settings']
        );

        $this->assertSame('14.231.100.55', $log2->ip_address);
        $this->assertSame('macOS • Chrome', $log2->metadata['device_summary']);
        $this->assertSame($macChromeUa, $log2->metadata['user_agent']);
        $this->assertSame('settings', $log2->metadata['source_screen']);
    }

    public function test_tenant_registration_creates_audit_log_and_super_admin_notifications(): void
    {
        Http::fake();
        Mail::fake();

        $uniqueSuffix = strtolower(substr(uniqid(), -6));
        $storeCode = "airpods-care-{$uniqueSuffix}";
        $phone = '098' . random_int(1000000, 9999999);
        $email = "reg_{$uniqueSuffix}@podscare.vn";
        $iphoneUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

        $response = $this->withHeaders([
            'CF-Connecting-IP' => '27.72.100.88',
            'User-Agent'       => $iphoneUa,
        ])->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode,
            'store_name' => 'AirPods Pro Care Center',
            'owner_name' => 'Nguyễn Văn Đăng Ký',
            'phone'      => $phone,
            'email'      => $email,
            'password'   => 'secret123',
            'plan'       => 'pro',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCode);

        $newTenantId = (int) $response->json('data.tenant.id');
        $newOwnerId = (int) $response->json('data.owner.id');

        // 1. Kiểm tra bản ghi AuditLog tenant_registered
        $regLog = AuditLog::query()
            ->where('tenant_id', $newTenantId)
            ->where('action', 'tenant_registered')
            ->first();

        $this->assertNotNull($regLog, 'Phải tạo bản ghi AuditLog cho sự kiện tenant_registered.');
        $this->assertSame($newOwnerId, (int) $regLog->user_id);
        $this->assertSame('27.72.100.88', $regLog->ip_address);
        $this->assertSame('iPhone (iOS) • Safari', $regLog->metadata['device_summary'] ?? null);
        $this->assertSame($storeCode, $regLog->new_values['store_code'] ?? null);
        $this->assertSame('Nguyễn Văn Đăng Ký', $regLog->new_values['owner_name'] ?? null);

        // 2. Kiểm tra Notification gửi cho tất cả super_admin đang active (và không gửi cho super_admin bị khóa)
        $notif1 = Notification::query()
            ->where('user_id', $this->superAdmin->id)
            ->where('type', 'tenant_registered')
            ->latest('id')
            ->first();

        $notif2 = Notification::query()
            ->where('user_id', $this->secondSuperAdmin->id)
            ->where('type', 'tenant_registered')
            ->latest('id')
            ->first();

        $inactiveNotif = Notification::query()
            ->where('user_id', $this->inactiveSuperAdmin->id)
            ->where('type', 'tenant_registered')
            ->where('message', 'like', "%{$storeCode}%")
            ->first();

        $this->assertNotNull($notif1);
        $this->assertNotNull($notif2);
        $this->assertNull($inactiveNotif);
        $this->assertSame('/platform/stores', $notif1->action_url);
        $this->assertSame('/platform/stores', $notif1->toArray()['action_url']);
        $this->assertStringContainsString($storeCode, $notif1->message);
        $this->assertStringContainsString('Nguyễn Văn Đăng Ký', $notif1->message);
    }

    public function test_login_and_logout_create_audit_logs_with_tenant_ip_and_device_summary(): void
    {
        $windowsEdgeUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';

        // 1. Đăng nhập
        $loginResponse = $this->withHeaders([
            'X-Forwarded-For' => '42.112.55.77, 10.0.0.5',
            'User-Agent'      => $windowsEdgeUa,
        ])->postJson('/api/v1/auth/login', [
            'store_code' => $this->tenantA->code,
            'login'      => $this->adminA->email,
            'password'   => 'password123',
        ]);

        $loginResponse->assertStatus(200)
            ->assertJsonPath('success', true);

        $token = $loginResponse->json('data.token');
        $this->assertNotEmpty($token);

        $loginLog = AuditLog::query()
            ->where('tenant_id', $this->tenantA->id)
            ->where('user_id', $this->adminA->id)
            ->where('action', 'user_login')
            ->latest('id')
            ->first();

        $this->assertNotNull($loginLog, 'Phải ghi AuditLog user_login khi đăng nhập thành công.');
        $this->assertSame('42.112.55.77', $loginLog->ip_address);
        $this->assertSame('Windows • Edge', $loginLog->metadata['device_summary'] ?? null);
        $this->assertSame('admin', $loginLog->metadata['role'] ?? null);

        // 2. Đăng xuất bằng chính Sanctum Bearer token vừa nhận
        $logoutResponse = $this->withHeaders([
            'Authorization'    => "Bearer {$token}",
            'CF-Connecting-IP' => '42.112.55.78',
            'User-Agent'       => $windowsEdgeUa,
        ])->postJson('/api/v1/auth/logout');

        $logoutResponse->assertStatus(200)
            ->assertJsonPath('success', true);

        $logoutLog = AuditLog::query()
            ->where('tenant_id', $this->tenantA->id)
            ->where('user_id', $this->adminA->id)
            ->where('action', 'user_logout')
            ->latest('id')
            ->first();

        $this->assertNotNull($logoutLog, 'Phải ghi AuditLog user_logout khi đăng xuất.');
        $this->assertSame('42.112.55.78', $logoutLog->ip_address);
        $this->assertSame('Windows • Edge', $logoutLog->metadata['device_summary'] ?? null);
    }

    public function test_platform_stores_returns_activity_metadata_filters_new_7d_and_logs_lifecycle_actions(): void
    {
        // Đưa tenantB về thời điểm đăng ký cách đây 15 ngày để kiểm tra bộ lọc new_7d
        DB::table('tenants')
            ->where('id', $this->tenantB->id)
            ->update(['created_at' => now()->subDays(15)]);

        // Tạo 2 bản ghi log cho tenantA để xác nhận lấy đúng bản ghi mới nhất
        AuditLog::create([
            'tenant_id'      => $this->tenantA->id,
            'user_id'        => $this->adminA->id,
            'user_name'      => $this->adminA->name,
            'action'         => 'tenant_registered',
            'auditable_type' => Tenant::class,
            'auditable_id'   => $this->tenantA->id,
            'details'        => 'Đăng ký gian hàng ban đầu',
            'metadata'       => ['device_summary' => 'iPhone (iOS) • Safari'],
            'ip_address'     => '113.160.1.1',
            'channel'        => 'portal',
        ]);

        $latestLog = AuditLog::create([
            'tenant_id'      => $this->tenantA->id,
            'user_id'        => $this->adminA->id,
            'user_name'      => $this->adminA->name,
            'action'         => 'user_login',
            'auditable_type' => User::class,
            'auditable_id'   => $this->adminA->id,
            'details'        => 'Chủ tiệm đăng nhập',
            'metadata'       => ['device_summary' => 'Android • Chrome'],
            'ip_address'     => '14.162.88.99',
            'channel'        => 'portal',
        ]);

        // 1. Gọi GET /api/v1/platform/stores?status=new_7d&per_page=all
        $new7dResponse = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/platform/stores?status=new_7d&per_page=all');

        $new7dResponse->assertStatus(200)
            ->assertJsonPath('success', true);

        $returnedStores = collect($new7dResponse->json('data.data'));
        $tenantAItem = $returnedStores->firstWhere('id', $this->tenantA->id);
        $tenantBItem = $returnedStores->firstWhere('id', $this->tenantB->id);

        $this->assertNotNull($tenantAItem, 'Gian hàng đăng ký trong 7 ngày phải xuất hiện trong bộ lọc new_7d.');
        $this->assertNull($tenantBItem, 'Gian hàng tạo cách đây > 7 ngày phải bị loại khỏi bộ lọc new_7d.');

        $this->assertSame('Nguyễn Chủ Tiệm Alpha', $tenantAItem['owner_name']);
        $this->assertNotEmpty($tenantAItem['last_activity_at']);
        $this->assertSame($latestLog->action, $tenantAItem['last_activity_action']);
        $this->assertSame('14.162.88.99', $tenantAItem['last_ip']);
        $this->assertSame('Android • Chrome', $tenantAItem['last_device']);

        // 2. Kiểm tra approveStore, suspendStore, activateStore ghi AuditLog kèm old_values/new_values
        $pendingTenant = Tenant::create([
            'code'   => 'pending-store-' . uniqid(),
            'name'   => 'Tiệm Chờ Phê Duyệt',
            'status' => 'pending',
            'plan'   => 'trial',
        ]);

        User::forceCreate([
            'tenant_id' => $pendingTenant->id,
            'name'      => 'Chủ Tiệm Pending',
            'email'     => 'pending_' . uniqid() . '@podscare.vn',
            'phone'     => '0933' . random_int(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => false,
        ]);

        $this->actingAs($this->superAdmin)
            ->withHeaders(['CF-Connecting-IP' => '118.69.55.10'])
            ->postJson("/api/v1/platform/stores/{$pendingTenant->id}/approve")
            ->assertStatus(200);

        $approveLog = AuditLog::query()
            ->where('tenant_id', $pendingTenant->id)
            ->where('action', 'store_approved')
            ->latest('id')
            ->first();

        $this->assertNotNull($approveLog);
        $this->assertSame(['status' => 'pending'], $approveLog->old_values);
        $this->assertSame(['status' => 'active'], $approveLog->new_values);
        $this->assertSame('118.69.55.10', $approveLog->ip_address);

        $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/platform/stores/{$pendingTenant->id}/suspend")
            ->assertStatus(200);

        $suspendLog = AuditLog::query()
            ->where('tenant_id', $pendingTenant->id)
            ->where('action', 'store_suspended')
            ->latest('id')
            ->first();

        $this->assertNotNull($suspendLog);
        $this->assertSame(['status' => 'active'], $suspendLog->old_values);
        $this->assertSame(['status' => 'suspended'], $suspendLog->new_values);

        $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/platform/stores/{$pendingTenant->id}/activate")
            ->assertStatus(200);

        $activateLog = AuditLog::query()
            ->where('tenant_id', $pendingTenant->id)
            ->where('action', 'store_activated')
            ->latest('id')
            ->first();

        $this->assertNotNull($activateLog);
        $this->assertSame(['status' => 'suspended'], $activateLog->old_values);
        $this->assertSame(['status' => 'active'], $activateLog->new_values);
    }

    public function test_audit_logs_endpoint_supports_tenant_and_action_group_filtering_and_prevents_cross_tenant_leak(): void
    {
        // Đảm bảo tồn tại master tenant độc lập để tenantA và tenantB đều là non-master tenant chuẩn
        if (! Tenant::where('code', 'fixo-master')->exists()) {
            Tenant::create([
                'code'   => 'fixo-master',
                'name'   => 'Fixo Master Store',
                'status' => 'active',
                'plan'   => 'pro',
            ]);
        }
        TenantScope::clearCache();

        // Tạo dữ liệu nhật ký đa nhóm cho Tenant A
        AuditLog::create([
            'tenant_id'      => $this->tenantA->id,
            'user_id'        => $this->adminA->id,
            'user_name'      => $this->adminA->name,
            'action'         => 'tenant_registered',
            'auditable_type' => Tenant::class,
            'auditable_id'   => $this->tenantA->id,
            'details'        => 'Đăng ký gian hàng Alpha',
            'metadata'       => ['device_summary' => 'iPhone (iOS) • Safari'],
            'ip_address'     => '113.161.10.1',
            'channel'        => 'portal',
        ]);

        AuditLog::create([
            'tenant_id'      => $this->tenantA->id,
            'user_id'        => $this->adminA->id,
            'user_name'      => $this->adminA->name,
            'action'         => 'user_login',
            'auditable_type' => User::class,
            'auditable_id'   => $this->adminA->id,
            'details'        => 'Đăng nhập gian hàng Alpha',
            'metadata'       => ['device_summary' => 'macOS • Chrome'],
            'ip_address'     => '113.161.10.2',
            'channel'        => 'portal',
        ]);

        AuditLog::create([
            'tenant_id'      => $this->tenantA->id,
            'user_id'        => $this->adminA->id,
            'user_name'      => $this->adminA->name,
            'action'         => 'repair_order_created',
            'auditable_type' => 'App\\Models\\RepairOrder',
            'auditable_id'   => 9991,
            'details'        => 'Tạo đơn sửa chữa RO-ALPHA-01',
            'metadata'       => ['device_summary' => 'macOS • Chrome'],
            'ip_address'     => '113.161.10.2',
            'channel'        => 'portal',
        ]);

        AuditLog::create([
            'tenant_id'      => $this->tenantA->id,
            'user_id'        => $this->adminA->id,
            'user_name'      => $this->adminA->name,
            'action'         => 'payment_confirmed',
            'auditable_type' => 'App\\Models\\Payment',
            'auditable_id'   => 8881,
            'details'        => 'Xác nhận thanh toán đơn RO-ALPHA-01',
            'metadata'       => ['device_summary' => 'macOS • Chrome'],
            'ip_address'     => '113.161.10.2',
            'channel'        => 'portal',
        ]);

        // Tạo dữ liệu nhật ký cho Tenant B
        AuditLog::create([
            'tenant_id'      => $this->tenantB->id,
            'user_id'        => $this->adminB->id,
            'user_name'      => $this->adminB->name,
            'action'         => 'user_login',
            'auditable_type' => User::class,
            'auditable_id'   => $this->adminB->id,
            'details'        => 'Đăng nhập gian hàng Beta',
            'metadata'       => ['device_summary' => 'Windows • Edge'],
            'ip_address'     => '14.241.20.9',
            'channel'        => 'portal',
        ]);

        // 1. Super Admin lọc theo ?tenant_id={tenantA->id}
        $saTenantResponse = $this->actingAs($this->superAdmin)
            ->getJson("/api/v1/audit-logs?tenant_id={$this->tenantA->id}&per_page=50");

        $saTenantResponse->assertStatus(200)
            ->assertJsonPath('success', true);

        $saTenantLogs = collect($saTenantResponse->json('data.data'));
        $this->assertCount(4, $saTenantLogs);
        $this->assertTrue($saTenantLogs->every(fn (array $item) => (int) $item['tenant_id'] === $this->tenantA->id));

        // Kiểm tra eager-loaded tenant:id,code,name
        $firstLogTenant = $saTenantLogs->first()['tenant'] ?? null;
        $this->assertNotNull($firstLogTenant);
        $this->assertSame($this->tenantA->id, (int) $firstLogTenant['id']);
        $this->assertSame($this->tenantA->code, $firstLogTenant['code']);
        $this->assertSame($this->tenantA->name, $firstLogTenant['name']);

        // 2. Super Admin lọc kết hợp ?tenant_id={tenantA->id}&action_group=auth
        $saAuthGroupResponse = $this->actingAs($this->superAdmin)
            ->getJson("/api/v1/audit-logs?tenant_id={$this->tenantA->id}&action_group=auth");

        $saAuthGroupResponse->assertStatus(200);
        $authActions = collect($saAuthGroupResponse->json('data.data'))->pluck('action')->all();
        $this->assertEqualsCanonicalizing(['tenant_registered', 'user_login'], $authActions);

        // 3. Chủ tiệm Admin của Tenant A cố tình truyền ?tenant_id={tenantB->id} vẫn bị khóa cứng trong Tenant A
        $crossTenantAttempt = $this->actingAs($this->adminA)
            ->getJson("/api/v1/audit-logs?tenant_id={$this->tenantB->id}&per_page=50");

        $crossTenantAttempt->assertStatus(200)
            ->assertJsonPath('success', true);

        $adminAReturnedLogs = collect($crossTenantAttempt->json('data.data'));
        $this->assertNotEmpty($adminAReturnedLogs);
        $this->assertTrue(
            $adminAReturnedLogs->every(fn (array $item) => (int) $item['tenant_id'] === $this->tenantA->id),
            'Admin của Tenant A tuyệt đối không được phép xem bất kỳ bản ghi AuditLog nào của Tenant B.'
        );
    }
}
