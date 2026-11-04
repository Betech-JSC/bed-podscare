<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\InventoryTransaction;
use App\Models\Part;
use App\Models\QuoteItem;
use App\Models\RepairOrder;
use App\Models\RepairQuote;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class InventoryDeductionOnRepairStartAndOrderReturnTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected Customer $customer;
    protected DeviceModel $device;
    protected User $adminUser;
    protected User $cskhUser;
    protected User $techUser;
    protected User $inventoryUser;
    protected User $qcUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'   => 'tenant_inv_' . uniqid(),
            'name'   => 'Tiệm Test Trừ Kho & Hoàn Đơn',
            'status' => 'active',
            'plan'   => 'pro',
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Chi nhánh Trung Tâm',
            'code'      => 'CN_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Nguyễn Huệ',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'tenant_id' => $this->tenant->id,
            'name'      => 'Trần Văn Khách',
            'phone'     => '091' . random_int(1000000, 9999999),
        ]);

        $this->device = DeviceModel::create([
            'tenant_id'  => $this->tenant->id,
            'name'       => 'AirPods Pro 2 USB-C',
            'model_code' => 'A3048_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->adminUser = $this->createUser('admin', 'Admin Quản Lý');
        $this->cskhUser = $this->createUser('cskh', 'Nhân Viên CSKH');
        $this->techUser = $this->createUser('technician', 'Kỹ Thuật Viên');
        $this->inventoryUser = $this->createUser('inventory', 'Thủ Kho');
        $this->qcUser = $this->createUser('qc', 'Chuyên Viên QC');
    }

    private function createUser(string $role, string $name): User
    {
        return User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => $name,
            'email'     => $role . '_' . uniqid() . '@example.com',
            'phone'     => '09' . random_int(10000000, 99999999),
            'password'  => Hash::make('password'),
            'role'      => $role,
            'is_active' => true,
        ]);
    }

    private function createPartWithStock(string $name, string $sku, int $stock = 10, string $category = 'airpods'): array
    {
        $part = Part::create([
            'tenant_id'         => $this->tenant->id,
            'name'              => $name,
            'sku'               => $sku,
            'category'          => $category,
            'compatible_models' => 'AirPods / Apple Watch',
            'storage_location'  => 'Kệ A1',
            'unit'              => 'cái',
            'cost_price'        => 120000,
            'retail_price'      => 350000,
            'stock_quantity'    => $stock,
            'min_stock_alert'   => 3,
            'is_active'         => true,
        ]);

        $branchPart = BranchPart::create([
            'branch_id'       => $this->branch->id,
            'part_id'         => $part->id,
            'stock_quantity'  => $stock,
            'min_stock_alert' => 3,
        ]);

        return [$part, $branchPart];
    }

    private function createOrder(array $attributes = []): RepairOrder
    {
        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create(array_merge([
            'tenant_id'          => $this->tenant->id,
            'order_code'         => "FX{$year}-INV{$randomNum}",
            'branch_id'          => $this->branch->id,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'technician_id'      => $this->techUser->id,
            'issue_description'  => 'Thay pin tai nghe và màng loa',
            'status'             => 'waiting_tech',
            'order_type'         => 'in_store',
            'total_price'        => 550000,
            'created_by_user_id' => $this->cskhUser->id,
        ], $attributes));
    }

    /**
     * (a) Trừ kho tức thì ngay khi chuyển sang in_repair từ cả QuoteItem và additional_services[].linked_parts / parts_needed.
     */
    public function test_inventory_is_immediately_deducted_when_order_transitions_to_in_repair(): void
    {
        [$partQuote, $bpQuote] = $this->createPartWithStock('Pin AirPods Pro 2 Tai Trái', 'PIN-APP2-L-' . uniqid(), 10);
        [$partLinked, $bpLinked] = $this->createPartWithStock('Màng Loa AirPods Pro 2', 'LOA-APP2-' . uniqid(), 8);
        [$partNote, $bpNote] = $this->createPartWithStock('Cáp Sạc Hộp AirPods Pro 2', 'CAP-APP2-' . uniqid(), 6);

        $order = $this->createOrder([
            'status'              => 'waiting_tech',
            'additional_services' => [
                [
                    'id'           => 'srv_1',
                    'name'         => 'Thay màng loa trong',
                    'price'        => 250000,
                    'linked_parts' => [
                        [
                            'part_id'  => $partLinked->id,
                            'sku'      => $partLinked->sku,
                            'name'     => $partLinked->name,
                            'quantity' => 2,
                        ],
                    ],
                ],
            ],
        ]);

        $quote = RepairQuote::create([
            'quote_number'    => 'QUO-INV-' . uniqid(),
            'repair_order_id' => $order->id,
            'total_amount'    => 300000,
            'sent_by_user_id' => $this->cskhUser->id,
            'note'            => 'Báo giá thay pin tai trái',
            'status'          => 'approved',
        ]);

        QuoteItem::create([
            'quote_id'    => $quote->id,
            'part_id'     => $partQuote->id,
            'description' => 'Thay pin tai trái',
            'quantity'    => 1,
            'unit_price'  => 300000,
            'total_price' => 300000,
        ]);

        // KTV bấm "Bắt đầu sửa" (chuyển sang in_repair)
        $res = $this->actingAs($this->techUser, 'sanctum')->patchJson("/api/v1/orders/{$order->id}/status", [
            'status' => 'in_repair',
        ]);

        $res->assertStatus(200)
            ->assertJsonPath('data.status', 'in_repair');

        // Kiểm tra tồn kho đã bị trừ ngay tại thời điểm in_repair
        $this->assertEquals(9, $bpQuote->fresh()->stock_quantity);
        $this->assertEquals(9, $partQuote->fresh()->stock_quantity);

        $this->assertEquals(6, $bpLinked->fresh()->stock_quantity);
        $this->assertEquals(6, $partLinked->fresh()->stock_quantity);

        // Khi đơn đang ở in_repair, KTV ghi nhận thêm linh kiện qua parts-note -> tự động trừ kho phần chênh lệch mới
        $resNote = $this->actingAs($this->techUser, 'sanctum')->patchJson("/api/v1/orders/{$order->id}/parts-note", [
            'parts_needed' => "{$partNote->sku} x1",
        ]);
        $resNote->assertStatus(200);

        $this->assertEquals(5, $bpNote->fresh()->stock_quantity);
        $this->assertEquals(5, $partNote->fresh()->stock_quantity);
        // Hai linh kiện cũ không bị trừ trùng
        $this->assertEquals(9, $bpQuote->fresh()->stock_quantity);
        $this->assertEquals(6, $bpLinked->fresh()->stock_quantity);
    }

    /**
     * (b) Net Idempotency: không bị trừ kho trùng lặp khi chuyển qua lại in_repair -> waiting_parts -> in_repair -> completed.
     */
    public function test_net_idempotency_prevents_duplicate_deduction_across_status_transitions(): void
    {
        [$part, $branchPart] = $this->createPartWithStock('Pin AirPods 3', 'PIN-AP3-' . uniqid(), 10);

        $order = $this->createOrder([
            'status'              => 'assigned',
            'additional_services' => [
                [
                    'id'           => 'srv_idem',
                    'name'         => 'Thay pin AirPods 3',
                    'price'        => 350000,
                    'linked_parts' => [
                        ['part_id' => $part->id, 'quantity' => 2],
                    ],
                ],
            ],
        ]);

        // 1. assigned -> in_repair (trừ 2 -> còn 8)
        $this->actingAs($this->techUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$order->id}/status", ['status' => 'in_repair'])
            ->assertStatus(200);

        $this->assertEquals(8, $branchPart->fresh()->stock_quantity);
        $this->assertEquals(8, $part->fresh()->stock_quantity);

        // 2. in_repair -> waiting_parts -> in_repair -> waiting_qc -> ready_for_return -> completed
        $this->actingAs($this->techUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$order->id}/status", [
                'status'       => 'waiting_parts',
                'parts_needed' => $part->sku . ' x2',
            ])
            ->assertStatus(200);

        $this->actingAs($this->techUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$order->id}/status", ['status' => 'in_repair'])
            ->assertStatus(200);

        $this->actingAs($this->techUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$order->id}/status", [
                'status'             => 'waiting_qc',
                'final_check_result' => 'Đã test âm thanh ổn định',
            ])
            ->assertStatus(200);

        $this->actingAs($this->qcUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$order->id}/status", ['status' => 'ready_for_return'])
            ->assertStatus(200);

        $this->actingAs($this->cskhUser, 'sanctum')
            ->postJson('/api/v1/payments', [
                'repair_order_id' => $order->id,
                'amount'          => (float) $order->fresh()->total_price,
                'payment_method'  => 'cash',
                'notes'           => 'Thu tiền bàn giao máy',
            ])
            ->assertStatus(201);

        $this->assertEquals('completed', $order->fresh()->status);

        // Tồn kho vẫn giữ nguyên là 8 (chỉ có đúng 1 phiếu export_repair -2)
        $this->assertEquals(8, $branchPart->fresh()->stock_quantity);
        $this->assertEquals(8, $part->fresh()->stock_quantity);

        $exportTxCount = InventoryTransaction::where('repair_order_id', $order->id)
            ->where('part_id', $part->id)
            ->where('transaction_type', 'export_repair')
            ->count();

        $this->assertEquals(1, $exportTxCount);
    }

    /**
     * (c) Hoàn đơn (cancelled) từ in_repair và từ completed tự động cộng trả lại tồn kho (import_reversal).
     */
    public function test_order_return_cancelled_restores_inventory_from_in_repair_and_completed(): void
    {
        [$partA, $bpA] = $this->createPartWithStock('Vỏ Hộp Sạc AirPods Pro', 'VO-APP-' . uniqid(), 10);
        [$partB, $bpB] = $this->createPartWithStock('Pin Hộp Sạc AirPods Pro', 'PIN-BOX-APP-' . uniqid(), 10);

        // Case 1: Đơn đang in_repair -> khách báo không sửa / trả máy (cancelled)
        $orderInRepair = $this->createOrder([
            'status'              => 'waiting_tech',
            'additional_services' => [
                [
                    'id'           => 'srv_a',
                    'name'         => 'Thay vỏ hộp sạc',
                    'price'        => 300000,
                    'linked_parts' => [['part_id' => $partA->id, 'quantity' => 1]],
                ],
            ],
        ]);

        $this->actingAs($this->techUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$orderInRepair->id}/status", ['status' => 'in_repair'])
            ->assertStatus(200);

        $this->assertEquals(9, $bpA->fresh()->stock_quantity);
        $this->assertEquals(9, $partA->fresh()->stock_quantity);

        // Chuyển sang cancelled (Hoàn đơn / Trả máy)
        $this->actingAs($this->cskhUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$orderInRepair->id}/status", [
                'status'         => 'cancelled',
                'decline_reason' => 'Khách đổi ý không sửa nữa, nhận lại máy',
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'cancelled');

        // Tồn kho được hoàn trả về 10 và có giao dịch import_reversal +1
        $this->assertEquals(10, $bpA->fresh()->stock_quantity);
        $this->assertEquals(10, $partA->fresh()->stock_quantity);

        $reversalA = InventoryTransaction::where('repair_order_id', $orderInRepair->id)
            ->where('part_id', $partA->id)
            ->where('transaction_type', 'import_reversal')
            ->first();
        $this->assertNotNull($reversalA);
        $this->assertEquals(1, (int) $reversalA->quantity);

        // Nếu mở lại đơn từ cancelled -> in_repair thì Net Idempotency cho phép trừ kho lại từ 10 xuống 9
        $this->actingAs($this->cskhUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$orderInRepair->id}/status", ['status' => 'in_repair'])
            ->assertStatus(200);
        $this->assertEquals(9, $bpA->fresh()->stock_quantity);

        // Case 2: Đơn đã completed -> hoàn đơn (cancelled)
        $orderCompleted = $this->createOrder([
            'status'              => 'waiting_tech',
            'additional_services' => [
                [
                    'id'           => 'srv_b',
                    'name'         => 'Thay pin hộp sạc',
                    'price'        => 400000,
                    'linked_parts' => [['part_id' => $partB->id, 'quantity' => 2]],
                ],
            ],
        ]);

        $this->actingAs($this->techUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$orderCompleted->id}/status", ['status' => 'in_repair'])
            ->assertStatus(200);
        $this->actingAs($this->cskhUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$orderCompleted->id}/status", ['status' => 'ready_for_return'])
            ->assertStatus(200);
        $this->actingAs($this->cskhUser, 'sanctum')
            ->postJson('/api/v1/payments', [
                'repair_order_id' => $orderCompleted->id,
                'amount'          => (float) $orderCompleted->fresh()->total_price,
                'payment_method'  => 'cash',
                'notes'           => 'Thu tiền bàn giao máy',
            ])
            ->assertStatus(201);

        $this->assertEquals('completed', $orderCompleted->fresh()->status);

        $this->assertEquals(8, $bpB->fresh()->stock_quantity);

        // Hoàn đơn từ trạng thái completed
        $this->actingAs($this->cskhUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$orderCompleted->id}/status", [
                'status'         => 'cancelled',
                'decline_reason' => 'Hoàn đơn sau bàn giao do khách trả máy',
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'cancelled');

        $this->assertEquals(10, $bpB->fresh()->stock_quantity);
        $this->assertEquals(10, $partB->fresh()->stock_quantity);
    }

    /**
     * (d) API GET /api/v1/inventory/transactions trả đủ thông tin dòng sản phẩm và PUT /api/v1/orders/{id} cho phép nhân sự vận hành chỉnh sửa.
     */
    public function test_inventory_transactions_include_product_line_and_staff_roles_can_full_edit_order(): void
    {
        [$part, $branchPart] = $this->createPartWithStock('Pin Apple Watch S8 45mm', 'PIN-AWS8-' . uniqid(), 10, 'apple_watch');

        $watchDevice = DeviceModel::create([
            'tenant_id'  => $this->tenant->id,
            'name'       => 'Apple Watch Series 8 45mm',
            'model_code' => 'AWS8_' . uniqid(),
            'category'   => 'apple_watch',
        ]);

        $order = $this->createOrder([
            'device_model_id'     => $watchDevice->id,
            'status'              => 'waiting_tech',
            'additional_services' => [
                [
                    'id'           => 'srv_watch',
                    'name'         => 'Thay pin Apple Watch S8',
                    'price'        => 600000,
                    'linked_parts' => [['part_id' => $part->id, 'quantity' => 1]],
                ],
            ],
        ]);

        // Bắt đầu sửa -> sinh giao dịch xuất kho
        $this->actingAs($this->techUser, 'sanctum')
            ->patchJson("/api/v1/orders/{$order->id}/status", ['status' => 'in_repair'])
            ->assertStatus(200);

        $today = now()->toDateString();
        $txRes = $this->actingAs($this->cskhUser, 'sanctum')
            ->getJson("/api/v1/inventory/transactions?date={$today}&part_id={$part->id}");

        $txRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.data.0.part.category', 'apple_watch')
            ->assertJsonPath('data.data.0.repair_order.device_model.category', 'apple_watch')
            ->assertJsonPath('data.data.0.repair_order.device_model.name', 'Apple Watch Series 8 45mm');

        // Đảm bảo bảo mật giá vốn: CSKH không thấy unit_cost hay part.cost_price
        $firstTx = $txRes->json('data.data.0');
        $this->assertArrayNotHasKey('unit_cost', $firstTx);
        $this->assertArrayNotHasKey('cost_price', $firstTx['part'] ?? []);

        // Nhân sự vận hành (CSKH, Inventory, QC) được phép gọi PUT /api/v1/orders/{id} để chỉnh sửa thông tin đơn hàng
        foreach ([$this->cskhUser, $this->inventoryUser, $this->qcUser] as $idx => $staffUser) {
            $newPrice = 650000 + ($idx * 50000);
            $putRes = $this->actingAs($staffUser, 'sanctum')
                ->putJson("/api/v1/orders/{$order->id}", [
                    'customer_name'     => "Khách Cập Nhật {$staffUser->role}",
                    'issue_description' => "Mô tả cập nhật bởi {$staffUser->role}",
                    'total_price'       => $newPrice,
                    'order_type'        => 'cod',
                    'shipping_address'  => '456 Lê Duẩn, Đà Nẵng',
                ]);

            $putRes->assertStatus(200)
                ->assertJsonPath('success', true)
                ->assertJsonPath('data.order_type', 'cod')
                ->assertJsonPath('data.issue_description', "Mô tả cập nhật bởi {$staffUser->role}");

            $this->assertEquals($newPrice, (float) $order->fresh()->total_price);
        }
    }
}
