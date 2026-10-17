<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\TelegramNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TelegramWebhookController extends Controller
{
    /**
     * Nhận Webhook Update từ Telegram Bot API để xử lý lệnh /start <connect_token>.
     */
    public function handle(Request $request, TelegramNotificationService $service): JsonResponse
    {
        $configuredSecret = trim((string) config('services.telegram.webhook_secret', ''));
        if ($configuredSecret !== '') {
            $headerSecret = (string) $request->header('X-Telegram-Bot-Api-Secret-Token', '');
            if (! hash_equals($configuredSecret, $headerSecret)) {
                return $this->failure('Invalid webhook secret token.', 401);
            }
        }

        $recipient = $service->handleWebhookUpdate($request->all());

        return $this->success([
            'handled'      => $recipient !== null,
            'recipient_id' => $recipient?->id,
        ], 'OK');
    }
}
