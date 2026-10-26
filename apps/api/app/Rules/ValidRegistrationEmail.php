<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class ValidRegistrationEmail implements ValidationRule
{
    /**
     * Khóa cấu hình hỗ trợ ghi đè kết quả kiểm tra DNS trong môi trường kiểm thử.
     */
    public const TEST_DNS_OVERRIDE = 'valid_registration_email.dns_override';

    /**
     * Danh sách các tên miền email dùng một lần (disposable / temporary email) bị chặn.
     *
     * @var array<int, string>
     */
    public const DISPOSABLE_DOMAINS = [
        '10minutemail.com',
        'tempmail.com',
        'temp-mail.org',
        'guerrillamail.com',
        'yopmail.com',
        'mailinator.com',
        'trashmail.com',
        'getnada.com',
        'maildrop.cc',
        'dispostable.com',
        'sharklasers.com',
        'fakeinbox.com',
        'mohmal.com',
        'mailnesia.com',
        'throwawaymail.com',
        'guerrillamailblock.com',
        'tempmailaddress.com',
        'mailpoof.com',
        'burnermail.io',
        'tempmailo.com',
        'emailondeck.com',
        '33mail.com',
        'moakt.com',
        'tmpmail.net',
        'tmpmail.org',
        'crazymailing.com',
        'dropmail.me',
    ];

    /**
     * Bảng ánh xạ các lỗi gõ nhầm tên miền phổ biến sang tên miền chuẩn.
     *
     * @var array<string, string>
     */
    public const TYPO_DOMAINS = [
        'gmial.com'  => 'gmail.com',
        'gamil.com'  => 'gmail.com',
        'gmai.com'   => 'gmail.com',
        'gmail.co'   => 'gmail.com',
        'gmail.vn'   => 'gmail.com',
        'yaho.com'   => 'yahoo.com',
        'yahooo.com' => 'yahoo.com',
        'outlok.com' => 'outlook.com',
        'hotmial.com'=> 'hotmail.com',
    ];

    /**
     * Danh sách các TLD dành riêng cho mục đích không tồn tại hoặc nội bộ không nhận thư thực tế.
     *
     * @var array<int, string>
     */
    public const INVALID_TLDS = [
        'invalid',
        'test',
        'localhost',
        'local',
    ];

    /**
     * Danh sách tên miền tin cậy phục vụ chạy Feature Test trong môi trường sandbox không có mạng DNS ngoài.
     *
     * @var array<int, string>
     */
    public const TRUSTED_TESTING_DOMAINS = [
        'fixo.vn',
        'fixo.com.vn',
        'tiemmoi.vn',
        'podscare.vn',
        'gmail.com',
        'googlemail.com',
        'yahoo.com',
        'outlook.com',
        'hotmail.com',
        'icloud.com',
        'example.com',
    ];

    /**
     * Bảng ghi đè kết quả DNS theo từng domain phục vụ unit/feature test deterministic.
     *
     * @var array<string, bool>
     */
    public static array $testDnsOverrides = [];

    /**
     * Callback resolver tùy chỉnh ở mức static (nếu được thiết lập trong test).
     */
    public static ?Closure $dnsResolver = null;

    /**
     * @param  Closure(string): bool|null  $dnsChecker
     */
    public function __construct(
        protected ?Closure $dnsChecker = null
    ) {}

    /**
     * Thiết lập ghi đè kết quả kiểm tra DNS cho một tên miền cụ thể trong kiểm thử.
     */
    public static function setTestDnsOverride(string $domain, bool $hasValidRecord): void
    {
        self::$testDnsOverrides[strtolower(trim($domain))] = $hasValidRecord;
    }

    /**
     * Xóa toàn bộ cấu hình ghi đè DNS trong kiểm thử.
     */
    public static function resetTestDnsOverrides(): void
    {
        self::$testDnsOverrides = [];
        self::$dnsResolver = null;
    }

    /**
     * Thực thi kiểm tra tính hợp lệ thực tế của địa chỉ email đăng ký gian hàng.
     *
     * @param  Closure(string, ?string=): \Illuminate\Translation\PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || trim($value) === '') {
            $fail('Vui lòng nhập địa chỉ email.');
            return;
        }

        $email = trim($value);

        // 1. Kiểm tra định dạng email chuẩn RFC và trích xuất phần tên miền
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || ! str_contains($email, '@')) {
            $fail('Địa chỉ email không đúng định dạng.');
            return;
        }

        $parts = explode('@', $email);
        $localPart = trim((string) $parts[0]);
        $domain = strtolower(trim((string) end($parts)));

        if ($domain === '' || ! str_contains($domain, '.') || str_starts_with($domain, '.') || str_ends_with($domain, '.')) {
            $fail('Địa chỉ email không đúng định dạng.');
            return;
        }

        // 1b. Chặn thủ thuật cộng chuỗi (sub-addressing / +tag) trong phần local-part của email
        if (str_contains($localPart, '+')) {
            $fail('Địa chỉ email không được chứa ký tự bí danh (+). Vui lòng sử dụng địa chỉ email chính thức của cửa hàng.');
            return;
        }

        // 2. Chặn các tên miền do người dùng gõ nhầm phổ biến (gmial.com, gmail.vn, yaho.com...)
        if (isset(self::TYPO_DOMAINS[$domain])) {
            $suggestion = self::TYPO_DOMAINS[$domain];
            $fail("Tên miền email '@{$domain}' có vẻ bị gõ nhầm (bạn có ý dùng '@{$suggestion}'?). Vui lòng kiểm tra lại chính tả tên miền email.");
            return;
        }

        // 3. Chặn danh sách tên miền email rác / dùng một lần (Disposable email domains)
        if ($this->isDisposableDomain($domain)) {
            $fail('Hệ thống không chấp nhận địa chỉ email tạm thời (email rác). Vui lòng sử dụng email cá nhân hoặc doanh nghiệp thực tế.');
            return;
        }

        // 4. Kiểm tra bản ghi DNS nhận thư (MX hoặc A)
        if (! $this->hasValidDnsRecord($domain)) {
            $fail("Tên miền email '@{$domain}' không tồn tại hoặc không thể nhận thư (thiếu bản ghi DNS MX/A). Vui lòng kiểm tra lại địa chỉ email.");
        }
    }

    /**
     * Kiểm tra tên miền (hoặc tên miền cha) có nằm trong danh sách disposable email không.
     */
    protected function isDisposableDomain(string $domain): bool
    {
        foreach (self::DISPOSABLE_DOMAINS as $disposableDomain) {
            if ($domain === $disposableDomain || str_ends_with($domain, '.' . $disposableDomain)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Kiểm tra sự tồn tại của bản ghi DNS MX hoặc A trên tên miền.
     */
    protected function hasValidDnsRecord(string $domain): bool
    {
        if ($this->dnsChecker !== null) {
            return (bool) ($this->dnsChecker)($domain);
        }

        if (self::$dnsResolver !== null) {
            return (bool) (self::$dnsResolver)($domain);
        }

        if (array_key_exists($domain, self::$testDnsOverrides)) {
            return (bool) self::$testDnsOverrides[$domain];
        }

        $configOverride = config(self::TEST_DNS_OVERRIDE);
        if (is_callable($configOverride)) {
            return (bool) $configOverride($domain);
        }
        if (is_array($configOverride) && array_key_exists($domain, $configOverride)) {
            return (bool) $configOverride[$domain];
        }
        if (is_bool($configOverride)) {
            return $configOverride;
        }

        // Từ chối ngay các TLD dành riêng cho mục đích không tồn tại (.invalid, .test, .localhost, .local)
        $domainLabels = explode('.', $domain);
        $tld = strtolower((string) end($domainLabels));
        if (in_array($tld, self::INVALID_TLDS, true)) {
            return false;
        }

        // Trong môi trường testing (sandbox không có kết nối DNS ra ngoài), cho phép các tên miền kiểm thử tin cậy
        if (app()->environment('testing') && in_array($domain, self::TRUSTED_TESTING_DOMAINS, true)) {
            return true;
        }

        if (! function_exists('checkdnsrr')) {
            return false;
        }

        return @checkdnsrr($domain, 'MX') || @checkdnsrr($domain, 'A');
    }
}
