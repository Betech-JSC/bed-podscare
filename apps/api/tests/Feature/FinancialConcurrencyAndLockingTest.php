<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashTransaction;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\SaasInvoice;
use App\Models\SepayTransaction;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WorkShift;
use App\Services\OrderCodeService;
use App\Services\OrderWorkflowService;
use App\Services\ShiftService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

class FinancialConcurrencyAndLockingTest extends TestCase
{
    use DatabaseTransactions;

    private function createUser(array $attributes): User
    {
        $user = new User();
        $user->forceFill($attributes);
        $user->saveQuietly();

        return $user;
    }

    private function createBaseFixture(): array
    {
        \App\Models\SubscriptionPlan::firstOrCreate(
            ['id' => 'pro'],
            [
                'code'          => 'PRO',
                'name'          => 'Gói Chuyên Nghiệp',
                'price'         => 299000,
                'price_monthly' => 299000,
                'price_yearly'  => 2990000,
                'billing_cycle' => 'monthly',
                'is_active'     => true,
            ]
        );

        $tenant = Tenant::create([
            'name'   => 'PodsCare Main',
            'code'   => 'MAIN',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $branch = Branch::withoutGlobalScopes()->create([
            'tenant_id' => $tenant->id,
            'code'      => '1',
            'name'      => 'Chi nhánh Quận 1',
            'address'   => '123 Lê Lợi',
            'phone'     => '0909000111',
            'is_active' => true,
        ]);

        $admin = $this->createUser([
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'name'      => 'Admin Store',
            'email'     => 'admin@main.test',
            'phone'     => '0909000112',
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $tech = $this->createUser([
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'name'      => 'KTV Store',
            'email'     => 'tech@main.test',
            'phone'     => '0909000113',
            'password'  => Hash::make('password'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $customer = Customer::withoutGlobalScopes()->create([
            'tenant_id'    => $tenant->id,
            'name'         => 'Nguyễn Văn A',
            'phone'        => '0912345678',
            'orders_count' => 0,
            'total_spent'  => 0,
        ]);

        $deviceModel = DeviceModel::firstOrCreate(
            ['model_code' => 'A2931'],
            [
                'name'     => 'AirPods Pro 2',
                'category' => 'AirPods Pro',
            ]
        );

        return compact('tenant', 'branch', 'admin', 'tech', 'customer', 'deviceModel');
    }

    public function test_payment_store_and_confirm_prevent_duplicate_payment_and_accumulate_customer_atomically(): void
    {
        $ctx = $this->createBaseFixture();

        app(ShiftService::class)->openShift($ctx['tenant']->id, $ctx['branch']->id, $ctx['admin']->id, 1000000);

        $order = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $ctx['tenant']->id,
            'order_code'          => 'PC122102601',
            'branch_id'           => $ctx['branch']->id,
            'customer_id'         => $ctx['customer']->id,
            'device_model_id'     => $ctx['deviceModel']->id,
            'technician_id'       => $ctx['tech']->id,
            'issue_description'   => 'Thay pin',
            'status'              => 'ready_for_return',
            'total_price'         => 500000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $ctx['admin']->id,
        ]);

        // Lần 1: Thu tiền mặt thành công
        $res1 = $this->actingAs($ctx['admin'])->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 500000,
            'payment_method'  => 'cash',
        ]);
        $res1->assertStatus(201);

        // Lần 2: Gọi lặp thu tiền cho cùng đơn hàng phải bị chặn 422
        $res2 = $this->actingAs($ctx['admin'])->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 500000,
            'payment_method'  => 'cash',
        ]);
        $res2->assertStatus(422);

        $customer = $ctx['customer']->fresh();
        $this->assertEquals(1, (int) $customer->orders_count);
        $this->assertEquals(500000.0, (float) $customer->total_spent);
        $this->assertEquals(1, Warranty::withoutGlobalScopes()->where('repair_order_id', $order->id)->count());
        $this->assertEquals(1, CashTransaction::withoutGlobalScopes()->where('tenant_id', $ctx['tenant']->id)->where('category', 'repair_order_cash')->count());

        // Kiểm tra confirm lặp trên phiếu bank_transfer pending
        $order2 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $ctx['tenant']->id,
            'order_code'          => 'PC122102602',
            'branch_id'           => $ctx['branch']->id,
            'customer_id'         => $ctx['customer']->id,
            'device_model_id'     => $ctx['deviceModel']->id,
            'technician_id'       => $ctx['tech']->id,
            'issue_description'   => 'Thay vỏ',
            'status'              => 'ready_for_return',
            'total_price'         => 300000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $ctx['admin']->id,
        ]);

