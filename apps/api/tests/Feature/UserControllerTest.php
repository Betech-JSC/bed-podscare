<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Foundation\Testing\WithFaker;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserControllerTest extends TestCase
{
    private function getAdminToken(): array
    {
        $admin = User::where('email', 'admin@fixo.com.vn')->first()
            ?? User::where('email', 'admin@podscare.vn')->first()
            ?? User::where('role', 'admin')->first();

        if (! $admin) {
            $admin = new User([
                'name'      => 'Minh Lê',
                'email'     => 'admin@fixo.com.vn',
                'password'  => Hash::make('password123'),
                'phone'     => '0901 000 001',
                'is_active' => true,
            ]);
            $admin->role = 'admin';
            $admin->save();
        }

        $token = $admin->createToken('test_token')->plainTextToken;

        return [
            'Authorization' => "Bearer {$token}",
            'Accept'        => 'application/json',
        ];
    }

    public function test_get_users_list(): void
    {
        $headers = $this->getAdminToken();

        $response = $this->getJson('/api/v1/users', $headers);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'data' => [
                    'data' => [
                        '*' => ['id', 'name', 'email', 'role', 'is_active'],
                    ],
                ],
            ]);
    }

    public function test_create_user_with_validation(): void
    {
        $headers = $this->getAdminToken();
        $uniqueEmail = 'staff_' . uniqid() . '@fixo.com.vn';

        // 1. Validation failure (missing name, email, role)
        $badResponse = $this->postJson('/api/v1/users', [
            'name' => '',
            'email' => 'not-an-email',
            'role' => 'invalid_role',
        ], $headers);
        $badResponse->assertStatus(422);

        // 1b. Validation failure: branch staff without branch_id
        $missingBranchResponse = $this->postJson('/api/v1/users', [
            'name'     => 'Nhân viên Test',
            'email'    => $uniqueEmail,
            'password' => 'password123',
            'phone'    => '0912 345 678',
            'role'     => 'cskh',
        ], $headers);
        $missingBranchResponse->assertStatus(422)
            ->assertJsonValidationErrors(['branch_id']);

        // 2. Successful creation with branch_id
        $branch = Branch::firstOrCreate(
            ['code' => 'BR_TEST_USR'],
            ['name' => 'Chi nhánh Test User', 'address' => '123 Test St', 'phone' => '0901234567', 'is_active' => true]
        );

        $createResponse = $this->postJson('/api/v1/users', [
            'name'      => 'Nhân viên Test',
            'email'     => $uniqueEmail,
            'password'  => 'password123',
            'phone'     => '0912 345 678',
            'branch_id' => $branch->id,
            'role'      => 'cskh',
        ], $headers);

        $createResponse->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.email', $uniqueEmail)
            ->assertJsonPath('data.role', 'cskh')
            ->assertJsonPath('data.branch_id', $branch->id);

        $createdId = $createResponse->json('data.id');

        // 3. Update user
        $updateResponse = $this->putJson("/api/v1/users/{$createdId}", [
            'name' => 'Nhân viên Test Cập Nhật',
            'role' => 'technician',
        ], $headers);

        $updateResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.name', 'Nhân viên Test Cập Nhật')
            ->assertJsonPath('data.role', 'technician');

        // 4. Toggle status
        $toggleResponse = $this->postJson("/api/v1/users/{$createdId}/toggle-status", [], $headers);
        $toggleResponse->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.is_active', false);

        // Toggle back to active
        $toggleBack = $this->postJson("/api/v1/users/{$createdId}/toggle-status", [], $headers);
        $toggleBack->assertStatus(200)
            ->assertJsonPath('data.is_active', true);
    }

    public function test_login_with_phone_and_quick_credentials(): void
    {
        // Test login with seeded technician credentials
        $response = $this->postJson('/api/v1/auth/login', [
            'email'    => 'ktv.tuan@fixo.com.vn',
            'password' => 'password',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.role', 'technician');

        // Test backward compatibility alias
        $responseAlias = $this->postJson('/api/v1/auth/login', [
            'email'    => 'ktv.tuan@podscare.vn',
            'password' => 'password',
        ]);

        $responseAlias->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.role', 'technician');
    }
}
