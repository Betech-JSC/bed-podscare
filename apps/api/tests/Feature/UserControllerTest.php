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
        $admin = User::firstOrCreate(
            ['email' => 'admin@podscare.vn'],
            [
                'name'      => 'Minh Lê',
                'password'  => Hash::make('password123'),
                'role'      => 'admin',
                'phone'     => '0901 000 001',
                'is_active' => true,
            ]
        );

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
        $uniqueEmail = 'staff_' . uniqid() . '@podscare.vn';

        // 1. Validation failure
        $badResponse = $this->postJson('/api/v1/users', [
            'name' => '',
            'email' => 'not-an-email',
            'role' => 'invalid_role',
        ], $headers);
        $badResponse->assertStatus(422);

        // 2. Successful creation
        $createResponse = $this->postJson('/api/v1/users', [
            'name'     => 'Nhân viên Test',
            'email'    => $uniqueEmail,
            'password' => 'password123',
            'phone'    => '0912 345 678',
            'role'     => 'cskh',
        ], $headers);

        $createResponse->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.email', $uniqueEmail)
            ->assertJsonPath('data.role', 'cskh');

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
        // Test quick login with demo technician credentials
        $response = $this->postJson('/api/v1/auth/login', [
            'email'    => 'tuan.kt@podscare.vn',
            'password' => 'password123',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.role', 'technician');
    }
}
