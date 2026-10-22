<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class DiscordNotificationService
{
    /**
     * Gửi thông báo đăng ký gian hàng mới về kênh Discord qua Webhook.
     * Bọc fail-safe để không bao giờ làm gián đoạn luồng đăng ký của khách hàng.
     */
    public function sendTenantRegistrationNotification(Tenant|array $tenant, User|array $owner): bool
    {
        $webhookUrl = config('services.discord.webhook_url');

        if (! is_string($webhookUrl) || trim($webhookUrl) === '') {
            return false;
        }

        try {
            $tenantName = $tenant instanceof Tenant ? (string) $tenant->name : (string) ($tenant['name'] ?? '');
            $planKey = $tenant instanceof Tenant ? (string) ($tenant->plan ?? 'trial') : (string) ($tenant['plan'] ?? 'trial');
            $rawCreatedAt = $tenant instanceof Tenant ? $tenant->created_at : ($tenant['created_at'] ?? null);

            $ownerPhone = $owner instanceof User ? (string) $owner->phone : (string) ($owner['phone'] ?? '');
            $ownerEmail = $owner instanceof User ? (string) $owner->email : (string) ($owner['email'] ?? '');

            $planLabels = [
                'trial'    => 'Dùng thử (Trial)',
                'standard' => 'Tiêu chuẩn (Standard)',
                'pro'      => 'Chuyên nghiệp (Pro)',
            ];
            $planLabel = $planLabels[$planKey] ?? $planKey;

            $createdAtCarbon = $rawCreatedAt instanceof Carbon
                ? $rawCreatedAt->copy()
                : ($rawCreatedAt ? Carbon::parse($rawCreatedAt) : now());

            $registeredAt = $createdAtCarbon->timezone('Asia/Ho_Chi_Minh')->format('d/m/Y H:i:s');

            $payload = [
                'username' => 'Fixo - Đăng Ký Mới',
                'embeds'   => [
                    [
                        'title'  => '🎉 Gian hàng mới vừa đăng ký trên Fixo',
                        'color'  => 889992, // #0D9488 (Calm Jade)
                        'fields' => [
                            [
                                'name'   => 'Tên tiệm',
                                'value'  => $tenantName !== '' ? $tenantName : 'N/A',
                                'inline' => false,
                            ],
                            [
                                'name'   => 'Số điện thoại',
                                'value'  => $ownerPhone !== '' ? $ownerPhone : 'N/A',
                                'inline' => true,
                            ],
                            [
                                'name'   => 'Email',
                                'value'  => $ownerEmail !== '' ? $ownerEmail : 'N/A',
                                'inline' => true,
                            ],
                            [
                                'name'   => 'Gói cước',
                                'value'  => $planLabel,
                                'inline' => true,
                            ],
                            [
                                'name'   => 'Thời gian đăng ký',
                                'value'  => $registeredAt,
                                'inline' => true,
                            ],
                        ],
                    ],
                ],
            ];

            $response = Http::connectTimeout(5)
                ->timeout(8)
                ->post(trim($webhookUrl), $payload);

            if (! $response->successful()) {
                Log::warning('Discord webhook notification returned non-success status.', [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);

                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::warning('Failed to send Discord tenant registration notification.', [
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
