<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\TelegramRecipient;
use App\Models\Tenant;
use App\Services\TelegramNotificationService;
use App\Support\PhoneHelper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class TelegramRecipientController extends Controller
{
    /**
     * Xác định tenant_id của người dùng hiện tại.
     */
    protected function resolveTenantId(Request $request): ?int
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        if (! empty($user->tenant_id)) {
            return (int) $user->tenant_id;
        }

        if ($user->role === 'super_admin') {
            $tenantId = Tenant::where('code', 'fixo-master')->value('id') ?? Tenant::value('id');
            return $tenantId ? (int) $tenantId : null;
        }

        return null;
    }

    /**
     * Danh sách người nhận thông báo Telegram của cửa hàng.
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $this->resolveTenantId($request);
        if (! $tenantId) {
            return $this->failure('Không tìm thấy thông tin cửa hàng.', 404);
        }

        $hasPending = TelegramRecipient::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('telegram_chat_id')->orWhere('telegram_chat_id', ''))
            ->exists();

        if ($hasPending) {
            try {
                app(\App\Services\TelegramNotificationService::class)->syncUpdates($tenantId);
            } catch (\Throwable $e) {
                // Bỏ qua lỗi đồng bộ ngầm để không ảnh hưởng việc tải danh sách
            }
        }

        $recipients = TelegramRecipient::with('branch')
            ->where('tenant_id', $tenantId)
            ->orderByDesc('id')
            ->get();

        return $this->success($recipients, 'Lấy danh sách người nhận Telegram thành công.');
    }

    /**
     * Thêm mới số điện thoại / đầu mối nhận thông báo Telegram.
     */
    public function store(Request $request): JsonResponse
    {
        $tenantId = $this->resolveTenantId($request);
        if (! $tenantId) {
            return $this->failure('Không tìm thấy thông tin cửa hàng.', 404);
        }

        $validated = $request->validate([
            'label'              => 'required|string|max:100',
            'phone'              => 'required|string|max:30',
            'branch_id'          => 'nullable|integer',
            'target_role'        => 'nullable|string|in:admin,cskh,technician,qc',
            'telegram_chat_id'   => 'nullable|string|max:64',
            'telegram_thread_id' => 'nullable|string|max:64',
            'subscribed_events'  => 'nullable|array',
            'is_active'          => 'nullable|boolean',
        ]);

        if (! empty($validated['branch_id'])) {
            $branchExists = Branch::where('tenant_id', $tenantId)
                ->where('id', $validated['branch_id'])
                ->exists();
            if (! $branchExists) {
                return $this->failure('Chi nhánh không hợp lệ hoặc không thuộc cửa hàng.', 422);
            }
        }

        $normalizedPhone = PhoneHelper::normalizeForStorage($validated['phone']) ?: trim($validated['phone']);
        $chatId = isset($validated['telegram_chat_id']) && trim($validated['telegram_chat_id']) !== ''
            ? trim($validated['telegram_chat_id'])
            : null;
        $threadId = isset($validated['telegram_thread_id']) && trim($validated['telegram_thread_id']) !== ''
            ? trim($validated['telegram_thread_id'])
            : null;

        $recipient = TelegramRecipient::create([
            'tenant_id'          => $tenantId,
            'branch_id'          => $validated['branch_id'] ?? null,
            'label'              => trim($validated['label']),
            'phone'              => $normalizedPhone,
            'target_role'        => $validated['target_role'] ?? 'admin',
            'telegram_chat_id'   => $chatId,
            'telegram_thread_id' => $threadId,
            'connect_token'      => 'adm_' . Str::lower(Str::random(24)),
            'subscribed_events'  => $validated['subscribed_events'] ?? ['order.created'],
            'is_active'          => $validated['is_active'] ?? true,
            'connected_at'       => $chatId ? now() : null,
        ]);

        return $this->success(
            $recipient->load('branch'),
            'Thêm số điện thoại nhận thông báo Telegram thành công.',
            201
        );
    }

    /**
     * Cập nhật thông tin người nhận thông báo Telegram.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $tenantId = $this->resolveTenantId($request);
        if (! $tenantId) {
            return $this->failure('Không tìm thấy thông tin cửa hàng.', 404);
        }

        $recipient = TelegramRecipient::where('tenant_id', $tenantId)->find($id);
        if (! $recipient) {
            return $this->failure('Không tìm thấy người nhận Telegram.', 404);
        }

        $validated = $request->validate([
            'label'              => 'sometimes|required|string|max:100',
            'phone'              => 'sometimes|required|string|max:30',
            'branch_id'          => 'nullable|integer',
            'target_role'        => 'nullable|string|in:admin,cskh,technician,qc',
            'telegram_chat_id'   => 'nullable|string|max:64',
            'telegram_thread_id' => 'nullable|string|max:64',
            'subscribed_events'  => 'nullable|array',
            'is_active'          => 'nullable|boolean',
        ]);

        if (array_key_exists('branch_id', $validated) && ! empty($validated['branch_id'])) {
            $branchExists = Branch::where('tenant_id', $tenantId)
                ->where('id', $validated['branch_id'])
                ->exists();
            if (! $branchExists) {
                return $this->failure('Chi nhánh không hợp lệ hoặc không thuộc cửa hàng.', 422);
            }
        }

        if (array_key_exists('label', $validated)) {
            $recipient->label = trim($validated['label']);
        }
        if (array_key_exists('phone', $validated)) {
            $recipient->phone = PhoneHelper::normalizeForStorage($validated['phone']) ?: trim($validated['phone']);
        }
        if (array_key_exists('branch_id', $validated)) {
            $recipient->branch_id = $validated['branch_id'];
        }
        if (array_key_exists('target_role', $validated) && $validated['target_role'] !== null) {
            $recipient->target_role = $validated['target_role'];
        }
        if (array_key_exists('telegram_chat_id', $validated)) {
            $newChatId = $validated['telegram_chat_id'] !== null && trim($validated['telegram_chat_id']) !== ''
                ? trim($validated['telegram_chat_id'])
                : null;
            $recipient->telegram_chat_id = $newChatId;
            if ($newChatId && ! $recipient->connected_at) {
                $recipient->connected_at = now();
            }
        }
        if (array_key_exists('telegram_thread_id', $validated)) {
            $recipient->telegram_thread_id = $validated['telegram_thread_id'] !== null && trim($validated['telegram_thread_id']) !== ''
                ? trim($validated['telegram_thread_id'])
                : null;
        }
        if (array_key_exists('subscribed_events', $validated) && is_array($validated['subscribed_events'])) {
            $recipient->subscribed_events = $validated['subscribed_events'];
        }
        if (array_key_exists('is_active', $validated) && $validated['is_active'] !== null) {
            $recipient->is_active = (bool) $validated['is_active'];
        }

        $recipient->save();

        return $this->success(
            $recipient->fresh(['branch']),
            'Cập nhật cấu hình người nhận Telegram thành công.'
        );
    }

    /**
     * Xóa người nhận thông báo Telegram.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = $this->resolveTenantId($request);
        if (! $tenantId) {
            return $this->failure('Không tìm thấy thông tin cửa hàng.', 404);
        }

        $recipient = TelegramRecipient::where('tenant_id', $tenantId)->find($id);
        if (! $recipient) {
            return $this->failure('Không tìm thấy người nhận Telegram.', 404);
        }

        $recipient->delete();

        return $this->success(['deleted_id' => $id], 'Đã xóa người nhận thông báo Telegram.');
    }

    /**
     * Đồng bộ kết nối Telegram từ getUpdates (hỗ trợ Localhost).
     */
    public function sync(Request $request, TelegramNotificationService $service): JsonResponse
    {
        $tenantId = $this->resolveTenantId($request);
        if (! $tenantId) {
            return $this->failure('Không tìm thấy thông tin cửa hàng.', 404);
        }

        $syncedCount = $service->syncUpdates($tenantId);
        $recipients = TelegramRecipient::with('branch')
            ->where('tenant_id', $tenantId)
            ->orderByDesc('id')
            ->get();

        return $this->success([
            'synced_count' => $syncedCount,
            'recipients'   => $recipients,
        ], "Đã đồng bộ kết nối Telegram ({$syncedCount} tài khoản mới).");
    }

    /**
     * Gửi tin nhắn kiểm tra tới một người nhận Telegram.
     */
    public function test(Request $request, int $id, TelegramNotificationService $service): JsonResponse
    {
        $tenantId = $this->resolveTenantId($request);
        if (! $tenantId) {
            return $this->failure('Không tìm thấy thông tin cửa hàng.', 404);
        }

        $recipient = TelegramRecipient::where('tenant_id', $tenantId)->find($id);
        if (! $recipient) {
            return $this->failure('Không tìm thấy người nhận Telegram.', 404);
        }

        if (empty($recipient->telegram_chat_id)) {
            return $this->failure('Số điện thoại này chưa kích hoạt kết nối Telegram.', 422);
        }

        $label = htmlspecialchars((string) $recipient->label, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $phone = htmlspecialchars((string) $recipient->phone, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $htmlMessage = "<b>TIN NHẮN KIỂM TRA HỆ THỐNG PODSCARE</b>\n"
            . "━━━━━━━━━━━━━━━━━━\n"
            . "Người nhận: <b>{$label}</b> ({$phone})\n"
            . "Trạng thái: <b>Kết nối hoạt động tốt</b>\n"
            . "Thời gian: " . now()->format('H:i:s - d/m/Y');

        $sent = $service->sendMessage(
            (string) $recipient->telegram_chat_id,
            $htmlMessage,
            $recipient->telegram_thread_id
        );

        if (! $sent) {
            return $this->failure(
                'Không thể gửi tin nhắn Telegram. Vui lòng kiểm tra cấu hình TELEGRAM_BOT_TOKEN hoặc Chat ID.',
                422
            );
        }

        return $this->success(['sent' => true], 'Đã gửi tin nhắn kiểm tra tới Telegram thành công.');
    }
}
