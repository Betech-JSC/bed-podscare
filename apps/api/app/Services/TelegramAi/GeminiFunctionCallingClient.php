<?php

namespace App\Services\TelegramAi;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GeminiFunctionCallingClient
{
    public const DEFAULT_NINE_ROUTER_BASE_URL = 'http://127.0.0.1:20128/v1';
    public const DEFAULT_NINE_ROUTER_COMBO = 'podscare-ai';
    public const DEFAULT_NINE_ROUTER_API_KEY = '9router-local';

    /**
     * Bộ nhớ đệm in-memory trong phạm vi request cho các biến đọc từ file .env.
     *
     * @var array<string, string>|null
     */
    protected ?array $hotEnvCache = null;

    /**
     * Bộ nhớ đệm in-memory trong phạm vi request cho dữ liệu cấu hình 9Router đọc từ db.json.
     *
     * @var array<string, array<int, array<string, mixed>>>
     */
    protected array $nineRouterDiskCache = [];

    /**
     * Bộ đếm số lần đọc đĩa thực tế của file .env trong vòng đời instance.
     */
    protected int $hotEnvReadCount = 0;

    /**
     * Bộ đếm số lần đọc đĩa thực tế của file db.json (9Router) trong vòng đời instance.
     */
    protected int $nineRouterDiskReadCount = 0;

    /**
     * Xóa bộ nhớ đệm cấu hình in-memory (.env và db.json của 9Router).
     */
    public function flushConfigCache(): void
    {
        $this->hotEnvCache = null;
        $this->nineRouterDiskCache = [];
        $this->hotEnvReadCount = 0;
        $this->nineRouterDiskReadCount = 0;
    }

    /**
     * Trả về thống kê số lần đọc đĩa thực tế trong vòng đời instance.
     *
     * @return array{env_reads: int, nine_router_db_reads: int}
     */
    public function getDiskReadCounts(): array
    {
        return [
            'env_reads'            => $this->hotEnvReadCount,
            'nine_router_db_reads' => $this->nineRouterDiskReadCount,
        ];
    }

    /**
     * Đọc giá trị từ file .env trên đĩa với bộ nhớ đệm in-memory trong phạm vi request.
     */
    protected function readHotEnvValue(string $key): string
    {
        if ($this->hotEnvCache === null) {
            $this->hotEnvCache = [];
            $envPath = base_path('.env');

            if (is_file($envPath) && is_readable($envPath)) {
                $this->hotEnvReadCount++;
                $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                if (is_array($lines)) {
                    foreach ($lines as $line) {
                        $trimmed = trim($line);
                        if ($trimmed === '' || str_starts_with($trimmed, '#')) {
                            continue;
                        }

                        if (preg_match('/^(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/', $trimmed, $matches)) {
                            $envKey = trim($matches[1]);
                            $val = trim($matches[2]);
                            if (
                                (str_starts_with($val, '"') && str_ends_with($val, '"'))
                                || (str_starts_with($val, "'") && str_ends_with($val, "'"))
                            ) {
                                $val = substr($val, 1, -1);
                            }
                            $this->hotEnvCache[$envKey] = trim($val);
                        }
                    }
                }
            }
        }

        return $this->hotEnvCache[$key] ?? '';
    }

    /**
     * Lấy danh sách đường dẫn ứng viên của file cấu hình 9Router db.json.
     *
     * @param  array<int, string>|null  $candidatePaths
     * @return array<int, string>
     */
    protected function resolveNineRouterCandidatePaths(?array $candidatePaths = null): array
    {
        if ($candidatePaths !== null) {
            return $candidatePaths;
        }

        if (app()->runningUnitTests()) {
            $testDbPath = trim((string) config('services.gemini.nine_router_db_path', ''));
            return $testDbPath !== '' ? [$testDbPath] : [];
        }

        $home = trim((string) (getenv('HOME') ?: ''));
        $configuredPath = trim((string) config('services.gemini.nine_router_db_path', ''));

        return array_values(array_unique(array_filter([
            $configuredPath,
            '/root/.9router/db.json',
            $home !== '' ? rtrim($home, '/') . '/.9router/db.json' : '',
        ])));
    }

