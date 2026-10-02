<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubscriptionExpiredException extends Exception
{
    public function __construct(string $message = 'Gói dịch vụ đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.')
    {
        parent::__construct($message, 403);
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'success'    => false,
            'message'    => $this->getMessage(),
            'error_code' => 'SUBSCRIPTION_EXPIRED',
            'error'      => 'SUBSCRIPTION_EXPIRED',
            'redirect'   => '/subscription',
        ], 403);
    }
}
