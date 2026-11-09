<?php

namespace App\Http\Controllers\Api\V1\Threads;

use App\Http\Controllers\Controller;
use App\Services\Threads\ThreadsOAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class ThreadsOAuthCallbackController extends Controller
{
    /**
     * Xử lý callback OAuth 2.0 từ Meta Threads (GET /api/v1/threads/oauth/callback).
     */
    public function handle(Request $request, ThreadsOAuthService $oauthService): JsonResponse|RedirectResponse
    {
        if ($request->filled('error')) {
            $errorMsg = (string) $request->input('error_description', $request->input('error', 'OAuth authorization denied.'));
            return $this->failure("Ủy quyền Meta Threads thất bại: {$errorMsg}", 400);
        }

        $code = trim((string) $request->input('code', ''));
        $state = trim((string) $request->input('state', ''));

        if ($code === '' || $state === '') {
            return $this->failure('Thiếu tham số code hoặc state trong phản hồi OAuth.', 422);
        }

        try {
            $account = $oauthService->handleCallback($code, $state);
        } catch (\Throwable $e) {
            return $this->failure($e->getMessage(), 422, null, 'THREADS_OAUTH_CALLBACK_FAILED');
        }

        if ($request->boolean('redirect_to_ui')) {
            $frontendUrl = rtrim((string) config('threads.frontend_redirect_url', 'http://localhost:3010/threads'), '/');
            return redirect()->away("{$frontendUrl}?oauth=success&account_id={$account->id}");
        }

        return $this->success(
            $account,
            'Kết nối OAuth 2.0 và lưu Long-Lived Token (60 ngày) thành công.'
        );
    }

    /**
     * Hỗ trợ gọi controller dạng invokable.
     */
    public function __invoke(Request $request, ThreadsOAuthService $oauthService): JsonResponse|RedirectResponse
    {
        return $this->handle($request, $oauthService);
    }
}
