<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CheckoutPriceEditAndTech3DayTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $cskhUser;
    protected User $techUser;
    protected string $tz;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tz = config('app.timezone', 'Asia/Ho_Chi_Minh');

        $this->tenant = Tenant::create([
            'code'   => 'tenant_test_' . uniqid(),
            'name'   => 'PodsCare Price Edit & Tech Scope Test',
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

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'CSKH Quầy Thu Tiền',
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
     * Test 1: PaymentController cập nhật total_price của đơn hàng khi truyền service_price.
     */
    public function test_payment_controller_updates_order_total_price_with_service_price(): void
    {
        $order = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-TST-' . rand(1000, 9999),
            'issue_description'  => 'Kiểm tra máy chưa báo giá (0đ)',
            'estimated_price'    => 0,
            'initial_price'      => 0,
            'total_price'        => 0,
            'status'             => 'ready_for_return',
            'order_type'         => 'in_store',
            'created_by_user_id' => $this->cskhUser->id,
        ]);

        $token = $this->cskhUser->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/payments', [
                'repair_order_id' => $order->id,
                'service_price'   => 350000,
                'amount'          => 350000,
                'payment_method'  => 'cash',
                'notes'           => 'Thu tiền dịch vụ sau kiểm tra thực tế',
                'auto_confirm'    => true,
            ]);

        $response->assertSuccessful();

        $order->refresh();
        $this->assertEquals(350000, (float) $order->total_price);
        $this->assertEquals(350000, (float) $order->initial_price);
        $this->assertEquals('completed', $order->status);

        $this->assertDatabaseHas('payments', [
            'repair_order_id' => $order->id,
            'amount'          => 350000,
            'payment_method'  => 'cash',
            'status'          => 'paid',
        ]);
    }

    /**
     * Test 2: PaymentController tính tiền chính xác khi có giảm giá / chiết khấu dựa trên service_price.
     */
    public function test_payment_controller_with_service_price_and_discount(): void
    {
        $order = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-DSC-' . rand(1000, 9999),
            'issue_description'  => 'Đơn chưa báo giá',
            'estimated_price'    => 0,
            'total_price'        => 0,
            'status'             => 'ready_for_return',
            'order_type'         => 'in_store',
            'created_by_user_id' => $this->cskhUser->id,
        ]);

        $token = $this->cskhUser->createToken('test_token')->plainTextToken;

        // Báo khách 500.000 ₫, giảm 10% (50.000 ₫), thực thu 450.000 ₫
        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/payments', [
                'repair_order_id' => $order->id,
                'service_price'   => 500000,
                'amount'          => 450000,
                'payment_method'  => 'bank_transfer',
                'auto_confirm'    => true,
                'discount_type'   => 'percent',
                'discount_value'  => 10,
                'discount_amount' => 50000,
                'warranty_months' => 6,
            ]);

        $response->assertSuccessful();

        $order->refresh();
        $this->assertEquals(500000, (float) $order->total_price);
        $this->assertEquals('completed', $order->status);

        $this->assertDatabaseHas('payments', [
            'repair_order_id' => $order->id,
            'amount'          => 450000,
            'status'          => 'paid',
        ]);
    }

    /**
     * Test 3: OrderController lọc chính xác date_filter = '3_days' (Hôm nay, Hôm qua, Hôm kia).
     */
    public function test_order_controller_filters_3_days_scope(): void
    {
        $todayOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-TDY-' . rand(1000, 9999),
            'issue_description'  => 'Đơn hôm nay',
            'estimated_price'    => 100000,
            'status'             => 'assigned',
            'created_by_user_id' => $this->cskhUser->id,
        ]);
        DB::table('repair_orders')->where('id', $todayOrder->id)->update([
            'created_at' => Carbon::today($this->tz)->addHours(2),
        ]);

        $yesterdayOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-YST-' . rand(1000, 9999),
            'issue_description'  => 'Đơn hôm qua',
            'estimated_price'    => 200000,
            'status'             => 'in_repair',
            'created_by_user_id' => $this->cskhUser->id,
        ]);
        DB::table('repair_orders')->where('id', $yesterdayOrder->id)->update([
            'created_at' => Carbon::today($this->tz)->subDay()->addHours(2),
        ]);

        $dayBeforeYesterdayOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-DBY-' . rand(1000, 9999),
            'issue_description'  => 'Đơn hôm kia',
            'estimated_price'    => 300000,
            'status'             => 'waiting_parts',
            'created_by_user_id' => $this->cskhUser->id,
        ]);
        DB::table('repair_orders')->where('id', $dayBeforeYesterdayOrder->id)->update([
            'created_at' => Carbon::today($this->tz)->subDays(2)->addHours(4),
        ]);

        $oldOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-OLD-' . rand(1000, 9999),
            'issue_description'  => 'Đơn 5 ngày trước',
            'estimated_price'    => 400000,
            'status'             => 'assigned',
            'created_by_user_id' => $this->cskhUser->id,
        ]);
        DB::table('repair_orders')->where('id', $oldOrder->id)->update([
            'created_at' => Carbon::today($this->tz)->subDays(5),
        ]);

        $token = $this->cskhUser->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/orders?date_filter=3_days&per_page=100');

        $response->assertStatus(200);
        $orderCodes = collect($response->json('data.data'))->pluck('order_code')->toArray();

        $this->assertContains($todayOrder->order_code, $orderCodes);
        $this->assertContains($yesterdayOrder->order_code, $orderCodes);
        $this->assertContains($dayBeforeYesterdayOrder->order_code, $orderCodes);
        $this->assertNotContains($oldOrder->order_code, $orderCodes);
    }

    /**
     * Test 4: Role Technician truy vấn 3_days thành công và bị ép về 3_days nếu truyền all/30_days.
     */
    public function test_technician_role_rbac_coerces_to_safe_3_day_scope(): void
    {
        $dayBeforeYesterdayOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-TC3-' . rand(1000, 9999),
            'issue_description'  => 'Đơn hôm kia cho tech',
            'estimated_price'    => 250000,
            'status'             => 'in_repair',
            'technician_id'      => $this->techUser->id,
            'created_by_user_id' => $this->cskhUser->id,
        ]);
        DB::table('repair_orders')->where('id', $dayBeforeYesterdayOrder->id)->update([
            'created_at' => Carbon::today($this->tz)->subDays(2)->addHours(5),
        ]);

        $veryOldOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'order_code'         => 'FX' . date('y') . '-VOD-' . rand(1000, 9999),
            'issue_description'  => 'Đơn 10 ngày trước',
            'estimated_price'    => 500000,
            'status'             => 'completed',
            'technician_id'      => $this->techUser->id,
            'created_by_user_id' => $this->cskhUser->id,
        ]);
        DB::table('repair_orders')->where('id', $veryOldOrder->id)->update([
            'created_at' => Carbon::today($this->tz)->subDays(10),
        ]);

        $techToken = $this->techUser->createToken('tech_token')->plainTextToken;

        // Kỹ thuật viên gọi trực tiếp date_filter=3_days
        $res3Days = $this->withHeader('Authorization', "Bearer {$techToken}")
            ->getJson('/api/v1/orders?date_filter=3_days&per_page=100');

        $res3Days->assertStatus(200);
        $codes3Days = collect($res3Days->json('data.data'))->pluck('order_code')->toArray();
        $this->assertContains($dayBeforeYesterdayOrder->order_code, $codes3Days);
        $this->assertNotContains($veryOldOrder->order_code, $codes3Days);

        // Kỹ thuật viên cố tình gọi all -> RBAC tự động ép về 3_days
        $resAll = $this->withHeader('Authorization', "Bearer {$techToken}")
            ->getJson('/api/v1/orders?date_filter=all&per_page=100');

        $resAll->assertStatus(200);
        $codesAll = collect($resAll->json('data.data'))->pluck('order_code')->toArray();
        $this->assertContains($dayBeforeYesterdayOrder->order_code, $codesAll);
        $this->assertNotContains($veryOldOrder->order_code, $codesAll);
    }
}
