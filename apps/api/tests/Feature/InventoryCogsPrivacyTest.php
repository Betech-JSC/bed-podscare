<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\InventoryTransaction;
use App\Models\Part;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class InventoryCogsPrivacyTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected User $adminUser;
    protected User $technicianUser;
    protected User $receptionistUser;
    protected Part $part;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_cogs_' . uniqid(),
            'name'   => 'PodsCare COGS Privacy Tenant',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh COGS Privacy ' . uniqid(),
            'code'      => 'BR_COGS_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Đường Ba Tháng Hai, Quận 10',
            'is_active' => true,
        ]);

        $this->adminUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Kho Tester',
            'email'     => 'admin_cogs_' . uniqid() . '@podscare.vn',
            'phone'     => '0908' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'admin',
        ]);

        $this->technicianUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Tech Kho Tester',
            'email'     => 'tech_cogs_' . uniqid() . '@podscare.vn',
            'phone'     => '0907' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'technician',
        ]);

        $this->receptionistUser = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Receptionist Kho Tester',
            'email'     => 'recep_cogs_' . uniqid() . '@podscare.vn',
            'phone'     => '0906' . rand(100000, 999999),
            'password'  => Hash::make('Secret123!'),
            'role'      => 'receptionist',
        ]);

        $this->part = Part::create([
            'tenant_id'         => $this->tenant->id,
            'sku'               => 'BAT-APP2-' . uniqid(),
            'name'              => 'Pin AirPods Pro 2 Zin',
            'category'          => 'battery',
            'compatible_models' => 'AirPods Pro 2',
            'storage_location'  => 'Kệ A1-02',
            'stock_quantity'    => 20,
            'min_stock_alert'   => 5,
            'cost_price'        => 200000,
            'retail_price'      => 450000,
            'unit'              => 'viên',
            'is_active'         => true,
        ]);
    }

    /**
     * 1.1 Kiểm tra KTV và Lễ tân KHÔNG nhận được cost_price trong GET /api/v1/inventory/parts.
     */
    public function test_technician_and_receptionist_cannot_see_cost_price_in_parts_list(): void
    {
        // 1. Kỹ thuật viên
        $respTech = $this->actingAs($this->technicianUser, 'sanctum')
            ->getJson('/api/v1/inventory/parts');

        $respTech->assertStatus(200);
        $respTech->assertJsonMissing(['cost_price' => 200000]);
        $partsDataTech = $respTech->json('data.data');
        $this->assertNotEmpty($partsDataTech);
        foreach ($partsDataTech as $item) {
            $this->assertArrayNotHasKey('cost_price', $item);
            $this->assertArrayHasKey('retail_price', $item);
        }

        // 2. Lễ tân
        $respRecep = $this->actingAs($this->receptionistUser, 'sanctum')
            ->getJson('/api/v1/inventory/parts');

        $respRecep->assertStatus(200);
        $respRecep->assertJsonMissing(['cost_price' => 200000]);
        $partsDataRecep = $respRecep->json('data.data');
        $this->assertNotEmpty($partsDataRecep);
        foreach ($partsDataRecep as $item) {
            $this->assertArrayNotHasKey('cost_price', $item);
            $this->assertArrayHasKey('retail_price', $item);
        }
    }

    /**
     * 1.1 Kiểm tra KTV và Lễ tân KHÔNG nhận được cost_price trong GET /api/v1/inventory/parts/{id}.
     */
    public function test_technician_and_receptionist_cannot_see_cost_price_in_part_details(): void
    {
        // 1. Kỹ thuật viên
        $respTech = $this->actingAs($this->technicianUser, 'sanctum')
            ->getJson("/api/v1/inventory/parts/{$this->part->id}");

        $respTech->assertStatus(200);
        $partDataTech = $respTech->json('data');
        $this->assertArrayNotHasKey('cost_price', $partDataTech);
        $this->assertArrayHasKey('retail_price', $partDataTech);

        // 2. Lễ tân
        $respRecep = $this->actingAs($this->receptionistUser, 'sanctum')
            ->getJson("/api/v1/inventory/parts/{$this->part->id}");

        $respRecep->assertStatus(200);
        $partDataRecep = $respRecep->json('data');
        $this->assertArrayNotHasKey('cost_price', $partDataRecep);
        $this->assertArrayHasKey('retail_price', $partDataRecep);
    }

    /**
     * 1.1 Kiểm tra Admin nhận ĐẦY ĐỦ cost_price trong danh sách và chi tiết linh kiện.
     */
    public function test_admin_can_see_cost_price_in_parts_list_and_details(): void
    {
        // 1. Danh sách
        $respList = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/inventory/parts');

        $respList->assertStatus(200);
        $partsData = $respList->json('data.data');
        $targetPart = collect($partsData)->firstWhere('id', $this->part->id);
        $this->assertNotNull($targetPart);
        $this->assertArrayHasKey('cost_price', $targetPart);
        $this->assertEquals(200000, (float) $targetPart['cost_price']);

        // 2. Chi tiết
        $respDetail = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson("/api/v1/inventory/parts/{$this->part->id}");

        $respDetail->assertStatus(200);
        $partDetail = $respDetail->json('data');
        $this->assertArrayHasKey('cost_price', $partDetail);
        $this->assertEquals(200000, (float) $partDetail['cost_price']);
    }

    /**
     * 1.1 Kiểm tra KTV và Lễ tân KHÔNG nhận được unit_cost trong GET /api/v1/inventory/transactions.
     */
    public function test_technician_and_receptionist_cannot_see_unit_cost_in_transactions_list(): void
    {
        // Tạo giao dịch kho với unit_cost
        InventoryTransaction::create([
            'transaction_code'   => 'TX-' . uniqid(),
            'part_id'            => $this->part->id,
            'branch_id'          => $this->branch->id,
            'transaction_type'   => 'import',
            'quantity'           => 10,
            'unit_cost'          => 180000,
            'notes'              => 'Nhập linh kiện thử nghiệm',
            'created_by_user_id' => $this->adminUser->id,
        ]);

        // 1. Kỹ thuật viên
        $respTech = $this->actingAs($this->technicianUser, 'sanctum')
            ->getJson('/api/v1/inventory/transactions');

        $respTech->assertStatus(200);
        $respTech->assertJsonMissing(['unit_cost' => 180000]);
        $txDataTech = $respTech->json('data.data');
        $this->assertNotEmpty($txDataTech);
        foreach ($txDataTech as $tx) {
            $this->assertArrayNotHasKey('unit_cost', $tx);
            if (isset($tx['part'])) {
                $this->assertArrayNotHasKey('cost_price', $tx['part']);
            }
        }

        // 2. Lễ tân
        $respRecep = $this->actingAs($this->receptionistUser, 'sanctum')
            ->getJson('/api/v1/inventory/transactions');

        $respRecep->assertStatus(200);
        $respRecep->assertJsonMissing(['unit_cost' => 180000]);
        $txDataRecep = $respRecep->json('data.data');
        $this->assertNotEmpty($txDataRecep);
        foreach ($txDataRecep as $tx) {
            $this->assertArrayNotHasKey('unit_cost', $tx);
        }
    }

    /**
     * 1.1 Kiểm tra Admin nhận ĐẦY ĐỦ unit_cost trong danh sách giao dịch kho.
     */
    public function test_admin_can_see_unit_cost_in_transactions_list(): void
    {
        InventoryTransaction::create([
            'transaction_code'   => 'TX-' . uniqid(),
            'part_id'            => $this->part->id,
            'branch_id'          => $this->branch->id,
            'transaction_type'   => 'import',
            'quantity'           => 10,
            'unit_cost'          => 180000,
            'notes'              => 'Nhập linh kiện cho Admin xem',
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $resp = $this->actingAs($this->adminUser, 'sanctum')
            ->getJson('/api/v1/inventory/transactions');

        $resp->assertStatus(200);
        $txData = $resp->json('data.data');
        $this->assertNotEmpty($txData);
        $firstTx = $txData[0];
        $this->assertArrayHasKey('unit_cost', $firstTx);
        $this->assertEquals(180000, (float) $firstTx['unit_cost']);
    }

    /**
     * 1.2 Non-admin gửi unit_cost khi tạo giao dịch kho bị bỏ qua, fallback về cost_price của linh kiện.
     */
    public function test_non_admin_unit_cost_is_ignored_and_falls_back_to_part_cost_price(): void
    {
        $payload = [
            'part_id'          => $this->part->id,
            'branch_id'        => $this->branch->id,
            'transaction_type' => 'import',
            'quantity'         => 5,
            'unit_cost'        => 999999, // Non-admin gửi giá vốn giả mạo
            'notes'            => 'Thử gửi unit_cost trái phép',
        ];

        $resp = $this->actingAs($this->technicianUser, 'sanctum')
            ->postJson('/api/v1/inventory/transactions', $payload);

        $resp->assertStatus(201);

        // Kiểm tra trong DB: unit_cost được lưu bằng part->cost_price (200000), không phải 999999
        $txId = $resp->json('data.id');
        $createdTx = InventoryTransaction::findOrFail($txId);
        $this->assertEquals(200000, (float) $createdTx->unit_cost);
        $this->assertNotEquals(999999, (float) $createdTx->unit_cost);

        // Response trả về cho KTV cũng không lộ unit_cost hoặc cost_price
        $responseData = $resp->json('data');
        $this->assertArrayNotHasKey('unit_cost', $responseData);
        if (isset($responseData['part'])) {
            $this->assertArrayNotHasKey('cost_price', $responseData['part']);
        }
    }

    /**
     * 1.2 Admin gửi unit_cost khi tạo giao dịch kho thì được chấp nhận.
     */
    public function test_admin_can_set_custom_unit_cost_when_creating_transaction(): void
    {
        $payload = [
            'part_id'          => $this->part->id,
            'branch_id'        => $this->branch->id,
            'transaction_type' => 'import',
            'quantity'         => 8,
            'unit_cost'        => 215000, // Admin gửi giá vốn nhập lô mới
            'notes'            => 'Admin nhập kho lô mới giá 215k',
        ];

        $resp = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/inventory/transactions', $payload);

        $resp->assertStatus(201);

        // Kiểm tra trong DB: unit_cost là 215000
        $txId = $resp->json('data.id');
        $createdTx = InventoryTransaction::findOrFail($txId);
        $this->assertEquals(215000, (float) $createdTx->unit_cost);

        // Response trả về cho Admin hiển thị đầy đủ unit_cost
        $responseData = $resp->json('data');
        $this->assertArrayHasKey('unit_cost', $responseData);
        $this->assertEquals(215000, (float) $responseData['unit_cost']);
    }
}
