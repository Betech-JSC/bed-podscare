<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\Payment;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class Stage2OperationsAndFinancePaginationTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenantA;
    protected Tenant $tenantB;
    protected Branch $branchA1;
    protected Branch $branchA2;
    protected Branch $branchB1;
    protected DeviceModel $devicePro2;
    protected DeviceModel $deviceMax;
    protected User $adminTenantA;
    protected User $cskhBranchA1;
    protected User $cskhBranchA2;
    protected User $techBranchA1;
    protected User $adminTenantB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenantA = Tenant::create([
            'code'   => 'tenant_s2_a_' . uniqid(),
            'name'   => 'PodsCare Stage2 Store A',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->tenantB = Tenant::create([
            'code'   => 'tenant_s2_b_' . uniqid(),
            'name'   => 'PodsCare Stage2 Store B',
            'status' => 'active',
            'plan'   => 'basic',
        ]);

        $this->branchA1 = Branch::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'BR_S2_A1_' . uniqid(),
            'phone'     => '0901111222',
            'address'   => '101 Nguyễn Huệ, Q1',
            'is_active' => true,
        ]);

        $this->branchA2 = Branch::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'name'      => 'Chi nhánh Quận 3',
            'code'      => 'BR_S2_A2_' . uniqid(),
            'phone'     => '0901111333',
            'address'   => '202 Võ Văn Tần, Q3',
            'is_active' => true,
        ]);

        $this->branchB1 = Branch::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'name'      => 'Chi nhánh Store B',
            'code'      => 'BR_S2_B1_' . uniqid(),
            'phone'     => '0902222333',
            'address'   => '303 Cầu Giấy, HN',
            'is_active' => true,
        ]);

        $this->devicePro2 = DeviceModel::create([
            'name'       => 'AirPods Pro 2 USB-C ' . uniqid(),
            'model_code' => 'A3048_S2_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->deviceMax = DeviceModel::create([
            'name'       => 'AirPods Max Type-C ' . uniqid(),
            'model_code' => 'A3184_S2_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->adminTenantA = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'Admin Store A',
            'email'     => 'admin_s2_a_' . uniqid() . '@podscare.vn',
            'phone'     => '098' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->cskhBranchA1 = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'CSKH Quận 1',
            'email'     => 'cskh_s2_a1_' . uniqid() . '@podscare.vn',
            'phone'     => '097' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->cskhBranchA2 = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA2->id,
            'name'      => 'CSKH Quận 3',
            'email'     => 'cskh_s2_a2_' . uniqid() . '@podscare.vn',
            'phone'     => '096' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'cskh',
            'is_active' => true,
        ]);

        $this->techBranchA1 = User::forceCreate([
            'tenant_id' => $this->tenantA->id,
            'branch_id' => $this->branchA1->id,
            'name'      => 'KTV Quận 1',
            'email'     => 'tech_s2_a1_' . uniqid() . '@podscare.vn',
            'phone'     => '094' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'technician',
            'is_active' => true,
        ]);

        $this->adminTenantB = User::forceCreate([
            'tenant_id' => $this->tenantB->id,
            'branch_id' => $this->branchB1->id,
            'name'      => 'Admin Store B',
            'email'     => 'admin_s2_b_' . uniqid() . '@podscare.vn',
            'phone'     => '095' . random_int(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);
    }

    /**
     * Helper tạo nhanh khách hàng và đơn sửa chữa.
     */
    protected function createOrder(array $overrides = []): RepairOrder
    {
        $tenantId = $overrides['tenant_id'] ?? $this->tenantA->id;
        $branchId = $overrides['branch_id'] ?? $this->branchA1->id;
        $deviceModelId = $overrides['device_model_id'] ?? $this->devicePro2->id;

        $customer = $overrides['customer'] ?? Customer::withoutGlobalScopes()->forceCreate([
            'tenant_id'    => $tenantId,
            'name'         => $overrides['customer_name'] ?? ('Khách S2 ' . uniqid()),
            'phone'        => $overrides['customer_phone'] ?? ('091' . random_int(1000000, 9999999)),
            'orders_count' => 1,
            'total_spent'  => 500000,
        ]);

        $createdAt = $overrides['created_at'] ?? Carbon::now('Asia/Ho_Chi_Minh');

        return RepairOrder::withoutGlobalScopes()->forceCreate([
            'tenant_id'            => $tenantId,
            'branch_id'            => $branchId,
            'customer_id'          => $customer->id,
            'device_model_id'      => $deviceModelId,
            'order_code'           => $overrides['order_code'] ?? ('RO-S2-' . strtoupper(uniqid())),
            'order_type'           => $overrides['order_type'] ?? 'in_store',
            'status'               => $overrides['status'] ?? 'received',
            'issue_description'    => $overrides['issue_description'] ?? 'Thay pin tai nghe AirPods',
            'serial_number'        => $overrides['serial_number'] ?? ('SN-S2-' . strtoupper(uniqid())),
            'total_price'          => $overrides['total_price'] ?? 500000,
            'initial_price'        => $overrides['initial_price'] ?? 500000,
            'technician_id'        => $overrides['technician_id'] ?? null,
            'special_parts_needed' => $overrides['special_parts_needed'] ?? null,
            'special_parts_status' => $overrides['special_parts_status'] ?? null,
            'created_by_user_id'   => $overrides['created_by_user_id'] ?? $this->adminTenantA->id,
            'created_at'           => $createdAt,
            'updated_at'           => $overrides['updated_at'] ?? $createdAt,
        ]);
    }

    /**
     * Test 1: GET /api/v1/orders hỗ trợ page, per_page (1..500), per_page=all / all=true,
     * trả kèm summary chính xác theo loại đơn và trạng thái, đồng thời cô lập branch_id / tenant_id.
     */
    public function test_orders_index_paginates_supports_per_page_all_and_returns_accurate_summary(): void
    {
        // Tạo 10 đơn in_store đang sửa (assigned cho KTV, 2 đơn có special_parts_status = pending)
        for ($i = 1; $i <= 10; $i++) {
            $this->createOrder([
                'order_type'           => 'in_store',
                'status'               => 'in_repair',
                'technician_id'        => $this->techBranchA1->id,
                'special_parts_status' => $i <= 2 ? 'pending' : null,
                'special_parts_needed' => $i <= 2 ? 'IC nguồn đặc biệt' : null,
            ]);
        }

        // Tạo 5 đơn cod chờ QC (assigned cho KTV)
        for ($i = 1; $i <= 5; $i++) {
            $this->createOrder([
                'order_type'    => 'cod',
                'status'        => 'waiting_qc',
                'technician_id' => $this->techBranchA1->id,
            ]);
        }

        // Tạo 4 đơn warranty mới tiếp nhận (chưa gán KTV -> unassigned)
        for ($i = 1; $i <= 4; $i++) {
            $this->createOrder([
                'order_type'    => 'warranty',
                'status'        => 'received',
                'technician_id' => null,
            ]);
        }

        // Tạo 3 đơn in_store sẵn sàng trả khách (assigned cho KTV)
        for ($i = 1; $i <= 3; $i++) {
            $this->createOrder([
                'order_type'    => 'in_store',
                'status'        => 'ready_for_return',
                'technician_id' => $this->techBranchA1->id,
            ]);
        }

        // Tạo 3 đơn in_store đã hoàn tất (assigned cho KTV)
        for ($i = 1; $i <= 3; $i++) {
            $this->createOrder([
                'order_type'    => 'in_store',
                'status'        => 'completed',
                'technician_id' => $this->techBranchA1->id,
            ]);
        }

        // Tạo thêm đơn ở Branch A2 (4 đơn) và Tenant B (6 đơn) để kiểm chứng cô lập
        for ($i = 1; $i <= 4; $i++) {
            $this->createOrder([
                'tenant_id' => $this->tenantA->id,
                'branch_id' => $this->branchA2->id,
                'status'    => 'received',
            ]);
        }
        for ($i = 1; $i <= 6; $i++) {
            $this->createOrder([
                'tenant_id' => $this->tenantB->id,
                'branch_id' => $this->branchB1->id,
                'status'    => 'received',
            ]);
        }

        // Tổng Branch A1 = 25 đơn:
        // - in_store = 16 (10 + 3 + 3), cod = 5, warranty = 4, special_parts = 2
        // - unassigned = 4, all_count = 25, open_count = 22 (trừ 3 completed),
        // - in_workshop_count = 19 (10 in_repair + 5 waiting_qc + 4 received),
        // - waiting_pickup_count = 3, waiting_qc_count = 5, completed_count = 3
        $expectedSummaryA1 = [
            'total'                => 25,
            'in_store_count'       => 16,
            'cod_count'            => 5,
            'warranty_count'       => 4,
            'special_parts_count'  => 2,
            'unassigned_count'     => 4,
            'all_count'            => 25,
            'open_count'           => 22,
            'in_workshop_count'    => 19,
            'waiting_pickup_count' => 3,
            'waiting_qc_count'     => 5,
            'completed_count'      => 3,
        ];

        // 1. Phân trang page=1&per_page=15 tại Branch A1
        $resP1 = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?page=1&per_page=15&date_filter=all');

        $resP1->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.per_page', 15)
            ->assertJsonPath('data.total', 25)
            ->assertJsonPath('data.last_page', 2)
            ->assertJsonPath('data.from', 1)
            ->assertJsonPath('data.to', 15)
            ->assertJsonPath('data.summary', $expectedSummaryA1);
        $this->assertCount(15, $resP1->json('data.data'));

        // 2. Phân trang page=2&per_page=15 trả về 10 đơn còn lại
        $resP2 = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?page=2&per_page=15&date_filter=all');

        $resP2->assertStatus(200)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.total', 25)
            ->assertJsonPath('data.from', 16)
            ->assertJsonPath('data.to', 25)
            ->assertJsonPath('data.summary', $expectedSummaryA1);
        $this->assertCount(10, $resP2->json('data.data'));

        // 3. Chế độ per_page=all và all=true
        $resAll = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?per_page=all&date_filter=all');

        $resAll->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', 25)
            ->assertJsonPath('data.summary', $expectedSummaryA1);
        $this->assertCount(25, $resAll->json('data.data'));

        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?all=true&date_filter=all')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 25);

        // 4. Kẹp biên per_page (1..500)
        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?per_page=9999&date_filter=all')
            ->assertStatus(200)
            ->assertJsonPath('data.per_page', 500);

        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?per_page=0&date_filter=all')
            ->assertStatus(200)
            ->assertJsonPath('data.per_page', 1);

        // 5. Admin Tenant A xem toàn bộ chi nhánh thấy 29 đơn (25 + 4), không lẫn 6 đơn của Tenant B
        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/orders?per_page=all&date_filter=all')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 29)
            ->assertJsonPath('data.summary.all_count', 29);
    }

    /**
     * Test 2: GET /api/v1/orders hỗ trợ lọc status=waiting_qc (kể cả đơn cũ hơn 15 đơn mới nhất),
     * lọc đa trạng thái statuses / status comma-separated, order_type=warranty, quote_candidates=true,
     * unpaid_only=true, và tìm kiếm từ khóa q.
     */
    public function test_orders_index_supports_multi_status_warranty_quote_candidates_unpaid_only_and_search(): void
    {
        // Tạo 8 đơn ở trạng thái waiting_qc từ 10 ngày trước (giả lập đơn tồn đọng chờ QC nằm sâu phía sau)
        for ($i = 1; $i <= 8; $i++) {
            $this->createOrder([
                'order_code' => sprintf('RO-QC-OLD-%02d', $i),
                'status'     => 'waiting_qc',
                'created_at' => Carbon::now('Asia/Ho_Chi_Minh')->subDays(10),
            ]);
        }

        // Tạo 20 đơn mới tiếp nhận hôm nay (nằm ở trang 1 nếu không lọc status)
        for ($i = 1; $i <= 20; $i++) {
            $this->createOrder([
                'order_code' => sprintf('RO-NEW-%02d', $i),
                'status'     => 'received',
                'order_type' => $i <= 6 ? 'warranty' : 'in_store',
            ]);
        }

        // Tạo 5 đơn waiting_approval (quote candidate) và 4 đơn waiting_parts
        for ($i = 1; $i <= 5; $i++) {
            $this->createOrder([
                'status' => 'waiting_approval',
            ]);
        }
        for ($i = 1; $i <= 4; $i++) {
            $this->createOrder([
                'status' => 'waiting_parts',
            ]);
        }

        // Tạo 3 đơn ready_for_return: trong đó 1 đơn đã thanh toán (paid), 1 đơn chỉ mới pending, 1 đơn chưa có phiếu thu
        $paidOrder = $this->createOrder([
            'order_code'  => 'RO-PAID-001',
            'status'      => 'ready_for_return',
            'total_price' => 600000,
        ]);
        Payment::forceCreate([
            'payment_code'        => 'FX26-PY-PAID01',
            'repair_order_id'     => $paidOrder->id,
            'amount'              => 600000,
            'payment_method'      => 'cash',
            'status'              => 'paid',
            'paid_at'             => now(),
            'received_by_user_id' => $this->cskhBranchA1->id,
        ]);

        $pendingPaymentOrder = $this->createOrder([
            'order_code'  => 'RO-UNPAID-PENDING-002',
            'status'      => 'ready_for_return',
            'total_price' => 750000,
        ]);
        Payment::forceCreate([
            'payment_code'        => 'FX26-PY-PEND02',
            'repair_order_id'     => $pendingPaymentOrder->id,
            'amount'              => 750000,
            'payment_method'      => 'bank_transfer',
            'status'              => 'pending',
            'received_by_user_id' => $this->cskhBranchA1->id,
        ]);

        $noPaymentOrder = $this->createOrder([
            'order_code'        => 'RO-UNPAID-NONE-003',
            'status'            => 'waiting_pickup',
            'total_price'       => 900000,
            'serial_number'     => 'SN-SPECIAL-MAX-999',
            'issue_description' => 'Mất nguồn hoàn toàn bên phải',
            'customer_name'     => 'Lê Hoàng Châu',
            'customer_phone'    => '0908123987',
            'device_model_id'   => $this->deviceMax->id,
        ]);

        // 1. Scenario QC: Lọc status=waiting_qc trả về đầy đủ cả 8 đơn chờ QC dù tạo từ 10 ngày trước và sau 20 đơn mới
        $resWaitingQc = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?status=waiting_qc&page=1&per_page=15');

        $resWaitingQc->assertStatus(200)
            ->assertJsonPath('data.total', 8)
            ->assertJsonPath('data.current_page', 1);
        $this->assertCount(8, $resWaitingQc->json('data.data'));

        // 2. Lọc đa trạng thái bằng comma-separated status=waiting_qc,waiting_parts (8 + 4 = 12)
        $resCommaStatuses = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?status=waiting_qc,waiting_parts&per_page=all');

        $resCommaStatuses->assertStatus(200)
            ->assertJsonPath('data.total', 12);

        // 3. Lọc đa trạng thái bằng mảng statuses[]=waiting_approval&statuses[]=waiting_parts (5 + 4 = 9)
        $resArrayStatuses = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?statuses[]=waiting_approval&statuses[]=waiting_parts&per_page=all');

        $resArrayStatuses->assertStatus(200)
            ->assertJsonPath('data.total', 9);

        // 4. Lọc order_type=warranty trả về đúng 6 đơn bảo hành, đồng thời summary.warranty_count = 6
        $resWarrantyType = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?order_type=warranty&date_filter=all&per_page=15');

        $resWarrantyType->assertStatus(200)
            ->assertJsonPath('data.total', 6)
            ->assertJsonPath('data.summary.warranty_count', 6);

        // 5. Lọc quote_candidates=true (và status=quote_candidates) trả về đúng 25 đơn (20 received + 5 waiting_approval)
        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?quote_candidates=true&per_page=15&page=1')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 25)
            ->assertJsonPath('data.last_page', 2);

        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?status=quote_candidates&per_page=all')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 25);

        // 6. Lọc đơn chờ thu tiền VietQR: status=ready_for_return,waiting_pickup & unpaid_only=true
        // Chỉ trả về 2 đơn chưa thu tiền (RO-UNPAID-PENDING-002 và RO-UNPAID-NONE-003), loại bỏ RO-PAID-001
        $resUnpaidReady = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/orders?status=ready_for_return,waiting_pickup&unpaid_only=true&per_page=all');

        $resUnpaidReady->assertStatus(200)
            ->assertJsonPath('data.total', 2);
        $returnedCodes = collect($resUnpaidReady->json('data.data'))->pluck('order_code')->all();
        $this->assertContains('RO-UNPAID-PENDING-002', $returnedCodes);
        $this->assertContains('RO-UNPAID-NONE-003', $returnedCodes);
        $this->assertNotContains('RO-PAID-001', $returnedCodes);

        // 7. Tìm kiếm từ khóa q theo mã đơn, serial, lỗi, tên khách, SĐT và tên dòng máy
        foreach ([
            'RO-UNPAID-NONE-003',
            'SN-SPECIAL-MAX-999',
            'Mất nguồn hoàn toàn bên phải',
            'Lê Hoàng Châu',
            '0908123987',
            'AirPods Max Type-C',
        ] as $keyword) {
            $this->actingAs($this->cskhBranchA1, 'sanctum')
                ->getJson('/api/v1/orders?q=' . urlencode($keyword))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.order_code', $noPaymentOrder->order_code);
        }
    }

    /**
     * Test 3: GET /api/v1/quotes hỗ trợ page, per_page, per_page=all / all=true (vượt mốc 15 báo giá cũ),
     * lọc repair_order_ids, status, tìm kiếm q và cô lập branch_id / tenant_id.
     */
    public function test_quotes_index_paginates_beyond_15_supports_per_page_all_repair_order_ids_search_and_isolation(): void
    {
        $targetOrderIds = [];
        $targetOrderCodes = [];

        // Tạo 21 báo giá tại Branch A1
        for ($i = 1; $i <= 21; $i++) {
            $order = $this->createOrder([
                'tenant_id'  => $this->tenantA->id,
                'branch_id'  => $this->branchA1->id,
                'order_code' => sprintf('RO-QT-A1-%03d', $i),
                'status'     => 'waiting_approval',
            ]);

            if ($i <= 3) {
                $targetOrderIds[] = $order->id;
                $targetOrderCodes[] = $order->order_code;
            }

            RepairQuote::withoutGlobalScopes()->forceCreate([
                'tenant_id'           => $this->tenantA->id,
                'repair_order_id'     => $order->id,
                'quote_number'        => sprintf('Q-202610-%04d', $i),
                'total_amount'        => 450000 + ($i * 10000),
                'warranty_terms_days' => 90,
                'note'                => "Báo giá thay pin đợt {$i}",
                'status'              => $i <= 15 ? 'pending' : 'approved',
                'sent_by_user_id'     => $this->cskhBranchA1->id,
                'sent_at'             => now(),
            ]);
        }

        // Tạo 1 báo giá đặc biệt ở Branch A1 để test tìm kiếm q
        $specialOrder = $this->createOrder([
            'tenant_id'       => $this->tenantA->id,
            'branch_id'       => $this->branchA1->id,
            'order_code'      => 'RO-QT-SPECIAL-777',
            'serial_number'   => 'SN-QT-777',
            'customer_name'   => 'Phạm Gia Huy',
            'customer_phone'  => '0933444555',
            'device_model_id' => $this->deviceMax->id,
            'status'          => 'waiting_approval',
        ]);
        RepairQuote::withoutGlobalScopes()->forceCreate([
            'tenant_id'           => $this->tenantA->id,
            'repair_order_id'     => $specialOrder->id,
            'quote_number'        => 'Q-SPECIAL-7777',
            'total_amount'        => 1250000,
            'warranty_terms_days' => 180,
            'note'                => 'Thay cụm màng loa AirPods Max chính hãng',
            'status'              => 'pending',
            'sent_by_user_id'     => $this->cskhBranchA1->id,
            'sent_at'             => now(),
        ]);

        // Tạo 3 báo giá ở Branch A2 và 4 báo giá ở Tenant B
        for ($j = 1; $j <= 3; $j++) {
            $orderA2 = $this->createOrder([
                'tenant_id' => $this->tenantA->id,
                'branch_id' => $this->branchA2->id,
            ]);
            RepairQuote::withoutGlobalScopes()->forceCreate([
                'tenant_id'           => $this->tenantA->id,
                'repair_order_id'     => $orderA2->id,
                'quote_number'        => "Q-A2-{$j}-" . uniqid(),
                'total_amount'        => 500000,
                'warranty_terms_days' => 90,
                'note'                => 'Báo giá chi nhánh 2',
                'status'              => 'pending',
                'sent_by_user_id'     => $this->cskhBranchA2->id,
                'sent_at'             => now(),
            ]);
        }

        for ($k = 1; $k <= 4; $k++) {
            $orderB1 = $this->createOrder([
                'tenant_id' => $this->tenantB->id,
                'branch_id' => $this->branchB1->id,
            ]);
            RepairQuote::withoutGlobalScopes()->forceCreate([
                'tenant_id'           => $this->tenantB->id,
                'repair_order_id'     => $orderB1->id,
                'quote_number'        => "Q-B1-{$k}-" . uniqid(),
                'total_amount'        => 600000,
                'warranty_terms_days' => 90,
                'note'                => 'Báo giá cửa hàng B',
                'status'              => 'pending',
                'sent_by_user_id'     => $this->adminTenantB->id,
                'sent_at'             => now(),
            ]);
        }

        // Tổng báo giá Branch A1 = 22 (21 + 1)
        // 1. Trang 1 (per_page=15)
        $resP1 = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/quotes?page=1&per_page=15');

        $resP1->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.per_page', 15)
            ->assertJsonPath('data.total', 22)
            ->assertJsonPath('data.last_page', 2)
            ->assertJsonPath('data.from', 1)
            ->assertJsonPath('data.to', 15);
        $this->assertCount(15, $resP1->json('data.data'));

        // 2. Trang 2 (per_page=15) trả về 7 báo giá còn lại (không bị cắt mất sau bản ghi 15)
        $resP2 = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/quotes?page=2&per_page=15');

        $resP2->assertStatus(200)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.total', 22)
            ->assertJsonPath('data.from', 16)
            ->assertJsonPath('data.to', 22);
        $this->assertCount(7, $resP2->json('data.data'));

        // 3. per_page=all / all=true vượt mốc 15 mặc định cũ, trả về đủ 22 báo giá của Branch A1
        $resAll = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/quotes?per_page=all');

        $resAll->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', 22);
        $this->assertCount(22, $resAll->json('data.data'));

        // 4. Cô lập chi nhánh và tenant: Admin Tenant A thấy 25 (22 + 3), Admin Tenant B thấy 4
        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/quotes?all=true')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 25);

        $this->actingAs($this->adminTenantB, 'sanctum')
            ->getJson('/api/v1/quotes?all=true')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 4);

        // 5. Lọc repair_order_ids theo danh sách ID số và theo danh sách mã order_code
        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/quotes?repair_order_ids=' . implode(',', $targetOrderIds))
            ->assertStatus(200)
            ->assertJsonPath('data.total', 3);

        $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/quotes?repair_order_ids=' . implode(',', $targetOrderCodes))
            ->assertStatus(200)
            ->assertJsonPath('data.total', 3);

        // 6. Tìm kiếm q trên quotes
        foreach ([
            'Q-SPECIAL-7777',
            'màng loa AirPods Max chính hãng',
            'RO-QT-SPECIAL-777',
            'Phạm Gia Huy',
            '0933444555',
        ] as $keyword) {
            $this->actingAs($this->cskhBranchA1, 'sanctum')
                ->getJson('/api/v1/quotes?q=' . urlencode($keyword))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.quote_number', 'Q-SPECIAL-7777');
        }
    }

    /**
     * Test 4: GET /api/v1/payments hỗ trợ phân trang (page, per_page, per_page=all, all=true),
     * lọc theo date / payment_method / q, cô lập chi nhánh & tenant, và trả về summary toàn cục chính xác
     * (45 giao dịch với tổng thực thu 32.000.000 ₫ không bị cắt theo trang 15 dòng).
     */
    public function test_payments_index_paginates_filters_and_returns_accurate_global_summary(): void
    {
        $targetDate = '2026-10-20';
        $otherDate = '2026-10-22';

        // 1. Tạo 25 giao dịch chuyển khoản VietQR (bank_transfer) đã thanh toán (paid), mỗi giao dịch 800.000 ₫ => 20.000.000 ₫
        for ($i = 1; $i <= 25; $i++) {
            $order = $this->createOrder([
                'tenant_id'   => $this->tenantA->id,
                'branch_id'   => $this->branchA1->id,
                'status'      => 'completed',
                'total_price' => 800000,
            ]);

            Payment::forceCreate([
                'payment_code'        => sprintf('FX26-PY-TRF-%03d', $i),
                'repair_order_id'     => $order->id,
                'amount'              => 800000,
                'payment_method'      => 'bank_transfer',
                'transaction_ref'     => sprintf('SEPAY-REF-%03d', $i),
                'status'              => 'paid',
                'paid_at'             => Carbon::parse($i <= 10 ? "{$targetDate} 10:00:00" : "{$otherDate} 14:00:00"),
                'received_by_user_id' => $this->cskhBranchA1->id,
                'notes'               => 'Thu qua VietQR SePay',
            ]);
        }

        // 2. Tạo 15 giao dịch tiền mặt (cash) đã thanh toán (paid), mỗi giao dịch 800.000 ₫ => 12.000.000 ₫
        for ($i = 1; $i <= 15; $i++) {
            $order = $this->createOrder([
                'tenant_id'   => $this->tenantA->id,
                'branch_id'   => $this->branchA1->id,
                'status'      => 'completed',
                'total_price' => 800000,
            ]);

            Payment::forceCreate([
                'payment_code'        => sprintf('FX26-PY-CSH-%03d', $i),
                'repair_order_id'     => $order->id,
                'amount'              => 800000,
                'payment_method'      => 'cash',
                'status'              => 'paid',
                'paid_at'             => Carbon::parse("{$otherDate} 15:30:00"),
                'received_by_user_id' => $this->cskhBranchA1->id,
                'notes'               => 'Thu tiền mặt tại quầy',
            ]);
        }

        // 3. Tạo 3 giao dịch chờ chuyển khoản (pending) và 2 giao dịch đã hoàn tiền (refunded: tổng hoàn 1.500.000 ₫)
        for ($i = 1; $i <= 3; $i++) {
            $order = $this->createOrder([
                'tenant_id'      => $this->tenantA->id,
                'branch_id'      => $this->branchA1->id,
                'order_code'     => $i === 1 ? 'RO-PAY-FIND-999' : ('RO-PEND-' . uniqid()),
                'customer_name'  => $i === 1 ? 'Đặng Thu Thảo' : ('Khách Chờ ' . $i),
                'customer_phone' => $i === 1 ? '0912345678' : ('091' . random_int(1000000, 9999999)),
                'status'         => 'ready_for_return',
                'total_price'    => 500000,
            ]);

            Payment::forceCreate([
                'payment_code'        => $i === 1 ? 'FX26-PY-FIND-999' : sprintf('FX26-PY-PND-%03d', $i),
                'repair_order_id'     => $order->id,
                'amount'              => 500000,
                'payment_method'      => 'bank_transfer',
                'status'              => 'pending',
                'created_at'          => Carbon::parse("{$otherDate} 16:00:00"),
                'received_by_user_id' => $this->cskhBranchA1->id,
            ]);
        }

        for ($i = 1; $i <= 2; $i++) {
            $order = $this->createOrder([
                'tenant_id'   => $this->tenantA->id,
                'branch_id'   => $this->branchA1->id,
                'status'      => 'cancelled',
                'total_price' => 750000,
            ]);

            Payment::forceCreate([
                'payment_code'        => sprintf('FX26-PY-RFD-%03d', $i),
                'repair_order_id'     => $order->id,
                'amount'              => 750000,
                'refund_amount'       => 750000,
                'payment_method'      => 'cash',
                'status'              => 'refunded',
                'paid_at'             => Carbon::parse("{$otherDate} 11:00:00"),
                'refunded_at'         => Carbon::parse("{$otherDate} 17:00:00"),
                'refund_reason'       => 'Hoàn tiền cho khách',
                'refund_method'       => 'cash',
                'received_by_user_id' => $this->cskhBranchA1->id,
                'refunded_by_user_id' => $this->adminTenantA->id,
            ]);
        }

        // Tạo thêm giao dịch ở Branch A2 (2 phiếu thu) và Tenant B (3 phiếu thu) để kiểm tra cô lập
        for ($j = 1; $j <= 2; $j++) {
            $oA2 = $this->createOrder([
                'tenant_id' => $this->tenantA->id,
                'branch_id' => $this->branchA2->id,
            ]);
            Payment::forceCreate([
                'payment_code'        => "FX26-PY-A2-{$j}-" . uniqid(),
                'repair_order_id'     => $oA2->id,
                'amount'              => 1000000,
                'payment_method'      => 'cash',
                'status'              => 'paid',
                'paid_at'             => now(),
                'received_by_user_id' => $this->cskhBranchA2->id,
            ]);
        }

        for ($k = 1; $k <= 3; $k++) {
            $oB1 = $this->createOrder([
                'tenant_id' => $this->tenantB->id,
                'branch_id' => $this->branchB1->id,
            ]);
            Payment::forceCreate([
                'payment_code'        => "FX26-PY-B1-{$k}-" . uniqid(),
                'repair_order_id'     => $oB1->id,
                'amount'              => 2000000,
                'payment_method'      => 'bank_transfer',
                'status'              => 'paid',
                'paid_at'             => now(),
                'received_by_user_id' => $this->adminTenantB->id,
            ]);
        }

        // Kiểm chứng Scenario trong Spec:
        // Branch A1 có 45 giao dịch (25 transfer paid = 20tr, 15 cash paid = 12tr, 3 pending, 2 refunded = 1.5tr)
        // Tổng thực thu = 32.000.000 ₫
        $resPage1 = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/payments?page=1&per_page=15');

        $resPage1->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.per_page', 15)
            ->assertJsonPath('data.total', 45)
            ->assertJsonPath('data.last_page', 3)
            ->assertJsonPath('data.from', 1)
            ->assertJsonPath('data.to', 15)
            ->assertJsonPath('data.summary.total_amount', 32000000)
            ->assertJsonPath('data.summary.total_collected', 32000000)
            ->assertJsonPath('data.summary.transfer_amount', 20000000)
            ->assertJsonPath('data.summary.cash_amount', 12000000)
            ->assertJsonPath('data.summary.refunded_amount', 1500000)
            ->assertJsonPath('data.summary.total_count', 45)
            ->assertJsonPath('data.summary.completed_count', 40)
            ->assertJsonPath('data.summary.pending_count', 3)
            ->assertJsonPath('data.summary.refunded_count', 2)
            ->assertJsonPath('data.summary.transfer_count', 25)
            ->assertJsonPath('data.summary.cash_count', 15);
        $this->assertCount(15, $resPage1->json('data.data'));

        // Trang 2 (16..30) vẫn giữ nguyên summary toàn cục 32.000.000 ₫
        $resPage2 = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/payments?page=2&per_page=15');

        $resPage2->assertStatus(200)
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.from', 16)
            ->assertJsonPath('data.to', 30)
            ->assertJsonPath('data.summary.total_amount', 32000000);
        $this->assertCount(15, $resPage2->json('data.data'));

        // Chế độ per_page=all trả về toàn bộ 45 phiếu thu
        $resAll = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/payments?per_page=all');

        $resAll->assertStatus(200)
            ->assertJsonPath('data.current_page', 1)
            ->assertJsonPath('data.last_page', 1)
            ->assertJsonPath('data.total', 45);
        $this->assertCount(45, $resAll->json('data.data'));

        // Lọc theo ngày date=2026-10-20 (có 10 giao dịch bank_transfer = 8.000.000 ₫)
        $resByDate = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson("/api/v1/payments?date={$targetDate}&page=1&per_page=15");

        $resByDate->assertStatus(200)
            ->assertJsonPath('data.total', 10)
            ->assertJsonPath('data.summary.total_amount', 8000000)
            ->assertJsonPath('data.summary.transfer_amount', 8000000)
            ->assertJsonPath('data.summary.cash_amount', 0)
            ->assertJsonPath('data.summary.total_count', 10)
            ->assertJsonPath('data.summary.completed_count', 10);

        // Lọc theo payment_method=cash (15 paid + 2 refunded = 17 phiếu, cash_amount = 12.000.000 ₫)
        $resByMethod = $this->actingAs($this->cskhBranchA1, 'sanctum')
            ->getJson('/api/v1/payments?payment_method=cash&page=1&per_page=15');

        $resByMethod->assertStatus(200)
            ->assertJsonPath('data.total', 17)
            ->assertJsonPath('data.summary.total_amount', 12000000)
            ->assertJsonPath('data.summary.cash_amount', 12000000)
            ->assertJsonPath('data.summary.transfer_amount', 0)
            ->assertJsonPath('data.summary.completed_count', 15)
            ->assertJsonPath('data.summary.refunded_count', 2);

        // Tìm kiếm từ khóa q theo mã phiếu thu, mã đơn, tên khách, SĐT
        foreach (['FX26-PY-FIND-999', 'RO-PAY-FIND-999', 'Đặng Thu Thảo', '0912345678'] as $keyword) {
            $this->actingAs($this->cskhBranchA1, 'sanctum')
                ->getJson('/api/v1/payments?q=' . urlencode($keyword))
                ->assertStatus(200)
                ->assertJsonPath('data.total', 1)
                ->assertJsonPath('data.data.0.payment_code', 'FX26-PY-FIND-999');
        }

        // Cô lập tenant: Admin Tenant A thấy 47 phiếu (45 + 2), Admin Tenant B thấy 3 phiếu (6.000.000 ₫)
        $this->actingAs($this->adminTenantA, 'sanctum')
            ->getJson('/api/v1/payments?all=true')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 47)
            ->assertJsonPath('data.summary.total_amount', 34000000);

        $this->actingAs($this->adminTenantB, 'sanctum')
            ->getJson('/api/v1/payments?all=true')
            ->assertStatus(200)
            ->assertJsonPath('data.total', 3)
            ->assertJsonPath('data.summary.total_amount', 6000000);
    }
}
