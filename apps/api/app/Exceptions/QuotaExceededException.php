<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QuotaExceededException extends Exception
{
    protected string $errorCode;

    public function __construct(string $errorCode = 'QUOTA_EXCEEDED', string $message = 'Đã vượt quá hạn mức của gói cước hiện tại.')
    {
        parent::__construct($message, 422);
        $this->errorCode = $errorCode;
    }

    public function getErrorCode(): string
    {
        return $this->errorCode;
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'success'    => false,
            'message'    => $this->getMessage(),
            'error_code' => $this->errorCode,
            'error'      => $this->errorCode,
            'redirect'   => '/subscription',
        ], 422);
    }
}
