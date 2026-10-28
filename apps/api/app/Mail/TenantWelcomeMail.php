<?php

namespace App\Mail;

use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TenantWelcomeMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * Bảng ánh xạ mã gói cước sang tên hiển thị tiếng Việt.
     *
     * @var array<string, string>
     */
    public const PLAN_LABELS = [
        'trial'    => 'Dùng thử (Trial)',
        'standard' => 'Tiêu chuẩn (Standard)',
        'pro'      => 'Chuyên nghiệp (Pro)',
    ];

    public Tenant $tenant;

    public User $owner;

    public string $storeCode;

    public string $storeName;

    public string $ownerName;

    public string $ownerEmail;

    public string $planKey;

    public string $planLabel;

    public string $trialEndsAtFormatted;

    public string $dashboardUrl;

    /**
     * Khởi tạo email chúc mừng đăng ký gian hàng mới.
     */
    public function __construct(Tenant $tenant, User $owner, ?string $dashboardUrl = null)
    {
        $this->tenant = $tenant;
        $this->owner = $owner;

        $this->storeCode = (string) $tenant->code;
        $this->storeName = (string) $tenant->name;
        $this->ownerName = (string) $owner->name;
        $this->ownerEmail = (string) $owner->email;

        $this->planKey = strtolower((string) ($tenant->plan ?: 'trial'));
        $this->planLabel = self::PLAN_LABELS[$this->planKey] ?? (string) $tenant->plan;

        $rawTrialEndsAt = $tenant->trial_ends_at ?? $tenant->expires_at ?? now()->addYear();
        $trialCarbon = $rawTrialEndsAt instanceof CarbonInterface
            ? Carbon::instance($rawTrialEndsAt)->copy()
            : Carbon::parse((string) $rawTrialEndsAt);

        $this->trialEndsAtFormatted = $trialCarbon
            ->timezone('Asia/Ho_Chi_Minh')
            ->format('d/m/Y');

        $baseUrl = $dashboardUrl
            ?: (string) (config('app.frontend_url') ?: env('FRONTEND_URL') ?: config('app.url', 'https://fixo.com.vn'));

        $this->dashboardUrl = str_ends_with(rtrim($baseUrl, '/'), '/login')
            ? rtrim($baseUrl, '/')
            : rtrim($baseUrl, '/') . '/login';
    }

    /**
     * Định nghĩa tiêu đề (Subject) của email chúc mừng.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "[FIXO Repair OS] Chào mừng gian hàng {$this->storeName} ({$this->storeCode}) — Kích hoạt thành công",
        );
    }

    /**
     * Định nghĩa Blade view và dữ liệu truyền vào mẫu email HTML.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.tenant-welcome',
            with: [
                'tenant'               => $this->tenant,
                'owner'                => $this->owner,
                'storeCode'            => $this->storeCode,
                'storeName'            => $this->storeName,
                'ownerName'            => $this->ownerName,
                'ownerEmail'           => $this->ownerEmail,
                'planKey'              => $this->planKey,
                'planLabel'            => $this->planLabel,
                'trialEndsAtFormatted' => $this->trialEndsAtFormatted,
                'dashboardUrl'         => $this->dashboardUrl,
            ],
        );
    }

    /**
     * @return array<int, \Illuminate\Mail\Mailables\Attachment>
     */
    public function attachments(): array
    {
        return [];
    }
}
