<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\User;
use App\Models\Warranty;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SecurityPiiPatchTest extends TestCase
{
    use DatabaseTransactions;
    private function getBranch(): Branch
    {
        return Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'Q1',
            'address'   => '123 Lê Lợi, P. Bến Nghé, Q.1',
            'phone'     => '0901000001',
            'is_active' => true,
        ]);
    }

    private function getDeviceModel(): DeviceModel
    {
        return DeviceModel::first() ?? DeviceModel::create([
            'name'        => 'AirPods Pro 2 (USB-C)',
            'model_code'  => 'MTJV3VN/A',
            'category'    => 'airpods_pro',
            'release_year'=> 2023,
        ]);
    }

    private function getStaffUser(): User
    {
        return User::where('role', 'admin')->first() ?? User::create([
            'name'      => 'Admin User',
            'email'     => 'admin_test_' . uniqid() . '@fixo.com.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    private function getCustomer(): Customer
    {
        return Customer::firstOrCreate(
            ['phone' => '0903482716'],
            [
                'name'          => 'Nguyễn Minh Anh',
                'email'         => 'minhanh.test@gmail.com',
                'customer_type' => 'retail',
            ]
        );
    }

    /**
     * Task 2.2: Test user tạo mặc định có role là 'technician', không phải 'admin'.
     */
    public function test_user_created_without_specifying_role_defaults_to_technician(): void
    {
        $uniqueSuffix = uniqid();
        $user = User::create([
            'name'     => "Kỹ thuật viên {$uniqueSuffix}",
            'email'    => "ktv_{$uniqueSuffix}@fixo.com.vn",
            'password' => Hash::make('secret123456'),
        ]);

        $user->refresh();

        $this->assertEquals('technician', $user->role, 'Mặc định role của User mới phải là technician.');
        $this->assertNotEquals('admin', $user->role, 'Tuyệt đối không được mặc định trao quyền admin cho user mới.');
    }

    /**
     * Task 3.3: Test tra cứu GET /api/v1/tracking/{code} không kèm phone thì thông tin customer bị mask (0903****16).
     */
    public function test_public_tracking_without_phone_masks_customer_pii(): void
    {
        $uniqueSuffix = uniqid();
        $customer = $this->getCustomer();

        $orderCode = "PC-PII-{$uniqueSuffix}";
        $order = RepairOrder::create([
            'order_code'          => $orderCode,
            'branch_id'           => $this->getBranch()->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $this->getDeviceModel()->id,
            'issue_description'   => 'Kiểm tra bảo mật PII',
            'status'              => 'in_repair',
            'created_by_user_id'  => $this->getStaffUser()->id,
        ]);

        $response = $this->getJson("/api/v1/tracking/{$orderCode}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.order.order_code', $orderCode)
            ->assertJsonPath('data.order.customer.phone', '0903****16')
            ->assertJsonPath('data.order.customer.name', 'Nguyễn M*** A***');

        // Đảm bảo số điện thoại thật không xuất hiện trong payload
        $this->assertStringNotContainsString('0903482716', $response->json('data.order.customer.phone'));
    }

    /**
     * Task 3.3: Test tra cứu kèm phone đúng thì hiển thị đầy đủ thông tin customer.
     */
    public function test_public_tracking_with_matching_phone_returns_full_customer_info(): void
    {
        $uniqueSuffix = uniqid();
        $customer = $this->getCustomer();

        $orderCode = "PC-FULL-{$uniqueSuffix}";
        RepairOrder::create([
            'order_code'          => $orderCode,
            'branch_id'           => $this->getBranch()->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $this->getDeviceModel()->id,
            'issue_description'   => 'Tra cứu kèm số điện thoại',
            'status'              => 'in_repair',
            'created_by_user_id'  => $this->getStaffUser()->id,
        ]);

        // 1. Tra cứu kèm đủ 10 số điện thoại
        $responseFull = $this->getJson("/api/v1/tracking/{$orderCode}?phone=0903482716");
        $responseFull->assertStatus(200)
            ->assertJsonPath('data.order.customer.phone', '0903482716')
            ->assertJsonPath('data.order.customer.name', 'Nguyễn Minh Anh');

        // 2. Tra cứu kèm 4 số cuối điện thoại (2716)
        $responseLast4 = $this->getJson("/api/v1/tracking/{$orderCode}?phone=2716");
        $responseLast4->assertStatus(200)
            ->assertJsonPath('data.order.customer.phone', '0903482716')
            ->assertJsonPath('data.order.customer.name', 'Nguyễn Minh Anh');

        // 3. Tra cứu kèm số điện thoại sai -> vẫn trả về nhưng thông tin bị mask
        $responseWrong = $this->getJson("/api/v1/tracking/{$orderCode}?phone=0999999999");
        $responseWrong->assertStatus(200)
            ->assertJsonPath('data.order.customer.phone', '0903****16')
            ->assertJsonPath('data.order.customer.name', 'Nguyễn M*** A***');
    }

    /**
     * Task 3.3: Test tra cứu bảo hành GET /api/v1/warranties/lookup?code=... thông tin customer bị mask.
     */
    public function test_public_warranty_lookup_with_code_masks_customer_pii(): void
    {
        $uniqueSuffix = uniqid();
        $customer = $this->getCustomer();

        $order = RepairOrder::create([
            'order_code'          => "PC-WAR-{$uniqueSuffix}",
            'branch_id'           => $this->getBranch()->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $this->getDeviceModel()->id,
            'issue_description'   => 'Đơn bảo hành',
            'status'              => 'completed',
            'created_by_user_id'  => $this->getStaffUser()->id,
        ]);

        $warrantyCode = "WAR-TEST-{$uniqueSuffix}";
        Warranty::create([
            'warranty_code'   => $warrantyCode,
            'repair_order_id' => $order->id,
            'customer_id'     => $customer->id,
            'device_model_id' => $this->getDeviceModel()->id,
            'coverage_item'   => 'Thay Pin AirPods Pro 2',
            'start_date'      => Carbon::now()->subDays(10),
            'duration_days'   => 90,
            'end_date'        => Carbon::now()->addDays(80),
            'status'          => 'active',
        ]);

        // 1. Tra cứu chỉ bằng mã bảo hành: thông tin khách hàng bị che mờ
        $response = $this->getJson("/api/v1/warranties/lookup?code={$warrantyCode}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.0.warranty_code', $warrantyCode)
            ->assertJsonPath('data.0.customer.phone', '0903****16')
            ->assertJsonPath('data.0.customer.name', 'Nguyễn M*** A***');

        $this->assertNull($response->json('data.0.customer.email'));

        // 2. Tra cứu bằng mã bảo hành kèm số điện thoại đúng: hiển thị đầy đủ
        $responseVerified = $this->getJson("/api/v1/warranties/lookup?code={$warrantyCode}&phone=0903482716");
        $responseVerified->assertStatus(200)
            ->assertJsonPath('data.0.customer.phone', '0903482716')
            ->assertJsonPath('data.0.customer.name', 'Nguyễn Minh Anh');
    }
}
