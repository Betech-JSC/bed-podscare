<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class BranchManagementTest extends TestCase
{
    use DatabaseTransactions;

    private function getAdminUser(): User
    {
        $user = User::where('email', 'admin_test@podscare.vn')->first();
        if (! $user) {
            $user = User::forceCreate([
                'name'      => 'Quản Trị Viên Test',
                'email'     => 'admin_test@podscare.vn',
                'password'  => Hash::make('password123'),
                'role'      => 'admin',
                'phone'     => '0901000999',
                'is_active' => true,
            ]);
        } elseif ($user->role !== 'admin') {
            $user->role = 'admin';
            $user->save();
        }

        return $user;
    }

    private function getStaffUser(string $role = 'cskh'): User
    {
        $user = User::where('email', "staff_{$role}_test@podscare.vn")->first();
        if (! $user) {
            $user = User::forceCreate([
                'name'      => "Nhân Viên {$role} Test",
                'email'     => "staff_{$role}_test@podscare.vn",
                'password'  => Hash::make('password123'),
                'role'      => $role,
                'phone'     => '0901000888',
                'is_active' => true,
            ]);
        } elseif ($user->role !== $role) {
            $user->role = $role;
            $user->save();
        }

        return $user;
    }

    /**
     * Test 1: Admin tạo chi nhánh mới thành công (201 Created, chuẩn ApiResponse, lưu DB, ghi Audit Log).
     */
    public function test_admin_can_create_branch_successfully(): void
    {
        $admin = $this->getAdminUser();
        $code = 'TEST_' . strtoupper(substr(uniqid(), -4));

        $payload = [
            'code'      => strtolower($code), // gửi chữ thường để test tự động strtoupper
            'name'      => 'Chi Nhánh Test Hồ Chí Minh',
            'address'   => '789 Đường Sư Vạn Hạnh, Quận 10, TP.HCM',
            'phone'     => '0909123456',
            'is_active' => true,
        ];

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/branches', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Tạo chi nhánh mới thành công.')
            ->assertJsonPath('data.code', $code)
            ->assertJsonPath('data.name', 'Chi Nhánh Test Hồ Chí Minh')
            ->assertJsonPath('data.address', '789 Đường Sư Vạn Hạnh, Quận 10, TP.HCM')
            ->assertJsonPath('data.is_active', true);

        $branchId = $response->json('data.id');
        $this->assertNotNull($branchId);

        // Kiểm tra bản ghi trong bảng branches
        $this->assertDatabaseHas('branches', [
            'id'   => $branchId,
            'code' => $code,
            'name' => 'Chi Nhánh Test Hồ Chí Minh',
        ]);

        // Kiểm tra ghi nhật ký audit_logs
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $admin->id,
            'action'  => 'branch.created',
        ]);
    }

    /**
     * Test 2: Người dùng không phải Admin (cskh, technician) bị từ chối với 403 Forbidden.
     */
    public function test_non_admin_cannot_create_branch(): void
    {
        $cskhUser = $this->getStaffUser('cskh');
        $techUser = $this->getStaffUser('technician');

        $payload = [
            'code'      => 'FORBIDDEN_1',
            'name'      => 'Chi Nhánh Bị Từ Chối',
            'address'   => '123 Test Street',
            'phone'     => '0900000000',
            'is_active' => true,
        ];

        // 1. CSKH thử tạo chi nhánh
        $cskhResponse = $this->actingAs($cskhUser, 'sanctum')->postJson('/api/v1/branches', $payload);
        $cskhResponse->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Chỉ quản trị viên (Admin) mới có quyền tạo chi nhánh mới.');

        // 2. Kỹ thuật viên thử tạo chi nhánh
        $techResponse = $this->actingAs($techUser, 'sanctum')->postJson('/api/v1/branches', $payload);
        $techResponse->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Chỉ quản trị viên (Admin) mới có quyền tạo chi nhánh mới.');

        // Đảm bảo không có bản ghi nào bị tạo vào DB
        $this->assertDatabaseMissing('branches', [
            'code' => 'FORBIDDEN_1',
        ]);
    }

    /**
     * Test 3: Người dùng không phải Admin không thể cập nhật hoặc đổi trạng thái chi nhánh (403 Forbidden).
     */
    public function test_non_admin_cannot_update_or_toggle_branch(): void
    {
        $admin = $this->getAdminUser();
        $cskh = $this->getStaffUser('cskh');

        $branch = Branch::create([
            'code'      => 'BR_' . uniqid(),
            'name'      => 'Chi Nhánh Test Quyền',
            'address'   => '123 Đường Test',
            'phone'     => '0901234567',
            'is_active' => true,
        ]);

        // Thử cập nhật
        $updateResponse = $this->actingAs($cskh, 'sanctum')->putJson("/api/v1/branches/{$branch->id}", [
            'name' => 'Chi Nhánh Đổi Tên Bất Hợp Pháp',
        ]);
        $updateResponse->assertStatus(403)
            ->assertJsonPath('success', false);

        // Thử toggle status
        $toggleResponse = $this->actingAs($cskh, 'sanctum')->postJson("/api/v1/branches/{$branch->id}/toggle-status");
        $toggleResponse->assertStatus(403)
            ->assertJsonPath('success', false);
    }

    /**
     * Test 4: Chưa đăng nhập không thể thao tác (401 Unauthorized).
     */
    public function test_unauthenticated_user_cannot_access_branch_endpoints(): void
    {
        $this->postJson('/api/v1/branches', ['code' => 'UNAUTH'])->assertStatus(401);
        $this->putJson('/api/v1/branches/1', ['name' => 'UNAUTH'])->assertStatus(401);
        $this->postJson('/api/v1/branches/1/toggle-status')->assertStatus(401);
    }

    /**
     * Test 5: Validate dữ liệu khi tạo chi nhánh - lỗi trùng mã code.
     */
    public function test_validation_fails_on_duplicate_code(): void
    {
        $admin = $this->getAdminUser();
        $code = 'DUP_' . strtoupper(substr(uniqid(), -4));

        // Tạo chi nhánh ban đầu
        Branch::create([
            'code'      => $code,
            'name'      => 'Chi Nhánh Trùng Mã 1',
            'address'   => '123 Đường Số 1',
            'phone'     => '0901111111',
            'is_active' => true,
        ]);

        // Thử tạo chi nhánh khác nhưng trùng mã (kể cả chữ thường)
        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/branches', [
            'code'    => strtolower($code),
            'name'    => 'Chi Nhánh Trùng Mã 2',
            'address' => '456 Đường Số 2',
            'phone'   => '0902222222',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['code']);
    }

    /**
     * Test 6: Validate các trường bắt buộc (code, name, address).
     */
    public function test_validation_fails_on_missing_required_fields(): void
    {
        $admin = $this->getAdminUser();

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/branches', [
            'code'    => '',
            'name'    => '',
            'address' => '',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['code', 'name', 'address']);
    }

    /**
     * Test 7: Admin cập nhật thông tin chi nhánh thành công (200 OK & ghi audit_logs).
     */
    public function test_admin_can_update_branch(): void
    {
        $admin = $this->getAdminUser();
        $branch = Branch::create([
            'code'      => 'UP_' . uniqid(),
            'name'      => 'Chi Nhánh Cũ',
            'address'   => 'Địa chỉ cũ',
            'phone'     => '0900000001',
            'is_active' => true,
        ]);

        $response = $this->actingAs($admin, 'sanctum')->putJson("/api/v1/branches/{$branch->id}", [
            'name'    => 'Chi Nhánh Mới Cập Nhật',
            'address' => 'Địa chỉ mới cập nhật',
            'phone'   => '0909999999',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Cập nhật thông tin chi nhánh thành công.')
            ->assertJsonPath('data.name', 'Chi Nhánh Mới Cập Nhật')
            ->assertJsonPath('data.address', 'Địa chỉ mới cập nhật')
            ->assertJsonPath('data.phone', '0909999999');

        $this->assertDatabaseHas('branches', [
            'id'      => $branch->id,
            'name'    => 'Chi Nhánh Mới Cập Nhật',
            'address' => 'Địa chỉ mới cập nhật',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $admin->id,
            'action'  => 'branch.updated',
        ]);
    }

    /**
     * Test 8: Admin toggle trạng thái chi nhánh (kích hoạt / tạm ngưng).
     */
    public function test_admin_can_toggle_branch_status(): void
    {
        $admin = $this->getAdminUser();
        $branch = Branch::create([
            'code'      => 'TOG_' . uniqid(),
            'name'      => 'Chi Nhánh Toggle Status',
            'address'   => 'Địa chỉ toggle',
            'phone'     => '0900000002',
            'is_active' => true,
        ]);

        // 1. Tắt kích hoạt
        $toggleOffResponse = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/branches/{$branch->id}/toggle-status");
        $toggleOffResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.is_active', false);

        $this->assertFalse($branch->fresh()->is_active);

        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $admin->id,
            'action'  => 'branch.status_toggled',
        ]);

        // 2. Bật kích hoạt lại
        $toggleOnResponse = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/branches/{$branch->id}/toggle-status");
        $toggleOnResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.is_active', true);

        $this->assertTrue($branch->fresh()->is_active);
    }

    /**
     * Test 9: Thao tác trên chi nhánh không tồn tại trả về 404 Not Found.
     */
    public function test_non_existent_branch_returns_404(): void
    {
        $admin = $this->getAdminUser();

        $this->actingAs($admin, 'sanctum')->putJson('/api/v1/branches/999999', [
            'name' => 'Không tồn tại',
        ])->assertStatus(404);

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/branches/999999/toggle-status')
            ->assertStatus(404);
    }
}
