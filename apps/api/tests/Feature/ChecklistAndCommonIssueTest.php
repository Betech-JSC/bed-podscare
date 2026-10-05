<?php

namespace Tests\Feature;

use App\Models\ChecklistTemplate;
use App\Models\CommonIssue;
use App\Models\DeviceModel;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class ChecklistAndCommonIssueTest extends TestCase
{
    use DatabaseTransactions;

    /**
     * Test checklist template endpoint returns default AirPods checklist.
     */
    public function test_checklist_template_default_returns_airpods(): void
    {
        $response = $this->getJson('/api/v1/devices/checklist-template');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    '*' => [
                        'id',
                        'category',
                        'item_name',
                        'description',
                        'order_index',
                    ],
                ],
            ]);

        $data = $response->json('data');
        $this->assertNotEmpty($data);

        foreach ($data as $item) {
            $this->assertEquals('AirPods', $item['category']);
        }
    }

    /**
     * Test checklist template endpoint filters correctly by category.
     */
    public function test_checklist_template_filters_by_category(): void
    {
        $categories = ['Apple Watch', 'Apple Pencil', 'MacBook', 'iPad'];

        foreach ($categories as $category) {
            $response = $this->getJson('/api/v1/devices/checklist-template?category=' . urlencode($category));

            $response->assertStatus(200)
                ->assertJsonPath('success', true);

            $data = $response->json('data');
            $this->assertNotEmpty($data, "Checklist templates for {$category} should not be empty");

            foreach ($data as $item) {
                $this->assertEquals($category, $item['category']);
            }
        }
    }

    /**
     * Test checklist template endpoint handles device_model_id parameter.
     */
    public function test_checklist_template_handles_device_model_id(): void
    {
        $watchModel = DeviceModel::where('category', 'Apple Watch')->first();
        if (! $watchModel) {
            $watchModel = DeviceModel::create([
                'name' => 'Apple Watch Series 9 Test',
                'category' => 'Apple Watch',
                'model_code' => 'TEST-WATCH-001',
                'release_year' => 2023,
                'manufacturer' => 'Apple',
                'is_active' => true,
            ]);
        }

        $response = $this->getJson('/api/v1/devices/checklist-template?device_model_id=' . $watchModel->id);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $data = $response->json('data');
        $this->assertNotEmpty($data);

        foreach ($data as $item) {
            $this->assertEquals('Apple Watch', $item['category']);
        }
    }

    /**
     * Test checklist template deduplicates items when multiple models have identical checklist item names.
     */
    public function test_checklist_template_deduplicates_item_names_for_category(): void
    {
        $testCat = 'Test Category ' . uniqid();

        $modelA = DeviceModel::create([
            'name' => 'Device Model A ' . uniqid(),
            'category' => $testCat,
            'model_code' => 'MOD-A-' . uniqid(),
            'is_active' => true,
        ]);

        $modelB = DeviceModel::create([
            'name' => 'Device Model B ' . uniqid(),
            'category' => $testCat,
            'model_code' => 'MOD-B-' . uniqid(),
            'is_active' => true,
        ]);

        // Model A có 3 tiêu chí
        ChecklistTemplate::create([
            'device_model_id' => $modelA->id,
            'category' => $testCat,
            'item_name' => 'Màn hình / hiển thị',
            'order_index' => 1,
            'is_active' => true,
        ]);
        ChecklistTemplate::create([
            'device_model_id' => $modelA->id,
            'category' => $testCat,
            'item_name' => 'Cảm ứng',
            'order_index' => 2,
            'is_active' => true,
        ]);
        ChecklistTemplate::create([
            'device_model_id' => $modelA->id,
            'category' => $testCat,
            'item_name' => 'Pin',
            'order_index' => 3,
            'is_active' => true,
        ]);

        // Model B có cùng 3 tiêu chí trùng tên
        ChecklistTemplate::create([
            'device_model_id' => $modelB->id,
            'category' => $testCat,
            'item_name' => 'Màn hình / hiển thị',
            'order_index' => 1,
            'is_active' => true,
        ]);
        ChecklistTemplate::create([
            'device_model_id' => $modelB->id,
            'category' => $testCat,
            'item_name' => 'Cảm ứng',
            'order_index' => 2,
            'is_active' => true,
        ]);
        ChecklistTemplate::create([
            'device_model_id' => $modelB->id,
            'category' => $testCat,
            'item_name' => 'Pin',
            'order_index' => 3,
            'is_active' => true,
        ]);

        $response = $this->getJson('/api/v1/devices/checklist-template?category=' . urlencode($testCat));

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $items = $response->json('data');
        $this->assertCount(3, $items, 'Checklist items must be deduplicated to exactly 3 items instead of 6');

        $itemNames = array_column($items, 'item_name');
        $this->assertEquals(['Màn hình / hiển thị', 'Cảm ứng', 'Pin'], $itemNames);
        $this->assertEquals(count($itemNames), count(array_unique($itemNames)), 'No duplicate item_name allowed');
    }

    /**
     * Test checklist template prioritizes specific model checklist and supports model_id or model_name.
     */
    public function test_checklist_template_prioritizes_specific_model_and_supports_aliases(): void
    {
        $testCat = 'Smart Watch ' . uniqid();

        $specialModel = DeviceModel::create([
            'name' => 'Ultra Titanium ' . uniqid(),
            'category' => $testCat,
            'model_code' => 'ULTRA-' . uniqid(),
            'is_active' => true,
        ]);

        ChecklistTemplate::create([
            'device_model_id' => $specialModel->id,
            'category' => $testCat,
            'item_name' => 'Nút Action Button Ultra',
            'order_index' => 1,
            'is_active' => true,
        ]);

        ChecklistTemplate::create([
            'device_model_id' => $specialModel->id,
            'category' => $testCat,
            'item_name' => 'Còi báo động Siren 86dB',
            'order_index' => 2,
            'is_active' => true,
        ]);

        // Test with device_model_id
        $res1 = $this->getJson('/api/v1/devices/checklist-template?device_model_id=' . $specialModel->id);
        $res1->assertStatus(200);
        $items1 = $res1->json('data');
        $this->assertCount(2, $items1);
        $this->assertEquals('Nút Action Button Ultra', $items1[0]['item_name']);

        // Test with model_id alias
        $res2 = $this->getJson('/api/v1/devices/checklist-template?model_id=' . $specialModel->id);
        $res2->assertStatus(200);
        $items2 = $res2->json('data');
        $this->assertCount(2, $items2);
        $this->assertEquals('Nút Action Button Ultra', $items2[0]['item_name']);

        // Test with model_name
        $res3 = $this->getJson('/api/v1/devices/checklist-template?model_name=' . urlencode($specialModel->name));
        $res3->assertStatus(200);
        $items3 = $res3->json('data');
        $this->assertCount(2, $items3);
        $this->assertEquals('Nút Action Button Ultra', $items3[0]['item_name']);
    }

    /**
     * Test common issues endpoint returns default AirPods issues.
     */
    public function test_common_issues_default_returns_airpods(): void
    {
        $response = $this->getJson('/api/v1/services/common-issues');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    '*' => [
                        'id',
                        'category',
                        'issue_name',
                        'solution',
                        'estimated_time',
                    ],
                ],
            ]);

        $data = $response->json('data');
        $this->assertNotEmpty($data);

        foreach ($data as $item) {
            $this->assertEquals('AirPods', $item['category']);
        }
    }

    /**
     * Test common issues endpoint filters by category.
     */
    public function test_common_issues_filters_by_category(): void
    {
        $categories = ['Apple Watch', 'Apple Pencil', 'MacBook', 'iPad'];

        foreach ($categories as $category) {
            $response = $this->getJson('/api/v1/services/common-issues?category=' . urlencode($category));

            $response->assertStatus(200)
                ->assertJsonPath('success', true);

            $data = $response->json('data');
            $this->assertNotEmpty($data, "Common issues for {$category} should not be empty");

            foreach ($data as $item) {
                $this->assertEquals($category, $item['category']);
            }
        }
    }

    /**
     * Test common issues endpoint handles device_model_id parameter.
     */
    public function test_common_issues_handles_device_model_id(): void
    {
        $macModel = DeviceModel::where('category', 'MacBook')->first();
        if (! $macModel) {
            $macModel = DeviceModel::create([
                'name' => 'MacBook Air M2 Test',
                'category' => 'MacBook',
                'model_code' => 'TEST-MAC-001',
                'release_year' => 2022,
                'manufacturer' => 'Apple',
                'is_active' => true,
            ]);
        }

        $response = $this->getJson('/api/v1/services/common-issues?device_model_id=' . $macModel->id);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $data = $response->json('data');
        $this->assertNotEmpty($data);

        foreach ($data as $item) {
            $this->assertEquals('MacBook', $item['category']);
        }
    }

    /**
     * Test relations and query scopes on models.
     */
    public function test_eloquent_scopes_and_relations(): void
    {
        $airpodsChecklists = ChecklistTemplate::active()->forCategory('AirPods')->get();
        $this->assertGreaterThan(0, $airpodsChecklists->count());

        $watchIssues = CommonIssue::active()->forCategory('Apple Watch')->get();
        $this->assertGreaterThan(0, $watchIssues->count());

        $model = DeviceModel::where('category', 'AirPods')->first();
        $this->assertNotNull($model);
        $this->assertInstanceOf(\Illuminate\Database\Eloquent\Collection::class, $model->checklistTemplates);
        $this->assertInstanceOf(\Illuminate\Database\Eloquent\Collection::class, $model->commonIssues);
    }
}
