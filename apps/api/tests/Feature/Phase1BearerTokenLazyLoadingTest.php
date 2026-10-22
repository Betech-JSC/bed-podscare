<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\PersonalAccessToken;
use App\Models\RepairOrder;
use App\Models\SubscriptionPlan;
use App\Models\TelegramRecipient;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use App\Services\CashTransactionService;
use App\Services\TelegramAi\TelegramAiAssistantService;
use App\Services\WarrantyReworkService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class Phase1BearerTokenLazyLoadingTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected User $adminUser;
    protected Customer $customer;
    protected DeviceModel $deviceModel;
    protected string $bearerToken;

    protected function setUp(): void
    {
        parent::setUp();

        Model::preventLazyLoading(true);

        SubscriptionPlan::updateOrCreate(
            ['id' => 'pro'],
            [
                'name'          => 'Gói Chuyên Nghiệp (Pro)',
                'code'          => 'pro',
                'price'         => 299000,
                'price_monthly' => 299000,
                'price_yearly'  => 2990000,
                'max_branches'  => 10,
                'max_users'     => 50,
                'max_orders'    => 10000,
                'is_active'     => true,
                'sort_order'    => 2,
            ]
        );

        $this->tenant = Tenant::create([
            'code'                => 'tenant_p1_' . uniqid(),
            'name'                => 'Cửa Hàng Kiểm Chứng Phase 1',
            'status'              => 'active',
            'plan'                => 'pro',
            'current_plan_id'     => 'pro',
            'expires_at'          => now()->addMonths(6),
            'bank_code'           => 'MB',
            'bank_account_number' => '0987654321',
            'bank_account_holder' => 'NGUYEN VAN A',
        ]);

        $this->branch = Branch::forceCreate([
            'tenant_id' => $this->tenant->id,
            'code'      => 'BRP1_' . strtoupper(substr(uniqid(), -4)),
            'name'      => 'Chi Nhánh Trung Tâm P1',
            'address'   => '123 Lê Lợi, Quận 1',
            'phone'     => '0901234567',
            'is_active' => true,
        ]);

        $createdUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Phase 1',
            'email'     => 'admin_p1_' . uniqid() . '@example.com',
            'phone'     => '091' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->bearerToken = $createdUser->createToken('phase1-real-http-token')->plainTextToken;

        // Tải lại từ DB để đảm bảo wasRecentlyCreated === false
        $this->adminUser = User::withoutGlobalScopes()->findOrFail($createdUser->id);
        $this->assertFalse($this->adminUser->wasRecentlyCreated);

        $this->customer = Customer::forceCreate([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Khách Hàng Gốc P1',
            'phone'     => '098' . random_int(1000000, 9999999),
        ]);

        $this->deviceModel = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2 USB-C',
            'model_code' => 'A3048_' . uniqid(),
            'category'   => 'AirPods',
        ]);

        auth()->forgetGuards();
    }

    /**
     * Task 1.1: PersonalAccessToken::findToken() tự động eager-load tokenable (User)
     * với wasRecentlyCreated === false và không nổ LazyLoadingViolationException.
     */
    public function test_task_1_1_personal_access_token_eager_loads_tokenable(): void
    {
        $accessToken = PersonalAccessToken::findToken($this->bearerToken);

        $this->assertNotNull($accessToken);
        $this->assertFalse($accessToken->wasRecentlyCreated);
        $this->assertTrue($accessToken->relationLoaded('tokenable'));
        $this->assertNotNull($accessToken->tokenable);
        $this->assertFalse($accessToken->tokenable->wasRecentlyCreated);
        $this->assertSame($this->adminUser->id, $accessToken->tokenable->id);
    }

    /**
     * Task 1.2: 6 Controllers truy cập $user->tenant qua HTTP Bearer Token thật
     * không bị nổ LazyLoadingViolationException.
     */
    public function test_task_1_2_controllers_load_missing_tenant_with_real_bearer_token(): void
    {
        Storage::fake('public');
        $headers = ['Authorization' => 'Bearer ' . $this->bearerToken];

        // 1. OrderController::store()
        auth()->forgetGuards();
        $orderRes = $this->withHeaders($headers)->postJson('/api/v1/orders', [
            'branch_id'         => $this->branch->id,
            'customer_name'     => 'Khách Tiếp Nhận Bearer',
            'customer_phone'    => '097' . random_int(1000000, 9999999),
            'device_model_id'   => $this->deviceModel->id,
            'issue_description' => 'Mất kết nối tai phải',
            'estimated_price'   => 350000,
        ]);
        $orderRes->assertStatus(201)->assertJsonPath('success', true);

        // 2. BranchController::store()
        auth()->forgetGuards();
        $branchRes = $this->withHeaders($headers)->postJson('/api/v1/branches', [
            'code'    => 'BRNEW_' . strtoupper(substr(uniqid(), -4)),
            'name'    => 'Chi Nhánh Mới Bearer',
            'address' => '456 Nguyễn Huệ, Quận 1',
        ]);
        $branchRes->assertStatus(201)->assertJsonPath('success', true);

        // 3. UserController::store()
        auth()->forgetGuards();
        $userRes = $this->withHeaders($headers)->postJson('/api/v1/users', [
            'name'      => 'Nhân Viên CSKH Mới',
            'email'     => 'cskh_p1_' . uniqid() . '@example.com',
            'password'  => 'password123',
            'role'      => 'cskh',
            'branch_id' => $this->branch->id,
        ]);
        $userRes->assertStatus(201)->assertJsonPath('success', true);

        // 4. SaasBillingController::current() & subscribe()
        auth()->forgetGuards();
        $billingCurrentRes = $this->withHeaders($headers)->getJson('/api/v1/saas/current');
        $billingCurrentRes->assertStatus(200)->assertJsonPath('success', true);

        auth()->forgetGuards();
        $billingSubRes = $this->withHeaders($headers)->postJson('/api/v1/saas/subscribe', [
            'plan_id'       => 'pro',
            'billing_cycle' => 'monthly',
        ]);
        $billingSubRes->assertStatus(201)->assertJsonPath('success', true);

        // 5. TenantSettingController: getSettings(), updateSettings(), uploadLogo(), deleteLogo()
        auth()->forgetGuards();
        $getSettingsRes = $this->withHeaders($headers)->getJson('/api/v1/tenant/settings');
        $getSettingsRes->assertStatus(200)->assertJsonPath('success', true);

        auth()->forgetGuards();
        $updateSettingsRes = $this->withHeaders($headers)->postJson('/api/v1/tenant/settings', [
            'name'                => 'Cửa Hàng Đã Cập Nhật P1',
            'hotline'             => '19008888',
            'receipt_footer_note' => 'Cảm ơn quý khách',
        ]);
        $updateSettingsRes->assertStatus(200)->assertJsonPath('success', true);

        auth()->forgetGuards();
        $tinyPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        $uploadLogoRes = $this->withHeaders($headers)->postJson('/api/v1/tenant/logo', [
            'logo_base64' => $tinyPngBase64,
        ]);
        $uploadLogoRes->assertStatus(200)->assertJsonPath('success', true);

        auth()->forgetGuards();
        $deleteLogoRes = $this->withHeaders($headers)->deleteJson('/api/v1/tenant/logo');
        $deleteLogoRes->assertStatus(200)->assertJsonPath('success', true);

        // 6. PaymentController::vietqr()
        $orderId = (int) $orderRes->json('data.id');
        $payment = Payment::forceCreate([
            'payment_code'        => 'FX26-PY-' . random_int(100000, 999999),
            'repair_order_id'     => $orderId,
            'amount'              => 350000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'received_by_user_id' => $this->adminUser->id,
        ]);

        auth()->forgetGuards();
        $vietqrRes = $this->withHeaders($headers)->postJson("/api/v1/payments/{$payment->id}/vietqr");
        $vietqrRes->assertStatus(200)->assertJsonPath('success', true);
    }

    /**
     * Task 1.3: WarrantyReworkService::createReworkOrderFromClaim() nạp đầy đủ
     * warranty.repairOrder và không nổ LazyLoadingViolationException.
     */
    public function test_task_1_3_warranty_rework_service_loads_missing_warranty_and_repair_order(): void
    {
        $headers = ['Authorization' => 'Bearer ' . $this->bearerToken];

        $originalOrder = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'order_code'         => 'FX26-ORIG-' . random_int(1000, 9999),
            'order_type'         => 'in_store',
            'status'             => 'completed',
            'issue_description'  => 'Thay pin tai trái',
            'serial_number'      => 'SN-P1-' . random_int(1000, 9999),
            'total_price'        => 400000,
            'initial_price'      => 400000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $warranty = Warranty::forceCreate([
            'warranty_code'   => 'WR-P1-' . random_int(10000, 99999),
            'repair_order_id' => $originalOrder->id,
            'customer_id'     => $this->customer->id,
            'device_model_id' => $this->deviceModel->id,
            'coverage_item'   => 'Thay pin tai trái',
            'start_date'      => now()->subDays(3)->toDateString(),
            'duration_days'   => 90,
            'end_date'        => now()->addDays(87)->toDateString(),
            'status'          => 'active',
        ]);

        // Luồng 1: Gọi qua HTTP Bearer Token thật tới POST /api/v1/warranties/claims
        auth()->forgetGuards();
        $claimRes = $this->withHeaders($headers)->postJson('/api/v1/warranties/claims', [
            'warranty_id'       => $warranty->id,
            'issue_description' => 'Pin tai trái sụt nhanh',
            'resolution_mode'   => 'send_tech',
            'notes'             => 'Kiểm tra lại cell pin',
        ]);
        $claimRes->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'in_progress');
        $this->assertNotNull($claimRes->json('data.rework_order_id'));

        // Luồng 2: Gọi trực tiếp WarrantyReworkService với bản ghi tải tươi từ DB (wasRecentlyCreated === false, chưa eager-load)
        $claim2 = WarrantyClaim::forceCreate([
            'claim_code'          => 'CLM-' . date('Ym') . '-' . random_int(1000, 9999),
            'warranty_id'         => $warranty->id,
            'issue_description'   => 'Tai trái rè nhẹ khi bật ANC',
            'resolution_mode'     => 'send_tech',
            'status'              => 'received',
            'received_by_user_id' => $this->adminUser->id,
        ]);

        $freshClaim = WarrantyClaim::withoutGlobalScopes()->findOrFail($claim2->id);
        $freshActor = User::withoutGlobalScopes()->findOrFail($this->adminUser->id);

        $this->assertFalse($freshClaim->wasRecentlyCreated);
        $this->assertFalse($freshClaim->relationLoaded('warranty'));

        $reworkOrder = app(WarrantyReworkService::class)->createReworkOrderFromClaim($freshClaim, $freshActor);
        $this->assertSame('warranty', $reworkOrder->order_type);
        $this->assertSame($originalOrder->id, $reworkOrder->parent_order_id);
    }

    /**
     * Task 1.4: OrderController::update() eager-load customer khi cập nhật
     * customer_name và customer_phone qua HTTP Bearer Token thật (cả theo ID và order_code).
     */
    public function test_task_1_4_order_update_customer_info_with_real_bearer_token(): void
    {
        $headers = ['Authorization' => 'Bearer ' . $this->bearerToken];

        $order = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'order_code'         => 'PC26-UPD-' . random_int(1000, 9999),
            'order_type'         => 'in_store',
            'status'             => 'waiting_tech',
            'issue_description'  => 'Vệ sinh loa',
            'total_price'        => 200000,
            'initial_price'      => 200000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        // 1. Cập nhật qua numeric ID
        auth()->forgetGuards();
        $newPhone = '093' . random_int(1000000, 9999999);
        $res = $this->withHeaders($headers)->putJson("/api/v1/orders/{$order->id}", [
            'customer_name'  => 'Khách Đã Đổi Tên P1',
            'customer_phone' => $newPhone,
            'repair_note'    => 'Đã cập nhật tên khách theo ID',
        ]);

        $res->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.customer.name', 'Khách Đã Đổi Tên P1');

        // 2. Cập nhật qua mã chuỗi order_code
        auth()->forgetGuards();
        $newPhone2 = '094' . random_int(1000000, 9999999);
        $resByCode = $this->withHeaders($headers)->putJson("/api/v1/orders/{$order->order_code}", [
            'customer_name'  => 'Khách Đổi Tên Theo Mã Đơn P1',
            'customer_phone' => $newPhone2,
            'repair_note'    => 'Đã cập nhật tên khách theo order_code',
        ]);

        $resByCode->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.customer.name', 'Khách Đổi Tên Theo Mã Đơn P1');
    }

    /**
     * Task 1.5: CashTransactionService::recordRepairOrderCashPayment() và
     * PaymentController::store() / confirm() / confirmCash() không nổ LazyLoadingViolationException
     * khi $order chưa được nạp trước quan hệ customer.
     */
    public function test_task_1_5_cash_payment_and_confirm_load_missing_customer(): void
    {
        $headers = ['Authorization' => 'Bearer ' . $this->bearerToken];

        // 1. Kiểm tra trực tiếp CashTransactionService với fresh RepairOrder chưa load customer
        $order1 = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'order_code'         => 'FX26-CASH1-' . random_int(1000, 9999),
            'order_type'         => 'in_store',
            'status'             => 'ready_for_return',
            'issue_description'  => 'Thay cáp sạc hộp sạc 1',
            'total_price'        => 450000,
            'initial_price'      => 450000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $payment1 = Payment::forceCreate([
            'payment_code'        => 'FX26-PY-' . random_int(100000, 999999),
            'repair_order_id'     => $order1->id,
            'amount'              => 450000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->adminUser->id,
        ]);

        $freshOrder1 = RepairOrder::withoutGlobalScopes()->findOrFail($order1->id);
        $freshPayment1 = Payment::withoutGlobalScopes()->findOrFail($payment1->id);
        $this->assertFalse($freshOrder1->wasRecentlyCreated);
        $this->assertFalse($freshOrder1->relationLoaded('customer'));

        $cashTx1 = app(CashTransactionService::class)->recordRepairOrderCashPayment(
            (int) $this->tenant->id,
            (int) $this->branch->id,
            (int) $this->adminUser->id,
            $freshPayment1,
            $freshOrder1
        );

        $this->assertNotNull($cashTx1);
        $this->assertSame($this->customer->name, $cashTx1->recipient_payer);

        // 2. Kiểm tra PaymentController::store() thu tiền mặt trực tiếp qua HTTP Bearer Token thật
        $order2 = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'order_code'         => 'FX26-CASH2-' . random_int(1000, 9999),
            'order_type'         => 'in_store',
            'status'             => 'ready_for_return',
            'issue_description'  => 'Thay cáp sạc hộp sạc 2',
            'total_price'        => 500000,
            'initial_price'      => 500000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        auth()->forgetGuards();
        $storePayRes = $this->withHeaders($headers)->postJson('/api/v1/payments', [
            'repair_order_id' => $order2->id,
            'amount'          => 500000,
            'payment_method'  => 'cash',
            'notes'           => 'Thu tiền mặt trực tiếp qua store()',
        ]);
        $storePayRes->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'paid');

        // 3. Kiểm tra PaymentController::confirm() duyệt phiếu thu tiền mặt đang pending (chưa có CashTransaction trước đó)
        $order3 = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'order_code'         => 'FX26-CASH3-' . random_int(1000, 9999),
            'order_type'         => 'in_store',
            'status'             => 'ready_for_return',
            'issue_description'  => 'Thay cáp sạc hộp sạc 3',
            'total_price'        => 550000,
            'initial_price'      => 550000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $payment3 = Payment::forceCreate([
            'payment_code'        => 'FX26-PY-' . random_int(100000, 999999),
            'repair_order_id'     => $order3->id,
            'amount'              => 550000,
            'payment_method'      => 'cash',
            'status'              => 'pending',
            'received_by_user_id' => $this->adminUser->id,
        ]);

        auth()->forgetGuards();
        $confirmRes = $this->withHeaders($headers)->postJson("/api/v1/payments/{$payment3->id}/confirm", [
            'notes' => 'Xác nhận thu tiền mặt tại quầy',
        ]);
        $confirmRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'paid');

        // 4. Kiểm tra alias PaymentController::confirmCash() với user nạp từ DB (wasRecentlyCreated === false)
        $order4 = RepairOrder::forceCreate([
            'tenant_id'          => $this->tenant->id,
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->deviceModel->id,
            'order_code'         => 'FX26-CASH4-' . random_int(1000, 9999),
            'order_type'         => 'in_store',
            'status'             => 'ready_for_return',
            'issue_description'  => 'Thay cáp sạc hộp sạc 4',
            'total_price'        => 600000,
            'initial_price'      => 600000,
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $payment4 = Payment::forceCreate([
            'payment_code'        => 'FX26-PY-' . random_int(100000, 999999),
            'repair_order_id'     => $order4->id,
            'amount'              => 600000,
            'payment_method'      => 'cash',
            'status'              => 'pending',
            'received_by_user_id' => $this->adminUser->id,
        ]);

        $freshUser = User::withoutGlobalScopes()->findOrFail($this->adminUser->id);
        $this->assertFalse($freshUser->wasRecentlyCreated);
        $req = \Illuminate\Http\Request::create("/api/v1/payments/{$payment4->id}/confirm", 'POST', [
            'notes' => 'Duyệt qua confirmCash()',
        ]);
        $req->setUserResolver(fn () => $freshUser);

        $confirmCashResponse = app(\App\Http\Controllers\Api\V1\PaymentController::class)->confirmCash($req, $payment4->id);
        $this->assertSame(200, $confirmCashResponse->getStatusCode());
    }

    /**
     * Task 1.6: TelegramAiAssistantService::resolveBranchDisplay() nạp missing branch
     * trên bản ghi TelegramRecipient đọc từ DB (wasRecentlyCreated === false).
     */
    public function test_task_1_6_telegram_ai_assistant_service_resolves_branch_display_without_lazy_loading(): void
    {
        $recipient = TelegramRecipient::forceCreate([
            'tenant_id'        => $this->tenant->id,
            'branch_id'        => $this->branch->id,
            'label'            => 'Quản lý Chi nhánh P1',
            'phone'            => '0901234567',
            'connect_token'    => 'TOK_P1_' . uniqid(),
            'telegram_chat_id' => '9988776655',
            'target_role'      => 'admin',
            'is_active'        => true,
        ]);

        $freshRecipient = TelegramRecipient::withoutGlobalScopes()->findOrFail($recipient->id);
        $this->assertFalse($freshRecipient->wasRecentlyCreated);
        $this->assertFalse($freshRecipient->relationLoaded('branch'));

        $displayName = TelegramAiAssistantService::resolveBranchDisplay($freshRecipient);

        $this->assertSame($this->branch->name, $displayName);
        $this->assertTrue($freshRecipient->relationLoaded('branch'));
    }
}
