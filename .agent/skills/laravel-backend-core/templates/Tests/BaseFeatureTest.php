<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\WithFaker;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Lớp BaseFeatureTest cung cấp nền tảng kiểm thử chức năng tự động:
 * 1. Tự động reset CSDL sạch sẽ sau mỗi bài test với RefreshDatabase.
 * 2. Cung cấp các helper đăng nhập nhanh cho User và Admin.
 * 3. Hỗ trợ kích hoạt Fakes cho Queue, Mail, Event, Storage chỉ bằng một hàm gọi.
 * 4. Helper assertions kiểm tra cấu trúc JSON chuẩn của ApiResponse trait.
 */
abstract class BaseFeatureTest extends TestCase
{
    use RefreshDatabase, WithFaker;

    protected ?User $adminUser = null;
    protected ?User $regularUser = null;

    protected function setUp(): void
    {
        parent::setUp();
    }

    /**
     * Kích hoạt toàn bộ các Fakes để bài test chạy độc lập và không bắn ra ngoài.
     */
    protected function fakeExternalServices(): void
    {
        Queue::fake();
        Mail::fake();
        Event::fake();
        Storage::fake('public');
    }

    /**
     * Đăng nhập với tư cách Quản trị viên (Admin).
     */
    protected function actingAsAdmin(?User $admin = null): static
    {
        $this->adminUser = $admin ?? User::factory()->create([
            'email'    => 'admin_' . uniqid() . '@example.com',
            'is_admin' => true,
        ]);

        return $this->actingAs($this->adminUser, 'admin');
    }

    /**
     * Đăng nhập với tư cách Người dùng thông thường (Client / Customer).
     */
    protected function actingAsUser(?User $user = null): static
    {
        $this->regularUser = $user ?? User::factory()->create([
            'email' => 'user_' . uniqid() . '@example.com',
        ]);

        return $this->actingAs($this->regularUser, 'web');
    }

    /**
     * Xác nhận response tuân thủ đúng cấu trúc thành công của ApiResponse trait.
     */
    protected function assertApiSuccess($response, int $expectedStatus = 200): static
    {
        $response->assertStatus($expectedStatus)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'success',
                'message',
                'data',
            ]);

        return $this;
    }

    /**
     * Xác nhận response tuân thủ đúng cấu trúc thất bại của ApiResponse trait.
     */
    protected function assertApiFailure($response, int $expectedStatus = 400, ?string $expectedErrorCode = null): static
    {
        $response->assertStatus($expectedStatus)
            ->assertJsonPath('success', false)
            ->assertJsonStructure([
                'success',
                'message',
                'errors',
            ]);

        if ($expectedErrorCode !== null) {
            $response->assertJsonPath('error_code', $expectedErrorCode);
        }

        return $this;
    }

    /**
     * Xác nhận response báo lỗi xác thực form (HTTP 422 Unprocessable Entity).
     */
    protected function assertApiValidationError($response, array|string $fields): static
    {
        $response->assertStatus(422)
            ->assertJsonValidationErrors($fields);

        return $this;
    }

    /**
     * Xác nhận response trả về lỗi xung đột sửa đổi đồng thời (HTTP 409 Conflict).
     */
    protected function assertApiConflictError($response): static
    {
        $response->assertStatus(409)
            ->assertJsonPath('success', false);

        return $this;
    }
}
