<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class QuoteRejectAndQcFailGuardTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected User $admin;
    protected User $tech;
    protected Customer $customer;
    protected DeviceModel $deviceModel;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'       => 'quote_qc_guard_' . uniqid(),
            'name'       => 'PodsCare Guard Store',
            'status'     => 'active',
            'plan'       => 'pro',
            'expires_at' => now()->addYear(),
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'code'      => 'CN_GUARD_' . uniqid(),
            'name'      => 'Chi Nhánh Guard',
            'address'   => '100 Lê Lai',
            'phone'     => '0901234567',
            'is_active' => true,
        ]);

        $this->admin = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Guard',
            'email'     => 'admin_guard_' . uniqid() . '@podscare.vn',
            'phone'     => '091' . rand(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->tech = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'KTV Guard',
            'email'     => 'tech_guard_' . uniqid() . '@podscare.vn',
            'phone'     => '092' . rand(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Guard',
            'phone'     => '093' . rand(1000000, 9999999),
        ]);

        $this->deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'tenant_id'   => $this->tenant->id,
            'name'        => 'AirPods Pro 2',
            'category'    => 'AirPods',
            'model_code'  => 'A2931_G_' . uniqid(),
            'description' => 'Test model',
        ]);
    }

    /**
     * 1. Từ chối báo giá (POST /api/v1/quotes/{id}/reject) chuyển báo giá sang rejected
     *    và chặn gọi lại approve/reject lần 2 hoặc khi đơn đã completed/cancelled (HTTP 422).
     */
    public function test_quote_reject_flow_and_state_guardrails(): void
    {
        $order = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'order_code'         => 'PCQT_' . uniqid(),
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'status'             => 'waiting_approval',
            'issue_description'  => 'Thay pin hai bên',
            'total_price'        => 500000,
            'created_by_user_id' => $this->admin->id,
        ]);

        $quote = RepairQuote::create([
            'tenant_id'           => $this->tenant->id,
            'repair_order_id'     => $order->id,
            'quote_number'        => 'QT_REJ_' . uniqid(),
            'total_amount'        => 500000,
            'warranty_terms_days' => 90,
            'note'                => 'Báo giá thay pin hai bên',
            'status'              => 'pending',
            'sent_by_user_id'     => $this->admin->id,
        ]);

        // 1. Từ chối báo giá hợp lệ
        $rejectRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/v1/quotes/{$quote->id}/reject", [
                'reason' => 'Khách chưa muốn sửa lúc này',
            ]);

        $rejectRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'declined');

        $order->refresh();
        $this->assertSame('rejected', $order->status);

        // 2. Guardrail: Gọi approve hoặc reject lại trên báo giá đã rejected -> HTTP 422
        $reApproveRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/v1/quotes/{$quote->id}/approve");
        $reApproveRes->assertStatus(422);

        $reRejectRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/v1/quotes/{$quote->id}/reject", [
                'reason' => 'Từ chối lần 2',
            ]);
        $reRejectRes->assertStatus(422);

        // 3. Guardrail: Báo giá pending nhưng đơn hàng đã completed hoặc cancelled -> HTTP 422
        $completedOrder = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'order_code'         => 'PCQT_CMP_' . uniqid(),
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'status'             => 'completed',
            'issue_description'  => 'Đã sửa xong',
            'total_price'        => 300000,
            'created_by_user_id' => $this->admin->id,
        ]);

        $pendingQuoteOnCompleted = RepairQuote::create([
            'tenant_id'           => $this->tenant->id,
            'repair_order_id'     => $completedOrder->id,
            'quote_number'        => 'QT_CMP_' . uniqid(),
            'total_amount'        => 300000,
            'warranty_terms_days' => 90,
            'note'                => 'Báo giá đơn đã đóng',
            'status'              => 'pending',
            'sent_by_user_id'     => $this->admin->id,
        ]);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/v1/quotes/{$pendingQuoteOnCompleted->id}/approve")
            ->assertStatus(422);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/v1/quotes/{$pendingQuoteOnCompleted->id}/reject", [
                'reason' => 'Khách đổi ý',
            ])
            ->assertStatus(422);
    }

    /**
     * 2. Đánh trượt QC (POST /api/v1/qc với result = fail) chuyển đơn sang rework_needed,
     *    và chặn tạo QC khi đơn đã completed/cancelled (HTTP 422).
     */
    public function test_qc_fail_transitions_to_rework_needed_and_blocks_terminal_orders(): void
    {
        $order = RepairOrder::create([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'order_code'         => 'PCQC_' . uniqid(),
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'technician_id'      => $this->tech->id,
            'status'             => 'waiting_qc',
            'issue_description'  => 'Rè loa trái',
            'total_price'        => 400000,
            'created_by_user_id' => $this->admin->id,
        ]);

        // 1. Đánh trượt QC lần 1 -> đơn chuyển sang rework_needed
        $qcFailRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/qc', [
                'repair_order_id' => $order->id,
                'result'          => 'fail',
                'rework_reason'   => 'Âm bass tai trái vẫn hơi rè khi mở max âm lượng',
                'criteria'        => [
                    ['criterion' => 'sound_quality', 'is_passed' => false],
                ],
            ]);

        $qcFailRes->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.result', 'fail');

        $order->refresh();
        $this->assertSame('rework_needed', $order->status);

        // 2. Guardrail: Đơn đã completed hoặc cancelled không được tạo phiếu QC mới -> HTTP 422
        $order->update(['status' => 'completed']);

        $qcBlockedRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/qc', [
                'repair_order_id' => $order->id,
                'result'          => 'pass',
                'criteria'        => [
                    ['criterion' => 'sound_quality', 'is_passed' => true],
                ],
            ]);

        $qcBlockedRes->assertStatus(422);
    }
}