        $pendingPaymentRes = $this->actingAs($ctx['admin'])->postJson('/api/v1/payments', [
            'repair_order_id' => $order2->id,
            'amount'          => 300000,
            'payment_method'  => 'bank_transfer',
            'auto_confirm'    => false,
        ]);
        $pendingPaymentRes->assertStatus(201);
        $paymentId = $pendingPaymentRes->json('data.id');

        $confirm1 = $this->actingAs($ctx['admin'])->postJson("/api/v1/payments/{$paymentId}/confirm");
        $confirm1->assertOk();

        $confirm2 = $this->actingAs($ctx['admin'])->postJson("/api/v1/payments/{$paymentId}/confirm");
        $confirm2->assertStatus(422);

        $customer = $ctx['customer']->fresh();
        $this->assertEquals(2, (int) $customer->orders_count);
        $this->assertEquals(800000.0, (float) $customer->total_spent);
    }

    public function test_refund_is_idempotent_and_blocks_double_refund(): void
    {
        $ctx = $this->createBaseFixture();

        app(ShiftService::class)->openShift($ctx['tenant']->id, $ctx['branch']->id, $ctx['admin']->id, 1000000);

        $order = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $ctx['tenant']->id,
            'order_code'          => 'PC122102605',
            'branch_id'           => $ctx['branch']->id,
            'customer_id'         => $ctx['customer']->id,
            'device_model_id'     => $ctx['deviceModel']->id,
            'technician_id'       => $ctx['tech']->id,
            'issue_description'   => 'Sửa mic',
            'status'              => 'ready_for_return',
            'total_price'         => 400000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $ctx['admin']->id,
        ]);

        $payRes = $this->actingAs($ctx['admin'])->postJson('/api/v1/payments', [
            'repair_order_id' => $order->id,
            'amount'          => 400000,
            'payment_method'  => 'cash',
        ]);
        $paymentId = $payRes->json('data.id');

        // Hoàn tiền lần 1 thành công
        $refund1 = $this->actingAs($ctx['admin'])->postJson("/api/v1/payments/{$paymentId}/refund", [
            'refund_method' => 'cash',
            'refund_reason' => 'Khách đổi ý',
        ]);
        $refund1->assertOk();

        // Hoàn tiền lần 2 bị chặn 422
        $refund2 = $this->actingAs($ctx['admin'])->postJson("/api/v1/payments/{$paymentId}/refund", [
            'refund_method' => 'cash',
            'refund_reason' => 'Hoàn tiền lần 2',
        ]);
        $refund2->assertStatus(422);

        // Chỉ có duy nhất 1 phiếu chi hoàn tiền và két tiền mặt chỉ trừ 1 lần
        $this->assertEquals(1, CashTransaction::withoutGlobalScopes()->where('tenant_id', $ctx['tenant']->id)->where('category', 'refund')->count());
        $shift = WorkShift::withoutGlobalScopes()->where('branch_id', $ctx['branch']->id)->first();
        $this->assertEquals(1000000.0, (float) $shift->expected_cash);
        $this->assertEquals(0, (int) $ctx['customer']->fresh()->orders_count);
        $this->assertEquals(0.0, (float) $ctx['customer']->fresh()->total_spent);
    }

    public function test_open_shift_blocks_second_open_shift_for_same_branch(): void
    {
        $ctx = $this->createBaseFixture();
        $shiftService = app(ShiftService::class);

        $shift1 = $shiftService->openShift($ctx['tenant']->id, $ctx['branch']->id, $ctx['admin']->id, 500000);
        $this->assertEquals('open', $shift1->status);

        $this->expectException(ValidationException::class);
        $shiftService->openShift($ctx['tenant']->id, $ctx['branch']->id, $ctx['admin']->id, 500000);
    }

    public function test_workflow_transition_locks_row_and_prevents_double_completion_side_effects(): void
    {
        $ctx = $this->createBaseFixture();

        $orderStale1 = RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'           => $ctx['tenant']->id,
            'order_code'          => 'PC122102610',
            'branch_id'           => $ctx['branch']->id,
            'customer_id'         => $ctx['customer']->id,
            'device_model_id'     => $ctx['deviceModel']->id,
            'technician_id'       => $ctx['tech']->id,
            'issue_description'   => 'Vệ sinh loa',
            'status'              => 'ready_for_return',
            'total_price'         => 250000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $ctx['admin']->id,
        ]);

        // Bản sao thứ hai trong bộ nhớ vẫn mang status = 'ready_for_return' (mô phỏng request đồng thời)
        $orderStale2 = RepairOrder::withoutGlobalScopes()->find($orderStale1->id);

        \App\Models\Payment::create([
            'payment_code'        => 'PAY-STALE-' . uniqid(),
            'repair_order_id'     => $orderStale1->id,
            'amount'              => 250000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $ctx['admin']->id,
        ]);

        $workflow = app(OrderWorkflowService::class);
        $workflow->transition($orderStale1, 'completed', ['user' => $ctx['admin']]);

        // Khi $orderStale2 gọi transition('completed'), BaseWorkflowService đọc lại dòng đã khóa thấy đã 'completed' -> ném ConflictHttpException
        $conflictThrown = false;
        try {
            $workflow->transition($orderStale2, 'completed', ['user' => $ctx['admin']]);
        } catch (ConflictHttpException $e) {
            $conflictThrown = true;
        }

        $this->assertTrue($conflictThrown, 'Transition trên bản ghi stale đã chuyển trạng thái phải ném ConflictHttpException');
        $this->assertEquals(1, Warranty::withoutGlobalScopes()->where('repair_order_id', $orderStale1->id)->count());
        $this->assertEquals(1, (int) $ctx['customer']->fresh()->orders_count);
        $this->assertEquals(250000.0, (float) $ctx['customer']->fresh()->total_spent);
    }

    public function test_order_code_service_handles_sequence_beyond_99_and_sepay_webhook_is_idempotent(): void
    {
        $ctx = $this->createBaseFixture();
        $orderCodeService = app(OrderCodeService::class);
        $fixedDate = Carbon::create(2026, 10, 22, 9, 0, 0, 'Asia/Ho_Chi_Minh');

        // Tạo đơn thứ 99 trong ngày
        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $ctx['tenant']->id,
            'order_code'         => 'PC122102699',
            'branch_id'          => $ctx['branch']->id,
            'customer_id'        => $ctx['customer']->id,
            'device_model_id'    => $ctx['deviceModel']->id,
            'issue_description'  => 'Đơn 99',
            'status'             => 'waiting_tech',
            'created_by_user_id' => $ctx['admin']->id,
        ]);

        $code100 = $orderCodeService->generate($ctx['branch']->id, $fixedDate);
        $this->assertEquals('PC1221026100', $code100);

        RepairOrder::withoutGlobalScopes()->create([
            'tenant_id'          => $ctx['tenant']->id,
            'order_code'         => $code100,
            'branch_id'          => $ctx['branch']->id,
            'customer_id'        => $ctx['customer']->id,
            'device_model_id'    => $ctx['deviceModel']->id,
            'issue_description'  => 'Đơn 100',
            'status'             => 'waiting_tech',
            'created_by_user_id' => $ctx['admin']->id,
        ]);

        // Đơn tiếp theo phải là 101 chứ không bị kẹt ở 100 do lỗi sắp xếp chuỗi ASCII ('99' > '100')
        $code101 = $orderCodeService->generate($ctx['branch']->id, $fixedDate);
        $this->assertEquals('PC1221026101', $code101);

        // Kiểm tra SePay Webhook Idempotency
        config(['sepay.webhook_secret' => 'test_sepay_secret']);
        $baseExpiry = Carbon::now()->addDays(5);
        $ctx['tenant']->update(['expires_at' => $baseExpiry]);

        $invoice = SaasInvoice::create([
            'tenant_id'      => $ctx['tenant']->id,
            'reference_code' => 'FIXSUB55',
            'plan_id'        => 'pro',
            'billing_cycle'  => 'monthly',
            'amount'         => 299000,
            'status'         => 'pending',
            'expires_at'     => now()->addDay(),
        ]);

        $payload = [
            'id'             => 'SEPAY_TX_1001',
            'content'        => 'Thanh toan FIXSUB' . $invoice->id,
            'transferAmount' => 299000,
        ];

        $wh1 = $this->postJson('/api/v1/webhooks/sepay', $payload, [
            'Authorization' => 'Apikey test_sepay_secret',
        ]);
        $wh1->assertOk()->assertJsonPath('success', true);

        $expiryAfterFirst = $ctx['tenant']->fresh()->expires_at;

        // Gửi lại webhook trùng mã giao dịch SEPAY_TX_1001
        $wh2 = $this->postJson('/api/v1/webhooks/sepay', $payload, [
            'Authorization' => 'Apikey test_sepay_secret',
        ]);
        $wh2->assertOk()->assertJsonPath('code', 'ALREADY_PROCESSED');

        $this->assertEquals(1, SepayTransaction::where('sepay_transaction_id', 'SEPAY_TX_1001')->count());
        $this->assertEquals($expiryAfterFirst->timestamp, $ctx['tenant']->fresh()->expires_at->timestamp);
    }
}
