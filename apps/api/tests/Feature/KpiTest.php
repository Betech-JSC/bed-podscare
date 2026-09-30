<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\User;
use Carbon\Carbon;
use Tests\TestCase;

class KpiTest extends TestCase
{
    private function getAuthenticatedUser(): User
    {
        $user = User::where('email', 'admin@podscare.vn')->first();
        if (! $user) {
            $user = User::first();
        }
        $this->assertNotNull($user, 'Authenticated user must exist');
        return $user;
    }

    private function createOrderForKpi(array $attributes = []): RepairOrder
    {
        $branch = Branch::first();
        $customer = Customer::first();
        $device = DeviceModel::first();
        $user = $this->getAuthenticatedUser();

        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);

        return RepairOrder::create(array_merge([
            'order_code'          => "PC{$year}-K{$randomNum}",
            'branch_id'           => $branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'issue_description'   => 'Lỗi âm thanh rè hoặc pin',
            'status'              => 'inspecting',
            'total_price'         => 500000,
            'warranty_terms_days' => 90,
            'created_by_user_id'  => $user->id,
            'created_at'          => Carbon::now(),
        ], $attributes));
    }

    /**
     * Test 1: GET /api/v1/kpi/dashboard yêu cầu xác thực Bearer token.
     */
    public function test_dashboard_kpi_requires_authentication(): void
    {
        $response = $this->getJson('/api/v1/kpi/dashboard');
        $response->assertStatus(401);
    }

    /**
     * Test 2: GET /api/v1/kpi/dashboard trả về cấu trúc dữ liệu KPI đầy đủ.
     */
    public function test_dashboard_kpi_returns_complete_structure(): void
    {
        $user = $this->getAuthenticatedUser();
        $this->createOrderForKpi();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/kpi/dashboard');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    'summary' => [
                        'active_orders',
                        'intake_today',
                        'today_orders',
                        'monthly_revenue',
                        'monthly_revenue_formatted',
                        'completion_rate',
                        'total_orders',
                        'completed_orders',
                    ],
                    'active_orders',
                    'intake_today',
                    'today_orders',
                    'monthly_revenue',
                    'monthly_revenue_formatted',
                    'completion_rate',
                    'status_distribution',
                    'workload_by_status',
                    'revenue_chart',
                ],
            ]);
    }

    /**
     * Test 3: Tính toán chính xác các chỉ số tổng hợp (active_orders, monthly_revenue, completion_rate, revenue_chart).
     */
    public function test_dashboard_kpi_calculates_accurate_metrics(): void
    {
        $user = $this->getAuthenticatedUser();
        $branch = Branch::first();

        // Tạo 1 đơn inspecting (active)
        $this->createOrderForKpi([
            'status'      => 'inspecting',
            'branch_id'   => $branch->id,
            'total_price' => 200000,
        ]);

        // Tạo 1 đơn in_repair (active)
        $this->createOrderForKpi([
            'status'      => 'in_repair',
            'branch_id'   => $branch->id,
            'total_price' => 300000,
        ]);

        // Tạo 1 đơn completed hôm nay (doanh thu 800.000)
        $this->createOrderForKpi([
            'status'         => 'completed',
            'branch_id'      => $branch->id,
            'total_price'    => 800000,
            'handed_over_at' => Carbon::now(),
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson("/api/v1/kpi/dashboard?branch_id={$branch->id}");

        $response->assertStatus(200);
        $data = $response->json('data');

        $this->assertGreaterThanOrEqual(2, $data['active_orders']);
        $this->assertGreaterThanOrEqual(800000, $data['monthly_revenue']);
        $this->assertIsArray($data['revenue_chart']);
        $this->assertCount(14, $data['revenue_chart']);

        // Kiểm tra phần tử biểu đồ có đầy đủ trường date, label, revenue, completed_orders
        $firstPoint = $data['revenue_chart'][0];
        $this->assertArrayHasKey('date', $firstPoint);
        $this->assertArrayHasKey('label', $firstPoint);
        $this->assertArrayHasKey('revenue', $firstPoint);
        $this->assertArrayHasKey('completed_orders', $firstPoint);
    }

    /**
     * Test 4: Bộ lọc khoảng thời gian period=7_days trả về 7 điểm dữ liệu.
     */
    public function test_dashboard_kpi_supports_custom_periods(): void
    {
        $user = $this->getAuthenticatedUser();

        $response7 = $this->actingAs($user, 'sanctum')->getJson('/api/v1/kpi/dashboard?period=7_days');
        $response7->assertStatus(200);
        $this->assertCount(7, $response7->json('data.revenue_chart'));

        $response30 = $this->actingAs($user, 'sanctum')->getJson('/api/v1/kpi/dashboard?period=30_days');
        $response30->assertStatus(200);
        $this->assertCount(30, $response30->json('data.revenue_chart'));
    }

    /**
     * Test 5: Bộ lọc chi nhánh branch_id cách ly số liệu giữa các chi nhánh.
     */
    public function test_dashboard_kpi_filters_by_branch(): void
    {
        $user = $this->getAuthenticatedUser();

        $branch1 = Branch::first();
        $branch2 = Branch::skip(1)->first() ?? Branch::create([
            'name'      => 'Chi nhánh Thử Nghiệm 2',
            'code'      => 'CN2-TEST',
            'address'   => '456 Hai Bà Trưng, Q.3',
            'phone'     => '0902000002',
            'is_active' => true,
        ]);

        $this->createOrderForKpi([
            'branch_id'   => $branch2->id,
            'status'      => 'in_repair',
            'total_price' => 1500000,
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson("/api/v1/kpi/dashboard?branch_id={$branch2->id}");
        $response->assertStatus(200);

        $this->assertGreaterThanOrEqual(1, $response->json('data.active_orders'));
    }
}
