<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ApiV1EndpointsTest extends TestCase
{
    /**
     * Test public tracking endpoint.
     */
    public function test_public_tracking_endpoint_returns_order_and_timeline(): void
    {
        $response = $this->getJson('/api/v1/tracking/PC26-00981');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.order.order_code', 'PC26-00981');

        $this->assertStringContainsString('****', $response->json('data.order.customer.phone'));

        $this->assertCount(6, $response->json('data.timeline'));
    }

    /**
     * Test public tracking with non-existent code returns 404.
     */
    public function test_public_tracking_with_invalid_code_returns_404(): void
    {
        $response = $this->getJson('/api/v1/tracking/NONEXISTENT-999');

        $response->assertStatus(404)
            ->assertJsonPath('success', false);
    }

    /**
     * Test public devices and checklist template endpoints.
     */
    public function test_public_devices_and_checklist_template(): void
    {
        $response = $this->getJson('/api/v1/devices');
        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $responseTemplate = $this->getJson('/api/v1/devices/checklist-template');
        $responseTemplate->assertStatus(200)
            ->assertJsonPath('success', true);
        $this->assertCount(9, $responseTemplate->json('data'));
    }

    /**
     * Test public services and common issues endpoints.
     */
    public function test_public_services_and_common_issues(): void
    {
        $responseServices = $this->getJson('/api/v1/services');
        $responseServices->assertStatus(200)
            ->assertJsonPath('success', true);

        $responseIssues = $this->getJson('/api/v1/services/common-issues');
        $responseIssues->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    /**
     * Test public branches endpoint.
     */
    public function test_public_branches_endpoint(): void
    {
        $response = $this->getJson('/api/v1/branches');
        $response->assertStatus(200)
            ->assertJsonPath('success', true);
        $this->assertNotEmpty($response->json('data'));
    }


    /**
     * Test auth login with valid and invalid credentials.
     */
    public function test_auth_login_with_valid_and_invalid_credentials(): void
    {
        // 1. Invalid credentials
        $responseFail = $this->postJson('/api/v1/auth/login', [
            'email'    => 'admin@podscare.vn',
            'password' => 'wrong_password',
        ]);
        $responseFail->assertStatus(401)
            ->assertJsonPath('success', false);

        // 2. Valid credentials
        $responseSuccess = $this->postJson('/api/v1/auth/login', [
            'email'    => 'admin@podscare.vn',
            'password' => 'password',
        ]);
        $responseSuccess->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'token',
                    'token_type',
                    'user' => ['id', 'name', 'email', 'role'],
                ],
            ]);
    }

    /**
     * Test unauthenticated access to protected routes returns 401.
     */
    public function test_protected_routes_require_authentication(): void
    {
        $response = $this->getJson('/api/v1/orders');
        $response->assertStatus(401);
    }

    /**
     * Test authenticated CRUD operations on orders and FSM transitions.
     */
    public function test_authenticated_user_can_access_orders_and_crud(): void
    {
        $user = User::where('email', 'admin@podscare.vn')->first();
        $this->assertNotNull($user);

        $branch = Branch::first();
        $customer = Customer::first();
        $device = DeviceModel::first();

        // 1. Get orders list
        $responseList = $this->actingAs($user, 'sanctum')->getJson('/api/v1/orders');
        $responseList->assertStatus(200)->assertJsonPath('success', true);

        // 2. Create new order
        $responseCreate = $this->actingAs($user, 'sanctum')->postJson('/api/v1/orders', [
            'branch_id'           => $branch->id,
            'customer_id'         => $customer->id,
            'device_model_id'     => $device->id,
            'issue_description'   => 'AirPods mất tiếng một bên tai',
            'estimated_price'     => 300000,
            'warranty_terms_days' => 90,
            'checklists'          => [
                ['item_name' => 'Kết nối Bluetooth', 'status' => 'pass'],
                ['item_name' => 'Âm thanh tai trái', 'status' => 'fail', 'note' => 'Không nghe thấy gì'],
            ],
        ]);

        $responseCreate->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'inspecting');

        $createdOrderId = $responseCreate->json('data.id');

        // 3. FSM Transition: inspecting -> waiting_approval
        $responseTransition = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$createdOrderId}/transition", [
            'status' => 'waiting_approval',
        ]);
        $responseTransition->assertStatus(200)
            ->assertJsonPath('data.status', 'waiting_approval');

        // 4. Invalid FSM Transition: waiting_approval -> ready_for_return should fail (422)
        $responseInvalid = $this->actingAs($user, 'sanctum')->postJson("/api/v1/orders/{$createdOrderId}/transition", [
            'status' => 'ready_for_return',
        ]);
        $responseInvalid->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    /**
     * Test inventory, shipments, warranties and payments endpoints.
     */
    public function test_inventory_shipments_warranties_and_payments_endpoints(): void
    {
        $user = User::where('email', 'admin@podscare.vn')->first();

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/inventory/parts')
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/shipments')
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/warranties')
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/payments')
            ->assertStatus(200)
            ->assertJsonPath('success', true);
    }
}
