<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\ChecklistTemplate;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DeviceCrudApiTest extends TestCase
{
    use DatabaseTransactions;

    protected User $adminUser;
    protected User $techUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->adminUser = User::forceCreate([
            'name' => 'Admin Test ' . uniqid(),
            'email' => 'admin_' . uniqid() . '@fixo.vn',
            'phone' => '0901' . rand(100000, 999999),
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'is_active' => true,
        ]);

        $this->techUser = User::forceCreate([
            'name' => 'Tech Test ' . uniqid(),
            'email' => 'tech_' . uniqid() . '@fixo.vn',
            'phone' => '0902' . rand(100000, 999999),
            'password' => Hash::make('password123'),
            'role' => 'tech',
            'is_active' => true,
        ]);
    }

    /**
     * Test danh sách thiết bị kèm theo checklist_templates.
     */
    public function test_get_devices_returns_checklist_templates(): void
    {
        $response = $this->getJson('/api/v1/devices');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    '*' => [
                        'id',
                        'name',
                        'category',
                        'model_code',
                        'checklist_templates',
                    ],
                ],
            ]);
    }

    /**
     * Test admin tạo mới dòng thiết bị thành công kèm checklist templates.
     */
    public function test_admin_can_create_device_with_checklists(): void
    {
        $payload = [
            'name' => 'Sony WH-1000XM5',
            'category' => 'Headphones',
            'model_code' => 'WH1000XM5-' . uniqid(),
            'manufacturer' => 'Sony',
            'has_anc' => true,
            'checks' => [
                'Nguồn & Khởi động',
                'Chống ồn chủ động ANC',
                'Micro đàm thoại',
                'Cảm ứng vuốt chạm',
            ],
        ];

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/devices', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.name', 'Sony WH-1000XM5')
            ->assertJsonPath('data.category', 'Headphones')
            ->assertJsonPath('data.manufacturer', 'Sony');

        $deviceId = $response->json('data.id');
        $this->assertNotNull($deviceId);

        $this->assertDatabaseHas('device_models', [
            'id' => $deviceId,
            'name' => 'Sony WH-1000XM5',
            'category' => 'Headphones',
        ]);

        $this->assertEquals(
            4,
            ChecklistTemplate::where('device_model_id', $deviceId)->count()
        );
    }

    /**
     * Test admin cập nhật thông tin dòng máy và đồng bộ checklist.
     */
    public function test_admin_can_update_device_and_sync_checklists(): void
    {
        $device = DeviceModel::create([
            'name' => 'Initial Watch ' . uniqid(),
            'category' => 'Apple Watch',
            'model_code' => 'WATCH-' . uniqid(),
            'manufacturer' => 'Apple',
            'is_active' => true,
        ]);

        ChecklistTemplate::create([
            'device_model_id' => $device->id,
            'category' => $device->category,
            'item_name' => 'Cũ 1',
            'type' => 'functional',
            'order_index' => 1,
            'is_active' => true,
        ]);

        $payload = [
            'name' => 'Apple Watch Ultra 2 Updated',
            'checks' => [
                'Đo nhịp tim ECG',
                'Cảm biến độ sâu',
                'Màn hình 3000 nits',
            ],
        ];

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->putJson("/api/v1/devices/{$device->id}", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.name', 'Apple Watch Ultra 2 Updated');

        $this->assertDatabaseHas('device_models', [
            'id' => $device->id,
            'name' => 'Apple Watch Ultra 2 Updated',
        ]);

        // Kiểm tra danh sách checklist mới đã thay thế checklist cũ
        $newChecks = ChecklistTemplate::where('device_model_id', $device->id)
            ->orderBy('order_index')
            ->pluck('item_name')
            ->toArray();

        $this->assertEquals([
            'Đo nhịp tim ECG',
            'Cảm biến độ sâu',
            'Màn hình 3000 nits',
        ], $newChecks);
    }

    /**
     * Test admin xóa dòng máy chưa có đơn sửa chữa (xóa cứng).
     */
    public function test_admin_can_delete_unused_device(): void
    {
        $device = DeviceModel::create([
            'name' => 'Temp Device ' . uniqid(),
            'category' => 'AirPods',
            'model_code' => 'TEMP-' . uniqid(),
            'is_active' => true,
        ]);

        ChecklistTemplate::create([
            'device_model_id' => $device->id,
            'category' => 'AirPods',
            'item_name' => 'Item Test',
            'order_index' => 1,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->deleteJson("/api/v1/devices/{$device->id}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertDatabaseMissing('device_models', ['id' => $device->id]);
        $this->assertDatabaseMissing('checklist_templates', ['device_model_id' => $device->id]);
    }

    /**
     * Test admin xóa dòng máy đã có đơn sửa chữa (deactivate an toàn).
     */
    public function test_admin_deactivates_device_with_existing_orders(): void
    {
        $device = DeviceModel::create([
            'name' => 'Used Device ' . uniqid(),
            'category' => 'AirPods',
            'model_code' => 'USED-' . uniqid(),
            'is_active' => true,
        ]);

        $branch = Branch::first() ?? Branch::create([
            'name' => 'Chi nhánh Test ' . uniqid(),
            'code' => 'BR_' . uniqid(),
            'phone' => '0901112233',
            'address' => 'Địa chỉ test',
            'is_active' => true,
        ]);

        $customer = Customer::create([
            'name' => 'Khách Test',
            'phone' => '0987' . rand(100000, 999999),
        ]);

        RepairOrder::create([
            'order_code' => 'ORD-' . strtoupper(uniqid()),
            'branch_id' => $branch->id,
            'customer_id' => $customer->id,
            'device_model_id' => $device->id,
            'issue_description' => 'Pin chai, mic rè',
            'status' => 'pending',
            'created_by_user_id' => $this->adminUser->id,
        ]);

        $response = $this->actingAs($this->adminUser, 'sanctum')
            ->deleteJson("/api/v1/devices/{$device->id}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        // Thiết bị vẫn còn trong database nhưng is_active chuyển thành false
        $this->assertDatabaseHas('device_models', [
            'id' => $device->id,
            'is_active' => false,
        ]);
    }

    /**
     * Test nhân viên không phải admin bị chặn quyền (403 Forbidden).
     */
    public function test_non_admin_cannot_mutate_devices(): void
    {
        $payload = [
            'name' => 'Hacker Model',
            'category' => 'AirPods',
            'checks' => ['Check 1'],
        ];

        // Thử tạo mới
        $resCreate = $this->actingAs($this->techUser, 'sanctum')
            ->postJson('/api/v1/devices', $payload);
        $resCreate->assertStatus(403);

        $device = DeviceModel::first();
        if ($device) {
            // Thử sửa
            $resUpdate = $this->actingAs($this->techUser, 'sanctum')
                ->putJson("/api/v1/devices/{$device->id}", ['name' => 'Hacked']);
            $resUpdate->assertStatus(403);

            // Thử xóa
            $resDelete = $this->actingAs($this->techUser, 'sanctum')
                ->deleteJson("/api/v1/devices/{$device->id}");
            $resDelete->assertStatus(403);
        }
    }

    /**
     * Test lấy danh sách danh mục động và tạo danh mục mới.
     */
    public function test_categories_and_store_category(): void
    {
        $resGet = $this->getJson('/api/v1/devices/categories');
        $resGet->assertStatus(200)
            ->assertJsonPath('success', true);

        $cats = $resGet->json('data');
        $this->assertContains('AirPods', $cats);

        // Admin tạo danh mục mới
        $newCategory = 'Smart Ring ' . uniqid();
        $resPost = $this->actingAs($this->adminUser, 'sanctum')
            ->postJson('/api/v1/devices/categories', [
                'name' => $newCategory,
            ]);

        $resPost->assertStatus(201)
            ->assertJsonPath('success', true);

        // Kiểm tra danh mục mới xuất hiện trong categories
        $resGetAfter = $this->getJson('/api/v1/devices/categories');
        $this->assertContains($newCategory, $resGetAfter->json('data'));
    }

    /**
     * Test checklist-template endpoint returns deduplicated criteria across multiple models in a category.
     */
    public function test_checklist_template_endpoint_deduplicates_category_items(): void
    {
        $category = 'Wearable ' . uniqid();

        // Model 1
        $model1 = DeviceModel::create([
            'name' => 'Watch Series A ' . uniqid(),
            'category' => $category,
            'model_code' => 'WSA-' . uniqid(),
            'is_active' => true,
        ]);
        ChecklistTemplate::create([
            'device_model_id' => $model1->id,
            'category' => $category,
            'item_name' => 'Màn hình / hiển thị',
            'order_index' => 1,
            'is_active' => true,
        ]);
        ChecklistTemplate::create([
            'device_model_id' => $model1->id,
            'category' => $category,
            'item_name' => 'Cảm ứng & Nguồn',
            'order_index' => 2,
            'is_active' => true,
        ]);

        // Model 2
        $model2 = DeviceModel::create([
            'name' => 'Watch Series B ' . uniqid(),
            'category' => $category,
            'model_code' => 'WSB-' . uniqid(),
            'is_active' => true,
        ]);
        ChecklistTemplate::create([
            'device_model_id' => $model2->id,
            'category' => $category,
            'item_name' => 'Màn hình / hiển thị',
            'order_index' => 1,
            'is_active' => true,
        ]);
        ChecklistTemplate::create([
            'device_model_id' => $model2->id,
            'category' => $category,
            'item_name' => 'Cảm ứng & Nguồn',
            'order_index' => 2,
            'is_active' => true,
        ]);

        $res = $this->getJson('/api/v1/devices/checklist-template?category=' . urlencode($category));
        $res->assertStatus(200)->assertJsonPath('success', true);

        $items = $res->json('data');
        $this->assertCount(2, $items, 'Category items should be deduplicated to 2 distinct items');
        $this->assertEquals(['Màn hình / hiển thị', 'Cảm ứng & Nguồn'], array_column($items, 'item_name'));
    }

    /**
     * Test checklist-template endpoint retrieves tailored checklist by device_model_id.
     */
    public function test_checklist_template_endpoint_retrieves_by_device_model_id(): void
    {
        $category = 'Tablet ' . uniqid();
        $customModel = DeviceModel::create([
            'name' => 'Pro Max Tablet ' . uniqid(),
            'category' => $category,
            'model_code' => 'TAB-' . uniqid(),
            'is_active' => true,
        ]);

        ChecklistTemplate::create([
            'device_model_id' => $customModel->id,
            'category' => $category,
            'item_name' => 'Face ID TrueDepth',
            'order_index' => 1,
            'is_active' => true,
        ]);

        $res = $this->getJson('/api/v1/devices/checklist-template?device_model_id=' . $customModel->id);
        $res->assertStatus(200)->assertJsonPath('success', true);

        $items = $res->json('data');
        $this->assertCount(1, $items);
        $this->assertEquals('Face ID TrueDepth', $items[0]['item_name']);
    }
}
