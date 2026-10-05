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

    public function test_upload_logo_rejects_file_over_2mb_or_invalid_format(): void
    {
        // 1. File dung lượng lớn > 2MB (2049 KB)
        $largeFile = UploadedFile::fake()->create('heavy_image.png', 2500, 'image/png');

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
}
