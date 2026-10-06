<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class OrderAdditionalServicesTest extends TestCase
{
    use DatabaseTransactions;

    private function getAuthenticatedUser(string $role = 'cskh', ?Branch $branch = null): User
    {
        $branch = $branch ?? (Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'BR_Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi, Q1, TP.HCM',
            'is_active' => true,
        ]));

        return User::factory()->create([
            'name'      => 'Test ' . ucfirst($role),
            'email'     => 'user_' . uniqid() . '@fixo.vn',
            'role'      => $role,
            'branch_id' => $branch->id,
        ]);
    }

    private function createTestOrder(float $initialPrice = 500000, ?User $user = null): RepairOrder
    {
        $branch = $user?->branch ?? (Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'BR_Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi, Q1, TP.HCM',
            'is_active' => true,
        ]));

        $customer = Customer::first() ?? Customer::create([
            'name'  => 'Trần Hoàng Long',
            'phone' => '090' . random_int(1000000, 9999999),
            'email' => 'long_' . uniqid() . '@gmail.com',
        ]);

        $device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $year = date('y');
        $randomNum = str_pad((string) random_int(1000, 99999), 5, '0', STR_PAD_LEFT);
        $orderCode = "FX{$year}-{$randomNum}";

        return RepairOrder::create([
            'order_code'           => $orderCode,
            'branch_id'            => $branch->id,
            'customer_id'          => $customer->id,
            'device_model_id'      => $device->id,
            'serial_number'        => 'H123456789',
            'issue_description'    => 'Hỏng loa tai phải',
            'status'               => 'in_repair',
            'total_price'          => $initialPrice,
            'initial_price'        => $initialPrice,
            'warranty_terms_days'  => 90,
            'created_by_user_id'   => $user?->id ?? 1,
        ]);
    }

    public function test_cskh_can_add_additional_service_and_total_price_increases(): void
    {
        $cskh = $this->getAuthenticatedUser('cskh');
        $order = $this->createTestOrder(500000, $cskh);

        $response = $this->actingAs($cskh)
            ->postJson("/api/v1/orders/{$order->id}/additional-services", [
                'name'  => 'Vệ sinh buồng âm chống bám bụi',
                'price' => 150000,
                'note'  => 'Khách dặn kỹ lau sạch cặn màng loa',
            ]);

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('data.total_price', '650000.00');

        $order->refresh();
        $this->assertEquals(650000.0, (float) $order->total_price);
        $this->assertEquals(500000.0, (float) $order->initial_price);
        $this->assertCount(1, $order->additional_services);
        $this->assertEquals('Vệ sinh buồng âm chống bám bụi', $order->additional_services[0]['name']);
        $this->assertEquals(150000, $order->additional_services[0]['price']);
        $this->assertEquals($cskh->name, $order->additional_services[0]['created_by_name']);
    }

    public function test_technician_is_forbidden_from_adding_additional_service(): void
    {
        $branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'BR_Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi, Q1, TP.HCM',
            'is_active' => true,
        ]);

        $tech = $this->getAuthenticatedUser('technician', $branch);
        $order = $this->createTestOrder(500000, $tech);

        $response = $this->actingAs($tech)
            ->postJson("/api/v1/orders/{$order->id}/additional-services", [
                'name'  => 'Thay pin dock sạc',
                'price' => 300000,
            ]);

        $response->assertStatus(403);
    }

    public function test_validation_fails_when_price_is_missing_or_non_positive(): void
    {
        $cskh = $this->getAuthenticatedUser('cskh');
        $order = $this->createTestOrder(500000, $cskh);

        // Missing price
        $responseMissing = $this->actingAs($cskh)
            ->postJson("/api/v1/orders/{$order->id}/additional-services", [
                'name' => 'Thay pin',
            ]);
        $responseMissing->assertStatus(422);

        // Zero price
        $responseZero = $this->actingAs($cskh)
            ->postJson("/api/v1/orders/{$order->id}/additional-services", [
                'name'  => 'Thay pin',
                'price' => 0,
            ]);
        $responseZero->assertStatus(422);

        // Negative price
        $responseNeg = $this->actingAs($cskh)
            ->postJson("/api/v1/orders/{$order->id}/additional-services", [
                'name'  => 'Thay pin',
                'price' => -50000,
            ]);
        $responseNeg->assertStatus(422);

        // Missing name
        $responseNoName = $this->actingAs($cskh)
            ->postJson("/api/v1/orders/{$order->id}/additional-services", [
                'price' => 100000,
            ]);
        $responseNoName->assertStatus(422);
    }

    public function test_cskh_can_delete_additional_service_and_total_price_decreases(): void
    {
        $cskh = $this->getAuthenticatedUser('cskh');
        $order = $this->createTestOrder(500000, $cskh);

        // Thêm 2 dịch vụ
        $added1 = $order->addAdditionalService([
            'name'  => 'Dịch vụ 1',
            'price' => 150000,
        ], $cskh);

        $added2 = $order->addAdditionalService([
            'name'  => 'Dịch vụ 2',
            'price' => 80000,
        ], $cskh);

        $order->refresh();
        $this->assertEquals(730000.0, (float) $order->total_price);
        $this->assertCount(2, $order->additional_services);

        // Xóa dịch vụ 2
        $response = $this->actingAs($cskh)
            ->deleteJson("/api/v1/orders/{$order->id}/additional-services/{$added2['id']}");

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('data.total_price', '650000.00');

        $order->refresh();
        $this->assertEquals(650000.0, (float) $order->total_price);
        $this->assertCount(1, $order->additional_services);
        $this->assertEquals($added1['id'], $order->additional_services[0]['id']);
    }

    public function test_technician_is_forbidden_from_deleting_additional_service(): void
    {
        $branch = Branch::first() ?? Branch::create([
            'name'      => 'Chi nhánh Quận 1',
            'code'      => 'BR_Q1_' . uniqid(),
            'phone'     => '0901234567',
            'address'   => '123 Lê Lợi, Q1, TP.HCM',
            'is_active' => true,
        ]);

        $cskh = $this->getAuthenticatedUser('cskh', $branch);
        $tech = $this->getAuthenticatedUser('technician', $branch);
        $order = $this->createTestOrder(500000, $cskh);

        $added = $order->addAdditionalService([
            'name'  => 'Vệ sinh vỏ',
            'price' => 50000,
        ], $cskh);

        $response = $this->actingAs($tech)
            ->deleteJson("/api/v1/orders/{$order->id}/additional-services/{$added['id']}");

        $response->assertStatus(403);
    }

    public function test_deleting_non_existent_service_returns_404(): void
    {
        $cskh = $this->getAuthenticatedUser('cskh');
        $order = $this->createTestOrder(500000, $cskh);

        $response = $this->actingAs($cskh)
            ->deleteJson("/api/v1/orders/{$order->id}/additional-services/srv_non_existent_9999");

        $response->assertStatus(404);
        $response->assertJsonPath('success', false);
    }

    public function test_initial_price_is_backfilled_if_initially_null(): void
    {
        $cskh = $this->getAuthenticatedUser('cskh');
        $order = $this->createTestOrder(400000, $cskh);
        $order->initial_price = null;
        $order->save();

        $response = $this->actingAs($cskh)
            ->postJson("/api/v1/orders/{$order->id}/additional-services", [
                'name'  => 'Thay jack sạc',
                'price' => 100000,
            ]);

        $response->assertStatus(200);
        $order->refresh();
        $this->assertEquals(400000.0, (float) $order->initial_price);
        $this->assertEquals(500000.0, (float) $order->total_price);
    }
}