    /**
     * Đọc và giải mã dữ liệu db.json của 9Router với bộ nhớ đệm in-memory trong phạm vi request.
     *
     * @param  array<int, string>|null  $candidatePaths
     * @return array<int, array<string, mixed>>
     */
    protected function loadNineRouterDiskConfigs(?array $candidatePaths = null): array
    {
        $paths = $this->resolveNineRouterCandidatePaths($candidatePaths);
        if (empty($paths)) {
            return [];
        }

        $cacheKey = implode("\0", $paths);
        if (array_key_exists($cacheKey, $this->nineRouterDiskCache)) {
            return $this->nineRouterDiskCache[$cacheKey];
        }

        $decodedConfigs = [];
        foreach ($paths as $path) {
            if ($path === '' || ! is_file($path) || ! is_readable($path)) {
                continue;
            }

            $this->nineRouterDiskReadCount++;
            $raw = @file_get_contents($path);
            if (! is_string($raw) || trim($raw) === '') {
                continue;
            }

            $db = json_decode($raw, true);
            if (is_array($db)) {
                $decodedConfigs[] = $db;
            }
        }

        $this->nineRouterDiskCache[$cacheKey] = $decodedConfigs;

        return $decodedConfigs;
    }

    /**
     * Lấy Base URL của cổng 9Router (mặc định: http://127.0.0.1:20128/v1).
     * Mọi yêu cầu AI đều đi qua cổng OpenAI-compatible của 9Router.
     */
    public function resolveBaseUrl(): string
    {
        if (app()->runningUnitTests()) {
            $testBaseUrl = trim((string) config('services.gemini.base_url', self::DEFAULT_NINE_ROUTER_BASE_URL));
            if ($testBaseUrl === '' || strtolower($testBaseUrl) === 'direct') {
                return self::DEFAULT_NINE_ROUTER_BASE_URL;
            }

            return rtrim($testBaseUrl, '/');
        }

        $hotBaseUrl = $this->readHotEnvValue('GEMINI_BASE_URL');
        if ($hotBaseUrl !== '' && strtolower($hotBaseUrl) !== 'direct') {
            return rtrim($hotBaseUrl, '/');
        }

        $baseUrl = trim((string) config('services.gemini.base_url', ''));
        if ($baseUrl === '') {
            $baseUrl = trim((string) env('GEMINI_BASE_URL', ''));
        }
        if ($baseUrl === '' || strtolower($baseUrl) === 'direct') {
            $baseUrl = self::DEFAULT_NINE_ROUTER_BASE_URL;
        }

        return rtrim($baseUrl, '/');
    }

