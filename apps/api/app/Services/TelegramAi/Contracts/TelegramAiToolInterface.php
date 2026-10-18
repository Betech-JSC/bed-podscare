<?php

namespace App\Services\TelegramAi\Contracts;

use App\Models\TelegramRecipient;

interface TelegramAiToolInterface
{
    /**
     * Tên định danh hàm (snake_case) để khai báo với Gemini Function Calling.
     */
    public function name(): string;

    /**
     * Mô tả chức năng của Tool để Gemini biết khi nào cần gọi.
     */
    public function description(): string;

    /**
     * JSON Schema (OpenAPI 3.0 / Gemini Schema) mô tả các tham số đầu vào.
     */
    public function parametersSchema(): array;

    /**
     * Nhận mảng tham số từ AI, tự chuẩn hóa/kiểm tra lại tham số và thực thi Eloquent Query khóa cứng tenant_id/branch_id.
     */
    public function execute(array $args, TelegramRecipient $recipient): array;
}
