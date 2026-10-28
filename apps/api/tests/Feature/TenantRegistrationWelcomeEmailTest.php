<?php

namespace Tests\Feature;

use App\Mail\TenantWelcomeMail;
use App\Models\Branch;
use App\Models\Scopes\TenantScope;
use App\Models\Tenant;
use App\Models\User;
use App\Rules\ValidRegistrationEmail;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use RuntimeException;
use Tests\TestCase;

class TenantRegistrationWelcomeEmailTest extends TestCase
{
    use DatabaseTransactions;

    protected function clearTenantRegistrationRateLimiter(string $ip = '127.0.0.1'): void
    {
        RateLimiter::clear(md5('tenant-registration' . $ip));
        RateLimiter::clear('tenant-registration:' . $ip);
    }

    protected function setUp(): void
    {
        parent::setUp();
        ValidRegistrationEmail::resetTestDnsOverrides();
        config([ValidRegistrationEmail::TEST_DNS_OVERRIDE => null]);
        $this->clearTenantRegistrationRateLimiter();
    }

    protected function tearDown(): void
    {
        $this->clearTenantRegistrationRateLimiter();
        ValidRegistrationEmail::resetTestDnsOverrides();
        config([ValidRegistrationEmail::TEST_DNS_OVERRIDE => null]);
        Carbon::setTestNow();
        parent::tearDown();
    }