    /**
     * Lấy API Key cho 9Router từ cấu hình, biến môi trường, file .env hoặc đọc tự động từ db.json của 9Router.
     * Nếu chưa cấu hình key riêng thì mặc định dùng '9router-local'.
     */
    public function resolveApiKey(): string
    {
        if (! app()->runningUnitTests()) {
            $hotApiKey = $this->readHotEnvValue('GEMINI_API_KEY');
            if ($hotApiKey !== '' && $hotApiKey !== self::DEFAULT_NINE_ROUTER_API_KEY) {
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

        if ($apiKey === '' || $apiKey === self::DEFAULT_NINE_ROUTER_API_KEY) {
            $diskKey = $this->resolveNineRouterApiKeyFromDisk();
            if ($diskKey !== '') {
                return $diskKey;
            }
        }

        return $apiKey !== '' ? $apiKey : self::DEFAULT_NINE_ROUTER_API_KEY;
    }

    /**
     * Đọc API key thật từ file cấu hình của 9Router (/root/.9router/db.json hoặc ~/.9router/db.json) nếu tồn tại.
     *
     * @param  array<int, string>|null  $candidatePaths
     */
    public function resolveNineRouterApiKeyFromDisk(?array $candidatePaths = null): string
    {
        $configs = $this->loadNineRouterDiskConfigs($candidatePaths);

        foreach ($configs as $db) {
            $apiKeys = data_get($db, 'apiKeys');
            if (is_array($apiKeys)) {
                foreach ($apiKeys as $entry) {
                    if (is_string($entry) && trim($entry) !== '') {
                        return trim($entry);
                    }
                    if (is_array($entry)) {
                        $key = trim((string) ($entry['key'] ?? $entry['apiKey'] ?? $entry['token'] ?? $entry['value'] ?? ''));
                        if ($key !== '') {
                            return $key;
                        }
                    }
                }
            }
        }

        return '';
    }

    /**
     * Đọc danh sách tên combo/alias điều phối từ file cấu hình của 9Router (/root/.9router/db.json hoặc ~/.9router/db.json).
     * Hỗ trợ cấu trúc combos dạng mảng chuỗi, mảng object (name/id/alias/slug) hoặc map theo key.
     *
     * @param  array<int, string>|null  $candidatePaths
     * @return array<int, string>
     */
    public function resolveNineRouterCombosFromDisk(?array $candidatePaths = null): array
    {
        $configs = $this->loadNineRouterDiskConfigs($candidatePaths);
        $combos = [];

        foreach ($configs as $db) {
            $rawCombos = data_get($db, 'combos');
            if (! is_array($rawCombos)) {
                continue;
            }

            foreach ($rawCombos as $key => $entry) {
                if (is_string($entry) && trim($entry) !== '') {
                    $combos[] = trim($entry);
                    continue;
                }

                if (is_array($entry)) {
                    if (array_key_exists('enabled', $entry) && $entry['enabled'] === false) {
                        continue;
                    }
                    if (array_key_exists('isActive', $entry) && $entry['isActive'] === false) {
                        continue;
                    }

                    $comboName = trim((string) (
                        $entry['name']
                        ?? $entry['alias']
                        ?? $entry['slug']
                        ?? $entry['id']
                        ?? (is_string($key) ? $key : '')
                    ));

                    if ($comboName !== '') {
                        $combos[] = $comboName;
                    }
                }
            }

            if (! empty($combos)) {
                break;
            }
        }

        return array_values(array_unique(array_filter($combos, static fn (string $c) => $c !== '')));
    }

    /**
     * Xây dựng chuỗi combo/alias ưu tiên cho 9Router (Zero Hardcoded Models).
     * Tuyệt đối không gán cứng bất kỳ tên model đơn lẻ nào của nhà cung cấp;
     * kết hợp GEMINI_MODEL, GEMINI_FALLBACK_MODELS (nếu có) và danh sách combo từ db.json của 9Router, mặc định luôn có 'podscare-ai'.
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

        $fallbackList = $fallbackRaw !== ''
            ? array_map('trim', explode(',', $fallbackRaw))
            : [];

        $diskCombos = $this->resolveNineRouterCombosFromDisk();

        $merged = [];
        if ($primaryModel !== '') {
            $merged[] = $primaryModel;
        }
        foreach ($fallbackList as $fb) {
            if ($fb !== '') {
                $merged[] = $fb;
            }
        }
        foreach ($diskCombos as $combo) {
            if ($combo !== '') {
                $merged[] = $combo;
            }
        }

        if (! in_array(self::DEFAULT_NINE_ROUTER_COMBO, $merged, true)) {
            $merged[] = self::DEFAULT_NINE_ROUTER_COMBO;
        }

        $filtered = array_filter($merged, static fn (string $m) => $m !== '');

        return array_values(array_unique($filtered));
    }

    /**
     * Chuẩn hóa URL đích cho cổng 9Router OpenAI-compatible (/v1/chat/completions).
     */
    public function buildOpenAiChatEndpoint(string $baseUrl): string
    {
        $clean = rtrim(trim($baseUrl), '/');
        if ($clean === '') {
            $clean = self::DEFAULT_NINE_ROUTER_BASE_URL;
        }
        if (str_ends_with($clean, '/chat/completions')) {
            return $clean;
        }
        if (str_ends_with($clean, '/v1')) {
            return $clean . '/chat/completions';
        }

        return $clean . '/v1/chat/completions';
    }

    /**
     * Chuyển đổi danh sách functionDeclarations sang mảng tools chuẩn OpenAI.
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
     * Đổi đệ quy kiểu dữ liệu JSON Schema từ chữ hoa (OBJECT/STRING/...) sang chữ thường (object/string/...) chuẩn OpenAI.
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
     * Chuyển đổi contents và systemInstruction sang mảng messages chuẩn OpenAI.
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
     * Gọi cổng 9Router OpenAI-compatible (/v1/chat/completions) hỗ trợ Tool Calling và xoay vòng combo dự phòng.
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

        $timeout = (int) config('services.gemini.timeout', 20);
        if ($timeout <= 0) {
            $timeout = 20;
        }

        $models = $this->resolveModelChain();
        $retryableStatuses = [404, 429, 500, 502, 503, 504];

        $diskKey = $this->resolveNineRouterApiKeyFromDisk();
        $effectiveKey = trim($apiKey);
        if ($effectiveKey === '' || $effectiveKey === self::DEFAULT_NINE_ROUTER_API_KEY) {
            $effectiveKey = $diskKey;
        }

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
                $sendRequest = static function (string $bearerToken) use ($timeout, $endpoint, $payload) {
                    $pending = Http::connectTimeout(5)
                        ->timeout($timeout)
                        ->withOptions(['force_ip_resolve' => 'v4']);

                    if ($bearerToken !== '') {
                        $pending = $pending->withToken($bearerToken);
                    }

                    return $pending->post($endpoint, $payload);
                };

                $response = $sendRequest($effectiveKey);

                if ($response->status() === 401 && $effectiveKey !== '') {
                    if ($diskKey !== '' && $diskKey !== $effectiveKey) {
                        $diskRetryResponse = $sendRequest($diskKey);
                        if ($diskRetryResponse->status() !== 401) {
                            $response = $diskRetryResponse;
                            $effectiveKey = $diskKey;
                        } else {
                            $response = $sendRequest('');
                            $effectiveKey = '';
                        }
                    } else {
                        $response = $sendRequest('');
                        $effectiveKey = '';
                    }
                }

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

                    // Hỗ trợ tương thích ngược nếu mock response trả cấu trúc candidates
                    if (empty($functionCalls) && $text === '' && is_array(data_get($json, 'candidates.0.content.parts'))) {
                        $textChunks = [];
                        foreach (data_get($json, 'candidates.0.content.parts', []) as $part) {
                            if (! is_array($part) || ! empty($part['thought'])) {
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
                        $text = trim(implode("\n", $textChunks));
                    }

                    return [
                        'ok'             => true,
                        'model'          => $model,
                        'function_call'  => $functionCalls[0] ?? null,
                        'function_calls' => $functionCalls,
                        'text'           => $text,
                        'model_content'  => $message ?: data_get($json, 'candidates.0.content'),
                        'raw'            => $json,
                    ];
                }

                $status = $response->status();
                if (in_array($status, $retryableStatuses, true)) {
                    Log::warning("9Router combo/model {$model} failed with status {$status}, trying next fallback combo...", [
                        'endpoint' => $endpoint,
                        'model'    => $model,
                        'status'   => $status,
                        'body'     => $response->body(),
                    ]);
                    continue;
                }

                Log::error("9Router combo/model {$model} failed with non-retryable status {$status}.", [
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
                Log::warning("9Router combo/model {$model} threw exception ({$e->getMessage()}), trying next fallback combo...", [
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
     * Gọi cổng 9Router OpenAI-compatible (/v1/chat/completions) hỗ trợ Function Calling và xoay vòng combo dự phòng.
     */
    public function generateWithTools(
        array $contents,
        array $functionDeclarations = [],
        ?string $systemInstruction = null
    ): array {
        $baseUrl = $this->resolveBaseUrl();
        $apiKey = $this->resolveApiKey();

        return $this->generateViaOpenAiCompatible(
            $baseUrl,
            $apiKey,
            $contents,
            $functionDeclarations,
            $systemInstruction
        );
    }

    /**
     * Alias tương thích cho generateWithTools().
     */
    public function generateOrCallTools(
        array $contents,
        array $functionDeclarations = [],
        ?string $systemInstruction = null
    ): array {
        return $this->generateWithTools($contents, $functionDeclarations, $systemInstruction);
    }

    /**
     * Thực hiện Bước 2 (Turn 2 AI Synthesis) qua cổng 9Router:
     * Gửi câu hỏi gốc của Admin kèm dữ liệu thực tế từ các Tool vừa chạy để AI tổng hợp câu trả lời phân tích/so sánh trực diện bằng HTML tiếng Việt.
     *
     * @param  string  $userQuestion
     * @param  array<int, array{name: string, args?: array, result: array, formatted_html?: string}>  $executedTools
     * @param  string|null  $systemInstruction
     */
    public function synthesizeToolResults(
        string $userQuestion,
        array $executedTools,
        ?string $systemInstruction = null
    ): array {
        $toolBlocks = [];

        foreach ($executedTools as $index => $item) {
            if (! is_array($item)) {
                continue;
            }

            $toolName = trim((string) ($item['name'] ?? 'tool_' . ($index + 1)));
            $toolResult = is_array($item['result'] ?? null) ? $item['result'] : [];
            $formattedHtml = trim((string) ($item['formatted_html'] ?? ''));

            $compactJson = json_encode($toolResult, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $section = "Công cụ đã thực thi: {$toolName}\nDữ liệu kết quả: {$compactJson}";

            if ($formattedHtml !== '') {
                $section .= "\nBản trình bày chuẩn từ hệ thống:\n{$formattedHtml}";
            }

            $toolBlocks[] = $section;
        }

        $synthesisPrompt = implode("\n\n", [
            "Câu hỏi của Quản trị viên: \"{$userQuestion}\"",
            "Dữ liệu thực tế truy xuất từ hệ thống PodsCare:\n" . implode("\n\n---\n\n", $toolBlocks),
            "YÊU CẦU TRẢ LỜI BẮT BUỘC:",
            "1. Mở đầu bằng câu trả lời TRỰC DIỆN, đi thẳng vào trọng tâm câu hỏi của Quản trị viên:\n"
                . "   - Nếu câu hỏi so sánh (ví dụ: cái nào cao hơn, chênh lệch bao nhiêu): phải khẳng định ngay đối tượng nào cao hơn, nêu rõ số tiền và số đơn của từng bên cùng mức chênh lệch.\n"
                . "   - Nếu câu hỏi hỏi đích danh (ví dụ: ai thay, ai sửa, của khách nào): phải nêu ngay tên Kỹ thuật viên phụ trách, tên Khách hàng, mã đơn, hạng mục sửa chữa/báo giá và người tiếp nhận.",
            "2. Ngay bên dưới phần kết luận mở đầu, trình bày đầy đủ số liệu chi tiết dựa trên dữ liệu thực tế ở trên.",
            "3. Định dạng hoàn toàn bằng HTML Telegram hợp lệ (chỉ dùng thẻ <b>, <i>, <code> và gạch đầu dòng '- ' với ký tự xuống dòng thật).",
            "4. CẤM TUYỆT ĐỐI mọi icon, emoji và CẤM in lại khối JSON thô.",
        ]);

        return $this->generateWithTools(
            [
                [
                    'role'    => 'user',
                    'content' => $synthesisPrompt,
                ],
            ],
            [],
            $systemInstruction
        );
    }
}
