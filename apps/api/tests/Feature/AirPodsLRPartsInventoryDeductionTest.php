<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\InventoryTransaction;
use App\Models\Part;
use App\Models\RepairOrder;
use App\Models\Scopes\TenantScope;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\CommonIssueSeeder;
use Database\Seeders\DeviceModelSeeder;
use Database\Seeders\PartSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AirPodsLRPartsInventoryDeductionTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $airpods2Device;
    protected DeviceModel $airpodsPro2UsbCDevice;
    protected User $adminUser;
    protected User $cskhUser;
    protected User $techUser;
    protected User $qcUser;

    /**
     * Đảm bảo bài test luôn chạy an toàn tuyệt đối trên SQLite :memory: cô lập.
     */
    protected function setUpTraits(): array
    {
        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
        ]);
        DB::purge('sqlite');
        DB::setDefaultConnection('sqlite');

        if (! Schema::hasTable('migrations')) {
            $this->artisan('migrate');
        }

        return parent::setUpTraits();
    }

    protected function setUp(): void
    {
        parent::setUp();

        TenantScope::clearCache();

        $this->tenant = Tenant::firstOrCreate(
            ['code' => 'fixo-master'],
            [
                'name'   => 'PodsCare Master Tenant',
                'status' => 'active',
                'plan'   => 'pro',
            ]
        );

        TenantScope::clearCache();

        $this->branch = Branch::firstOrCreate(
            ['code' => 'CN-AP-LR-01'],
            [
                'tenant_id' => $this->tenant->id,
                'name'      => 'Chi nhánh Trung Tâm PodsCare',
                'phone'     => '0901234567',
                'address'   => '123 Nguyễn Huệ, Quận 1',
                'is_active' => true,
            ]
        );

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Nguyễn Văn Khách AirPods',
            'phone'     => '091' . random_int(1000000, 9999999),
        ]);

        $this->adminUser = $this->createUser('admin', 'Admin Quản Lý');
        $this->cskhUser = $this->createUser('cskh', 'Nhân Viên CSKH');
        $this->techUser = $this->createUser('technician', 'Kỹ Thuật Viên');
        $this->qcUser = $this->createUser('qc', 'Chuyên Viên QC');

        // Chạy bộ 3 Seeders chuẩn hóa danh mục 13 thiết bị, SKU L/R và Common Issues
        $this->seed([
            DeviceModelSeeder::class,
            PartSeeder::class,
            CommonIssueSeeder::class,
        ]);

        $this->airpods2Device = DeviceModel::where('name', 'AirPods 2')->firstOrFail();
        $this->airpodsPro2UsbCDevice = DeviceModel::where('name', 'AirPods Pro 2 (USB-C)')->firstOrFail();
    }

    private function createUser(string $role, string $name): User
    {
        return User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => $name,
            'email'     => $role . '_' . uniqid() . '@podscare.test',
            'phone'     => '09' . random_int(10000000, 99999999),
            'password'  => Hash::make('password'),
            'role'      => $role,
            'is_active' => true,
        ]);
    }

    private function getPartAndBranchPart(string $sku): array
    {
        $part = Part::withoutGlobalScopes()->where('sku', $sku)->firstOrFail();
        $branchPart = BranchPart::where('branch_id', $this->branch->id)
            ->where('part_id', $part->id)
            ->firstOrFail();

        return [$part, $branchPart];
    }

    /**
     * 1. Kiểm chứng Seeders & API GET /api/v1/services/common-issues trả về đúng định mức BOM L / R / L+R.
     */
    public function test_seeders_and_common_issues_api_return_accurate_lr_bom_for_all_airpods_models(): void
    {
        $airpodsPrefixes = ['AP2', 'AP3', 'APP1', 'APP2L', 'APP2C', 'APM'];
        $partTypes = ['BAT', 'SPK', 'MIC', 'MESH'];

        foreach ($airpodsPrefixes as $prefix) {
            foreach ($partTypes as $type) {
                foreach (['L', 'R'] as $side) {
                    $sku = "{$type}-{$prefix}-{$side}";
                    $part = Part::withoutGlobalScopes()->where('sku', $sku)->first();
                    $this->assertNotNull($part, "Kho parts phải có mã SKU tách rời {$sku}");

                    $branchPart = BranchPart::where('branch_id', $this->branch->id)
                        ->where('part_id', $part->id)
                        ->first();
                    $this->assertNotNull($branchPart, "Kho chi nhánh branch_parts phải đồng bộ mã {$sku}");
                    $this->assertGreaterThan(0, $branchPart->stock_quantity);
                }
            }
        }

        // Gọi API lấy danh mục lỗi thường gặp cho dòng máy AirPods 2
        $response = $this->actingAs($this->cskhUser, 'sanctum')
            ->getJson('/api/v1/services/common-issues?category=AirPods&device_model_id=' . $this->airpods2Device->id);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $issues = collect($response->json('data'));
        $this->assertNotEmpty($issues);

        // Kiểm chứng lỗi phạm vi Tai Trái (L) -> 1 mã *-L (quantity = 1)
        $leftBatIssue = $issues->first(fn ($i) => str_contains($i['issue_name'], 'Thay pin') && str_contains($i['issue_name'], 'Tai Trái (L)'));
        $this->assertNotNull($leftBatIssue, 'Phải có lỗi Thay pin phạm vi 1 bên Tai Trái (L)');
        $this->assertCount(1, $leftBatIssue['linked_parts']);
        $this->assertSame('BAT-AP2-L', $leftBatIssue['linked_parts'][0]['part_sku']);
        $this->assertSame(1, (int) $leftBatIssue['linked_parts'][0]['quantity']);

        // Kiểm chứng lỗi phạm vi Tai Phải (R) -> 1 mã *-R (quantity = 1)
        $rightBatIssue = $issues->first(fn ($i) => str_contains($i['issue_name'], 'Thay pin') && str_contains($i['issue_name'], 'Tai Phải (R)'));
        $this->assertNotNull($rightBatIssue, 'Phải có lỗi Thay pin phạm vi 1 bên Tai Phải (R)');
        $this->assertCount(1, $rightBatIssue['linked_parts']);
        $this->assertSame('BAT-AP2-R', $rightBatIssue['linked_parts'][0]['part_sku']);
        $this->assertSame(1, (int) $rightBatIssue['linked_parts'][0]['quantity']);

        // Kiểm chứng lỗi phạm vi Cả 2 tai (L + R) -> đủ 2 phần tử: 1 x *-L và 1 x *-R
        $bothBatIssue = $issues->first(fn ($i) => str_contains($i['issue_name'], 'Thay pin') && str_contains($i['issue_name'], 'Cả 2 tai (L + R)'));
        $this->assertNotNull($bothBatIssue, 'Phải có lỗi Thay pin phạm vi Cả 2 tai (L + R)');
        $this->assertCount(2, $bothBatIssue['linked_parts']);
        $this->assertSame('BAT-AP2-L', $bothBatIssue['linked_parts'][0]['part_sku']);
        $this->assertSame(1, (int) $bothBatIssue['linked_parts'][0]['quantity']);
        $this->assertSame('BAT-AP2-R', $bothBatIssue['linked_parts'][1]['part_sku']);
        $this->assertSame(1, (int) $bothBatIssue['linked_parts'][1]['quantity']);

        // Kiểm chứng tương tự cho Loa (SPK), Mic (MIC), Lưới (MESH) ở phạm vi Cả 2 tai (L + R)
        foreach (['SPK' => 'loa', 'MIC' => 'Mic', 'MESH' => 'lưới'] as $typePrefix => $keyword) {
            $bothIssue = $issues->first(fn ($i) => str_contains($i['issue_name'], $keyword) && str_contains($i['issue_name'], 'Cả 2 tai (L + R)'));
            $this->assertNotNull($bothIssue, "Phải có lỗi {$typePrefix} phạm vi Cả 2 tai (L + R)");
            $this->assertCount(2, $bothIssue['linked_parts']);
            $this->assertSame("{$typePrefix}-AP2-L", $bothIssue['linked_parts'][0]['part_sku']);
            $this->assertSame(1, (int) $bothIssue['linked_parts'][0]['quantity']);
            $this->assertSame("{$typePrefix}-AP2-R", $bothIssue['linked_parts'][1]['part_sku']);
            $this->assertSame(1, (int) $bothIssue['linked_parts'][1]['quantity']);
        }
    }

    /**
     * 2. Kịch bản 1 — Sửa 1 bên Tai Trái (L):
     * Chỉ trừ đúng 1 đơn vị BAT-AP2-L, giữ nguyên BAT-AP2-R không bị trừ.
     */
    public function test_scenario_1_repair_left_ear_deducts_only_left_sku(): void
    {
        [$partLeft, $bpLeft] = $this->getPartAndBranchPart('BAT-AP2-L');
        [$partRight, $bpRight] = $this->getPartAndBranchPart('BAT-AP2-R');

        $initialLeftStock = (int) $bpLeft->stock_quantity;
        $initialRightStock = (int) $bpRight->stock_quantity;

        $createRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $this->branch->id,
            'customer_id'       => $this->customer->id,
            'device_model_id'   => $this->airpods2Device->id,
            'issue_description' => 'Thay pin AirPods 2 - 1 bên Tai Trái (L)',
            'parts_needed'      => 'Pin tai nghe AirPods 2 - Tai Trái (L) (BAT-AP2-L) x1',
            'estimated_price'   => 250000,
            'order_type'        => 'in_store',
        ]);

        $createRes->assertStatus(201);
        $orderId = (int) $createRes->json('data.id');

        // Chuyển sang in_repair
        $this->actingAs($this->techUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$orderId}/status", ['status' => 'in_repair'])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'in_repair');

        // Tồn kho BAT-AP2-L giảm đúng 1, còn BAT-AP2-R giữ nguyên
        $this->assertSame($initialLeftStock - 1, (int) $bpLeft->fresh()->stock_quantity);
        $this->assertSame($initialLeftStock - 1, (int) $partLeft->fresh()->stock_quantity);
        $this->assertSame($initialRightStock, (int) $bpRight->fresh()->stock_quantity);
        $this->assertSame($initialRightStock, (int) $partRight->fresh()->stock_quantity);

        // Kiểm tra bản ghi inventory_transactions
        $leftTxs = InventoryTransaction::where('repair_order_id', $orderId)
            ->where('part_id', $partLeft->id)
            ->where('transaction_type', 'export_repair')
            ->get();
        $this->assertCount(1, $leftTxs);
        $this->assertSame(-1, (int) $leftTxs->first()->quantity);

        $rightTxCount = InventoryTransaction::where('repair_order_id', $orderId)
            ->where('part_id', $partRight->id)
            ->count();
        $this->assertSame(0, $rightTxCount);

        // Kiểm chứng tương tự khi sửa Loa (SPK-AP2-L) và Mic (MIC-AP2-L) 1 bên Tai Trái (L)
        foreach (['SPK' => 'Sửa/Thay loa & ANC AirPods 2 - 1 bên Tai Trái (L)', 'MIC' => 'Thay Mic đàm thoại / Mic ANC AirPods 2 - 1 bên Tai Trái (L)'] as $typePrefix => $issueDesc) {
            [$pL, $bpL] = $this->getPartAndBranchPart("{$typePrefix}-AP2-L");
            [$pR, $bpR] = $this->getPartAndBranchPart("{$typePrefix}-AP2-R");
            $initL = (int) $bpL->stock_quantity;
            $initR = (int) $bpR->stock_quantity;

            $subRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/orders', [
                'branch_id'         => $this->branch->id,
                'customer_id'       => $this->customer->id,
                'device_model_id'   => $this->airpods2Device->id,
                'issue_description' => $issueDesc,
                'estimated_price'   => 300000,
                'order_type'        => 'in_store',
            ]);
            $subRes->assertStatus(201);
            $this->assertSame($initL - 1, (int) $bpL->fresh()->stock_quantity);
            $this->assertSame($initR, (int) $bpR->fresh()->stock_quantity);
        }
    }

    /**
     * 3. Kịch bản 2 — Sửa 1 bên Tai Phải (R):
     * Chỉ trừ đúng 1 đơn vị BAT-AP2-R, giữ nguyên BAT-AP2-L không bị trừ.
     */
    public function test_scenario_2_repair_right_ear_deducts_only_right_sku(): void
    {
        [$partLeft, $bpLeft] = $this->getPartAndBranchPart('BAT-AP2-L');
        [$partRight, $bpRight] = $this->getPartAndBranchPart('BAT-AP2-R');

        $initialLeftStock = (int) $bpLeft->stock_quantity;
        $initialRightStock = (int) $bpRight->stock_quantity;

        $createRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $this->branch->id,
            'customer_id'       => $this->customer->id,
            'device_model_id'   => $this->airpods2Device->id,
            'issue_description' => 'Thay pin AirPods 2 - 1 bên Tai Phải (R)',
            'parts_needed'      => 'Pin tai nghe AirPods 2 - Tai Phải (R) (BAT-AP2-R) x1',
            'estimated_price'   => 250000,
            'order_type'        => 'in_store',
        ]);

        $createRes->assertStatus(201);
        $orderId = (int) $createRes->json('data.id');

        $this->actingAs($this->techUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$orderId}/status", ['status' => 'in_repair'])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'in_repair');

        // Tồn kho BAT-AP2-R giảm đúng 1, còn BAT-AP2-L giữ nguyên
        $this->assertSame($initialRightStock - 1, (int) $bpRight->fresh()->stock_quantity);
        $this->assertSame($initialRightStock - 1, (int) $partRight->fresh()->stock_quantity);
        $this->assertSame($initialLeftStock, (int) $bpLeft->fresh()->stock_quantity);
        $this->assertSame($initialLeftStock, (int) $partLeft->fresh()->stock_quantity);

        $rightTxs = InventoryTransaction::where('repair_order_id', $orderId)
            ->where('part_id', $partRight->id)
            ->where('transaction_type', 'export_repair')
            ->get();
        $this->assertCount(1, $rightTxs);
        $this->assertSame(-1, (int) $rightTxs->first()->quantity);

        $leftTxCount = InventoryTransaction::where('repair_order_id', $orderId)
            ->where('part_id', $partLeft->id)
            ->count();
        $this->assertSame(0, $leftTxCount);

        // Kiểm chứng tương tự khi sửa Loa (SPK-AP2-R) và Mic (MIC-AP2-R) 1 bên Tai Phải (R)
        foreach (['SPK' => 'Sửa/Thay loa & ANC AirPods 2 - 1 bên Tai Phải (R)', 'MIC' => 'Thay Mic đàm thoại / Mic ANC AirPods 2 - 1 bên Tai Phải (R)'] as $typePrefix => $issueDesc) {
            [$pL, $bpL] = $this->getPartAndBranchPart("{$typePrefix}-AP2-L");
            [$pR, $bpR] = $this->getPartAndBranchPart("{$typePrefix}-AP2-R");
            $initL = (int) $bpL->stock_quantity;
            $initR = (int) $bpR->stock_quantity;

            $subRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/orders', [
                'branch_id'         => $this->branch->id,
                'customer_id'       => $this->customer->id,
                'device_model_id'   => $this->airpods2Device->id,
                'issue_description' => $issueDesc,
                'estimated_price'   => 300000,
                'order_type'        => 'in_store',
            ]);
            $subRes->assertStatus(201);
            $this->assertSame($initR - 1, (int) $bpR->fresh()->stock_quantity);
            $this->assertSame($initL, (int) $bpL->fresh()->stock_quantity);
        }
    }

    /**
     * 4. Kịch bản 3 — Sửa Cả 2 tai (L + R) cho Pin, Loa, Mic:
     * Trừ đồng thời 1 đơn vị SKU-L và 1 đơn vị SKU-R (tổng 2 linh kiện: 1 Trái + 1 Phải),
     * tạo đủ 2 giao dịch xuất kho riêng biệt và đảm bảo tính lũy thừa (Idempotency) khi chuyển trạng thái tiếp theo.
     */
    public function test_scenario_3_repair_both_ears_deducts_both_left_and_right_skus_for_bat_spk_mic_with_idempotency(): void
    {
        [$batL, $bpBatL] = $this->getPartAndBranchPart('BAT-AP2-L');
        [$batR, $bpBatR] = $this->getPartAndBranchPart('BAT-AP2-R');
        [$spkL, $bpSpkL] = $this->getPartAndBranchPart('SPK-AP2-L');
        [$spkR, $bpSpkR] = $this->getPartAndBranchPart('SPK-AP2-R');
        [$micL, $bpMicL] = $this->getPartAndBranchPart('MIC-AP2-L');
        [$micR, $bpMicR] = $this->getPartAndBranchPart('MIC-AP2-R');

        $initBatL = (int) $bpBatL->stock_quantity;
        $initBatR = (int) $bpBatR->stock_quantity;
        $initSpkL = (int) $bpSpkL->stock_quantity;
        $initSpkR = (int) $bpSpkR->stock_quantity;
        $initMicL = (int) $bpMicL->stock_quantity;
        $initMicR = (int) $bpMicR->stock_quantity;

        // 4.1. Đơn sửa chữa AirPods 2 thay pin Cả 2 tai (L + R)
        $batOrderRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'           => $this->branch->id,
            'customer_id'         => $this->customer->id,
            'device_model_id'     => $this->airpods2Device->id,
            'issue_description'   => 'Thay pin AirPods 2 - Cả 2 tai (L + R)',
            'estimated_price'     => 450000,
            'order_type'          => 'in_store',
            'additional_services' => [
                [
                    'id'           => 'ISS-AP2-BAT-LR',
                    'name'         => 'Thay pin AirPods 2 - Cả 2 tai (L + R)',
                    'price'        => 450000,
                    'linked_parts' => [
                        ['part_sku' => 'BAT-AP2-L', 'part_name' => 'Pin tai nghe AirPods 2 - Tai Trái (L)', 'quantity' => 1],
                        ['part_sku' => 'BAT-AP2-R', 'part_name' => 'Pin tai nghe AirPods 2 - Tai Phải (R)', 'quantity' => 1],
                    ],
                ],
            ],
        ]);

        $batOrderRes->assertStatus(201);
        $batOrderId = (int) $batOrderRes->json('data.id');

        // Kiểm chứng trừ đồng thời 1 BAT-AP2-L và 1 BAT-AP2-R
        $this->assertSame($initBatL - 1, (int) $bpBatL->fresh()->stock_quantity);
        $this->assertSame($initBatL - 1, (int) $batL->fresh()->stock_quantity);
        $this->assertSame($initBatR - 1, (int) $bpBatR->fresh()->stock_quantity);
        $this->assertSame($initBatR - 1, (int) $batR->fresh()->stock_quantity);

        // Kiểm chứng chuyển trạng thái tiếp theo (in_repair -> waiting_qc -> ready_for_return -> completed) KHÔNG bị trừ trùng lần 2 (Idempotency)
        $this->actingAs($this->techUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$batOrderId}/status", ['status' => 'in_repair'])
            ->assertStatus(200);

        $this->actingAs($this->techUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$batOrderId}/status", [
                'status'             => 'waiting_qc',
                'final_check_result' => 'Đã test pin cả 2 tai L + R ổn định',
            ])
            ->assertStatus(200);

        $this->actingAs($this->qcUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$batOrderId}/status", ['status' => 'ready_for_return'])
            ->assertStatus(200);

        $this->actingAs($this->cskhUser, 'sanctum')
            ->postJson('/api/v1/payments', [
                'repair_order_id' => $batOrderId,
                'amount'          => 450000,
                'payment_method'  => 'cash',
                'notes'           => 'Thu tiền thay pin 2 tai AirPods 2',
            ])
            ->assertStatus(201);

        $this->assertSame('completed', RepairOrder::findOrFail($batOrderId)->status);

        // Tồn kho vẫn chỉ giảm đúng 1 cho mỗi bên, không bị trừ trùng lần 2
        $this->assertSame($initBatL - 1, (int) $bpBatL->fresh()->stock_quantity);
        $this->assertSame($initBatR - 1, (int) $bpBatR->fresh()->stock_quantity);

        $batExportTxs = InventoryTransaction::where('repair_order_id', $batOrderId)
            ->where('transaction_type', 'export_repair')
            ->get();
        $this->assertCount(2, $batExportTxs, 'Phải có đúng 2 giao dịch xuất kho riêng biệt (1 cho BAT-AP2-L và 1 cho BAT-AP2-R)');
        $this->assertSame(-1, (int) $batExportTxs->firstWhere('part_id', $batL->id)->quantity);
        $this->assertSame(-1, (int) $batExportTxs->firstWhere('part_id', $batR->id)->quantity);

        // 4.2. Kiểm chứng tương tự với Loa (SPK-AP2-L/R) và Mic (MIC-AP2-L/R) qua resolveStandardPartsFromIssueDescription
        $spkOrderRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $this->branch->id,
            'customer_id'       => $this->customer->id,
            'device_model_id'   => $this->airpods2Device->id,
            'issue_description' => 'Sửa/Thay loa & ANC AirPods 2 - Cả 2 tai (L + R)',
            'estimated_price'   => 650000,
            'order_type'        => 'in_store',
        ]);
        $spkOrderRes->assertStatus(201);
        $this->assertSame($initSpkL - 1, (int) $bpSpkL->fresh()->stock_quantity);
        $this->assertSame($initSpkR - 1, (int) $bpSpkR->fresh()->stock_quantity);

        $micOrderRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $this->branch->id,
            'customer_id'       => $this->customer->id,
            'device_model_id'   => $this->airpods2Device->id,
            'issue_description' => 'Thay Mic đàm thoại / Mic ANC AirPods 2 - Cả 2 tai (L + R)',
            'estimated_price'   => 520000,
            'order_type'        => 'in_store',
        ]);
        $micOrderRes->assertStatus(201);
        $this->assertSame($initMicL - 1, (int) $bpMicL->fresh()->stock_quantity);
        $this->assertSame($initMicR - 1, (int) $bpMicR->fresh()->stock_quantity);
    }

    /**
     * 5. Kịch bản 4 — Phân tích chuỗi "Tên linh kiện (SKU) x2" (Regex fix):
     * Khi parts_needed có chuỗi "Pin tai nghe AirPods Pro 2 (BAT-APP2-01) x2",
     * hệ thống bóc tách đúng quantity = 2 sau dấu đóng ngoặc ) và trừ đúng 2 đơn vị tồn kho của BAT-APP2-01.
     */
    public function test_scenario_4_regex_parses_quantity_after_closing_parenthesis_in_parts_needed(): void
    {
        [$partLegacy, $bpLegacy] = $this->getPartAndBranchPart('BAT-APP2-01');
        $initialStock = (int) $bpLegacy->stock_quantity;

        $createRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $this->branch->id,
            'customer_id'       => $this->customer->id,
            'device_model_id'   => $this->airpodsPro2UsbCDevice->id,
            'issue_description' => 'Thay cặp pin AirPods Pro 2',
            'parts_needed'      => 'Pin tai nghe AirPods Pro 2 (BAT-APP2-01) x2',
            'estimated_price'   => 500000,
            'order_type'        => 'in_store',
        ]);

        $createRes->assertStatus(201);
        $orderId = (int) $createRes->json('data.id');

        // Tồn kho BAT-APP2-01 phải giảm đúng 2 đơn vị (ví dụ: 18 -> 16)
        $this->assertSame($initialStock - 2, (int) $bpLegacy->fresh()->stock_quantity);
        $this->assertSame($initialStock - 2, (int) $partLegacy->fresh()->stock_quantity);

        $exportTx = InventoryTransaction::where('repair_order_id', $orderId)
            ->where('part_id', $partLegacy->id)
            ->where('transaction_type', 'export_repair')
            ->first();

        $this->assertNotNull($exportTx);
        $this->assertSame(-2, (int) $exportTx->quantity);
    }

    /**
     * 6. Kịch bản 5 — Hủy đơn (CANCELLED) hoàn kho đủ cả SKU-L và SKU-R:
     * Khi hủy đơn sửa chữa Cả 2 tai (L + R) đã xuất kho trước đó,
     * hệ thống hoàn trả lại đúng +1 cho BAT-AP2-L và +1 cho BAT-AP2-R.
     */
    public function test_scenario_5_cancelling_both_ears_order_restores_both_left_and_right_skus(): void
    {
        [$batL, $bpBatL] = $this->getPartAndBranchPart('BAT-AP2-L');
        [$batR, $bpBatR] = $this->getPartAndBranchPart('BAT-AP2-R');

        $initBatL = (int) $bpBatL->stock_quantity;
        $initBatR = (int) $bpBatR->stock_quantity;

        $createRes = $this->actingAs($this->cskhUser, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'         => $this->branch->id,
            'customer_id'       => $this->customer->id,
            'device_model_id'   => $this->airpods2Device->id,
            'issue_description' => 'Thay pin AirPods 2 - Cả 2 tai (L + R)',
            'parts_needed'      => 'Pin tai nghe AirPods 2 - Tai Trái (L) (BAT-AP2-L) x1, Pin tai nghe AirPods 2 - Tai Phải (R) (BAT-AP2-R) x1',
            'estimated_price'   => 450000,
            'order_type'        => 'in_store',
        ]);

        $createRes->assertStatus(201);
        $orderId = (int) $createRes->json('data.id');

        // Chuyển sang in_repair và xác nhận cả 2 mã đã bị trừ 1 đơn vị
        $this->actingAs($this->techUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$orderId}/status", ['status' => 'in_repair'])
            ->assertStatus(200);

        $this->assertSame($initBatL - 1, (int) $bpBatL->fresh()->stock_quantity);
        $this->assertSame($initBatR - 1, (int) $bpBatR->fresh()->stock_quantity);

        // Hủy đơn (cancelled)
        $this->actingAs($this->cskhUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$orderId}/status", [
                'status'         => 'cancelled',
                'decline_reason' => 'Khách đổi ý hủy đơn sửa cả 2 tai AirPods 2',
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'cancelled');

        // Kiểm chứng hoàn trả +1 cho cả BAT-AP2-L và BAT-AP2-R
        $this->assertSame($initBatL, (int) $bpBatL->fresh()->stock_quantity);
        $this->assertSame($initBatL, (int) $batL->fresh()->stock_quantity);
        $this->assertSame($initBatR, (int) $bpBatR->fresh()->stock_quantity);
        $this->assertSame($initBatR, (int) $batR->fresh()->stock_quantity);

        $reversalL = InventoryTransaction::where('repair_order_id', $orderId)
            ->where('part_id', $batL->id)
            ->where('transaction_type', 'import_reversal')
            ->first();
        $this->assertNotNull($reversalL);
        $this->assertSame(1, (int) $reversalL->quantity);

        $reversalR = InventoryTransaction::where('repair_order_id', $orderId)
            ->where('part_id', $batR->id)
            ->where('transaction_type', 'import_reversal')
            ->first();
        $this->assertNotNull($reversalR);
        $this->assertSame(1, (int) $reversalR->quantity);
    }
}
