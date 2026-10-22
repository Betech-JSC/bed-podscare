<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TenantBrandingApiTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected User $adminA;
    protected User $techA;
    protected User $adminB;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');

        // Tạo Tenant A và người dùng
        $this->tenantA = Tenant::create([
            'code'                => 'tiem-a-' . uniqid(),
            'name'                => 'Cửa Hàng Sửa Chữa A',
            'phone'               => '0901111222',
            'status'              => 'active',
            'plan'                => 'pro',
            'hotline'             => '1900 1111',
            'receipt_footer_note' => 'Cảm ơn quý khách đã ghé Tiệm A',
        ]);

        $this->adminA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Admin Tiệm A',
            'email'     => 'admin_a_' . uniqid() . '@tiem.vn',
            'phone'     => '0911' . rand(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->techA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'KTV Tiệm A',
            'email'     => 'tech_a_' . uniqid() . '@tiem.vn',
            'phone'     => '0912' . rand(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'tech',
            'is_active' => true,
        ]);

        // Tạo Tenant B và người dùng
        $this->tenantB = Tenant::create([
            'code'                => 'tiem-b-' . uniqid(),
            'name'                => 'Cửa Hàng Sửa Chữa B',
            'phone'               => '0903333444',
            'status'              => 'active',
            'plan'                => 'pro',
            'hotline'             => '1900 2222',
            'receipt_footer_note' => 'Tiệm B cam kết linh kiện chính hãng',
        ]);

        $this->adminB = User::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Admin Tiệm B',
            'email'     => 'admin_b_' . uniqid() . '@tiem.vn',
            'phone'     => '0913' . rand(100000, 999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    public function test_get_settings_returns_current_tenant_branding(): void
    {
        $response = $this->actingAs($this->adminA)
            ->getJson('/api/v1/tenant/settings');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant_id', $this->tenantA->id)
            ->assertJsonPath('data.name', 'Cửa Hàng Sửa Chữa A')
            ->assertJsonPath('data.code', $this->tenantA->code)
            ->assertJsonPath('data.hotline', '1900 1111')
            ->assertJsonPath('data.receipt_footer_note', 'Cảm ơn quý khách đã ghé Tiệm A');
    }

    public function test_update_settings_successfully_updates_branding_fields(): void
    {
        $response = $this->actingAs($this->adminA)
            ->postJson('/api/v1/tenant/settings', [
                'name'                => 'Tiệm A Apple Authorized',
                'hotline'             => '0988 888 999',
                'receipt_footer_note' => 'Bảo hành 1 đổi 1 trong 30 ngày',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.name', 'Tiệm A Apple Authorized')
            ->assertJsonPath('data.hotline', '0988 888 999')
            ->assertJsonPath('data.receipt_footer_note', 'Bảo hành 1 đổi 1 trong 30 ngày');

        $this->tenantA->refresh();
        $this->assertEquals('Tiệm A Apple Authorized', $this->tenantA->name);
        $this->assertEquals('0988 888 999', $this->tenantA->hotline);
        $this->assertEquals('Bảo hành 1 đổi 1 trong 30 ngày', $this->tenantA->receipt_footer_note);
    }

    public function test_upload_logo_stores_file_and_updates_tenant_logo_url(): void
    {
        $file = UploadedFile::fake()->image('store_logo.png', 400, 200);

        $response = $this->actingAs($this->adminA)
            ->postJson('/api/v1/tenant/logo', [
                'logo' => $file,
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $logoUrl = $response->json('data.logo_url');
        $this->assertNotEmpty($logoUrl);
        $this->assertStringContainsString("/storage/tenants/{$this->tenantA->id}/branding/", $logoUrl);

        $this->tenantA->refresh();
        $this->assertEquals($logoUrl, $this->tenantA->logo_url);

        // Kiểm tra file tồn tại trên public disk
        $relativePos = strpos($logoUrl, '/storage/');
        $relative = substr($logoUrl, $relativePos + strlen('/storage/'));
        Storage::disk('public')->assertExists($relative);
    }

    public function test_upload_logo_rejects_file_over_5mb_or_invalid_format(): void
    {
        // 1. File dung lượng lớn > 5MB (6000 KB > 5120 KB)
        $largeFile = UploadedFile::fake()->create('heavy_image.png', 6000, 'image/png');

        $response = $this->actingAs($this->adminA)
            ->postJson('/api/v1/tenant/logo', [
                'logo' => $largeFile,
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['logo']);

        // 2. File không phải ảnh (PDF)
        $pdfFile = UploadedFile::fake()->create('document.pdf', 500, 'application/pdf');

        $responseInvalid = $this->actingAs($this->adminA)
            ->postJson('/api/v1/tenant/logo', [
                'logo' => $pdfFile,
            ]);

        $responseInvalid->assertStatus(422)
            ->assertJsonValidationErrors(['logo']);
    }

    public function test_upload_logo_supports_base64_data_url_and_custom_mimes(): void
    {
        // 1. Upload ảnh PNG qua Base64 Data URL
        $base64Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        $response = $this->actingAs($this->adminA)
            ->postJson('/api/v1/tenant/logo', [
                'logo_base64' => $base64Png,
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $logoUrl = $response->json('data.logo_url');
        $this->assertNotEmpty($logoUrl);
        $this->assertStringContainsString("/storage/tenants/{$this->tenantA->id}/branding/", $logoUrl);

        $this->tenantA->refresh();
        $this->assertEquals($logoUrl, $this->tenantA->logo_url);

        $relativePos = strpos($logoUrl, '/storage/');
        $relative = substr($logoUrl, $relativePos + strlen('/storage/'));
        Storage::disk('public')->assertExists($relative);

        // 2. Upload ảnh SVG qua field logo dạng Data URL
        $base64Svg = 'data:image/svg+xml;base64,' . base64_encode('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="green"/></svg>');

        $responseSvg = $this->actingAs($this->adminA)
            ->postJson('/api/v1/tenant/logo', [
                'logo' => $base64Svg,
            ]);

        $responseSvg->assertStatus(200)
            ->assertJsonPath('success', true);

        // 3. Từ chối SVG chứa mã script độc hại
        $maliciousSvg = 'data:image/svg+xml;base64,' . base64_encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        $responseMalicious = $this->actingAs($this->adminA)
            ->postJson('/api/v1/tenant/logo', [
                'logo' => $maliciousSvg,
            ]);

        $responseMalicious->assertStatus(422)
            ->assertJsonValidationErrors(['logo']);
    }

    public function test_delete_logo_removes_file_and_sets_logo_url_to_null(): void
    {
        // Upload logo trước
        $file = UploadedFile::fake()->image('test_logo.png', 200, 200);
        $uploadRes = $this->actingAs($this->adminA)
            ->postJson('/api/v1/tenant/logo', ['logo' => $file]);

        $logoUrl = $uploadRes->json('data.logo_url');
        $relativePos = strpos($logoUrl, '/storage/');
        $relative = substr($logoUrl, $relativePos + strlen('/storage/'));
        Storage::disk('public')->assertExists($relative);

        // Gọi delete logo
        $deleteRes = $this->actingAs($this->adminA)
            ->deleteJson('/api/v1/tenant/logo');

        $deleteRes->assertStatus(200)
            ->assertJsonPath('data.logo_url', null);

        $this->tenantA->refresh();
        $this->assertNull($this->tenantA->logo_url);
        Storage::disk('public')->assertMissing($relative);
    }

    public function test_multi_tenant_isolation_strictly_prevents_cross_tenant_access(): void
    {
        // Admin A cấu hình logo và hotline của A
        $fileA = UploadedFile::fake()->image('logo_a.png', 300, 150);
        $this->actingAs($this->adminA)
            ->postJson('/api/v1/tenant/logo', ['logo' => $fileA]);
        $this->actingAs($this->adminA)
            ->postJson('/api/v1/tenant/settings', ['hotline' => '0901-TIEM-A']);

        // Admin B cấu hình logo và hotline của B
        $fileB = UploadedFile::fake()->image('logo_b.png', 300, 150);
        $this->actingAs($this->adminB)
            ->postJson('/api/v1/tenant/logo', ['logo' => $fileB]);
        $this->actingAs($this->adminB)
            ->postJson('/api/v1/tenant/settings', ['hotline' => '0902-TIEM-B']);

        $this->tenantA->refresh();
        $this->tenantB->refresh();

        // 1. Admin A chỉ thấy dữ liệu của Tenant A
        $resA = $this->actingAs($this->adminA)->getJson('/api/v1/tenant/settings');
        $resA->assertStatus(200)
            ->assertJsonPath('data.tenant_id', $this->tenantA->id)
            ->assertJsonPath('data.hotline', '0901-TIEM-A')
            ->assertJsonPath('data.logo_url', $this->tenantA->logo_url);

        // 2. Admin B chỉ thấy dữ liệu của Tenant B
        $resB = $this->actingAs($this->adminB)->getJson('/api/v1/tenant/settings');
        $resB->assertStatus(200)
            ->assertJsonPath('data.tenant_id', $this->tenantB->id)
            ->assertJsonPath('data.hotline', '0902-TIEM-B')
            ->assertJsonPath('data.logo_url', $this->tenantB->logo_url);

        // 3. Hai logo hoàn toàn độc lập khác biệt
        $this->assertNotEquals($this->tenantA->logo_url, $this->tenantB->logo_url);
    }

    public function test_non_admin_roles_are_forbidden_from_updating_branding(): void
    {
        // 1. KTV có thể đọc thông tin cài đặt
        $getRes = $this->actingAs($this->techA)->getJson('/api/v1/tenant/settings');
        $getRes->assertStatus(200);

        // 2. KTV không thể cập nhật settings -> 403 Forbidden
        $postRes = $this->actingAs($this->techA)
            ->postJson('/api/v1/tenant/settings', ['hotline' => '0999999999']);
        $postRes->assertStatus(403);

        // 3. KTV không thể upload logo -> 403 Forbidden
        $uploadRes = $this->actingAs($this->techA)
            ->postJson('/api/v1/tenant/logo', [
                'logo' => UploadedFile::fake()->image('tech_logo.png'),
            ]);
        $uploadRes->assertStatus(403);

        // 4. KTV không thể delete logo -> 403 Forbidden
        $deleteRes = $this->actingAs($this->techA)
            ->deleteJson('/api/v1/tenant/logo');
        $deleteRes->assertStatus(403);
    }

    public function test_auth_me_and_login_payload_includes_tenant_branding_fields(): void
    {
        $this->tenantA->update([
            'logo_url'            => 'https://example.com/logo-tiem-a.png',
            'hotline'             => '0909 999 888',
            'receipt_footer_note' => 'Phiếu này có giá trị trong 60 ngày',
        ]);

        $meRes = $this->actingAs($this->adminA)->getJson('/api/v1/auth/me');

        $meRes->assertStatus(200)
            ->assertJsonPath('data.tenant.logo_url', 'https://example.com/logo-tiem-a.png')
            ->assertJsonPath('data.tenant.hotline', '0909 999 888')
            ->assertJsonPath('data.tenant.receipt_footer_note', 'Phiếu này có giá trị trong 60 ngày');
    }

    public function test_relative_and_mismatched_port_logo_urls_are_normalized_to_valid_absolute_urls(): void
    {
        // 1. Lưu đường dẫn tương đối kiểu 'tenants/1/logo/test.png' trực tiếp vào DB
        \Illuminate\Support\Facades\DB::table('tenants')
            ->where('id', $this->tenantA->id)
            ->update(['logo_url' => "tenants/{$this->tenantA->id}/logo/custom_logo.png"]);

        $resRelative = $this->actingAs($this->adminA)
            ->getJson('http://localhost:8000/api/v1/tenant/settings');

        $resRelative->assertStatus(200)
            ->assertJsonPath('data.logo_url', "http://localhost:8000/storage/tenants/{$this->tenantA->id}/logo/custom_logo.png");

        // 2. Đường dẫn có lặp 'storage/storage/...' không bị nhân đôi
        \Illuminate\Support\Facades\DB::table('tenants')
            ->where('id', $this->tenantA->id)
            ->update(['logo_url' => "/storage/storage/tenants/{$this->tenantA->id}/branding/logo_dup.png"]);
        $this->adminA->unsetRelation('tenant');

        $resDup = $this->actingAs($this->adminA)
            ->getJson('http://localhost:8000/api/v1/tenant/settings');

        $resDup->assertStatus(200)
            ->assertJsonPath('data.logo_url', "http://localhost:8000/storage/tenants/{$this->tenantA->id}/branding/logo_dup.png");

        // 3. Đường dẫn 'http://localhost/storage/...' bị thiếu cổng :8000 được tự động chuẩn hóa theo host:port của request
        \Illuminate\Support\Facades\DB::table('tenants')
            ->where('id', $this->tenantA->id)
            ->update(['logo_url' => "http://localhost/storage/tenants/{$this->tenantA->id}/branding/logo_port.png"]);

        $resPort = $this->actingAs($this->adminA)
            ->getJson('http://localhost:8000/api/v1/auth/me');

        $resPort->assertStatus(200)
            ->assertJsonPath('data.tenant.logo_url', "http://localhost:8000/storage/tenants/{$this->tenantA->id}/branding/logo_port.png");
    }

    public function test_orders_index_store_show_and_update_always_include_tenant_with_absolute_logo_url(): void
    {
        \Illuminate\Support\Facades\DB::table('tenants')
            ->where('id', $this->tenantA->id)
            ->update([
                'logo_url'            => "tenants/{$this->tenantA->id}/branding/receipt_logo.png",
                'hotline'             => '1900 6868',
                'receipt_footer_note' => 'Bảo hành điện tử toàn quốc',
            ]);

        $branch = \App\Models\Branch::create([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Trung tâm A',
            'code'      => 'BR_A_' . uniqid(),
            'phone'     => '0901111222',
            'address'   => '100 Nguyễn Huệ, Q1',
            'is_active' => true,
        ]);

        $device = \App\Models\DeviceModel::create([
            'tenant_id'  => $this->tenantA->id,
            'name'       => 'AirPods Pro 2 USB-C',
            'model_code' => 'APP2_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $expectedLogoUrl = "http://localhost:8000/storage/tenants/{$this->tenantA->id}/branding/receipt_logo.png";

        // 1. POST /api/v1/orders (store)
        $storeRes = $this->actingAs($this->adminA)
            ->postJson('http://localhost:8000/api/v1/orders', [
                'branch_id'         => $branch->id,
                'customer_name'     => 'Khách In Hóa Đơn',
                'customer_phone'    => '0987654321',
                'device_model_id'   => $device->id,
                'issue_description' => 'Thay pin tai trái',
                'estimated_price'   => 350000,
            ]);

        $storeRes->assertStatus(201)
            ->assertJsonPath('data.tenant.id', $this->tenantA->id)
            ->assertJsonPath('data.tenant.name', 'Cửa Hàng Sửa Chữa A')
            ->assertJsonPath('data.tenant.logo_url', $expectedLogoUrl)
            ->assertJsonPath('data.tenant.hotline', '1900 6868')
            ->assertJsonPath('data.tenant.receipt_footer_note', 'Bảo hành điện tử toàn quốc');

        $orderId = $storeRes->json('data.id');

        // 2. GET /api/v1/orders (index)
        $indexRes = $this->actingAs($this->adminA)
            ->getJson('http://localhost:8000/api/v1/orders?date_filter=all');

        $indexRes->assertStatus(200)
            ->assertJsonPath('data.data.0.id', $orderId)
            ->assertJsonPath('data.data.0.tenant.id', $this->tenantA->id)
            ->assertJsonPath('data.data.0.tenant.logo_url', $expectedLogoUrl)
            ->assertJsonPath('data.data.0.tenant.hotline', '1900 6868')
            ->assertJsonPath('data.data.0.tenant.receipt_footer_note', 'Bảo hành điện tử toàn quốc');

        // 3. GET /api/v1/orders/{id} (show)
        $showRes = $this->actingAs($this->adminA)
            ->getJson("http://localhost:8000/api/v1/orders/{$orderId}");

        $showRes->assertStatus(200)
            ->assertJsonPath('data.tenant.id', $this->tenantA->id)
            ->assertJsonPath('data.tenant.logo_url', $expectedLogoUrl);

        // 4. PUT /api/v1/orders/{id} (update - Admin branch)
        $updateAdminRes = $this->actingAs($this->adminA)
            ->putJson("http://localhost:8000/api/v1/orders/{$orderId}", [
                'repair_note' => 'Đã vệ sinh màng loa',
            ]);

        $updateAdminRes->assertStatus(200)
            ->assertJsonPath('data.tenant.id', $this->tenantA->id)
            ->assertJsonPath('data.tenant.logo_url', $expectedLogoUrl)
            ->assertJsonPath('data.tenant.hotline', '1900 6868');

        // 5. PUT /api/v1/orders/{id} (update - Non-admin branch)
        $this->techA->update(['branch_id' => $branch->id]);
        $updateStaffRes = $this->actingAs($this->techA)
            ->putJson("http://localhost:8000/api/v1/orders/{$orderId}", [
                'repair_note' => 'KTV cập nhật ghi chú',
            ]);

        $updateStaffRes->assertStatus(200)
            ->assertJsonPath('data.tenant.id', $this->tenantA->id)
            ->assertJsonPath('data.tenant.logo_url', $expectedLogoUrl)
            ->assertJsonPath('data.tenant.hotline', '1900 6868');
    }
}
