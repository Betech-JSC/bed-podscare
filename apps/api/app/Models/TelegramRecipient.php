<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TelegramRecipient extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'label',
        'phone',
        'target_role',
        'telegram_chat_id',
        'telegram_thread_id',
        'connect_token',
        'subscribed_events',
        'is_active',
        'connected_at',
        'ai_message_count',
        'ai_context_summary',
        'ai_recent_messages',
        'ai_last_interaction_at',
    ];

    protected $casts = [
        'subscribed_events'      => 'array',
        'is_active'              => 'boolean',
        'connected_at'           => 'datetime',
        'ai_message_count'       => 'integer',
        'ai_recent_messages'     => 'array',
        'ai_last_interaction_at' => 'datetime',
    ];

    protected $appends = [
        'connect_url',
    ];

    public function getConnectUrlAttribute(): string
    {
        $botUsername = trim((string) config('services.telegram.bot_username', 'PodsCareNotifyBot'), '@ ');
        if ($botUsername === '') {
            $botUsername = 'PodsCareNotifyBot';
        }

        return "https://t.me/{$botUsername}?start={$this->connect_token}";
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'branch_id');
    }
}
