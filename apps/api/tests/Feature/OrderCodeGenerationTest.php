<?php

namespace Tests\Feature;

use App\Events\OrderOperationalEvent;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class OrderCodeGenerationTest extends TestCase
{
    use DatabaseTransactions;

    private Tenant $tenant;
    private Branch $branch1;
    private Branch $branch2;
    private User $adminUser;
    private DeviceModel $device;

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake([OrderOperationalEvent::class]);

        $this->tenant = Tenant::create([
            'code'   => 'tenant_code_' . uniqid(),
            'name'   => 'PodsCare Test Code Format',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch1 = Branch::create([
            'tenant_id' => $this->tenant->id,
            'code'      => '1',
            'name'      => 'Chi nhánh Quận 1',
            'phone'     => '0901234561',
            'address'   => '100 Nguyễn Huệ, Q1',
            'is_active' => true,
        ]);

        $this->branch2 = Branch::create([
            'tenant_id' => $this->tenant->id,
            'code'      => '2',
            'name'      => 'Chi nhánh Quận 2',
            'phone'     => '0901234562',
            'address'   => '200 Mai Chí Thọ, Q2',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch1->id,
            'name'      => 'Admin Order Code Test',
            'email'     => 'admin_code_' . uniqid() . '@podscare.vn',
            'password'  => bcrypt('secret123'),
            'role'      => 'admin',
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);
    }

    private function buildOrderPayload(int $branchId, string $phone = '0987654321'): array
    {
        return [
            'branch_id'            => $branchId,
            'customer_phone'       => $phone,
            'customer_name'        => 'Khách Hàng Test Code',
            'device_model_id'      => $this->device->id,
            'issue_description'    => 'Lỗi sạc dock tai nghe',
            'estimated_price'      => 350000,
            'warranty_terms_days'  => 90,
            'status'               => 'waiting_tech',
        ];
    }

    /**
     * Test 1.2: POST /api/v1/orders tạo đơn mới trả về mã dạng PC{branch_code}{DDMMYY}{STT} (ví dụ PC112102601).
     */
    public function test_store_order_generates_pc_order_code_format(): void
    {
        $payload = $this->buildOrderPayload($this->branch1->id);

        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/orders', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('success', true);

        $orderCode = $response->json('data.order_code');
        $expectedPrefix = 'PC1' . date('dmy');
        $expectedOrderCode = "{$expectedPrefix}01";

        $this->assertSame($expectedOrderCode, $orderCode);
        $this->assertDatabaseHas('repair_orders', [
            'id'         => $response->json('data.id'),
            'order_code' => $expectedOrderCode,
            'branch_id'  => $this->branch1->id,
        ]);
    }

    /**
     * Test tăng STT tuần tự khi tạo nhiều đơn liên tiếp trong cùng một ngày tại một chi nhánh.
     */
    public function test_store_consecutive_orders_increments_stt(): void
    {
        $payload1 = $this->buildOrderPayload($this->branch1->id, '0981111111');
        $response1 = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/orders', $payload1);
        $response1->assertStatus(201);
        $code1 = $response1->json('data.order_code');

        $payload2 = $this->buildOrderPayload($this->branch1->id, '0982222222');
        $response2 = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/orders', $payload2);
        $response2->assertStatus(201);
        $code2 = $response2->json('data.order_code');

        $payload3 = $this->buildOrderPayload($this->branch1->id, '0983333333');
        $response3 = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/orders', $payload3);
        $response3->assertStatus(201);
        $code3 = $response3->json('data.order_code');

        $prefix = 'PC1' . date('dmy');
        $this->assertSame("{$prefix}01", $code1);
        $this->assertSame("{$prefix}02", $code2);
        $this->assertSame("{$prefix}03", $code3);
    }

    /**
     * Test 1.3: Reset STT về 01 khi sang ngày mới cho cùng chi nhánh.
     */
    public function test_order_code_resets_sequence_on_new_day(): void
    {
        $customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hôm Qua',
            'phone'     => '0977' . random_int(100000, 999999),
        ]);

        // Giả lập đơn hàng của ngày hôm trước (yesterday) với STT 08
        $yesterdayDmy = Carbon::yesterday()->format('dmy');
        RepairOrder::create([
            'order_code'         => "PC1{$yesterdayDmy}08",
            'branch_id'          => $this->branch1->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $this->device->id,
            'issue_description'  => 'Đơn hôm qua',
            'status'             => 'completed',
            'total_price'        => 500000,
            'created_by_user_id' => $this->adminUser->id,
            'created_at'         => Carbon::yesterday(),
        ]);

        // Tạo đơn hàng ngày hôm nay qua API
        $payload = $this->buildOrderPayload($this->branch1->id);
        $response = $this->actingAs($this->adminUser, 'sanctum')->postJson('/api/v1/orders', $payload);

        $response->assertStatus(201);
        $codeToday = $response->json('data.order_code');

        // STT ngày hôm nay phải bắt đầu lại từ 01
        $todayPrefix = 'PC1' . date('dmy');
        $this->assertSame("{$todayPrefix}01", $codeToday);
    }

    /**
     * Test 1.3: STT độc lập giữa các chi nhánh khác nhau trong cùng một ngày.
     */
    public function test_order_code_sequence_is_independent_per_branch(): void
    {
        // Chi nhánh 1 tạo 2 đơn
        $resBranch1_1 = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/orders', $this->buildOrderPayload($this->branch1->id, '0911000001'));
        $resBranch1_1->assertStatus(201);

        $resBranch1_2 = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/orders', $this->buildOrderPayload($this->branch1->id, '0911000002'));
        $resBranch1_2->assertStatus(201);

        $dmy = date('dmy');
        $this->assertSame("PC1{$dmy}01", $resBranch1_1->json('data.order_code'));
        $this->assertSame("PC1{$dmy}02", $resBranch1_2->json('data.order_code'));

        // Chi nhánh 2 tạo đơn đầu tiên của ngày hôm đó
        $resBranch2_1 = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/orders', $this->buildOrderPayload($this->branch2->id, '0922000001'));
        $resBranch2_1->assertStatus(201);

        // Chi nhánh 2 phải có mã bắt đầu bằng PC2 và STT là 01
        $this->assertSame("PC2{$dmy}01", $resBranch2_1->json('data.order_code'));
    }

    /**
     * Test tra cứu đơn hàng hỗ trợ song song cả mã định dạng mới PC... và mã cũ FX...
     */
    public function test_dual_lookup_and_tracking_supports_both_pc_and_fx(): void
    {
        // 1. Tạo đơn mới PC...
        $resNew = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/orders', $this->buildOrderPayload($this->branch1->id, '0966112233'));
        $resNew->assertStatus(201);
        $newOrderCode = $resNew->json('data.order_code');

        // Tra cứu đơn mới qua OrderController@show bằng order_code
        $showNewRes = $this->actingAs($this->adminUser, 'sanctum')->getJson("/api/v1/orders/{$newOrderCode}");
        $showNewRes->assertStatus(200)
            ->assertJsonPath('data.order_code', $newOrderCode);

        // Tra cứu công khai đơn mới qua TrackingController@track
        $trackNewRes = $this->getJson("/api/v1/tracking/{$newOrderCode}?phone=0966112233");
        $trackNewRes->assertStatus(200)
            ->assertJsonPath('data.order.order_code', $newOrderCode);

        // 2. Tạo đơn cũ dạng FX... trong DB
        $customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Đơn Cũ FX',
            'phone'     => '0966445566',
        ]);
        $legacyOrderCode = 'FX26-88888';
        $legacyOrder = RepairOrder::create([
            'order_code'         => $legacyOrderCode,
            'branch_id'          => $this->branch1->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $this->device->id,
            'issue_description'  => 'Đơn cũ kiểm tra tương thích ngược',
            'status'             => 'inspecting',
            'total_price'        => 400000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        // Tra cứu đơn cũ qua OrderController@show
        $showOldRes = $this->actingAs($this->adminUser, 'sanctum')->getJson("/api/v1/orders/{$legacyOrderCode}");
        $showOldRes->assertStatus(200)
            ->assertJsonPath('data.order_code', $legacyOrderCode);

        // Tra cứu công khai đơn cũ qua TrackingController@track
        $trackOldRes = $this->getJson("/api/v1/tracking/{$legacyOrderCode}?phone=0966445566");
        $trackOldRes->assertStatus(200)
            ->assertJsonPath('data.order.order_code', $legacyOrderCode);
    }
}
