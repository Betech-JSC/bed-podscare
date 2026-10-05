<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Part;
use App\Models\Partner;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\Shipment;
use App\Models\User;
use App\Models\Warranty;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CriticalFlawsRemediationTest extends TestCase
{
    use DatabaseTransactions;

    private function getAdmin(): User
    {
        $admin = User::where('role', 'admin')->first();
        if (! $admin) {
            $admin = User::forceCreate([
                'name'      => 'Admin User',
                'email'     => 'admin_remediation_' . uniqid() . '@fixo.com.vn',
                'password'  => Hash::make('password123'),
                'role'      => 'admin',
                'is_active' => true,
            ]);
        }
        return $admin;
    }

    private function getBranch(string $code = 'Q1'): Branch
    {
        return Branch::where('code', $code)->first() ?? Branch::create([
            'name'      => "Chi nhánh {$code}",
            'code'      => $code,
            'address'   => "Địa chỉ {$code}",
            'phone'     => '0901000' . rand(100, 999),
            'is_active' => true,
        ]);
    }

    private function getStaff(Branch $branch, string $role = 'technician'): User
    {
        return User::forceCreate([
            'name'      => "Nhân viên {$role} {$branch->code}",
            'email'     => "staff_{$role}_" . uniqid() . '@fixo.com.vn',
            'password'  => Hash::make('password123'),
            'role'      => $role,
            'branch_id' => $branch->id,
            'is_active' => true,
        ]);
    }

    private function getCustomer(): Customer
    {
        return Customer::first() ?? Customer::create([
            'name'  => 'Nguyễn Văn A',
            'phone' => '0909' . rand(100000, 999999),
            'email' => 'customer_' . uniqid() . '@gmail.com',
        ]);
    }

    private function getDeviceModel(): DeviceModel
    {
        return DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'model_code'   => 'APP2',
            'category'     => 'airpods_pro',
            'release_year' => 2023,
        ]);
    }

    /**
     * Task 1.1: Role không thể gán qua mass assignment trong User::create.
     */
    public function test_role_cannot_be_mass_assigned(): void
    {
        $user = User::create([
            'name'     => 'Attacker User',
            'email'    => 'attacker_' . uniqid() . '@fixo.com.vn',
            'password' => Hash::make('password123'),
            'role'     => 'admin', // Cố tình leo quyền
        ]);

        $this->assertEquals('technician', $user->fresh()->role);
        $this->assertNotEquals('admin', $user->fresh()->role);
    }

    /**
     * Task 1.2: CheckRole middleware trả về 403 Forbidden cho non-admin tại /users.
     */
    public function test_check_role_middleware_blocks_non_admin_from_user_routes(): void
    {
        $branch = $this->getBranch('Q1');
        $staff = $this->getStaff($branch, 'technician');

        $response = $this->actingAs($staff, 'sanctum')->getJson('/api/v1/users');
        $response->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Bạn không có quyền thực hiện thao tác này.');

        $admin = $this->getAdmin();
        $adminResponse = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/users');
        $adminResponse->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    /**
     * Task 1.4: Phân lập đa chi nhánh cho OrderController index và store.
     */
    public function test_branch_data_isolation_for_orders(): void
    {
        $branch1 = $this->getBranch('Q1');
        $branch2 = $this->getBranch('Q3');

        $staff1 = $this->getStaff($branch1, 'technician');
        $device = $this->getDeviceModel();
        $customer = $this->getCustomer();

        // Tạo đơn cho chi nhánh 1
        $order1 = RepairOrder::create([
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'branch_id'          => $branch1->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'issue_description'  => 'Lỗi loa',
            'status'             => 'inspecting',
            'created_by_user_id' => $staff1->id,
        ]);

        // Tạo đơn cho chi nhánh 2
        $order2 = RepairOrder::create([
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'branch_id'          => $branch2->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'issue_description'  => 'Lỗi pin',
            'status'             => 'inspecting',
            'created_by_user_id' => $staff1->id,
        ]);

        // 1. Staff chi nhánh 1 xem danh sách đơn -> chỉ thấy order1, không thấy order2
        $responseList = $this->actingAs($staff1, 'sanctum')->getJson('/api/v1/orders');
        $responseList->assertStatus(200);
        $orderCodes = collect($responseList->json('data.data'))->pluck('order_code')->toArray();

        $this->assertContains($order1->order_code, $orderCodes);
        $this->assertNotContains($order2->order_code, $orderCodes);

        // 2. Staff chi nhánh 1 cố tình tạo đơn cho chi nhánh 2 -> tự động bị ép về chi nhánh 1
        $responseStore = $this->actingAs($staff1, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $branch2->id,
            'customer_name'     => 'Khách Hàng Test',
            'customer_phone'    => '0987654321',
            'device_model_id'   => $device->id,
            'issue_description' => 'Kiểm tra chi nhánh',
            'estimated_price'   => 250000,
        ]);

        $responseStore->assertStatus(201);
        $this->assertEquals($branch1->id, $responseStore->json('data.branch_id'));
    }

    /**
     * Task 1.5: Partner api_config bị ẩn trong response JSON.
     */
    public function test_partner_api_config_is_hidden(): void
    {
        $admin = $this->getAdmin();
        $partner = Partner::create([
            'code'           => 'PARTNER-' . uniqid(),
            'name'           => 'Đối Tác Vận Chuyển Bí Mật',
            'service_type'   => 'delivery',
            'api_config'     => ['secret_api_key' => 'super_secret_token_12345'],
            'status'         => 'active',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/partners/{$partner->id}");
        $response->assertStatus(200);
        $this->assertArrayNotHasKey('api_config', $response->json('data'));
        $this->assertStringNotContainsString('super_secret_token_12345', $response->getContent());
    }

    /**
     * Task 1.6 & 1.7: Cấu hình Sanctum expiration và timezone.
     */
    public function test_sanctum_expiration_and_timezone_configuration(): void
    {
        $this->assertEquals(1440, config('sanctum.expiration'));
        $this->assertEquals('Asia/Ho_Chi_Minh', config('app.timezone'));
    }

    /**
     * Task 2.1: PaymentController phân giải đơn bằng order_code dạng chuỗi.
     */
    public function test_payment_resolves_order_by_order_code_string(): void
    {
        $admin = $this->getAdmin();
        $branch = $this->getBranch('Q1');
        $device = $this->getDeviceModel();
        $customer = $this->getCustomer();

        $orderCode = 'FX26-' . rand(10000, 99999);
        $order = RepairOrder::create([
            'order_code'         => $orderCode,
            'branch_id'          => $branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'issue_description'  => 'Thay pin',
            'status'             => 'inspecting',
            'created_by_user_id' => $admin->id,
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/payments', [
            'order_code'     => $orderCode,
            'amount'         => 350000,
            'payment_method' => 'cash',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.repair_order_id', $order->id);
    }

    /**
     * Task 2.2: WarrantyController từ chối tạo claim cho sổ bảo hành hết hạn (422).
     */
    public function test_create_claim_rejects_expired_warranty(): void
    {
        $admin = $this->getAdmin();
        $branch = $this->getBranch('Q1');
        $device = $this->getDeviceModel();
        $customer = $this->getCustomer();

        $order = RepairOrder::create([
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'branch_id'          => $branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'issue_description'  => 'Đơn bảo hành cũ',
            'status'             => 'completed',
            'created_by_user_id' => $admin->id,
        ]);

        $expiredWarranty = Warranty::create([
            'warranty_code'   => 'WR-EXP-' . uniqid(),
            'repair_order_id' => $order->id,
            'customer_id'     => $customer->id,
            'device_model_id' => $device->id,
            'coverage_item'   => 'Thay loa',
            'start_date'      => Carbon::now()->subDays(100),
            'duration_days'   => 30,
            'end_date'        => Carbon::now()->subDays(70),
            'status'          => 'active',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $expiredWarranty->id,
            'issue_description' => 'Loa lại rè',
            'resolution_mode'   => 'store_check',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    /**
     * Task 2.3: InventoryController chặn xuất âm kho (422) và có lock bi quan.
     */
    public function test_inventory_blocks_negative_stock_export(): void
    {
        $admin = $this->getAdmin();
        $branch = $this->getBranch('Q1');

        $part = Part::create([
            'name'             => 'Pin AirPods Pro 2 Test',
            'sku'              => 'BAT-APP2-' . uniqid(),
            'category'         => 'battery',
            'cost_price'       => 150000,
            'retail_price'     => 350000,
            'storage_location' => 'Kệ A · Tầng 1',
            'stock_quantity'   => 2,
            'unit'             => 'cái',
            'is_active'        => true,
        ]);

        // Xuất 5 cái trong khi chỉ có 2 cái trong kho
        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/inventory/transactions', [
            'part_id'          => $part->id,
            'branch_id'        => $branch->id,
            'transaction_type' => 'export_repair',
            'quantity'         => 5,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->assertEquals(2, $part->fresh()->stock_quantity);
    }

    /**
     * Task 2.4: Bắt buộc QC Pass trước khi chuyển sang ready_for_return.
     */
    public function test_order_transition_requires_qc_pass_for_ready_for_return(): void
    {
        $admin = $this->getAdmin();
        $branch = $this->getBranch('Q1');
        $device = $this->getDeviceModel();
        $customer = $this->getCustomer();

        $order = RepairOrder::create([
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'branch_id'          => $branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'issue_description'  => 'Kiểm tra QC gate',
            'status'             => 'waiting_qc',
            'created_by_user_id' => $admin->id,
        ]);

        // 1. Chuyển sang ready_for_return khi chưa có QC -> 422
        $responseFail = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'ready_for_return',
        ]);
        $responseFail->assertStatus(422)
            ->assertJsonPath('success', false);

        // 2. Tạo QC Pass
        QcInspection::create([
            'repair_order_id' => $order->id,
            'inspector_id'    => $admin->id,
            'result'          => 'pass',
            'notes'           => 'Đạt tiêu chuẩn xuất sắc',
        ]);

        // 3. Chuyển lại -> thành công 200
        $responseSuccess = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'ready_for_return',
        ]);
        $responseSuccess->assertStatus(200)
            ->assertJsonPath('data.status', 'ready_for_return');
    }

    /**
     * Task 2.5: Cho phép chuyển từ rejected quay lại inspecting.
     */
    public function test_fsm_allows_rejected_to_inspecting_transition(): void
    {
        $admin = $this->getAdmin();
        $branch = $this->getBranch('Q1');
        $device = $this->getDeviceModel();
        $customer = $this->getCustomer();

        $order = RepairOrder::create([
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'branch_id'          => $branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'issue_description'  => 'Khách từng từ chối giá',
            'status'             => 'rejected',
            'created_by_user_id' => $admin->id,
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/orders/{$order->id}/transition", [
            'status' => 'inspecting',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'inspecting');
    }

    /**
     * Task 2.6: uploadPhoto và uploadProof hỗ trợ upload file binary thật.
     */
    public function test_upload_photo_and_proof_supports_binary_file(): void
    {
        Storage::fake('public');
        $admin = $this->getAdmin();
        $branch = $this->getBranch('Q1');
        $device = $this->getDeviceModel();
        $customer = $this->getCustomer();

        $order = RepairOrder::create([
            'order_code'         => 'FX26-' . rand(10000, 99999),
            'branch_id'          => $branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $device->id,
            'issue_description'  => 'Test upload file',
            'status'             => 'inspecting',
            'created_by_user_id' => $admin->id,
        ]);

        $file = UploadedFile::fake()->image('airpods_intake.jpg');

        $responsePhoto = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/orders/{$order->id}/photos", [
            'photo'   => $file,
            'caption' => 'Ảnh mặt trước',
        ]);

        $responsePhoto->assertStatus(201)
            ->assertJsonPath('success', true);

        $this->assertNotEmpty($responsePhoto->json('data.photo_url'));

        // Test shipment proof binary upload
        $shipment = Shipment::create([
            'shipment_code'      => 'SH-' . uniqid(),
            'repair_order_id'    => $order->id,
            'delivery_method'    => 'store_pickup',
            'carrier_name'       => 'Tại quầy',
            'status'             => 'pending',
            'created_by_user_id' => $admin->id,
        ]);

        $proofFile = UploadedFile::fake()->image('delivery_receipt.png');

        $responseProof = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/shipments/{$shipment->id}/proofs", [
            'proof'   => $proofFile,
            'caption' => 'Biên nhận đã ký',
        ]);

        $responseProof->assertStatus(201)
            ->assertJsonPath('success', true);

        $this->assertNotEmpty($responseProof->json('data.photo_url'));
    }
}
