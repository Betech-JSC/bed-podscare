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
