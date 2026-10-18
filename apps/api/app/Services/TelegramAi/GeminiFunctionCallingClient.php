<?php

namespace App\Services\TelegramAi;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GeminiFunctionCallingClient
{
    /**
     * Đọc trực tiếp giá trị từ file .env trên đĩa để nhận cấu hình mới tức thì mà không cần restart process.
     */
    protected function readHotEnvValue(string $key): string
    {
        $envPath = base_path('.env');
        if (! is_file($envPath) || ! is_readable($envPath)) {
            return '';
        }

        $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (! is_array($lines)) {
            return '';
        }

        $found = '';
        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || str_starts_with($trimmed, '#')) {
                continue;
            }

            if (preg_match('/^(?:export\s+)?' . preg_quote($key, '/') . '\s*=\s*(.*)$/', $trimmed, $matches)) {
                $val = trim($matches[1]);
                if (
                    (str_starts_with($val, '"') && str_ends_with($val, '"'))
                    || (str_starts_with($val, "'") && str_ends_with($val, "'"))
                ) {
                    $val = substr($val, 1, -1);
                }
                $found = trim($val);
            }
        }

        return $found;
    }

    /**
     * Lấy Base URL của cổng AI (mặc định là 9Router: http://127.0.0.1:20128/v1).
     * Chỉ khi cấu hình tường minh GEMINI_BASE_URL=direct (hoặc đặt rỗng trong unit test) mới gọi trực tiếp Google Gemini API.
     */
    public function resolveBaseUrl(): string
    {
        if (app()->runningUnitTests()) {
            $testBaseUrl = trim((string) config('services.gemini.base_url', 'http://127.0.0.1:20128/v1'));
            if (strtolower($testBaseUrl) === 'direct') {
                return '';
            }

            return rtrim($testBaseUrl, '/');
        }

        $hotBaseUrl = $this->readHotEnvValue('GEMINI_BASE_URL');
        if ($hotBaseUrl !== '') {
            if (strtolower($hotBaseUrl) === 'direct') {
                return '';
            }

            return rtrim($hotBaseUrl, '/');
        }

        $baseUrl = trim((string) config('services.gemini.base_url', ''));
        if ($baseUrl === '') {
            $baseUrl = trim((string) env('GEMINI_BASE_URL', ''));
        }
        if ($baseUrl === '') {
            $baseUrl = 'http://127.0.0.1:20128/v1';
        }

        if (strtolower($baseUrl) === 'direct') {
            return '';
        }

        return rtrim($baseUrl, '/');
    }

    /**
     * Lấy API Key cho 9Router / Gemini từ cấu hình, biến môi trường hoặc đọc nóng trực tiếp từ file .env trên đĩa.
     * Khi chạy qua 9Router (baseUrl !== ''), nếu chưa truyền key thì mặc định dùng '9router-local'.
     */
    public function resolveApiKey(): string
    {
        if (! app()->runningUnitTests()) {
            $hotApiKey = $this->readHotEnvValue('GEMINI_API_KEY');
            if ($hotApiKey !== '') {
                return $hotApiKey;
            }
        }

        $apiKey = trim((string) config('services.gemini.api_key', ''));
        if ($apiKey === '' && ! app()->runningUnitTests()) {
            $apiKey = trim((string) env('GEMINI_API_KEY', ''));
        }
        if ($apiKey === '' && ! app()->runningUnitTests()) {
            $apiKey = $this->readHotEnvValue('GEMINI_API_KEY');
        }

        if ($apiKey === '' && $this->resolveBaseUrl() !== '') {
            return '9router-local';
        }

        return $apiKey;
    }

    /**
     * Xây dựng chuỗi model/combo ưu tiên (Primary model + Fallback models).
     * Mặc định ưu tiên combo 'podscare-ai' của 9Router, dự phòng qua 'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash'.
     *
     * @return array<int, string>
     */
    public function resolveModelChain(): array
    {
        $hotPrimary = ! app()->runningUnitTests() ? $this->readHotEnvValue('GEMINI_MODEL') : '';
        $primaryModel = $hotPrimary !== ''
            ? $hotPrimary
            : trim((string) config('services.gemini.model', ''));
        if ($primaryModel === '' && ! app()->runningUnitTests()) {
            $primaryModel = trim((string) env('GEMINI_MODEL', ''));
        }
        if ($primaryModel === '' && ! app()->runningUnitTests()) {
            $primaryModel = $this->readHotEnvValue('GEMINI_MODEL');
        }
        if ($primaryModel === '') {
            $primaryModel = 'podscare-ai';
        }

        $hotFallback = ! app()->runningUnitTests() ? $this->readHotEnvValue('GEMINI_FALLBACK_MODELS') : '';
        $fallbackRaw = $hotFallback !== ''
            ? $hotFallback
            : trim((string) config('services.gemini.fallback_models', ''));
        if ($fallbackRaw === '' && ! app()->runningUnitTests()) {
            $fallbackRaw = trim((string) env('GEMINI_FALLBACK_MODELS', ''));
        }
        if ($fallbackRaw === '' && ! app()->runningUnitTests()) {
            $fallbackRaw = $this->readHotEnvValue('GEMINI_FALLBACK_MODELS');
        }
        if ($fallbackRaw === '') {
            $fallbackRaw = 'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash';
        }

        $fallbackList = array_map('trim', explode(',', $fallbackRaw));

        $merged = array_merge([$primaryModel], $fallbackList);
        $filtered = array_filter($merged, static fn (string $m) => $m !== '');

        return array_values(array_unique($filtered));
    }

    /**
     * Chuẩn hóa URL đích cho 9Router / OpenAI-compatible endpoint (/v1/chat/completions).
     */
    public function buildOpenAiChatEndpoint(string $baseUrl): string
    {
        $clean = rtrim(trim($baseUrl), '/');
        if (str_ends_with($clean, '/chat/completions')) {
            return $clean;
        }
        if (str_ends_with($clean, '/v1')) {
            return $clean . '/chat/completions';
        }

        return $clean . '/v1/chat/completions';
    }

    /**
     * Chuyển đổi danh sách functionDeclarations chuẩn Gemini sang mảng tools chuẩn OpenAI.
     */
    public function convertDeclarationsToOpenAiTools(array $functionDeclarations): array
    {
        $tools = [];
        foreach ($functionDeclarations as $decl) {
            if (! is_array($decl) || empty($decl['name'])) {
                continue;
            }

            $params = isset($decl['parameters']) && is_array($decl['parameters'])
                ? $this->normalizeJsonSchemaTypes($decl['parameters'])
                : ['type' => 'object', 'properties' => (object) []];

            $tools[] = [
                'type'     => 'function',
                'function' => [
                    'name'        => (string) $decl['name'],
                    'description' => (string) ($decl['description'] ?? ''),
                    'parameters'  => $params,
                ],
            ];
        }

        return $tools;
    }

    /**
     * Đổi đệ quy kiểu dữ liệu JSON Schema từ chữ hoa (OBJECT/STRING/...) của Gemini sang chữ thường (object/string/...) chuẩn OpenAI.
     */
    protected function normalizeJsonSchemaTypes(array $schema): array
    {
        if (isset($schema['type']) && is_string($schema['type'])) {
            $schema['type'] = strtolower($schema['type']);
        }

        if (array_key_exists('properties', $schema)) {
            if (is_array($schema['properties'])) {
                if (empty($schema['properties'])) {
                    $schema['properties'] = (object) [];
                } else {
                    $normalizedProps = [];
                    foreach ($schema['properties'] as $propName => $propDef) {
                        $normalizedProps[$propName] = is_array($propDef)
                            ? $this->normalizeJsonSchemaTypes($propDef)
                            : $propDef;
                    }
                    $schema['properties'] = $normalizedProps;
                }
            }
        }

        if (isset($schema['items']) && is_array($schema['items'])) {
            $schema['items'] = $this->normalizeJsonSchemaTypes($schema['items']);
        }

        return $schema;
    }

    /**
     * Chuyển đổi contents chuẩn Gemini và systemInstruction sang mảng messages chuẩn OpenAI.
     */
    protected function convertContentsToOpenAiMessages(array $contents, ?string $systemInstruction = null): array
    {
        $messages = [];

        if ($systemInstruction !== null && trim($systemInstruction) !== '') {
            $messages[] = [
                'role'    => 'system',
                'content' => trim($systemInstruction),
            ];
        }

        foreach ($contents as $item) {
            if (! is_array($item)) {
                continue;
            }

            $rawRole = strtolower(trim((string) ($item['role'] ?? 'user')));
            $role = $rawRole === 'model' ? 'assistant' : $rawRole;

            if (isset($item['content']) && is_string($item['content'])) {
                $messages[] = [
                    'role'    => $role,
                    'content' => $item['content'],
                ];
                continue;
            }

            $textChunks = [];
            $parts = $item['parts'] ?? [];
            if (is_array($parts)) {
                foreach ($parts as $part) {
                    if (is_array($part) && isset($part['text']) && is_string($part['text'])) {
                        $textChunks[] = $part['text'];
                    }
                }
            }

            if (! empty($textChunks)) {
                $messages[] = [
                    'role'    => $role,
                    'content' => implode("\n", $textChunks),
                ];
            }
        }

        return $messages;
    }

    /**
     * Gọi cổng 9Router / OpenAI-compatible (/v1/chat/completions) hỗ trợ Tool Calling và Auto-Fallback qua chuỗi model/combo.
     */
    protected function generateViaOpenAiCompatible(
        string $baseUrl,
        string $apiKey,
        array $contents,
        array $functionDeclarations = [],
        ?string $systemInstruction = null
    ): array {
        $endpoint = $this->buildOpenAiChatEndpoint($baseUrl);
        $messages = $this->convertContentsToOpenAiMessages($contents, $systemInstruction);
        $openAiTools = $this->convertDeclarationsToOpenAiTools($functionDeclarations);

        $timeout = (int) config('services.gemini.timeout', 15);
        if ($timeout <= 0) {
            $timeout = 15;
        }

        $models = $this->resolveModelChain();
        $retryableStatuses = [404, 429, 500, 502, 503, 504];

        foreach ($models as $model) {
            $payload = [
                'model'       => $model,
                'messages'    => $messages,
                'temperature' => 0.1,
            ];

            if (! empty($openAiTools)) {
                $payload['tools'] = $openAiTools;
                $payload['tool_choice'] = 'auto';
            }

            try {
                $response = Http::connectTimeout(5)
                    ->timeout($timeout)
                    ->withOptions(['force_ip_resolve' => 'v4'])
                    ->withToken($apiKey)
                    ->post($endpoint, $payload);

                if ($response->successful()) {
                    $json = $response->json() ?? [];
                    $message = data_get($json, 'choices.0.message', []);
                    if (! is_array($message)) {
                        $message = [];
                    }

                    $functionCalls = [];
                    $toolCalls = data_get($message, 'tool_calls', []);
                    if (is_array($toolCalls)) {
                        foreach ($toolCalls as $tc) {
                            if (! is_array($tc)) {
                                continue;
                            }

                            $fnName = trim((string) data_get($tc, 'function.name', data_get($tc, 'name', '')));
                            $rawArgs = data_get($tc, 'function.arguments', data_get($tc, 'arguments', '{}'));

                            if (is_string($rawArgs)) {
                                $decodedArgs = json_decode($rawArgs, true);
                                $parsedArgs = is_array($decodedArgs) ? $decodedArgs : [];
                            } elseif (is_array($rawArgs)) {
                                $parsedArgs = $rawArgs;
                            } elseif (is_object($rawArgs)) {
                                $parsedArgs = (array) $rawArgs;
                            } else {
                                $parsedArgs = [];
                            }

                            if ($fnName !== '') {
                                $functionCalls[] = [
                                    'name' => $fnName,
                                    'args' => $parsedArgs,
                                ];
                            }
                        }
                    }

                    $legacyFnCall = data_get($message, 'function_call');
                    if (empty($functionCalls) && is_array($legacyFnCall)) {
                        $fnName = trim((string) ($legacyFnCall['name'] ?? ''));
                        $rawArgs = $legacyFnCall['arguments'] ?? '{}';
                        $parsedArgs = is_string($rawArgs)
                            ? (json_decode($rawArgs, true) ?: [])
                            : (is_array($rawArgs) ? $rawArgs : (array) $rawArgs);

                        if ($fnName !== '') {
                            $functionCalls[] = [
                                'name' => $fnName,
                                'args' => is_array($parsedArgs) ? $parsedArgs : [],
                            ];
                        }
                    }

                    $text = trim((string) data_get($message, 'content', ''));

                    return [
                        'ok'             => true,
                        'model'          => $model,
                        'function_call'  => $functionCalls[0] ?? null,
                        'function_calls' => $functionCalls,
                        'text'           => $text,
                        'model_content'  => $message,
                        'raw'            => $json,
                    ];
                }

                $status = $response->status();
                if (in_array($status, $retryableStatuses, true)) {
                    Log::warning("9Router/OpenAI model {$model} failed with status {$status}, trying fallback model...", [
                        'endpoint' => $endpoint,
                        'model'    => $model,
                        'status'   => $status,
                        'body'     => $response->body(),
                    ]);
                    continue;
                }

                Log::error("9Router/OpenAI model {$model} failed with non-retryable status {$status}.", [
                    'endpoint' => $endpoint,
                    'model'    => $model,
                    'status'   => $status,
                    'body'     => $response->body(),
                ]);

                return [
                    'ok'             => false,
                    'error'          => "http_{$status}",
                    'model'          => $model,
                    'function_call'  => null,
                    'function_calls' => [],
                    'text'           => '',
                ];
            } catch (\Throwable $e) {
                Log::warning("9Router/OpenAI model {$model} threw exception ({$e->getMessage()}), trying fallback model...", [
                    'endpoint' => $endpoint,
                    'model'    => $model,
                ]);
                continue;
            }
        }

        return [
            'ok'             => false,
            'error'          => 'all_models_failed',
            'model'          => null,
            'function_call'  => null,
            'function_calls' => [],
            'text'           => '',
        ];
    }

    /**
     * Gọi Google Gemini generateContent (hoặc 9Router OpenAI-compatible khi có GEMINI_BASE_URL) hỗ trợ Function Calling và Auto-Fallback.
     */
    public function generateWithTools(
        array $contents,
        array $functionDeclarations = [],
        ?string $systemInstruction = null
    ): array {
        $baseUrl = $this->resolveBaseUrl();
        $apiKey = $this->resolveApiKey();

        if ($baseUrl !== '') {
            return $this->generateViaOpenAiCompatible(
                $baseUrl,
                $apiKey,
                $contents,
                $functionDeclarations,
                $systemInstruction
            );
        }

        if ($apiKey === '') {
            Log::warning('GeminiFunctionCallingClient: GEMINI_API_KEY is missing.');
            return [
                'ok'             => false,
                'error'          => 'missing_api_key',
                'model'          => null,
                'function_call'  => null,
                'function_calls' => [],
                'text'           => '',
            ];
        }

        $payload = [
            'contents'         => $contents,
            'generationConfig' => [
                'temperature' => 0.1,
            ],
        ];

        if ($systemInstruction !== null && trim($systemInstruction) !== '') {
            $payload['systemInstruction'] = [
                'parts' => [
                    ['text' => $systemInstruction],
                ],
            ];
        }

        if (! empty($functionDeclarations)) {
            $payload['tools'] = [
                [
                    'functionDeclarations' => array_values($functionDeclarations),
                ],
            ];
        }

        $timeout = (int) config('services.gemini.timeout', 15);
        if ($timeout <= 0) {
            $timeout = 15;
        }

        $models = $this->resolveModelChain();
        $retryableStatuses = [404, 429, 500, 502, 503, 504];

        foreach ($models as $model) {
            $endpoint = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";

            try {
                $response = Http::connectTimeout(5)
                    ->timeout($timeout)
                    ->withOptions(['force_ip_resolve' => 'v4'])
                    ->post($endpoint, $payload);

                if (
                    ! $response->successful()
                    && in_array($response->status(), [400, 401, 403], true)
                    && str_starts_with($apiKey, 'AQ.')
                    && ! app()->runningUnitTests()
                ) {
                    $vertexEndpoint = "https://aiplatform.googleapis.com/v1/publishers/google/models/{$model}:generateContent?key={$apiKey}";
                    $vertexPayload = $payload;
                    if (isset($vertexPayload['systemInstruction']) && ! isset($vertexPayload['systemInstruction']['role'])) {
                        $vertexPayload['systemInstruction']['role'] = 'system';
                    }
                    $vertexResponse = Http::connectTimeout(5)
                        ->timeout($timeout)
                        ->withOptions(['force_ip_resolve' => 'v4'])
                        ->post($vertexEndpoint, $vertexPayload);
                    if ($vertexResponse->successful()) {
                        $response = $vertexResponse;
                    }
                }

                if ($response->successful()) {
                    $json = $response->json() ?? [];
                    $parts = data_get($json, 'candidates.0.content.parts', []);
                    if (! is_array($parts)) {
                        $parts = [];
                    }

                    $functionCalls = [];
                    $textChunks = [];

                    foreach ($parts as $part) {
                        if (! is_array($part)) {
                            continue;
                        }

                        if (! empty($part['thought'])) {
                            continue;
                        }

                        if (isset($part['functionCall']) && is_array($part['functionCall'])) {
                            $fnName = trim((string) ($part['functionCall']['name'] ?? ''));
                            $fnArgs = $part['functionCall']['args'] ?? [];
                            if ($fnName !== '') {
                                $functionCalls[] = [
                                    'name' => $fnName,
                                    'args' => is_array($fnArgs) ? $fnArgs : (array) $fnArgs,
                                ];
                            }
                        }

                        if (isset($part['text']) && is_string($part['text'])) {
                            $textChunks[] = $part['text'];
                        }
                    }

                    $functionCall = $functionCalls[0] ?? null;

                    return [
                        'ok'             => true,
                        'model'          => $model,
                        'function_call'  => $functionCall,
                        'function_calls' => $functionCalls,
                        'text'           => trim(implode("\n", $textChunks)),
                        'model_content'  => data_get($json, 'candidates.0.content'),
                        'raw'            => $json,
                    ];
                }

                $status = $response->status();
                if (in_array($status, $retryableStatuses, true)) {
                    Log::warning("Gemini model {$model} failed with status {$status}, trying fallback model...", [
                        'model'  => $model,
                        'status' => $status,
                        'body'   => $response->body(),
                    ]);
                    continue;
                }

                Log::error("Gemini model {$model} failed with non-retryable status {$status}.", [
                    'model'  => $model,
                    'status' => $status,
                    'body'   => $response->body(),
                ]);

                return [
                    'ok'             => false,
                    'error'          => "http_{$status}",
                    'model'          => $model,
                    'function_call'  => null,
                    'function_calls' => [],
                    'text'           => '',
                ];
            } catch (\Throwable $e) {
                Log::warning("Gemini model {$model} threw exception ({$e->getMessage()}), trying fallback model...", [
                    'model' => $model,
                ]);
                continue;
            }
        }

        return [
            'ok'             => false,
            'error'          => 'all_models_failed',
            'model'          => null,
            'function_call'  => null,
            'function_calls' => [],
            'text'           => '',
        ];
    }
}
