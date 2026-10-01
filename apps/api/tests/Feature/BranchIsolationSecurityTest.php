<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Part;
use App\Models\RepairOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class BranchIsolationSecurityTest extends TestCase
{
    use DatabaseTransactions;

    protected Branch $branch1;
    protected Branch $branch2;
    protected User $adminUser;
    protected User $cskhUserBranch1;
    protected User $techUserBranch1;
    protected User $techUserBranch2;
    protected Customer $customer;
    protected DeviceModel $deviceModel;
    protected RepairOrder $orderBranch1;
    protected RepairOrder $orderBranch2;
    protected Part $testPart;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Tạo 2 chi nhánh độc lập
        $this->branch1 = Branch::forceCreate([
            'name'      => 'Chi nhánh Hà Nội Test ' . uniqid(),
            'code'      => 'HN_TEST_' . uniqid(),
            'phone'     => '0241234567',
            'address'   => '100 Phố Huế, Hai Bà Trưng, Hà Nội',
            'is_active' => true,
        ]);

        $this->branch2 = Branch::forceCreate([
            'name'      => 'Chi nhánh TP.HCM Test ' . uniqid(),
            'code'      => 'HCM_TEST_' . uniqid(),
            'phone'     => '0281234567',
            'address'   => '200 Nguyễn Thị Minh Khai, Q1, TP.HCM',
            'is_active' => true,
        ]);

        // 2. Tạo tài khoản Admin và Nhân sự của các chi nhánh
        $this->adminUser = User::forceCreate([
            'name'      => 'Admin Toàn Chuỗi ' . uniqid(),
            'email'     => 'admin_' . uniqid() . '@fixo.com.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'branch_id' => null,
            'is_active' => true,
        ]);

        $this->cskhUserBranch1 = User::forceCreate([
            'name'      => 'CSKH Hà Nội ' . uniqid(),
            'email'     => 'cskh_hn_' . uniqid() . '@fixo.com.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'branch_id' => $this->branch1->id,
            'is_active' => true,
        ]);

        $this->techUserBranch1 = User::forceCreate([
            'name'      => 'KTV Hà Nội ' . uniqid(),
            'email'     => 'tech_hn_' . uniqid() . '@fixo.com.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'branch_id' => $this->branch1->id,
            'is_active' => true,
        ]);

        $this->techUserBranch2 = User::forceCreate([
            'name'      => 'KTV Sài Gòn ' . uniqid(),
            'email'     => 'tech_hcm_' . uniqid() . '@fixo.com.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'branch_id' => $this->branch2->id,
            'is_active' => true,
        ]);

        // 3. Khách hàng và Thiết bị mẫu
        $this->customer = Customer::forceCreate([
            'name'  => 'Khách Hàng Test ' . uniqid(),
            'phone' => '098' . random_int(1000000, 9999999),
            'email' => 'customer_' . uniqid() . '@example.com',
        ]);

        $this->deviceModel = DeviceModel::first() ?? DeviceModel::forceCreate([
            'name'       => 'AirPods Pro 2 Test',
            'model_code' => 'A2698_TEST',
            'category'   => 'airpods',
        ]);

        // 4. Tạo 2 đơn sửa chữa thuộc 2 chi nhánh khác nhau
        $year = date('y');
        $code1 = "PC{$year}-HN" . str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
        $code2 = "PC{$year}-SG" . str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);

        $this->orderBranch1 = RepairOrder::forceCreate([
            'order_code'          => $code1,
            'branch_id'           => $this->branch1->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->deviceModel->id,
            'technician_id'       => $this->techUserBranch1->id,
            'issue_description'   => 'Lỗi pin tai nghe trái tại chi nhánh 1',
            'status'              => 'inspecting',
            'total_price'         => 500000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $this->cskhUserBranch1->id,
        ]);

        $this->orderBranch2 = RepairOrder::forceCreate([
            'order_code'          => $code2,
            'branch_id'           => $this->branch2->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->deviceModel->id,
            'technician_id'       => $this->techUserBranch2->id,
            'issue_description'   => 'Lỗi mất kết nối tại chi nhánh 2',
            'status'              => 'inspecting',
            'total_price'         => 750000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $this->techUserBranch2->id,
        ]);

        // 5. Linh kiện kho mẫu
        $this->testPart = Part::forceCreate([
            'name'              => 'Pin AirPods Pro 2 Test ' . uniqid(),
            'sku'               => 'BAT-APP2-TST-' . uniqid(),
            'category'          => 'battery',
            'cost_price'        => 150000,
            'retail_price'      => 350000,
            'storage_location'  => 'Kệ A · Tầng 1',
            'unit'              => 'cái',
            'stock_quantity'    => 50,
            'min_stock_alert'   => 5,
            'compatible_models' => 'AirPods Pro 2',
            'is_active'         => true,
        ]);
    }

    /**
     * 1. Test Non-Admin xem đơn chi nhánh khác bị trả HTTP 403 Forbidden (chống IDOR).
     */
    public function test_non_admin_cannot_view_order_of_other_branch_returns_403(): void
    {
        // CSKH Chi nhánh 1 cố tình xem đơn Chi nhánh 2 qua /api/v1/orders/{id}
        $response = $this->actingAs($this->cskhUserBranch1, 'sanctum')
            ->getJson("/api/v1/orders/{$this->orderBranch2->id}");

        $response->assertStatus(403);
        $this->assertStringContainsString('Bạn không có quyền truy cập đơn hàng thuộc chi nhánh khác.', $response->json('message') ?? '');

        // Kiểm tra với alias route /api/v1/repairs/{id}
        $aliasResponse = $this->actingAs($this->cskhUserBranch1, 'sanctum')
            ->getJson("/api/v1/repairs/{$this->orderBranch2->id}");

        $aliasResponse->assertStatus(403);

        // CSKH Chi nhánh 1 xem đơn của chính chi nhánh mình thành công (HTTP 200)
        $ownResponse = $this->actingAs($this->cskhUserBranch1, 'sanctum')
            ->getJson("/api/v1/orders/{$this->orderBranch1->id}");

        $ownResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $this->orderBranch1->id);
    }

    /**
     * 2. Test Non-Admin sửa/đổi trạng thái đơn chi nhánh khác bị trả HTTP 403 Forbidden.
     */
    public function test_non_admin_cannot_modify_or_transition_order_of_other_branch_returns_403(): void
    {
        // 2a. Sửa thông tin đơn (PUT /orders/{id})
        $updateResponse = $this->actingAs($this->techUserBranch1, 'sanctum')
            ->putJson("/api/v1/orders/{$this->orderBranch2->id}", [
                'repair_note' => 'Hacker cố ý sửa đơn chi nhánh khác',
            ]);
        $updateResponse->assertStatus(403);

        // 2b. Chuyển trạng thái đơn (POST /orders/{id}/transition)
        $transitionResponse = $this->actingAs($this->techUserBranch1, 'sanctum')
            ->postJson("/api/v1/orders/{$this->orderBranch2->id}/transition", [
                'transition' => 'waiting_tech',
            ]);
        $transitionResponse->assertStatus(403);

        // 2c. Phân công kỹ thuật viên (POST /orders/{id}/assign-technician)
        $assignResponse = $this->actingAs($this->cskhUserBranch1, 'sanctum')
            ->postJson("/api/v1/orders/{$this->orderBranch2->id}/assign-technician", [
                'technician_id' => $this->techUserBranch1->id,
            ]);
        $assignResponse->assertStatus(403);

        // 2d. Lấy allowed transitions (GET /orders/{id}/allowed-transitions)
        $allowedResponse = $this->actingAs($this->techUserBranch1, 'sanctum')
            ->getJson("/api/v1/orders/{$this->orderBranch2->id}/allowed-transitions");
        $allowedResponse->assertStatus(403);

        // 2e. Cập nhật checklist (POST /orders/{id}/checklists)
        $checklistResponse = $this->actingAs($this->techUserBranch1, 'sanctum')
            ->postJson("/api/v1/orders/{$this->orderBranch2->id}/checklists", [
                'items' => [
                    ['item_name' => 'Pin', 'status' => 'pass'],
                ],
            ]);
        $checklistResponse->assertStatus(403);

        // 2f. Tải ảnh hiện trạng (POST /orders/{id}/photos)
        $photoResponse = $this->actingAs($this->techUserBranch1, 'sanctum')
            ->postJson("/api/v1/orders/{$this->orderBranch2->id}/photos", [
                'photo_url' => 'https://example.com/fake.jpg',
            ]);
        $photoResponse->assertStatus(403);
    }

    /**
     * 3. Test Admin xem và sửa đơn của bất kỳ chi nhánh nào thành công (HTTP 200).
     */
    public function test_admin_can_view_and_modify_order_of_any_branch_successfully(): void
    {
        // Admin xem đơn Chi nhánh 1
        $resBranch1 = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders/{$this->orderBranch1->id}");
        $resBranch1->assertStatus(200)
            ->assertJsonPath('success', true);

        // Admin xem đơn Chi nhánh 2
        $resBranch2 = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders/{$this->orderBranch2->id}");
        $resBranch2->assertStatus(200)
            ->assertJsonPath('success', true);

        // Admin cập nhật đơn Chi nhánh 2
        $updateRes = $this->actingAs($this->adminUser, 'sanctum')
            ->putJson("/api/v1/orders/{$this->orderBranch2->id}", [
                'price_note' => 'Admin phê duyệt giá đặc biệt',
            ]);
        $updateRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.price_note', 'Admin phê duyệt giá đặc biệt');

        // Admin lấy allowed transitions của đơn Chi nhánh 2
        $allowedRes = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders/{$this->orderBranch2->id}/allowed-transitions");
        $allowedRes->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    /**
     * 4. Test Non-Admin lọc danh sách đơn chỉ ra đơn của chi nhánh mình (kể cả khi cố truyền param branch_id khác).
     */
    public function test_non_admin_order_list_is_strictly_scoped_to_own_branch(): void
    {
        // 4a. CSKH Chi nhánh 1 gọi GET /api/v1/orders thông thường
        $normalResponse = $this->actingAs($this->cskhUserBranch1, 'sanctum')
            ->getJson('/api/v1/orders');

        $normalResponse->assertStatus(200);
        $orderIds = collect($normalResponse->json('data.data'))->pluck('id')->all();

        $this->assertContains($this->orderBranch1->id, $orderIds, 'Phải chứa đơn của Chi nhánh 1');
        $this->assertNotContains($this->orderBranch2->id, $orderIds, 'Tuyệt đối KHÔNG chứa đơn của Chi nhánh 2');

        // 4b. CSKH Chi nhánh 1 cố tình inject param branch_id của Chi nhánh 2
        $tamperedResponse = $this->actingAs($this->cskhUserBranch1, 'sanctum')
            ->getJson("/api/v1/orders?branch_id={$this->branch2->id}");

        $tamperedResponse->assertStatus(200);
        $tamperedOrderIds = collect($tamperedResponse->json('data.data'))->pluck('id')->all();

        $this->assertContains($this->orderBranch1->id, $tamperedOrderIds, 'Vẫn chỉ chứa đơn của Chi nhánh 1');
        $this->assertNotContains($this->orderBranch2->id, $tamperedOrderIds, 'Không thể xem đơn Chi nhánh 2 qua param query');

        // 4c. Admin lọc theo Chi nhánh 2 thì chỉ ra đơn Chi nhánh 2
        $adminFilterResponse = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/orders?branch_id={$this->branch2->id}");

        $adminFilterResponse->assertStatus(200);
        $adminOrderIds = collect($adminFilterResponse->json('data.data'))->pluck('id')->all();
        $this->assertContains($this->orderBranch2->id, $adminOrderIds);
        $this->assertNotContains($this->orderBranch1->id, $adminOrderIds);
    }

    /**
     * 5. Test Non-Admin tạo phiếu kho cho chi nhánh khác bị trả HTTP 403 Forbidden.
     */
    public function test_non_admin_cannot_create_inventory_transaction_for_other_branch_returns_403(): void
    {
        // KTV Chi nhánh 1 cố tình tạo giao dịch kho cho Chi nhánh 2 -> 403
        $forbiddenResponse = $this->actingAs($this->techUserBranch1, 'sanctum')
            ->postJson('/api/v1/inventory/transactions', [
                'part_id'          => $this->testPart->id,
                'branch_id'        => $this->branch2->id,
                'transaction_type' => 'import',
                'quantity'         => 10,
                'unit_cost'        => 150000,
            ]);

        $forbiddenResponse->assertStatus(403);
        $this->assertStringContainsString('Bạn không có quyền tạo giao dịch kho cho chi nhánh khác.', $forbiddenResponse->json('message') ?? '');

        // KTV Chi nhánh 1 tạo giao dịch kho cho chi nhánh mình -> 201
        $successResponse = $this->actingAs($this->techUserBranch1, 'sanctum')
            ->postJson('/api/v1/inventory/transactions', [
                'part_id'          => $this->testPart->id,
                'branch_id'        => $this->branch1->id,
                'transaction_type' => 'import',
                'quantity'         => 10,
                'unit_cost'        => 150000,
            ]);

        $successResponse->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.branch_id', $this->branch1->id);

        // KTV Chi nhánh 1 xem lịch sử kho với query branch_id khác -> bị ép về chi nhánh mình
        $historyResponse = $this->actingAs($this->techUserBranch1, 'sanctum')
            ->getJson("/api/v1/inventory/transactions?branch_id={$this->branch2->id}");

        $historyResponse->assertStatus(200);
        $txBranchIds = collect($historyResponse->json('data.data'))->pluck('branch_id')->unique()->all();
        foreach ($txBranchIds as $bId) {
            $this->assertEquals($this->branch1->id, $bId, 'Mọi giao dịch kho trả về phải thuộc Chi nhánh 1');
        }
    }

    /**
     * 6. Test tạo nhân viên CSKH/KTV/QC/Kho thiếu branch_id bị trả HTTP 422 Unprocessable Content.
     */
    public function test_creating_branch_staff_without_branch_id_returns_422(): void
    {
        // 6a. Tạo CSKH thiếu branch_id
        $cskhRes = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/users', [
                'name'     => 'CSKH Thiếu Branch',
                'email'    => 'missing_branch_cskh_' . uniqid() . '@fixo.com.vn',
                'password' => 'password123',
                'role'     => 'cskh',
            ]);
        $cskhRes->assertStatus(422)
            ->assertJsonValidationErrors(['branch_id']);
        $this->assertStringContainsString('Chi nhánh công tác là bắt buộc đối với nhân sự chi nhánh.', $cskhRes->json('message') ?? '');

        // 6b. Tạo KTV (technician) thiếu branch_id
        $techRes = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/users', [
                'name'     => 'KTV Thiếu Branch',
                'email'    => 'missing_branch_tech_' . uniqid() . '@fixo.com.vn',
                'password' => 'password123',
                'role'     => 'technician',
            ]);
        $techRes->assertStatus(422)
            ->assertJsonValidationErrors(['branch_id']);

        // 6c. Tạo QC thiếu branch_id
        $qcRes = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/users', [
                'name'     => 'QC Thiếu Branch',
                'email'    => 'missing_branch_qc_' . uniqid() . '@fixo.com.vn',
                'password' => 'password123',
                'role'     => 'qc',
            ]);
        $qcRes->assertStatus(422)
            ->assertJsonValidationErrors(['branch_id']);

        // 6d. Tạo Kho (inventory) thiếu branch_id
        $invRes = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/users', [
                'name'     => 'Kho Thiếu Branch',
                'email'    => 'missing_branch_inv_' . uniqid() . '@fixo.com.vn',
                'password' => 'password123',
                'role'     => 'inventory',
            ]);
        $invRes->assertStatus(422)
            ->assertJsonValidationErrors(['branch_id']);

        // 6e. Tạo Admin KHÔNG CẦN branch_id -> thành công HTTP 201
        $adminRes = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/users', [
                'name'     => 'Admin Mới Không Cần Branch',
                'email'    => 'new_admin_' . uniqid() . '@fixo.com.vn',
                'password' => 'password123',
                'role'     => 'admin',
            ]);
        $adminRes->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.branch_id', null);

        // 6f. Tạo KTV CÓ branch_id -> thành công HTTP 201
        $validTechRes = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/users', [
                'name'      => 'KTV Hợp Lệ Có Branch',
                'email'     => 'valid_tech_' . uniqid() . '@fixo.com.vn',
                'password'  => 'password123',
                'branch_id' => $this->branch1->id,
                'role'      => 'technician',
            ]);
        $validTechRes->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.branch_id', $this->branch1->id);
    }

    /**
     * 7. Test Non-Admin xem KPI dashboard và KPI staff tự động bị scope về chi nhánh của mình.
     */
    public function test_non_admin_kpi_dashboard_and_staff_scoped_to_own_branch(): void
    {
        // Non-Admin (Chi nhánh 1) gọi KPI staff nhưng truyền param branch_id của Chi nhánh 2
        $staffResponse = $this->actingAs($this->techUserBranch1, 'sanctum')
            ->getJson("/api/v1/kpi/staff?branch_id={$this->branch2->id}");

        $staffResponse->assertStatus(200)
            ->assertJsonPath('success', true);

        $staffList = $staffResponse->json('data.staff') ?? [];
        $staffBranchIds = collect($staffList)->pluck('branch_id')->filter()->unique()->all();

        // Danh sách nhân viên KTV phải chỉ bao gồm nhân viên Chi nhánh 1
        foreach ($staffBranchIds as $bId) {
            $this->assertEquals($this->branch1->id, $bId, 'KPI nhân sự trả về phải thuộc Chi nhánh 1');
        }

        // Non-Admin (Chi nhánh 1) gọi KPI dashboard với param Chi nhánh 2
        $dashboardResponse = $this->actingAs($this->techUserBranch1, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch2->id}");

        $dashboardResponse->assertStatus(200)
            ->assertJsonPath('success', true);
    }
}