    /**
     * Scenario 1: Chặn địa chỉ email thuộc tên miền email rác tạm thời (Disposable Email Domains)
     * trước khi mở transaction tạo Tenant, Branch, User.
     */
    public function test_rejects_disposable_email_domains_before_creating_tenant(): void
    {
        Mail::fake();
        Http::fake();

        $disposableEmails = [
            'hacker@yopmail.com',
            'clone@10minutemail.com',
            'spam@tempmail.com',
            'test@mailinator.com',
            'burner@guerrillamail.com',
            'sub.inbox@yopmail.com',
        ];

        foreach ($disposableEmails as $index => $disposableEmail) {
            $this->clearTenantRegistrationRateLimiter();
            $storeCode = 'tiem-rac-' . $index . '-' . uniqid();

            $response = $this->postJson('/api/v1/tenants/register', [
                'store_code' => $storeCode,
                'store_name' => 'Tiệm Email Rác ' . $index,
                'owner_name' => 'Người Dùng Ảo',
                'phone'      => '0981' . rand(100000, 999999),
                'email'      => $disposableEmail,
                'password'   => 'password123',
                'plan'       => 'trial',
            ]);

            $response->assertStatus(422)
                ->assertJsonValidationErrors(['email']);

            $errorMessage = implode(' ', $response->json('errors.email', []));
            $this->assertStringContainsString('email tạm thời', $errorMessage);

            $this->assertDatabaseMissing('tenants', ['code' => $storeCode]);
            $this->assertDatabaseMissing('users', ['email' => $disposableEmail]);
        }

        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    /**
     * Scenario 2: Chặn các tên miền do người dùng gõ nhầm phổ biến (gmial.com, gamil.com, gmail.vn, yaho.com...)
     * kèm thông báo gợi ý tên miền đúng.
     */
    public function test_rejects_common_typo_email_domains_with_helpful_suggestion(): void
    {
        Mail::fake();
        Http::fake();

        $typoCases = [
            'chutiem@gmial.com'   => '@gmail.com',
            'chutiem@gamil.com'   => '@gmail.com',
            'chutiem@gmail.vn'    => '@gmail.com',
            'chutiem@yaho.com'    => '@yahoo.com',
            'chutiem@outlok.com'  => '@outlook.com',
            'chutiem@hotmial.com' => '@hotmail.com',
        ];

        $index = 0;
        foreach ($typoCases as $typoEmail => $expectedSuggestion) {
            $this->clearTenantRegistrationRateLimiter();
            $index++;
            $storeCode = 'tiem-typo-' . $index . '-' . uniqid();

            $response = $this->postJson('/api/v1/tenants/register', [
                'store_code' => $storeCode,
                'store_name' => 'Tiệm Gõ Nhầm Domain ' . $index,
                'owner_name' => 'Chủ Tiệm Gõ Nhầm',
                'phone'      => '0982' . rand(100000, 999999),
                'email'      => $typoEmail,
                'password'   => 'password123',
                'plan'       => 'trial',
            ]);

            $response->assertStatus(422)
                ->assertJsonValidationErrors(['email']);

            $errorMessage = implode(' ', $response->json('errors.email', []));
            $this->assertStringContainsString($expectedSuggestion, $errorMessage);

            $this->assertDatabaseMissing('tenants', ['code' => $storeCode]);
            $this->assertDatabaseMissing('users', ['email' => $typoEmail]);
        }

        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    /**
     * Scenario 3: Chặn tên miền không tồn tại hoặc không có bản ghi DNS MX/A hợp lệ.
     */
    public function test_rejects_domain_without_valid_dns_mx_or_a_record(): void
    {
        Mail::fake();
        Http::fake();

        // 1. Kiểm thử với TLD .invalid không tồn tại
        $storeCodeInvalidTld = 'tiem-invalid-' . uniqid();
        $invalidTldEmail = 'khachhang@nonexistent-domain-999999.invalid';

        $response1 = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCodeInvalidTld,
            'store_name' => 'Tiệm Domain Invalid',
            'owner_name' => 'Chủ Tiệm Invalid',
            'phone'      => '0983' . rand(100000, 999999),
            'email'      => $invalidTldEmail,
            'password'   => 'password123',
        ]);

        $response1->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $errorMessage1 = implode(' ', $response1->json('errors.email', []));
        $this->assertStringContainsString('không tồn tại hoặc không thể nhận thư', $errorMessage1);
        $this->assertDatabaseMissing('tenants', ['code' => $storeCodeInvalidTld]);
        $this->assertDatabaseMissing('users', ['email' => $invalidTldEmail]);

        // 2. Kiểm thử qua cấu hình ValidRegistrationEmail::TEST_DNS_OVERRIDE giả lập domain không có bản ghi MX/A
        config([
            ValidRegistrationEmail::TEST_DNS_OVERRIDE => [
                'ten-mien-khong-co-mx-9999.com.vn' => false,
            ],
        ]);

        $storeCodeNoMx = 'tiem-nomx-' . uniqid();
        $noMxEmail = 'owner@ten-mien-khong-co-mx-9999.com.vn';

        $response2 = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCodeNoMx,
            'store_name' => 'Tiệm Thiếu Bản Ghi MX',
            'owner_name' => 'Chủ Tiệm No MX',
            'phone'      => '0984' . rand(100000, 999999),
            'email'      => $noMxEmail,
            'password'   => 'password123',
        ]);

        $response2->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $errorMessage2 = implode(' ', $response2->json('errors.email', []));
        $this->assertStringContainsString('DNS MX/A', $errorMessage2);
        $this->assertDatabaseMissing('tenants', ['code' => $storeCodeNoMx]);
        $this->assertDatabaseMissing('users', ['email' => $noMxEmail]);

        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    /**
     * Scenario 4: Đăng ký hợp lệ với email thật (chutiem@gmail.com) trả về HTTP 201 Created,
     * tạo đầy đủ Tenant, Branch, User và gửi TenantWelcomeMail chuẩn Calm Jade (#176b51) & Warm Ivory (#f6f8f6),
     * không chứa gradient, hiển thị đầy đủ 6 thông tin định danh gian hàng.
     */
    public function test_valid_tenant_registration_sends_welcome_email_with_complete_store_details_and_calm_jade_design(): void
    {
        Mail::fake();
        Http::fake();

        $knownTime = Carbon::create(2026, 10, 26, 9, 0, 0, 'Asia/Ho_Chi_Minh');
        Carbon::setTestNow($knownTime);

        $email = 'chutiem@gmail.com';
        $phone = '0909123456';
        User::withoutGlobalScopes()->where('email', $email)->delete();
        User::withoutGlobalScopes()->where('phone', $phone)->update(['phone' => null]);
        Tenant::where('phone', $phone)->update(['phone' => null]);

        $storeCode = 'fixo-luxury-' . uniqid();
        $storeName = 'Xưởng Sửa Chữa Tai Nghe Fixo Luxury';
        $ownerName = 'Nguyễn Minh Tâm';

        $response = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode,
            'store_name' => $storeName,
            'owner_name' => $ownerName,
            'phone'      => $phone,
            'email'      => $email,
            'password'   => 'password123',
            'plan'       => 'trial',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCode)
            ->assertJsonPath('data.tenant.name', $storeName)
            ->assertJsonPath('data.tenant.status', 'active')
            ->assertJsonPath('data.tenant.plan', 'trial')
            ->assertJsonPath('data.user.email', $email);

        $tenantId = $response->json('data.tenant.id');
        $branchId = $response->json('data.branch.id');

        $this->assertDatabaseHas('tenants', [
            'id'     => $tenantId,
            'code'   => $storeCode,
            'name'   => $storeName,
            'status' => 'active',
        ]);

        $this->assertDatabaseHas('branches', [
            'id'        => $branchId,
            'tenant_id' => $tenantId,
            'is_active' => true,
        ]);

        $this->assertDatabaseHas('users', [
            'tenant_id' => $tenantId,
            'branch_id' => $branchId,
            'email'     => $email,
            'name'      => $ownerName,
            'role'      => 'admin',
        ]);

        Mail::assertSentCount(1);

        Mail::assertSent(TenantWelcomeMail::class, function (TenantWelcomeMail $mail) use (
            $email,
            $ownerName,
            $storeName,
            $storeCode,
            $knownTime
        ) {
            $this->assertTrue($mail->hasTo($email));

            $envelope = $mail->envelope();
            $this->assertStringContainsString('FIXO Repair OS', $envelope->subject);
            $this->assertStringContainsString($storeName, $envelope->subject);
            $this->assertStringContainsString($storeCode, $envelope->subject);

            $html = $mail->render();
            $expectedTrialEndDate = $knownTime->copy()->addYear()->timezone('Asia/Ho_Chi_Minh')->format('d/m/Y');

            // Kiểm tra đủ 6 thông tin định danh quan trọng của gian hàng
            $this->assertStringContainsString($ownerName, $html, 'Thiếu tên chủ cửa hàng trong email');
            $this->assertStringContainsString($storeName, $html, 'Thiếu tên gian hàng trong email');
            $this->assertStringContainsString($storeCode, $html, 'Thiếu mã gian hàng (store_code) trong email');
            $this->assertStringContainsString($email, $html, 'Thiếu địa chỉ email đăng nhập trong email');
            $this->assertStringContainsString('Dùng thử (Trial)', $html, 'Thiếu tên gói cước kích hoạt trong email');
            $this->assertStringContainsString($expectedTrialEndDate, $html, 'Thiếu ngày hết hạn dùng thử 1 năm trong email');
            $this->assertStringContainsString($mail->dashboardUrl, $html, 'Thiếu liên kết điều hướng tới trang Quản trị POS');

            // Kiểm tra tuân thủ Design System: Calm Jade (#176b51) & Warm Ivory (#f6f8f6), không dùng gradient
            $this->assertStringContainsString('#176b51', strtolower($html), 'Thiếu mã màu chủ đạo Calm Jade #176b51');
            $this->assertStringContainsString('#f6f8f6', strtolower($html), 'Thiếu mã màu nền Warm Ivory #f6f8f6');
            $this->assertStringNotContainsStringIgnoringCase('linear-gradient', $html, 'Email không được phép sử dụng linear-gradient');
            $this->assertStringNotContainsStringIgnoringCase('radial-gradient', $html, 'Email không được phép sử dụng radial-gradient');

            return true;
        });
    }

    /**
     * Scenario 5: Cơ chế Fail-Safe khi dịch vụ gửi Mail ném ngoại lệ kết nối / lỗi SMTP runtime:
     * Hệ thống ghi Log::warning nhưng API POST /api/v1/tenants/register vẫn trả về HTTP 201 Created bình thường.
     */
    public function test_smtp_transport_exception_is_logged_and_does_not_break_tenant_registration_response(): void
    {
        Http::fake();
        Log::spy();

        Mail::shouldReceive('to')
            ->once()
            ->with('chutiem-failsafe@gmail.com')
            ->andThrow(new RuntimeException('SMTP connection failed: 535-5.7.8 Username and Password not accepted'));

        $email = 'chutiem-failsafe@gmail.com';
        User::withoutGlobalScopes()->where('email', $email)->delete();
        User::withoutGlobalScopes()->where('phone', '0912345678')->update(['phone' => null]);
        Tenant::where('phone', '0912345678')->update(['phone' => null]);

        $storeCode = 'fixo-failsafe-' . uniqid();
        $storeName = 'Tiệm Kiểm Thử SMTP FailSafe';

        $response = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $storeCode,
            'store_name' => $storeName,
            'owner_name' => 'Trần Bảo An',
            'phone'      => '0912345678',
            'email'      => $email,
            'password'   => 'password123',
            'plan'       => 'pro',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $storeCode)
            ->assertJsonPath('data.tenant.name', $storeName)
            ->assertJsonPath('data.tenant.plan', 'pro')
            ->assertJsonPath('data.user.email', $email);

        $this->assertNotEmpty($response->json('data.token'));
        $this->assertNotEmpty($response->json('data.branch.id'));

        $this->assertDatabaseHas('tenants', [
            'code'   => $storeCode,
            'status' => 'active',
        ]);

        $this->assertDatabaseHas('branches', [
            'id'        => $response->json('data.branch.id'),
            'tenant_id' => $response->json('data.tenant.id'),
        ]);

        $this->assertDatabaseHas('users', [
            'email'     => $email,
            'tenant_id' => $response->json('data.tenant.id'),
            'role'      => 'admin',
        ]);

        Log::shouldHaveReceived('warning')
            ->once()
            ->withArgs(function (string $message, array $context) use ($storeCode, $email) {
                return $message === 'Failed to send tenant registration welcome email.'
                    && ($context['tenant_code'] ?? null) === $storeCode
                    && ($context['email'] ?? null) === $email
                    && str_contains((string) ($context['error'] ?? ''), 'SMTP connection failed');
            });
    }

    /**
     * Scenario 6 (Tầng 2a): Chặn Bot Honeypot khi trường ẩn website_url có giá trị.
     */
    public function test_rejects_bot_honeypot_website_url_before_creating_tenant(): void
    {
        Mail::fake();
        Http::fake();

        $storeCode = 'tiem-honeypot-' . uniqid();
        $email = "bot_{$storeCode}@gmail.com";

        $response = $this->postJson('/api/v1/tenants/register', [
            'store_code'  => $storeCode,
            'store_name'  => 'Tiệm Bot Tự Động',
            'owner_name'  => 'Auto Bot',
            'phone'       => '0985' . rand(100000, 999999),
            'email'       => $email,
            'password'    => 'password123',
            'website_url' => 'https://spam-bot.example.com',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Phát hiện yêu cầu đăng ký tự động không hợp lệ (Bot Honeypot).')
            ->assertJsonValidationErrors(['website_url']);

        $this->assertDatabaseMissing('tenants', ['code' => $storeCode]);
        $this->assertDatabaseMissing('users', ['email' => $email]);
        Mail::assertNothingSent();
        Http::assertNothingSent();
    }

    /**
     * Scenario 7 (Tầng 2b): Chặn Form Timing Guard khi gửi biểu mẫu quá nhanh (< 1500ms) và cho phép khi >= 1500ms.
     */
    public function test_rejects_form_submitted_too_fast_via_form_timing_guard_and_allows_human_timing(): void
    {
        Mail::fake();
        Http::fake();

        $knownTime = Carbon::create(2026, 10, 26, 15, 0, 0, 'Asia/Ho_Chi_Minh');
        Carbon::setTestNow($knownTime);

        $fastStoreCode = 'tiem-fast-bot-' . uniqid();
        $fastEmail = "fastbot_{$fastStoreCode}@gmail.com";

        // 1. Gửi quá nhanh (chỉ 400ms sau khi mở form < 1500ms) -> Bị chặn 422
        $fastResponse = $this->postJson('/api/v1/tenants/register', [
            'store_code'      => $fastStoreCode,
            'store_name'      => 'Tiệm Submit Quá Nhanh',
            'owner_name'      => 'Speed Bot',
            'phone'           => '0986' . rand(100000, 999999),
            'email'           => $fastEmail,
            'password'        => 'password123',
            'form_started_at' => $knownTime->getTimestampMs() - 400,
        ]);

        $fastResponse->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Thao tác gửi biểu mẫu quá nhanh. Vui lòng kiểm tra lại thông tin và thử lại.')
            ->assertJsonValidationErrors(['form_started_at']);

        $this->assertDatabaseMissing('tenants', ['code' => $fastStoreCode]);

        // 2. Gửi hợp lệ (2500ms sau khi mở form >= 1500ms) -> Thành công 201
        $humanStoreCode = 'tiem-human-' . uniqid();
        $humanEmail = "human_{$humanStoreCode}@gmail.com";

        $humanResponse = $this->postJson('/api/v1/tenants/register', [
            'store_code'      => $humanStoreCode,
            'store_name'      => 'Tiệm Người Thật Điền Form',
            'owner_name'      => 'Nguyễn Người Thật',
            'phone'           => '0987' . rand(100000, 999999),
            'email'           => $humanEmail,
            'password'        => 'password123',
            'form_started_at' => $knownTime->getTimestampMs() - 2500,
        ]);

        $humanResponse->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.tenant.code', $humanStoreCode);
    }

    /**
     * Scenario 8 (Tầng 3a): Chuẩn hóa SĐT (+84 -> 0), chặn SĐT sai định dạng VN và chặn SĐT trùng lặp.
     */
    public function test_validates_vietnam_phone_format_prevents_duplicate_phone_and_normalizes_plus84_prefix(): void
    {
        Mail::fake();
        Http::fake();

        // 1. Chặn SĐT sai định dạng Việt Nam
        $invalidPhones = ['123456', '0123456789', '099999999999', 'abcdefghij'];
        foreach ($invalidPhones as $idx => $invalidPhone) {
            $this->clearTenantRegistrationRateLimiter();
            $code = 'tiem-badphone-' . $idx . '-' . uniqid();
            $res = $this->postJson('/api/v1/tenants/register', [
                'store_code' => $code,
                'store_name' => 'Tiệm Sai SĐT ' . $idx,
                'owner_name' => 'Chủ Tiệm Sai SĐT',
                'phone'      => $invalidPhone,
                'email'      => "badphone_{$code}@gmail.com",
                'password'   => 'password123',
            ]);

            $res->assertStatus(422)
                ->assertJsonValidationErrors(['phone']);

            $phoneErr = implode(' ', $res->json('errors.phone', []));
            $this->assertStringContainsString('Số điện thoại không đúng định dạng 10 số hợp lệ tại Việt Nam.', $phoneErr);
        }

        // 2. Hỗ trợ chuẩn hóa +84 và khoảng trắng về dạng 10 số chuẩn 0xxxxxxxxx
        $this->clearTenantRegistrationRateLimiter();
        $randomSuffix = (string) rand(1000000, 9999999);
        $rawPlus84Phone = '+84 91' . substr($randomSuffix, 0, 1) . ' ' . substr($randomSuffix, 1, 3) . ' ' . substr($randomSuffix, 4, 3);
        $expectedNormalizedPhone = '091' . $randomSuffix;

        User::withoutGlobalScopes()->where('phone', $expectedNormalizedPhone)->update(['phone' => null]);
        Tenant::where('phone', $expectedNormalizedPhone)->update(['phone' => null]);

        $firstStoreCode = 'tiem-plus84-' . uniqid();
        $firstRes = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $firstStoreCode,
            'store_name' => 'Tiệm Chuẩn Hóa SĐT',
            'owner_name' => 'Chủ Tiệm Plus84',
            'phone'      => $rawPlus84Phone,
            'email'      => "plus84_{$firstStoreCode}@gmail.com",
            'password'   => 'password123',
        ]);

        $firstRes->assertStatus(201)
            ->assertJsonPath('data.owner.phone', $expectedNormalizedPhone);

        $this->assertDatabaseHas('tenants', [
            'code'  => $firstStoreCode,
            'phone' => $expectedNormalizedPhone,
        ]);

        // 3. Chặn đăng ký gian hàng thứ 2 dùng trùng số điện thoại đã đăng ký
        $dupStoreCode = 'tiem-dup-phone-' . uniqid();
        $dupRes = $this->postJson('/api/v1/tenants/register', [
            'store_code' => $dupStoreCode,
            'store_name' => 'Tiệm Trùng SĐT',
            'owner_name' => 'Chủ Tiệm Trùng SĐT',
            'phone'      => $expectedNormalizedPhone,
            'email'      => "dupphone_{$dupStoreCode}@gmail.com",
            'password'   => 'password123',
        ]);

        $dupRes->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);

        $dupPhoneErr = implode(' ', $dupRes->json('errors.phone', []));
        $this->assertStringContainsString('Số điện thoại này đã được sử dụng để đăng ký gian hàng trên hệ thống.', $dupPhoneErr);
        $this->assertDatabaseMissing('tenants', ['code' => $dupStoreCode]);
    }

    /**
     * Scenario 9 (Tầng 3b): Chặn Email chứa ký tự bí danh (+tag) và các tên miền disposable mới bổ sung.
     */
    public function test_rejects_email_sub_addressing_plus_tag_and_newly_added_disposable_domains(): void
    {
        Mail::fake();
        Http::fake();

        // 1. Chặn email sub-addressing (+tag)
        $plusEmails = [
            'chu-tiem+spam1@gmail.com',
            'owner+clone99@fixo.vn',
        ];

        foreach ($plusEmails as $idx => $plusEmail) {
            $this->clearTenantRegistrationRateLimiter();
            $code = 'tiem-plustag-' . $idx . '-' . uniqid();

            $res = $this->postJson('/api/v1/tenants/register', [
                'store_code' => $code,
                'store_name' => 'Tiệm Email Plus Tag ' . $idx,
                'owner_name' => 'Chủ Tiệm Plus Tag',
                'phone'      => '0971' . rand(100000, 999999),
                'email'      => $plusEmail,
                'password'   => 'password123',
            ]);

            $res->assertStatus(422)
                ->assertJsonValidationErrors(['email']);

            $err = implode(' ', $res->json('errors.email', []));
            $this->assertStringContainsString(
                'Địa chỉ email không được chứa ký tự bí danh (+). Vui lòng sử dụng địa chỉ email chính thức của cửa hàng.',
                $err
            );
            $this->assertDatabaseMissing('tenants', ['code' => $code]);
        }

        // 2. Chặn các tên miền disposable mới bổ sung
        $newDisposableEmails = [
            'bot1@mailpoof.com',
            'bot2@burnermail.io',
            'bot3@tempmailo.com',
            'bot4@emailondeck.com',
            'bot5@33mail.com',
            'bot6@moakt.com',
            'bot7@tmpmail.net',
            'bot8@tmpmail.org',
            'bot9@crazymailing.com',
            'bot10@dropmail.me',
        ];

        foreach ($newDisposableEmails as $idx => $disposableEmail) {
            $this->clearTenantRegistrationRateLimiter();
            $code = 'tiem-newdisp-' . $idx . '-' . uniqid();

            $res = $this->postJson('/api/v1/tenants/register', [
                'store_code' => $code,
                'store_name' => 'Tiệm Disposable Mới ' . $idx,
                'owner_name' => 'Người Dùng Ảo',
                'phone'      => '0972' . rand(100000, 999999),
                'email'      => $disposableEmail,
                'password'   => 'password123',
            ]);

            $res->assertStatus(422)
                ->assertJsonValidationErrors(['email']);

            $this->assertDatabaseMissing('tenants', ['code' => $code]);
        }
    }

    /**
     * Scenario 10 (Tầng 1): Chặn Rate Limit HTTP 429 khi gửi quá 5 yêu cầu đăng ký liên tiếp từ cùng 1 IP.
     */
    public function test_rate_limits_tenant_registration_after_5_attempts_per_15_minutes_per_ip(): void
    {
        Mail::fake();
        Http::fake();

        $testIp = '203.113.152.99';
        $this->clearTenantRegistrationRateLimiter($testIp);

        // 5 lần đầu tiên từ cùng IP được phép đi qua tầng Rate Limit
        for ($i = 1; $i <= 5; $i++) {
            $code = 'tiem-rl-' . $i . '-' . uniqid();
            $res = $this->withServerVariables(['REMOTE_ADDR' => $testIp])
                ->postJson('/api/v1/tenants/register', [
                    'store_code' => $code,
                    'store_name' => 'Tiệm Rate Limit ' . $i,
                    'owner_name' => 'Chủ Tiệm RL ' . $i,
                    'phone'      => '096' . $i . rand(100000, 999999),
                    'email'      => "rl_{$i}_{$code}@gmail.com",
                    'password'   => 'password123',
                ]);

            $res->assertStatus(201);
        }

        // Lần thứ 6 từ cùng IP bị chặn ngay với HTTP 429 Too Many Requests
        $sixthCode = 'tiem-rl-6-' . uniqid();
        $sixthRes = $this->withServerVariables(['REMOTE_ADDR' => $testIp])
            ->postJson('/api/v1/tenants/register', [
                'store_code' => $sixthCode,
                'store_name' => 'Tiệm Vượt Ngưỡng Rate Limit',
                'owner_name' => 'Spammer RL 6',
                'phone'      => '0966' . rand(100000, 999999),
                'email'      => "rl_6_{$sixthCode}@gmail.com",
                'password'   => 'password123',
            ]);

        $sixthRes->assertStatus(429)
            ->assertJsonPath('success', false)
            ->assertJsonPath(
                'message',
                'Bạn đã gửi quá nhiều yêu cầu đăng ký gian hàng từ địa chỉ mạng này. Vui lòng thử lại sau 15 phút.'
            );

        $this->assertDatabaseMissing('tenants', ['code' => $sixthCode]);
        $this->clearTenantRegistrationRateLimiter($testIp);
    }
}
