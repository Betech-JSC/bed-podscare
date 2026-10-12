<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Part;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminOperationalCenterTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $technician;
    protected string $tz;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tz = config('app.timezone', 'Asia/Ho_Chi_Minh');

        $this->tenant = Tenant::create([
            'code'   => 'tenant_op_center_' . uniqid(),
            'name'   => 'PodsCare Operational Center Test Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Vận Hành ' . uniqid(),
            'code'      => 'BR_OP_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 CMT8, Quận 10',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Nguyễn Văn Test',
            'phone'     => '0988' . rand(100000, 999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'         => 'AirPods Pro 2',
            'category'     => 'AirPods',
            'model_code'   => 'A2931',
            'manufacturer' => 'Apple',
            'is_active'    => true,
        ]);

        $this->technician = User::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Tuấn Kiệt',
            'email'     => 'tech_op_' . uniqid() . '@podscare.vn',
            'phone'     => '0909' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'technician',
        ]);

        $this->adminUser = User::create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Vận Hành',
            'email'     => 'admin_op_' . uniqid() . '@podscare.vn',
            'phone'     => '0908' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'admin',
        ]);
    }

    private function createOrder(array $attributes = []): RepairOrder
    {
        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create(array_merge([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => "PC{$year}-OP{$randomNum}",
            'issue_description'  => 'Kiểm tra trung tâm điều hành vận hành',
            'status'             => 'inspecting',
            'order_type'         => 'in_store',
            'total_price'        => 500000,
            'initial_price'      => 500000,
            'warranty_terms_days'=> 90,
            'created_by_user_id' => $this->adminUser->id,
            'technician_id'      => $this->technician->id,
            'created_at'         => Carbon::now($this->tz),
        ], $attributes));
    }

    /**
     * Case 1: Kiểm tra operational_summary tính đúng 4 thẻ điều hành
     */
    public function test_operational_summary_calculates_correct_counts(): void
    {
        // 1. Đơn đang sửa bình thường (active)
        $this->createOrder([
            'status'     => 'in_repair',
            'created_at' => Carbon::now($this->tz)->subHours(2),
        ]);

        // 2. Đơn chờ nhận máy (waiting_pickup)
        $this->createOrder([
            'status'     => 'waiting_pickup',
            'created_at' => Carbon::now($this->tz)->subHours(5),
        ]);

        // 3. Đơn sẵn sàng trả máy (ready_for_return)
        $this->createOrder([
            'status'     => 'ready_for_return',
            'created_at' => Carbon::now($this->tz)->subHours(3),
        ]);

        // 4. Đơn chờ linh kiện trực tiếp (waiting_parts)
        $this->createOrder([
            'status'     => 'waiting_parts',
            'created_at' => Carbon::now($this->tz)->subHours(6),
        ]);

        // 5. Đơn có special_parts_status = 'pending'
        $this->createOrder([
            'status'               => 'in_repair',
            'special_parts_status' => 'pending',
            'created_at'           => Carbon::now($this->tz)->subHours(4),
        ]);

        // 6. Đơn quá hạn cam kết (>24h)
        $overdue = $this->createOrder([
            'status' => 'in_repair',
        ]);
        \Illuminate\Support\Facades\DB::table('repair_orders')
            ->where('id', $overdue->id)
            ->update(['created_at' => Carbon::now($this->tz)->subHours(30)]);

        // 7. Đơn hoàn tất (completed - không tính vào active/overdue/parts)
        $this->createOrder([
            'status'         => 'completed',
            'handed_over_at' => Carbon::now($this->tz),
            'created_at'     => Carbon::now($this->tz)->subHours(40),
        ]);

        // 8. Đơn đã hủy (cancelled - không tính vào active/overdue/parts)
        $this->createOrder([
            'status'     => 'cancelled',
            'created_at' => Carbon::now($this->tz)->subHours(35),
        ]);

        // 9. Đơn từ chối (rejected - không tính vào active/overdue/parts)
        $this->createOrder([
            'status'     => 'rejected',
            'created_at' => Carbon::now($this->tz)->subHours(32),
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}");

        $response->assertStatus(200)->assertJsonPath('success', true);
        $data = $response->json('data');

        $this->assertArrayHasKey('operational_summary', $data);
        $op = $data['operational_summary'];

        // active_orders: 6 đơn (in_repair, waiting_pickup, ready_for_return, waiting_parts, in_repair special, in_repair overdue)
        $this->assertEquals(6, $op['active_orders']);

        // waiting_pickup_orders: 2 đơn (waiting_pickup, ready_for_return)
        $this->assertEquals(2, $op['waiting_pickup_orders']);

        // waiting_parts_orders: 2 đơn (waiting_parts + special_parts_status = pending)
        $this->assertEquals(2, $op['waiting_parts_orders']);

        // overdue_orders: 1 đơn (>24h)
        $this->assertEquals(1, $op['overdue_orders']);
    }

    /**
     * Case 2: Kiểm tra actionable_tasks trả về đúng 5 nhóm công việc khẩn và linh kiện tồn thấp
     */
    public function test_actionable_tasks_returns_all_urgent_task_groups(): void
    {
        // 1. Đơn quá hạn >24h
        $overdueOrder = $this->createOrder([
            'status'            => 'in_repair',
            'issue_description' => 'Pin chai nặng cần thay cell',
        ]);
        \Illuminate\Support\Facades\DB::table('repair_orders')
            ->where('id', $overdueOrder->id)
            ->update(['created_at' => Carbon::now($this->tz)->subHours(28)]);

        // 2. Đơn chờ duyệt giá
        $waitingApprovalOrder = $this->createOrder([
            'status'            => 'waiting_approval',
            'total_price'       => 750000,
            'issue_description' => 'Mất nguồn, cần báo giá IC',
            'created_at'        => Carbon::now($this->tz)->subHours(5),
        ]);

        // 3. Đơn chờ kiểm định QC
        $waitingQcOrder = $this->createOrder([
            'status'              => 'waiting_qc',
            'repair_completed_at' => Carbon::now($this->tz)->subHours(2),
            'issue_description'   => 'Đã thay loa ngoài, chờ test âm thanh',
        ]);

        // 4. Đơn chờ khách nhận
        $waitingPickupOrder = $this->createOrder([
            'status'            => 'waiting_pickup',
            'total_price'       => 1200000,
            'issue_description' => 'Vệ sinh tai nghe hoàn tất',
        ]);

        // 5. Linh kiện sắp hết tồn kho
        $lowPart = Part::create([
            'tenant_id'        => $this->tenant->id,
            'sku'              => 'PART-LOW-' . uniqid(),
            'name'             => 'Pin tai nghe AirPods 2 (A1602)',
            'category'         => 'Pin',
            'storage_location' => 'Kệ A-01',
            'stock_quantity'   => 2,
            'min_stock_alert'  => 5,
            'unit'             => 'viên',
            'is_active'        => true,
        ]);

        // Linh kiện tồn đủ (không được trả về)
        Part::create([
            'tenant_id'        => $this->tenant->id,
            'sku'              => 'PART-HIGH-' . uniqid(),
            'name'             => 'Vỏ hộp sạc AirPods Pro',
            'category'         => 'Vỏ',
            'storage_location' => 'Kệ B-02',
            'stock_quantity'   => 15,
            'min_stock_alert'  => 5,
            'unit'             => 'hộp',
            'is_active'        => true,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}");

        $response->assertStatus(200);
        $tasks = $response->json('data.actionable_tasks');

        $this->assertNotNull($tasks);
        $this->assertArrayHasKey('overdue', $tasks);
        $this->assertArrayHasKey('waiting_approval', $tasks);
        $this->assertArrayHasKey('waiting_qc', $tasks);
        $this->assertArrayHasKey('waiting_pickup', $tasks);
        $this->assertArrayHasKey('low_stock_parts', $tasks);

        // Kiểm tra chi tiết đơn quá hạn
        $this->assertNotEmpty($tasks['overdue']);
        $firstOverdue = collect($tasks['overdue'])->firstWhere('id', $overdueOrder->id);
        $this->assertNotNull($firstOverdue);
        $this->assertEquals($overdueOrder->order_code, $firstOverdue['order_code']);
        $this->assertEquals($this->customer->name, $firstOverdue['customer_name']);
        $this->assertEquals($this->technician->name, $firstOverdue['technician_name']);
        $this->assertGreaterThanOrEqual(27, $firstOverdue['hours_overdue']);

        // Kiểm tra đơn chờ duyệt giá
        $firstQuote = collect($tasks['waiting_approval'])->firstWhere('id', $waitingApprovalOrder->id);
        $this->assertNotNull($firstQuote);
        $this->assertEquals($this->customer->phone, $firstQuote['customer_phone']);
        $this->assertEquals(750000, $firstQuote['total_price']);

        // Kiểm tra đơn chờ QC
        $firstQc = collect($tasks['waiting_qc'])->firstWhere('id', $waitingQcOrder->id);
        $this->assertNotNull($firstQc);
        $this->assertEquals($this->technician->name, $firstQc['technician_name']);

        // Kiểm tra đơn chờ khách nhận
        $firstPickup = collect($tasks['waiting_pickup'])->firstWhere('id', $waitingPickupOrder->id);
        $this->assertNotNull($firstPickup);
        $this->assertEquals(1200000, $firstPickup['total_price']);
        $this->assertEquals($this->customer->phone, $firstPickup['customer_phone']);

        // Kiểm tra linh kiện tồn thấp
        $this->assertNotEmpty($tasks['low_stock_parts']);
        $foundPart = collect($tasks['low_stock_parts'])->firstWhere('id', $lowPart->id);
        $this->assertNotNull($foundPart);
        $this->assertEquals(2, $foundPart['stock_quantity']);
        $this->assertEquals(5, $foundPart['min_stock_alert']);
    }

    /**
     * Case 3: Kiểm tra bộ lọc branch_id hoạt động chính xác
     */
    public function test_branch_isolation_filters_orders_correctly(): void
    {
        $otherBranch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Khác ' . uniqid(),
            'code'      => 'BR_OTHER_' . uniqid(),
            'phone'     => '0909998877',
            'address'   => '789 Phan Đăng Lưu',
            'is_active' => true,
        ]);

        // Đơn thuộc branch hiện hành
        $this->createOrder([
            'branch_id' => $this->branch->id,
            'status'    => 'waiting_pickup',
        ]);

        // Đơn thuộc branch khác
        $this->createOrder([
            'branch_id' => $otherBranch->id,
            'status'    => 'waiting_pickup',
        ]);

        // Lọc theo branch hiện hành
        $resBranch = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$this->branch->id}");

        $resBranch->assertStatus(200);
        $this->assertEquals(1, $resBranch->json('data.operational_summary.waiting_pickup_orders'));

        // Lọc theo branch khác
        $resOther = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/kpi/dashboard?branch_id={$otherBranch->id}");

        $resOther->assertStatus(200);
        $this->assertEquals(1, $resOther->json('data.operational_summary.waiting_pickup_orders'));
    }

    /**
     * Case 4: Kiểm tra Tenant Isolation cho cả đơn hàng và kho linh kiện tồn thấp
     */
    public function test_tenant_isolation_prevents_cross_tenant_leakage(): void
    {
        $otherTenant = Tenant::create([
            'code'   => 'tenant_isolated_' . uniqid(),
            'name'   => 'Other Tenant Isolated',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $otherBranch = Branch::create([
            'tenant_id' => $otherTenant->id,
            'name'      => 'Chi nhánh Tenant Khác',
            'code'      => 'BR_ISO_' . uniqid(),
            'phone'     => '0900000000',
            'address'   => 'Hà Nội',
            'is_active' => true,
        ]);

        $otherCustomer = Customer::create([
            'tenant_id' => $otherTenant->id,
            'name'      => 'Khách của Tenant Khác',
            'phone'     => '0901000000',
        ]);

        $otherUser = User::create([
            'tenant_id' => $otherTenant->id,
            'branch_id' => $otherBranch->id,
            'name'      => 'Other User',
            'email'     => 'other_user_' . uniqid() . '@other.vn',
            'phone'     => '0901239999',
            'password'  => Hash::make('Secret123!'),
            'role'      => 'admin',
        ]);

        // Tạo đơn hàng thuộc tenant khác
        $otherOrder = RepairOrder::create([
            'tenant_id'          => $otherTenant->id,
            'branch_id'          => $otherBranch->id,
            'customer_id'        => $otherCustomer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => "PC-OTHER-" . uniqid(),
            'issue_description'  => 'Đơn của tenant khác không được xuất hiện',
            'status'             => 'in_repair',
            'created_by_user_id' => $otherUser->id,
            'total_price'        => 999999,
        ]);
        \Illuminate\Support\Facades\DB::table('repair_orders')
            ->where('id', $otherOrder->id)
            ->update(['created_at' => Carbon::now($this->tz)->subHours(30)]);

        // Tạo linh kiện tồn thấp thuộc tenant khác
        $otherPart = Part::create([
            'tenant_id'        => $otherTenant->id,
            'sku'              => 'PART-ISO-' . uniqid(),
            'name'             => 'Linh kiện của Tenant khác',
            'category'         => 'Khác',
            'storage_location' => 'Kho X',
            'stock_quantity'   => 1,
            'min_stock_alert'  => 10,
            'unit'             => 'cái',
            'is_active'        => true,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/kpi/dashboard');

        $response->assertStatus(200);
        $tasks = $response->json('data.actionable_tasks');

        // Kiểm tra không xuất hiện đơn của tenant khác trong overdue
        $foundOverdue = collect($tasks['overdue'])->firstWhere('id', $otherOrder->id);
        $this->assertNull($foundOverdue);

        // Kiểm tra không xuất hiện linh kiện của tenant khác trong low_stock_parts
        $foundPart = collect($tasks['low_stock_parts'])->firstWhere('id', $otherPart->id);
        $this->assertNull($foundPart);
    }
}
