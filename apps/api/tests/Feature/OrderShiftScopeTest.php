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
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrderShiftScopeTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $techUser;
    protected User $receptionistUser;
    protected string $tz;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tz = config('app.timezone', 'Asia/Ho_Chi_Minh');

        $this->tenant = Tenant::create([
            'code'   => 'tenant_test_' . uniqid(),
            'name'   => 'Tiệm Sửa Chữa Test Shift Scope',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Q1',
            'code'      => 'Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Test',
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
            'name'      => 'Admin User',
            'email'     => 'admin_' . uniqid() . '@example.com',
            'password'  => Hash::make('secret123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->techUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Technician User',
            'email'     => 'tech_' . uniqid() . '@example.com',
            'password'  => Hash::make('secret123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->receptionistUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'CSKH User',
            'email'     => 'cskh_' . uniqid() . '@example.com',
            'password'  => Hash::make('secret123'),
            'role'      => 'receptionist',
            'is_active' => true,
        ]);
    }

    protected function createOrder(string $status, Carbon $createdAt, array $extra = []): RepairOrder
    {
        $code = 'FX' . date('y') . '-' . rand(10000, 99999);
        $order = RepairOrder::create(array_merge([
            'tenant_id'           => $this->tenant->id,
            'order_code'          => $code,
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->device->id,
            'issue_description'   => 'Lỗi âm thanh test shift scope',
            'status'              => $status,
            'total_price'         => 350000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $this->receptionistUser->id,
        ], $extra));

        RepairOrder::where('id', $order->id)->update([
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ]);

        return $order->fresh();
    }

    /**
     * Test 1: date_filter = 'today' CHỈ trả về đơn tạo hôm nay, ẩn toàn bộ đơn cũ (kể cả đơn dở dang từ hôm trước).
     */
    public function test_today_filter_returns_only_today_orders_and_hides_all_past_orders(): void
    {
        $now = Carbon::now($this->tz);

        // 1. Đơn tạo hôm nay (bất kể trạng thái: completed hay in_repair)
        $todayCompleted = $this->createOrder('completed', $now->copy()->subHours(2));
        $todayInRepair = $this->createOrder('in_repair', $now->copy()->subMinutes(30));

        // 2. Đơn tạo hôm qua và các ngày trước nhưng chưa xong (in_repair)
        $yesterdayUnfinished = $this->createOrder('in_repair', Carbon::yesterday($this->tz)->hour(14));
        $pastUnfinished = $this->createOrder('in_repair', $now->copy()->subDays(3));

        // 3. Đơn cũ đã hoàn thành / hủy
        $yesterdayCompleted = $this->createOrder('completed', Carbon::yesterday($this->tz)->hour(10));
        $pastCancelled = $this->createOrder('cancelled', $now->copy()->subDays(2));

        $res = $this->actingAs($this->adminUser)
            ->getJson("/api/v1/orders?date_filter=today&branch_id={$this->branch->id}");

        $res->assertOk();
        $orderCodes = collect($res->json('data.data'))->pluck('order_code')->all();

        // Chỉ chứa đơn hôm nay
        $this->assertContains($todayCompleted->order_code, $orderCodes);
        $this->assertContains($todayInRepair->order_code, $orderCodes);

        // Tuyệt đối không chứa bất kỳ đơn nào từ quá khứ, dù dở dang hay đã xong
        $this->assertNotContains($yesterdayUnfinished->order_code, $orderCodes, 'Strict Today must hide yesterday unfinished orders');
        $this->assertNotContains($pastUnfinished->order_code, $orderCodes, 'Strict Today must hide past unfinished orders');
        $this->assertNotContains($yesterdayCompleted->order_code, $orderCodes);
        $this->assertNotContains($pastCancelled->order_code, $orderCodes);
    }

    /**
     * Test 2: Đơn cũ dở dang có thể truy xuất qua bộ lọc 7_days hoặc all.
     */
    public function test_past_unfinished_orders_are_viewable_via_7_days_or_all_filters(): void
    {
        $now = Carbon::now($this->tz);

        $pastUnfinished = $this->createOrder('in_repair', $now->copy()->subDays(3));

        // 1. Truy vấn 7_days => Chứa đơn 3 ngày trước
        $res7Days = $this->actingAs($this->adminUser)
            ->getJson("/api/v1/orders?date_filter=7_days&branch_id={$this->branch->id}");
        $res7Days->assertOk();
        $codes7Days = collect($res7Days->json('data.data'))->pluck('order_code')->all();
        $this->assertContains($pastUnfinished->order_code, $codes7Days);

        // 2. Truy vấn all => Chứa đơn 3 ngày trước
        $resAll = $this->actingAs($this->adminUser)
            ->getJson("/api/v1/orders?date_filter=all&branch_id={$this->branch->id}");
        $resAll->assertOk();
        $codesAll = collect($resAll->json('data.data'))->pluck('order_code')->all();
        $this->assertContains($pastUnfinished->order_code, $codesAll);
    }

    /**
     * Test 3: Technician request date_filter = 'all' hoặc '30_days' bị ép cứng giới hạn tối đa 7 ngày.
     */
    public function test_technician_is_strictly_clamped_to_7_days_even_if_requesting_all(): void
    {
        $now = Carbon::now($this->tz);

        // Đơn 5 ngày trước (trong vòng 7 ngày)
        $order5DaysAgo = $this->createOrder('completed', $now->copy()->subDays(5));
        // Đơn 10 ngày trước (ngoài 7 ngày)
        $order10DaysAgo = $this->createOrder('completed', $now->copy()->subDays(10));
        // Đơn 40 ngày trước (ngoài 30 ngày)
        $order40DaysAgo = $this->createOrder('completed', $now->copy()->subDays(40));

        // Kỹ thuật viên yêu cầu 'all'
        $resAll = $this->actingAs($this->techUser)
            ->getJson("/api/v1/orders?date_filter=all");

        $resAll->assertOk();
        $codesAll = collect($resAll->json('data.data'))->pluck('order_code')->all();

        $this->assertContains($order5DaysAgo->order_code, $codesAll);
        $this->assertNotContains($order10DaysAgo->order_code, $codesAll, 'Technician cannot see orders older than 7 days when requesting date_filter=all');
        $this->assertNotContains($order40DaysAgo->order_code, $codesAll);

        // Kỹ thuật viên yêu cầu '30_days'
        $res30 = $this->actingAs($this->techUser)
            ->getJson("/api/v1/orders?date_filter=30_days");

        $res30->assertOk();
        $codes30 = collect($res30->json('data.data'))->pluck('order_code')->all();

        $this->assertContains($order5DaysAgo->order_code, $codes30);
        $this->assertNotContains($order10DaysAgo->order_code, $codes30, 'Technician cannot see orders older than 7 days when requesting date_filter=30_days');
    }

    /**
     * Test 4: Admin request date_filter = 'all' xem được toàn bộ lịch sử (kể cả đơn hoàn thành 2 tháng trước).
     */
    public function test_admin_can_view_full_history_when_requesting_all(): void
    {
        $now = Carbon::now($this->tz);

        // Đơn 60 ngày trước (2 tháng) đã hoàn thành
        $order60DaysAgo = $this->createOrder('completed', $now->copy()->subDays(60));

        $res = $this->actingAs($this->adminUser)
            ->getJson("/api/v1/orders?date_filter=all&branch_id={$this->branch->id}");

        $res->assertOk();
        $codes = collect($res->json('data.data'))->pluck('order_code')->all();

        $this->assertContains($order60DaysAgo->order_code, $codes, 'Admin should be able to view orders from 60 days ago with date_filter=all');
    }

    /**
     * Test 5: date_filter = 'yesterday' và '7_days' lọc chính xác theo mốc thời gian.
     */
    public function test_yesterday_and_7_days_filter_correctly(): void
    {
        $now = Carbon::now($this->tz);

        $orderYesterday = $this->createOrder('in_repair', Carbon::yesterday($this->tz)->hour(14));
        $orderToday = $this->createOrder('in_repair', $now->copy()->subMinutes(10));
        $order4DaysAgo = $this->createOrder('in_repair', $now->copy()->subDays(4));
        $order15DaysAgo = $this->createOrder('in_repair', $now->copy()->subDays(15));

        // 1. Kiểm tra 'yesterday'
        $resYesterday = $this->actingAs($this->adminUser)
            ->getJson("/api/v1/orders?date_filter=yesterday&branch_id={$this->branch->id}");

        $resYesterday->assertOk();
        $codesYesterday = collect($resYesterday->json('data.data'))->pluck('order_code')->all();

        $this->assertContains($orderYesterday->order_code, $codesYesterday);
        $this->assertNotContains($orderToday->order_code, $codesYesterday);
        $this->assertNotContains($order4DaysAgo->order_code, $codesYesterday);

        // 2. Kiểm tra '7_days'
        $res7Days = $this->actingAs($this->adminUser)
            ->getJson("/api/v1/orders?date_filter=7_days&branch_id={$this->branch->id}");

        $res7Days->assertOk();
        $codes7Days = collect($res7Days->json('data.data'))->pluck('order_code')->all();

        $this->assertContains($orderToday->order_code, $codes7Days);
        $this->assertContains($orderYesterday->order_code, $codes7Days);
        $this->assertContains($order4DaysAgo->order_code, $codes7Days);
        $this->assertNotContains($order15DaysAgo->order_code, $codes7Days);
    }
}
