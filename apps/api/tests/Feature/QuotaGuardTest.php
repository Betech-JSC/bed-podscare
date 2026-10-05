<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class QuotaGuardTest extends TestCase
{
    use DatabaseTransactions;

    protected DeviceModel $deviceModel;

    protected function setUp(): void
    {
        parent::setUp();

        $this->deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'iPhone 15 Pro Max',
            'model_code' => 'A2849_' . uniqid(),
            'category'   => 'iphone',
        ]);
    }

    private function createTenantWithOwner(string $plan = 'trial', ?\DateTimeInterface $expiresAt = null): array
    {
        $tenant = Tenant::create([
            'code'            => 'tenant_' . uniqid(),
            'name'            => 'Tiệm ' . strtoupper($plan) . ' ' . uniqid(),
            'status'          => 'active',
            'plan'            => $plan,
            'current_plan_id' => $plan,
            'expires_at'      => $expiresAt ?? now()->addDays(14),
            'trial_ends_at'   => $plan === 'trial' ? now()->addDays(14) : null,
        ]);

        $owner = User::forceCreate([
            'tenant_id' => $tenant->id,
            'name'      => 'Chủ Tiệm ' . $plan,
            'email'     => 'owner_' . uniqid() . '@example.com',
            'phone'     => '093' . rand(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        return [$tenant, $owner];
    }

    /**
     * Case 3 (Trial Branch Limit): Gói Trial tạo branch 1 thành công (201), tạo branch 2 bị chặn 422.
     */
    public function test_case_3_trial_branch_limit(): void
    {
        [$tenant, $owner] = $this->createTenantWithOwner('trial');

        // Tạo chi nhánh 1: thành công (201)
        $res1 = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/branches', [
            'code'    => 'BR1_' . strtoupper(substr(uniqid(), -4)),
            'name'    => 'Chi nhánh 1',
            'address' => '123 Nguyễn Huệ, Q1',
        ]);

        $res1->assertStatus(201)
            ->assertJsonPath('success', true);

        // Tạo chi nhánh 2: bị chặn 422 (QUOTA_EXCEEDED_BRANCHES)
        $res2 = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/branches', [
            'code'    => 'BR2_' . strtoupper(substr(uniqid(), -4)),
            'name'    => 'Chi nhánh 2',
            'address' => '456 Lê Lợi, Q1',
        ]);

        $res2->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error_code', 'QUOTA_EXCEEDED_BRANCHES');
    }

    /**
     * Case 4 (Trial User Limit): Gói Trial tạo tối đa 2 nhân viên (201), tạo nhân viên thứ 3 bị chặn 422.
     */
    public function test_case_4_trial_user_limit(): void
    {
        [$tenant, $owner] = $this->createTenantWithOwner('trial');

        $branch = Branch::create([
            'tenant_id' => $tenant->id,
            'code'      => 'BR_U_' . strtoupper(substr(uniqid(), -4)),
            'name'      => 'Chi Nhánh Test User',
            'address'   => '102 Lê Lợi',
            'is_active' => true,
        ]);

        // Gói trial max_users = 2. Hiện tại đã có 1 user ($owner).
        // Tạo thêm user thứ 2: thành công (201)
        $res1 = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/users', [
            'name'      => 'Kỹ Thuật Viên 1',
            'email'     => 'ktv1_' . uniqid() . '@example.com',
            'password'  => 'password123',
            'role'      => 'technician',
            'branch_id' => $branch->id,
        ]);

        $res1->assertStatus(201)
            ->assertJsonPath('success', true);

        // Tạo thêm user thứ 3: bị chặn 422 (QUOTA_EXCEEDED_USERS)
        $res2 = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/users', [
            'name'      => 'CSKH 2',
            'email'     => 'cskh2_' . uniqid() . '@example.com',
            'password'  => 'password123',
            'role'      => 'cskh',
            'branch_id' => $branch->id,
        ]);

        $res2->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error_code', 'QUOTA_EXCEEDED_USERS');
    }

    /**
     * Case 5 (Trial Order Monthly Limit): Gói Trial tạo quá 50 đơn sửa chữa trong tháng bị chặn 422.
     */
    public function test_case_5_trial_order_monthly_limit(): void
    {
        [$tenant, $owner] = $this->createTenantWithOwner('trial');

        // Tạo 1 chi nhánh hợp lệ để gắn order
        $branch = Branch::create([
            'tenant_id' => $tenant->id,
            'code'      => 'BR_TR_' . strtoupper(substr(uniqid(), -4)),
            'name'      => 'Chi Nhánh Trial',
            'address'   => '100 Hai Bà Trưng',
            'is_active' => true,
        ]);

        $customer = Customer::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Khách Hàng Trial',
            'phone'     => '091' . rand(1000000, 9999999),
        ]);

        // Tạo 50 đơn hàng trong tháng hiện tại bằng Eloquent
        for ($i = 1; $i <= 50; $i++) {
            RepairOrder::create([
                'tenant_id'          => $tenant->id,
                'order_code'         => 'FX-TR-' . uniqid() . "-{$i}",
                'branch_id'          => $branch->id,
                'customer_id'        => $customer->id,
                'device_model_id'    => $this->deviceModel->id,
                'issue_description'  => 'Test đơn số ' . $i,
                'status'             => 'inspecting',
                'created_by_user_id' => $owner->id,
                'created_at'         => now(),
            ]);
        }

        // Tạo đơn thứ 51 qua API: bị chặn 422 (QUOTA_EXCEEDED_ORDERS)
        $response = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $branch->id,
            'customer_phone'    => '0988777111',
            'customer_name'     => 'Khách Thứ 51',
            'device_model_id'   => $this->deviceModel->id,
            'issue_description' => 'Pin phồng',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error_code', 'QUOTA_EXCEEDED_ORDERS');
    }

    /**
     * Case 6 (Standard Limits): Gói Standard tạo chi nhánh 2 thành công, branch 3 bị 422; tạo vượt 200 đơn bị 422.
     */
    public function test_case_6_standard_limits(): void
    {
        [$tenant, $owner] = $this->createTenantWithOwner('standard', now()->addDays(30));

        // Tạo chi nhánh 1: thành công (201)
        $res1 = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/branches', [
            'code'    => 'STD_B1_' . strtoupper(substr(uniqid(), -4)),
            'name'    => 'Chi nhánh Standard 1',
            'address' => '11 Nguyễn Trãi, Q5',
        ]);
        $res1->assertStatus(201);
        $branch1Id = $res1->json('data.id');

        // Tạo chi nhánh 2: thành công (201)
        $res2 = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/branches', [
            'code'    => 'STD_B2_' . strtoupper(substr(uniqid(), -4)),
            'name'    => 'Chi nhánh Standard 2',
            'address' => '22 Nguyễn Trãi, Q5',
        ]);
        $res2->assertStatus(201);

        // Tạo chi nhánh 3: bị chặn 422 (QUOTA_EXCEEDED_BRANCHES)
        $res3 = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/branches', [
            'code'    => 'STD_B3_' . strtoupper(substr(uniqid(), -4)),
            'name'    => 'Chi nhánh Standard 3',
            'address' => '33 Nguyễn Trãi, Q5',
        ]);
        $res3->assertStatus(422)
            ->assertJsonPath('error_code', 'QUOTA_EXCEEDED_BRANCHES');

        // Tạo 200 đơn trong tháng
        $customer = Customer::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Khách Hàng Standard',
            'phone'     => '094' . rand(1000000, 9999999),
        ]);

        for ($i = 1; $i <= 200; $i++) {
            RepairOrder::create([
                'tenant_id'          => $tenant->id,
                'order_code'         => 'FX-STD-' . uniqid() . "-{$i}",
                'branch_id'          => $branch1Id,
                'customer_id'        => $customer->id,
                'device_model_id'    => $this->deviceModel->id,
                'issue_description'  => 'Đơn thứ ' . $i,
                'status'             => 'inspecting',
                'created_by_user_id' => $owner->id,
                'created_at'         => now(),
            ]);
        }

        // Tạo đơn thứ 201: bị chặn 422 (QUOTA_EXCEEDED_ORDERS)
        $resOrder = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $branch1Id,
            'customer_phone'    => '0988000201',
            'customer_name'     => 'Khách Hàng 201',
            'device_model_id'   => $this->deviceModel->id,
            'issue_description' => 'Hỏng màn hình',
        ]);

        $resOrder->assertStatus(422)
            ->assertJsonPath('error_code', 'QUOTA_EXCEEDED_ORDERS');
    }

    /**
     * Case 7 (Pro Unlimited): Gói Pro tạo branch, user, order không bị giới hạn.
     */
    public function test_case_7_pro_unlimited(): void
    {
        [$tenant, $owner] = $this->createTenantWithOwner('pro', now()->addDays(365));

        $createdBranchIds = [];
        // Tạo 3 chi nhánh thành công
        for ($i = 1; $i <= 3; $i++) {
            $res = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/branches', [
                'code'    => 'PRO_B' . $i . '_' . strtoupper(substr(uniqid(), -4)),
                'name'    => 'Chi nhánh Pro ' . $i,
                'address' => "Địa chỉ Pro {$i}",
            ]);
            $res->assertStatus(201);
            $createdBranchIds[] = $res->json('data.id');
        }

        // Tạo 6 nhân sự thành công
        for ($i = 1; $i <= 6; $i++) {
            $res = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/users', [
                'name'      => 'Nhân Viên Pro ' . $i,
                'email'     => "pro_staff_{$i}_" . uniqid() . '@example.com',
                'password'  => 'password123',
                'role'      => 'technician',
                'branch_id' => $createdBranchIds[0],
            ]);
            $res->assertStatus(201);
        }

        // Tạo đơn hàng thành công
        $resOrder = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $createdBranchIds[0],
            'customer_phone'    => '0977888999',
            'customer_name'     => 'Khách VIP Pro',
            'device_model_id'   => $this->deviceModel->id,
            'issue_description' => 'Ép kính',
            'estimated_price'   => 350000,
        ]);

        $resOrder->assertStatus(201);
    }

    /**
     * Case 8 (Subscription Expired): Tenant hết hạn (expires_at < now()) bị chặn tác vụ ghi với HTTP 403.
     */
    public function test_case_8_subscription_expired_blocks_write_operations(): void
    {
        // Tenant đã hết hạn từ hôm qua
        [$tenant, $owner] = $this->createTenantWithOwner('trial', now()->subDay());

        // 1. Thao tác tạo chi nhánh bị chặn HTTP 403
        $resBranch = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/branches', [
            'code'    => 'EXP_B_' . strtoupper(substr(uniqid(), -4)),
            'name'    => 'Chi nhánh khi hết hạn',
            'address' => '789 Trần Hưng Đạo',
        ]);
        $resBranch->assertStatus(403)
            ->assertJsonPath('error_code', 'SUBSCRIPTION_EXPIRED');

        // 2. Thao tác tạo nhân viên bị chặn HTTP 403
        $resUser = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/users', [
            'name'     => 'Nhân viên khi hết hạn',
            'email'    => 'expired_' . uniqid() . '@example.com',
            'password' => 'password123',
            'role'     => 'technician',
        ]);
        $resUser->assertStatus(403)
            ->assertJsonPath('error_code', 'SUBSCRIPTION_EXPIRED');

        // 3. Thao tác tạo đơn sửa chữa bị chặn HTTP 403
        $resOrder = $this->actingAs($owner, 'sanctum')->postJson('/api/v1/orders', [
            'customer_phone'    => '0966555444',
            'customer_name'     => 'Khách Hàng Hết Hạn',
            'device_model_id'   => $this->deviceModel->id,
            'issue_description' => 'Sửa máy khi hết hạn',
        ]);
        $resOrder->assertStatus(403)
            ->assertJsonPath('error_code', 'SUBSCRIPTION_EXPIRED');
    }
}
