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
     * Lấy Gemini API Key từ cấu hình, biến môi trường hoặc đọc nóng trực tiếp từ file .env trên đĩa.
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
        if ($apiKey === '') {
            $apiKey = trim((string) env('GEMINI_API_KEY', ''));
        }
        if ($apiKey === '') {
            $apiKey = $this->readHotEnvValue('GEMINI_API_KEY');
        }

        return $apiKey;
    }

    /**
     * Xây dựng chuỗi model ưu tiên (Primary model + Fallback models).
     *
     * @return array<int, string>
     */
    public function resolveModelChain(): array
    {
        $hotPrimary = ! app()->runningUnitTests() ? $this->readHotEnvValue('GEMINI_MODEL') : '';
        $primaryModel = $hotPrimary !== ''
            ? $hotPrimary
            : trim((string) config('services.gemini.model', ''));
        if ($primaryModel === '') {
            $primaryModel = trim((string) env('GEMINI_MODEL', ''));
        }
        if ($primaryModel === '') {
            $primaryModel = $this->readHotEnvValue('GEMINI_MODEL');
        }
        if ($primaryModel === '') {
            $primaryModel = 'gemini-2.0-flash';
        }

        $hotFallback = ! app()->runningUnitTests() ? $this->readHotEnvValue('GEMINI_FALLBACK_MODELS') : '';
        $fallbackRaw = $hotFallback !== ''
            ? $hotFallback
            : trim((string) config('services.gemini.fallback_models', ''));
        if ($fallbackRaw === '') {
            $fallbackRaw = trim((string) env('GEMINI_FALLBACK_MODELS', ''));
        }
        if ($fallbackRaw === '') {
            $fallbackRaw = $this->readHotEnvValue('GEMINI_FALLBACK_MODELS');
        }
        if ($fallbackRaw === '') {
            $fallbackRaw = 'gemini-2.0-flash-lite,gemini-2.5-flash';
        }

        $fallbackList = array_map('trim', explode(',', $fallbackRaw));

        $merged = array_merge([$primaryModel], $fallbackList);
        $filtered = array_filter($merged, static fn (string $m) => $m !== '');

        return array_values(array_unique($filtered));
    }

    /**
     * Gọi Google Gemini generateContent hỗ trợ Function Calling và tự động chuyển đổi model dự phòng (Auto-Fallback).
     */
    public function generateWithTools(
        array $contents,
        array $functionDeclarations = [],
        ?string $systemInstruction = null
    ): array {
        $apiKey = $this->resolveApiKey();
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
