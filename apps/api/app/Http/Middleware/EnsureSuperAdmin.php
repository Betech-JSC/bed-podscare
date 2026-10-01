<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSuperAdmin
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'success' => false,
                'message' => 'Vui lòng đăng nhập để tiếp tục.',
            ], 401);
        }

        if ($user->role !== 'super_admin') {
            return response()->json([
                'success' => false,
                'message' => 'Bạn không có quyền truy cập cổng quản trị nền tảng.',
            ], 403);
        }

        return $next($request);
    }
}
