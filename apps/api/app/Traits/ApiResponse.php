<?php

namespace App\Traits;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

/**
 * Trait chuẩn hóa cấu trúc JSON Response cho toàn bộ hệ thống REST API.
 */
trait ApiResponse
{
    /**
     * Trả về phản hồi thành công (HTTP 200/201).
     *
     * @param mixed $data Dữ liệu trả về (Array, Collection, Resource, Model)
     * @param string $message Thông điệp hiển thị cho người dùng
     * @param int $status Mã trạng thái HTTP (mặc định 200)
     * @return JsonResponse
     */
    protected function success(mixed $data = [], string $message = 'OK', int $status = 200): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data'    => $data,
        ], $status);
    }

    /**
     * Trả về phản hồi tạo mới thành công (HTTP 201 Created).
     *
     * @param mixed $data Dữ liệu trả về
     * @param string $message Thông điệp hiển thị cho người dùng
     * @param int $status Mã trạng thái HTTP (mặc định 201)
     * @return JsonResponse
     */
    protected function created(mixed $data = [], string $message = 'Resource created', int $status = 201): JsonResponse
    {
        return $this->success($data, $message, $status);
    }

    /**
     * Trả về phản hồi thất bại / lỗi nghiệp vụ hoặc xác thực (HTTP 400/401/403/422/500).
     *
     * @param string $message Thông báo lỗi
     * @param int|string $status Mã HTTP status (mặc định 400)
     * @param mixed $errors Chi tiết lỗi (mảng lỗi validate hoặc exception trace)
     * @param string|null $errorCode Mã lỗi định danh ứng dụng (Application Error Code)
     * @return JsonResponse
     */
    protected function failure(
        string $message,
        int|string $status = 400,
        mixed $errors = null,
        ?string $errorCode = null
    ): JsonResponse {
        $httpStatus = is_int($status) ? $status : 400;

        $payload = [
            'success' => false,
            'message' => $message,
            'errors'  => $errors,
        ];

        if ($errorCode !== null) {
            $payload['error_code'] = $errorCode;
        }

        return response()->json($payload, $httpStatus);
    }

    /**
     * Trả về phản hồi không tìm thấy dữ liệu (HTTP 404 Not Found).
     *
     * @param string $message
     * @return JsonResponse
     */
    protected function empty(string $message = 'Resource not found'): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $message,
            'data'    => null,
        ], 404);
    }

    /**
     * Trả về phản hồi xóa thành công (HTTP 204 No Content).
     *
     * @return JsonResponse
     */
    public function delete(): JsonResponse
    {
        return response()->json(null, 204);
    }

    /**
     * Bộ đệm phản hồi API sử dụng Cache Tags (tùy biến theo locale và request URL).
     *
     * @param \Closure $callback Closure sinh dữ liệu nếu cache miss
     * @param array $tags Nhãn cache để dễ invalidate
     * @param int|null $ttl Thời gian cache tính bằng giây (mặc định vĩnh viễn hoặc theo config)
     * @return mixed
     */
    protected function cacheResponse(\Closure $callback, array $tags = ['api'], ?int $ttl = null): mixed
    {
        if (!config('app.cache_api_response', true)) {
            return $callback();
        }

        $fullUrl = app()->getLocale() . ':' . request()->fullUrl();

        if (strlen($fullUrl) > 500) {
            return $callback();
        }

        $cache = Cache::tags($tags);

        if ($ttl !== null) {
            return $cache->remember($fullUrl, $ttl, $callback);
        }

        return $cache->rememberForever($fullUrl, $callback);
    }
}
