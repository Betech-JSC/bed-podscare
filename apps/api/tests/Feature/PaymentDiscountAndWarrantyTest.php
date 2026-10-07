<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PaymentDiscountAndWarrantyTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $cskhUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'                => 'tenant_test_' . uniqid(),
            'name'                => 'Tiệm PodsCare Test',
            'status'              => 'active',
            'plan'                => 'standard',
            'bank_code'           => 'VCB',
            'bank_account_number' => '0123456789',
            'bank_account_holder' => 'PODSCARE TEST',
        ]);

        $this->branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Test',
            'code'      => 'BR_TEST_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Test Street',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id'   => $this->tenant->id,
            'name'        => 'Khách Hàng Test Discount',
            'phone'       => '091' . rand(1000000, 9999999),
            'total_spent' => 0,
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->cskhUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'CSKH Worker',
            'email'     => 'cskh_' . uniqid() . '@example.com',
            'phone'     => '098' . rand(1000000, 9999999),
            'password'  => Hash::make('password'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);
    }

    private function createOrder(float $price = 1000000): RepairOrder
    {
        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'order_code'         => "FX{$year}-T{$randomNum}",
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'issue_description'  => 'Thay pin tai nghe',
            'status'             => 'ready_for_return',
            'total_price'        => $price,
            'initial_price'      => $price,
            'created_by_user_id' => $this->cskhUser->id,
        ]);
    }

    /**
     * Test 1: Thanh toán với chiết khấu % (10%) và bảo hành 3 tháng (mặc định 90 ngày)
     */
    public function test_payment_with_percentage_discount_and_default_3_months_warranty(): void
    {
        $order = $this->createOrder(1000000);
        $initialSpent = (float) $this->customer->total_spent;

        $response = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 900000, // Đã trừ 10% (100.000đ)
            'payment_method'  => 'cash',
            'discount_type'   => 'percent',
            'discount_value'  => 10,
            'discount_amount' => 100000,
            'warranty_months' => 3,
            'auto_confirm'    => true,
            'notes'           => 'Khách thanh toán tiền mặt',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true);
        $this->assertEquals(900000, (float) $response->json('data.amount'));

        // Kiểm tra Payment
        $payment = Payment::where('repair_order_id', $order->id)->first();
        $this->assertNotNull($payment);
        $this->assertEquals(900000, (float) $payment->amount);
        $this->assertStringContainsString('Chiết khấu 10%: -100,000 ₫', $payment->notes);
        $this->assertEquals('paid', $payment->status);

        // Kiểm tra RepairOrder
        $order->refresh();
        $this->assertEquals('completed', $order->status);
        $this->assertEquals(90, $order->warranty_terms_days);

        // Kiểm tra Warranty
        $warranty = Warranty::where('repair_order_id', $order->id)->first();
        $this->assertNotNull($warranty);
        $this->assertEquals(90, $warranty->duration_days);
        $this->assertEquals('active', $warranty->status);
        $this->assertEquals(Carbon::now()->addDays(90)->toDateString(), $warranty->end_date->toDateString());

        // Kiểm tra total_spent khách hàng tích lũy đúng số tiền thực thu (900.000đ thay vì 1.000.000đ)
        $this->customer->refresh();
        $this->assertEquals($initialSpent + 900000, (float) $this->customer->total_spent);

        // Kiểm tra AuditLog
        $log = AuditLog::where('auditable_id', $payment->id)->first();
        $this->assertNotNull($log);
        $this->assertStringContainsString('Thực thu 900,000 ₫', $log->details);
        $this->assertStringContainsString('Đã giảm: 100,000 ₫', $log->details);
    }

    /**
     * Test 2: Thanh toán với giảm giá tiền mặt (fixed 50.000đ) và bảo hành 6 tháng (180 ngày)
     */
    public function test_payment_with_fixed_discount_and_6_months_warranty(): void
    {
        $order = $this->createOrder(500000);
        $initialSpent = (float) $this->customer->total_spent;

        $response = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 450000,
            'payment_method'  => 'cash',
            'discount_type'   => 'fixed',
            'discount_value'  => 50000,
            'discount_amount' => 50000,
            'warranty_months' => 6,
            'auto_confirm'    => true,
        ]);

        $response->assertStatus(201);

        $order->refresh();
        $this->assertEquals(180, $order->warranty_terms_days);

        $warranty = Warranty::where('repair_order_id', $order->id)->first();
        $this->assertNotNull($warranty);
        $this->assertEquals(180, $warranty->duration_days);
        $this->assertEquals(Carbon::now()->addDays(180)->toDateString(), $warranty->end_date->toDateString());

        $this->customer->refresh();
        $this->assertEquals($initialSpent + 450000, (float) $this->customer->total_spent);

        $payment = Payment::where('repair_order_id', $order->id)->first();
        $this->assertStringContainsString('Giảm giá: -50,000 ₫', $payment->notes);
    }

    /**
     * Test 3: Các gói bảo hành 9 tháng (270 ngày) và 12 tháng (365 ngày)
     */
    public function test_warranty_options_9_and_12_months(): void
    {
        // 9 tháng -> 270 ngày
        $order9 = $this->createOrder(300000);
        $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order9->id,
            'amount'          => 300000,
            'payment_method'  => 'cash',
            'warranty_months' => 9,
            'auto_confirm'    => true,
        ])->assertStatus(201);

        $order9->refresh();
        $this->assertEquals(270, $order9->warranty_terms_days);
        $warranty9 = Warranty::where('repair_order_id', $order9->id)->first();
        $this->assertEquals(270, $warranty9->duration_days);
        $this->assertEquals(Carbon::now()->addDays(270)->toDateString(), $warranty9->end_date->toDateString());

        // 12 tháng -> 365 ngày (1 năm chuẩn)
        $order12 = $this->createOrder(400000);
        $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order12->id,
            'amount'          => 400000,
            'payment_method'  => 'cash',
            'warranty_months' => 12,
            'auto_confirm'    => true,
        ])->assertStatus(201);

        $order12->refresh();
        $this->assertEquals(365, $order12->warranty_terms_days);
        $warranty12 = Warranty::where('repair_order_id', $order12->id)->first();
        $this->assertEquals(365, $warranty12->duration_days);
        $this->assertEquals(Carbon::now()->addDays(365)->toDateString(), $warranty12->end_date->toDateString());
    }

    /**
     * Test 4: Validation từ chối khi giá trị warranty_months hoặc discount_type không hợp lệ
     */
    public function test_validation_rejects_invalid_values(): void
    {
        $order = $this->createOrder(500000);

        // warranty_months = 5 (không nằm trong 3, 6, 9, 12)
        $response = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 500000,
            'payment_method'  => 'cash',
            'warranty_months' => 5,
        ]);
        $response->assertStatus(422)
            ->assertJsonValidationErrors(['warranty_months']);

        // discount_type = 'unknown'
        $response2 = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 500000,
            'payment_method'  => 'cash',
            'discount_type'   => 'unsupported',
        ]);
        $response2->assertStatus(422)
            ->assertJsonValidationErrors(['discount_type']);
    }
}
