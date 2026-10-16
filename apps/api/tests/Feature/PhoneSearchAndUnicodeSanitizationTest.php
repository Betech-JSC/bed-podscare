<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\Shipment;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Warranty;
use App\Support\PhoneHelper;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PhoneSearchAndUnicodeSanitizationTest extends TestCase
{
    use DatabaseTransactions;

    private function createTestContext(): array
    {
        $suffix = uniqid();

        $tenant = Tenant::first() ?? Tenant::create([
            'name'                => "PodsCare Test {$suffix}",
            'code'                => "PC{$suffix}",
            'slug'                => "podscare-{$suffix}",
            'status'              => 'active',
            'subscription_status' => 'active',
        ]);

        $branch = Branch::where('tenant_id', $tenant->id)->first() ?? Branch::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Chi nhánh Test Q1',
            'code'      => 'Q1',
            'address'   => '123 Lê Lợi, Q.1',
            'phone'     => '0901000001',
            'is_active' => true,
        ]);

        $deviceModel = DeviceModel::where('tenant_id', $tenant->id)->first() ?? DeviceModel::create([
            'tenant_id'    => $tenant->id,
            'name'         => 'AirPods Pro 2',
            'model_code'   => 'APP2-' . $suffix,
            'category'     => 'airpods_pro',
            'release_year' => 2023,
        ]);

        $admin = User::forceCreate([
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'name'      => "Admin {$suffix}",
            'email'     => "admin_{$suffix}@podscare.test",
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $cskh = User::forceCreate([
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'name'      => "CSKH {$suffix}",
            'email'     => "cskh_{$suffix}@podscare.test",
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $tech = User::forceCreate([
            'tenant_id' => $tenant->id,
            'branch_id' => $branch->id,
            'name'      => "Tech {$suffix}",
            'email'     => "tech_{$suffix}@podscare.test",
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        return [$tenant, $branch, $deviceModel, $admin, $cskh, $tech];
    }

    public function test_phone_helper_sanitizes_invisible_unicode_and_normalizes_phone_numbers(): void
    {
        // Sanitize invisible directional control chars (\u202D, \u202C, \u200B, \uFEFF)
        $this->assertSame('089 8842339', PhoneHelper::sanitizeText("\u{202D}089 8842339\u{202C}"));
        $this->assertSame('dung', PhoneHelper::sanitizeText("\u{202D}dung"));
        $this->assertSame('Nguyễn Văn Dũng', PhoneHelper::sanitizeText("\u{FEFF}\u{200B}Nguyễn Văn Dũng\u{202C}"));

        // Normalize for storage
        $this->assertSame('0898842339', PhoneHelper::normalizeForStorage("\u{202D}089 884 2339\u{202C}"));
        $this->assertSame('0898842339', PhoneHelper::normalizeForStorage('+84 898.842-339'));
        $this->assertSame('09877839144', PhoneHelper::normalizeForStorage('9877839144'));
        $this->assertSame('0987783914', PhoneHelper::normalizeForStorage('987783914'));
    }

    public function test_orders_search_handles_invisible_unicode_and_residual_chars_in_name(): void
    {
        [$tenant, $branch, $deviceModel, $admin, $cskh] = $this->createTestContext();
        Sanctum::actingAs($cskh);

        $customer = Customer::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Trần Văn Dũng',
            'phone'     => '0898842339',
        ]);

        $order = RepairOrder::create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'order_code'         => 'PCQ1-UNI-' . uniqid(),
            'issue_description'  => 'Mất nguồn tai phải',
            'status'             => 'waiting_tech',
            'created_by_user_id' => $cskh->id,
        ]);

        // 1. Copy-paste từ Zalo/iOS Contacts kèm \u202D và \u202C + khoảng trắng
        $zaloPhoneQuery = urlencode("\u{202D}089 8842339\u{202C}");
        $resPhone = $this->getJson("/api/v1/orders?q={$zaloPhoneQuery}");
        $resPhone->assertStatus(200);
        $ids = collect($resPhone->json('data.data'))->pluck('id')->all();
        $this->assertContains($order->id, $ids);

        // 2. Xóa số đi gõ tên khách nhưng còn sót \u202D ở đầu chuỗi ("\u202Ddung")
        $dirtyNameQuery = urlencode("\u{202D}Dũng");
        $resName = $this->getJson("/api/v1/orders?q={$dirtyNameQuery}");
        $resName->assertStatus(200);
        $nameIds = collect($resName->json('data.data'))->pluck('id')->all();
        $this->assertContains($order->id, $nameIds);
    }

    public function test_flexible_phone_search_matches_missing_leading_zero_and_spaced_phones(): void
    {
        [$tenant, $branch, $deviceModel, $admin, $cskh] = $this->createTestContext();
        Sanctum::actingAs($cskh);

        // Khách 1 trong DB lưu thiếu số 0 ở đầu ("9877839144")
        $customerNoZero = Customer::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Khách Thiếu Số 0',
            'phone'     => '9877839144',
        ]);
        $orderNoZero = RepairOrder::create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'customer_id'        => $customerNoZero->id,
            'device_model_id'    => $deviceModel->id,
            'order_code'         => 'PCQ1-NOZERO-' . uniqid(),
            'issue_description'  => 'Rè loa trái',
            'status'             => 'in_repair',
            'created_by_user_id' => $cskh->id,
        ]);

        // Khách 2 trong DB lưu có khoảng trắng ("0836 686 939")
        $customerSpaced = Customer::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Khách Có Dấu Cách',
            'phone'     => '0836 686 939',
        ]);
        $orderSpaced = RepairOrder::create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'customer_id'        => $customerSpaced->id,
            'device_model_id'    => $deviceModel->id,
            'order_code'         => 'PCQ1-SPACED-' . uniqid(),
            'issue_description'  => 'Thay pin',
            'status'             => 'in_repair',
            'created_by_user_id' => $cskh->id,
        ]);

        // Tìm bằng SĐT có số 0 ở đầu ("09877839144") -> phải thấy đơn của khách lưu "9877839144"
        $res1 = $this->getJson('/api/v1/orders?q=09877839144');
        $res1->assertStatus(200);
        $this->assertContains($orderNoZero->id, collect($res1->json('data.data'))->pluck('id')->all());

        // Tìm bằng SĐT viết liền ("0836686939") -> phải thấy đơn của khách lưu "0836 686 939"
        $res2 = $this->getJson('/api/v1/orders?q=0836686939');
        $res2->assertStatus(200);
        $this->assertContains($orderSpaced->id, collect($res2->json('data.data'))->pluck('id')->all());
    }

    public function test_orders_search_bypasses_today_date_filter_and_technician_7_days_limit(): void
    {
        [$tenant, $branch, $deviceModel, $admin, $cskh, $tech] = $this->createTestContext();

        $customer = Customer::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Khách Đơn Cũ',
            'phone'     => '0898842339',
        ]);

        // Đơn tạo cách đây 15 ngày và đã hoàn tất (ngoài ca hôm nay và ngoài 7 ngày của KTV)
        $oldOrder = RepairOrder::create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'order_code'         => 'PCQ1-OLD-' . uniqid(),
            'issue_description'  => 'Đơn từ 15 ngày trước',
            'status'             => 'completed',
            'created_by_user_id' => $cskh->id,
        ]);
        RepairOrder::where('id', $oldOrder->id)->update([
            'created_at' => Carbon::now('Asia/Ho_Chi_Minh')->subDays(15),
            'updated_at' => Carbon::now('Asia/Ho_Chi_Minh')->subDays(14),
        ]);

        // 1. CSKH đang ở tab mặc định date_filter=today nhưng gõ q=0898842339 -> tìm thấy ngay
        Sanctum::actingAs($cskh);
        $resCskh = $this->getJson('/api/v1/orders?date_filter=today&q=0898842339');
        $resCskh->assertStatus(200);
        $this->assertContains($oldOrder->id, collect($resCskh->json('data.data'))->pluck('id')->all());

        // 2. KTV đang ở tab mặc định date_filter=today nhưng gõ q=0898842339 -> vượt giới hạn 7 ngày và tìm thấy ngay
        Sanctum::actingAs($tech);
        $resTech = $this->getJson('/api/v1/orders?date_filter=today&q=0898842339');
        $resTech->assertStatus(200);
        $this->assertContains($oldOrder->id, collect($resTech->json('data.data'))->pluck('id')->all());
    }

    public function test_order_store_and_customer_update_normalize_phone_and_sanitize_name(): void
    {
        [$tenant, $branch, $deviceModel, $admin, $cskh] = $this->createTestContext();
        Sanctum::actingAs($admin);

        // 1. Tạo đơn mới với SĐT thiếu số 0 đầu ("9877839144") và tên dính ký tự ẩn
        $resStore1 = $this->postJson('/api/v1/orders', [
            'branch_id'         => $branch->id,
            'customer_name'     => "\u{202D}Lê Hoàng Nam\u{202C}",
            'customer_phone'    => '9877839144',
            'device_model_id'   => $deviceModel->id,
            'issue_description' => 'Thay pin tai trái',
        ]);
        $resStore1->assertStatus(201);
        $this->assertSame('09877839144', $resStore1->json('data.customer.phone'));
        $this->assertSame('Lê Hoàng Nam', $resStore1->json('data.customer.name'));

        // 2. Tạo đơn tiếp theo cho cùng SĐT nhưng truyền dạng đầy đủ có số 0 và dấu cách -> không tạo trùng khách hàng
        $existingCustomerId = $resStore1->json('data.customer.id');
        $resStore1DuplicateCheck = $this->postJson('/api/v1/orders', [
            'branch_id'         => $branch->id,
            'customer_name'     => 'Lê Hoàng Nam',
            'customer_phone'    => "\u{202D}0987 783 9144\u{202C}",
            'device_model_id'   => $deviceModel->id,
            'issue_description' => 'Vệ sinh mic',
        ]);
        $resStore1DuplicateCheck->assertStatus(201);
        $this->assertSame($existingCustomerId, $resStore1DuplicateCheck->json('data.customer.id'));

        // 3. Tạo đơn mới với SĐT có ký tự ẩn Unicode và khoảng trắng
        $resStore2 = $this->postJson('/api/v1/orders', [
            'branch_id'         => $branch->id,
            'customer_name'     => "\u{202D}Phạm Minh Tuấn\u{202C}",
            'customer_phone'    => "\u{202D}089 884 2339\u{202C}",
            'device_model_id'   => $deviceModel->id,
            'issue_description' => 'Sửa hộp sạc',
        ]);
        $resStore2->assertStatus(201);
        $this->assertSame('0898842339', $resStore2->json('data.customer.phone'));
        $this->assertSame('Phạm Minh Tuấn', $resStore2->json('data.customer.name'));

        // 4. Admin cập nhật thông tin khách hàng trên đơn qua PUT /api/v1/orders/{id}
        $orderId2 = $resStore2->json('data.id');
        $resUpdateOrder = $this->putJson("/api/v1/orders/{$orderId2}", [
            'customer_name'  => "\u{202D}Phạm Minh Tuấn Admin\u{202C}",
            'customer_phone' => '836686939',
        ]);
        $resUpdateOrder->assertStatus(200)
            ->assertJsonPath('data.customer.name', 'Phạm Minh Tuấn Admin')
            ->assertJsonPath('data.customer.phone', '0836686939');

        // 5. Cập nhật hồ sơ khách hàng qua PUT /api/v1/customers/{id} với SĐT +84 và ký tự ẩn
        $customerId = $resStore2->json('data.customer.id');
        $resUpdateCustomer = $this->putJson("/api/v1/customers/{$customerId}", [
            'name'  => "\u{202D}Phạm Minh Tuấn Updated\u{202C}",
            'phone' => "\u{202D}+84 912 345 678\u{202C}",
        ]);
        $resUpdateCustomer->assertStatus(200)
            ->assertJsonPath('data.name', 'Phạm Minh Tuấn Updated')
            ->assertJsonPath('data.phone', '0912345678');
    }

    public function test_customers_warranties_payments_and_shipments_phone_search(): void
    {
        [$tenant, $branch, $deviceModel, $admin, $cskh] = $this->createTestContext();
        Sanctum::actingAs($admin);

        $customer = Customer::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Vũ Thị Mai',
            'phone'     => '976543210', // Lưu thiếu số 0 đầu trong dữ liệu lịch sử
        ]);

        $order = RepairOrder::create([
            'tenant_id'          => $tenant->id,
            'branch_id'          => $branch->id,
            'customer_id'        => $customer->id,
            'device_model_id'    => $deviceModel->id,
            'order_code'         => 'PCQ1-ALL-' . uniqid(),
            'issue_description'  => 'Vệ sinh loa',
            'status'             => 'completed',
            'total_price'        => 300000,
            'created_by_user_id' => $admin->id,
        ]);

        $warranty = Warranty::create([
            'tenant_id'       => $tenant->id,
            'warranty_code'   => 'FX26-WR-' . rand(100000, 999999),
            'repair_order_id' => $order->id,
            'customer_id'     => $customer->id,
            'device_model_id' => $deviceModel->id,
            'coverage_item'   => 'Bảo hành loa',
            'start_date'      => Carbon::now()->toDateString(),
            'duration_days'   => 90,
            'end_date'        => Carbon::now()->addDays(90)->toDateString(),
            'status'          => 'active',
        ]);

        $payment = Payment::create([
            'tenant_id'           => $tenant->id,
            'payment_code'        => 'FX26-PY-' . rand(100000, 999999),
            'repair_order_id'     => $order->id,
            'amount'              => 300000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => Carbon::now(),
            'received_by_user_id' => $admin->id,
        ]);

        $shipment = Shipment::create([
            'tenant_id'          => $tenant->id,
            'shipment_code'      => 'SH-' . date('Ymd') . '-' . rand(1000, 9999),
            'repair_order_id'    => $order->id,
            'delivery_method'    => 'home_delivery',
            'carrier_name'       => 'GHTK',
            'tracking_code'      => 'GHTK' . rand(10000, 99999),
            'status'             => 'pending',
            'created_by_user_id' => $admin->id,
        ]);

        $queryWithZeroAndUnicode = urlencode("\u{202D}0976 543 210\u{202C}");

        // 1. /api/v1/customers
        $resCustomers = $this->getJson("/api/v1/customers?q={$queryWithZeroAndUnicode}");
        $resCustomers->assertStatus(200);
        $this->assertContains($customer->id, collect($resCustomers->json('data.data'))->pluck('id')->all());

        // 2. /api/v1/warranties/lookup (bằng cả phone lẫn code chứa cụm số cuối SĐT)
        $resLookup = $this->getJson("/api/v1/warranties/lookup?phone={$queryWithZeroAndUnicode}");
        $resLookup->assertStatus(200);
        $this->assertContains($warranty->id, collect($resLookup->json('data'))->pluck('id')->all());

        $resLookupPartialCode = $this->getJson('/api/v1/warranties/lookup?code=543210');
        $resLookupPartialCode->assertStatus(200);
        $this->assertContains($warranty->id, collect($resLookupPartialCode->json('data'))->pluck('id')->all());

        // 3. /api/v1/warranties & /api/v1/warranties/history
        $resWarranties = $this->getJson("/api/v1/warranties?q={$queryWithZeroAndUnicode}");
        $resWarranties->assertStatus(200);
        $this->assertContains($warranty->id, collect($resWarranties->json('data.data'))->pluck('id')->all());

        $resHistory = $this->getJson("/api/v1/warranties/history?phone={$queryWithZeroAndUnicode}");
        $resHistory->assertStatus(200)
            ->assertJsonPath('data.customer.id', $customer->id);

        // 4. /api/v1/payments
        $resPayments = $this->getJson("/api/v1/payments?q={$queryWithZeroAndUnicode}");
        $resPayments->assertStatus(200);
        $this->assertContains($payment->id, collect($resPayments->json('data.data'))->pluck('id')->all());

        // 5. /api/v1/shipments
        $resShipments = $this->getJson("/api/v1/shipments?q={$queryWithZeroAndUnicode}");
        $resShipments->assertStatus(200);
        $this->assertContains($shipment->id, collect($resShipments->json('data.data'))->pluck('id')->all());
    }
}
