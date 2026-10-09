<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrderTestNoteAndTechScopeTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $cskhUser;
    protected User $techUser;
    protected User $adminUser;
    protected string $tz;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tz = config('app.timezone', 'Asia/Ho_Chi_Minh');

        $this->tenant = Tenant::create([
            'code'   => 'tenant_test_' . uniqid(),
            'name'   => 'PodsCare Test Note & Tech Scope Test',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Q1 Test',
            'code'      => 'Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Test Note',
            'phone'     => '091' . rand(1000000, 9999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'A2931',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Quản Lý',
            'email'     => 'admin_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'CSKH Quầy Tiếp Nhận',
            'email'     => 'cskh_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Kỹ Thuật Viên Sửa Máy',
            'email'     => 'tech_' . uniqid() . '@podscare.vn',
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);
    }

    /**
     * Test 1: Tạo đơn sửa chữa lưu test_note thành công vào CSDL.
     */
    public function test_create_order_persists_test_note_successfully(): void
    {
        $token = $this->cskhUser->createToken('cskh_token')->plainTextToken;
        $noteContent = 'Tai trái rè bass khi bật ANC, pin case tụt nhanh từ 80% về 20% trong 15 phút.';

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/orders', [
                'branch_id'           => $this->branch->id,
                'customer_id'         => $this->customer->id,
                'device_model_id'     => $this->device->id,
                'serial_number'       => 'AP2-TEST-001',
                'issue_description'   => 'Lỗi pin và âm thanh tai nghe',
                'appearance_notes'    => 'Trầy xước nhẹ vỏ hộp sạc',
                'test_note'           => $noteContent,
                'estimated_price'     => 350000,
                'warranty_terms_days' => 90,
                'order_type'          => 'in_store',
            ]);

        $response->assertSuccessful();

        $orderData = $response->json('data');
        $this->assertNotNull($orderData);
        $this->assertEquals($noteContent, $orderData['test_note']);

        $this->assertDatabaseHas('repair_orders', [
            'id'        => $orderData['id'],
            'test_note' => $noteContent,
        ]);
    }

    /**
     * Test 2: Cập nhật test_note trên đơn sửa chữa thành công.
     */
    public function test_update_order_allows_updating_test_note(): void
    {
        $order = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-NOTE-' . rand(1000, 9999),
            'issue_description'  => 'Kiểm tra máy',
            'test_note'          => 'Ghi chú ban đầu',
            'estimated_price'    => 200000,
            'total_price'        => 200000,
            'status'             => 'waiting_tech',
            'order_type'         => 'in_store',
            'created_by_user_id' => $this->cskhUser->id,
        ]);

        $token = $this->adminUser->createToken('admin_token')->plainTextToken;
        $updatedNote = 'Ghi chú test quầy cập nhật: Đã test lại bằng Bluetooth 5.3, mic bên phải bắt sóng yếu.';

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson("/api/v1/orders/{$order->id}", [
                'test_note' => $updatedNote,
            ]);

        $response->assertSuccessful();

        $order->refresh();
        $this->assertEquals($updatedNote, $order->test_note);
    }

    /**
     * Test 3: Kỹ thuật viên xem ca hôm nay (today) tự động gom các đơn dở dang từ 3 ngày gần nhất (hôm nay, hôm qua, hôm kia).
     */
    public function test_technician_today_filter_automatically_includes_unfinished_orders_from_last_3_days(): void
    {
        // 1. Đơn hôm nay (đang sửa)
        $todayOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-TDY-' . rand(1000, 9999),
            'issue_description'  => 'Đơn hôm nay',
            'estimated_price'    => 150000,
            'status'             => 'in_repair',
            'created_by_user_id' => $this->cskhUser->id,
        ]);

        // 2. Đơn hôm qua DỞ DANG (waiting_parts)
        $yesterdayUnfinishedOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-YUN-' . rand(1000, 9999),
            'issue_description'  => 'Đơn hôm qua chờ linh kiện',
            'estimated_price'    => 250000,
            'status'             => 'waiting_parts',
            'created_by_user_id' => $this->cskhUser->id,
        ]);
        DB::table('repair_orders')->where('id', $yesterdayUnfinishedOrder->id)->update([
            'created_at' => Carbon::today($this->tz)->subDay()->addHours(3),
        ]);

        // 3. Đơn hôm kia DỞ DANG (assigned)
        $dayBeforeUnfinishedOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-DUN-' . rand(1000, 9999),
            'issue_description'  => 'Đơn hôm kia thợ đã nhận',
            'estimated_price'    => 350000,
            'status'             => 'assigned',
            'created_by_user_id' => $this->cskhUser->id,
        ]);
        DB::table('repair_orders')->where('id', $dayBeforeUnfinishedOrder->id)->update([
            'created_at' => Carbon::today($this->tz)->subDays(2)->addHours(2),
        ]);

        // 4. Đơn hôm qua ĐÃ HOÀN TẤT (completed) -> không nằm trong scope dở dang hôm nay của thợ
        $yesterdayCompletedOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-YCP-' . rand(1000, 9999),
            'issue_description'  => 'Đơn hôm qua đã sửa xong',
            'estimated_price'    => 200000,
            'status'             => 'completed',
            'created_by_user_id' => $this->cskhUser->id,
        ]);
        DB::table('repair_orders')->where('id', $yesterdayCompletedOrder->id)->update([
            'created_at' => Carbon::today($this->tz)->subDay()->addHours(1),
        ]);

        // 5. Đơn dở dang quá cũ (5 ngày trước) -> không gom vào ca 3 ngày
        $tooOldOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-OLD-' . rand(1000, 9999),
            'issue_description'  => 'Đơn 5 ngày trước',
            'estimated_price'    => 400000,
            'status'             => 'waiting_tech',
            'created_by_user_id' => $this->cskhUser->id,
        ]);
        DB::table('repair_orders')->where('id', $tooOldOrder->id)->update([
            'created_at' => Carbon::today($this->tz)->subDays(5),
        ]);

        $techToken = $this->techUser->createToken('tech_token')->plainTextToken;

        // Kỹ thuật viên xem ca hôm nay: GET /api/v1/orders?date_filter=today
        $response = $this->withHeader('Authorization', "Bearer {$techToken}")
            ->getJson('/api/v1/orders?date_filter=today&per_page=100');

        $response->assertSuccessful();

        $returnedCodes = collect($response->json('data.data'))->pluck('order_code')->toArray();

        // Thợ thấy: Đơn hôm nay, đơn dở dang hôm qua, đơn dở dang hôm kia
        $this->assertContains($todayOrder->order_code, $returnedCodes);
        $this->assertContains($yesterdayUnfinishedOrder->order_code, $returnedCodes);
        $this->assertContains($dayBeforeUnfinishedOrder->order_code, $returnedCodes);

        // Thợ KHÔNG thấy: Đơn hôm qua đã hoàn tất, đơn quá 3 ngày
        $this->assertNotContains($yesterdayCompletedOrder->order_code, $returnedCodes);
        $this->assertNotContains($tooOldOrder->order_code, $returnedCodes);
    }

    /**
     * Test 4: Lọc theo 3_days lấy toàn bộ các đơn trong 3 ngày gần nhất.
     */
    public function test_technician_3_days_filter_fetches_all_orders_within_3_days(): void
    {
        $orderIn3Days = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-3D1-' . rand(1000, 9999),
            'issue_description'  => 'Đơn trong vòng 3 ngày',
            'estimated_price'    => 180000,
            'status'             => 'waiting_tech',
            'created_by_user_id' => $this->cskhUser->id,
        ]);
        DB::table('repair_orders')->where('id', $orderIn3Days->id)->update([
            'created_at' => Carbon::today($this->tz)->subDays(2)->addHours(6),
        ]);

        $techToken = $this->techUser->createToken('tech_token')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$techToken}")
            ->getJson('/api/v1/orders?date_filter=3_days&per_page=100');

        $response->assertSuccessful();

        $returnedCodes = collect($response->json('data.data'))->pluck('order_code')->toArray();
        $this->assertContains($orderIn3Days->order_code, $returnedCodes);
    }
}
