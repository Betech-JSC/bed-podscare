<?php

namespace App\Jobs;

use App\Models\TelegramRecipient;
use App\Services\TelegramAi\TelegramAiAssistantService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessTelegramAiMessageJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $recipientId;

    public string $text;

    public string $messageText;

    public ?int $messageId;

    /**
     * @var array<string, mixed>
     */
    public array $update;

    /**
     * Create a new job instance.
     *
     * @param array<string, mixed>|int|null $update
     */
    public function __construct(int|TelegramRecipient $recipient, string $text, array|int|null $update = [])
    {
        $this->recipientId = $recipient instanceof TelegramRecipient ? (int) $recipient->id : (int) $recipient;
        $this->text = $text;
        $this->messageText = $text;
        if (is_int($update)) {
            $this->messageId = $update;
            $this->update = ['message' => ['message_id' => $update]];
        } else {
            $this->update = is_array($update) ? $update : [];
            $msgId = $this->update['message']['message_id'] ?? ($this->update['edited_message']['message_id'] ?? null);
            $this->messageId = is_numeric($msgId) ? (int) $msgId : null;
        }
    }

    /**
     * Execute the job.
     */
    public function handle(TelegramAiAssistantService $aiAssistantService): void
    {
        $recipient = TelegramRecipient::withoutGlobalScopes()
            ->with(['tenant', 'branch'])
            ->find($this->recipientId);

        if (! $recipient || ! $recipient->is_active) {
            return;
        }

        $aiAssistantService->handleIncomingMessage($recipient, $this->text, $this->update);
    }
}
