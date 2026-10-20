<?php

namespace App\Services\TelegramAi;

use App\Models\TelegramRecipient;
use App\Services\TelegramAi\Contracts\TelegramAiToolInterface;
use ReflectionClass;

class TelegramAiToolRegistry
{
    /**
     * @var array<string, TelegramAiToolInterface>
     */
    protected array $tools = [];

    /**
     * Mapping phân quyền mặc định theo tên Tool nếu Tool không khai báo allowedRoles().
     *
     * @var array<string, array<int, string>>
     */
    protected array $defaultToolRoles = [
        'get_revenue_summary' => ['admin', 'super_admin'],
    ];

    /**
     * @param iterable<TelegramAiToolInterface> $tools
     */
    public function __construct(iterable $tools = [])
    {
        foreach ($tools as $tool) {
            if ($tool instanceof TelegramAiToolInterface) {
                $this->register($tool);
            }
        }
    }

    /**
     * Tự động quét và đăng ký các class implement TelegramAiToolInterface từ thư mục Tools.
     * Đảm bảo các Tool chuyên biệt luôn đứng trước và FallbackSchemaQueryTool (fallback_schema_query) luôn đứng cuối.
     */
    public function discoverToolsFromDirectory(?string $directory = null): self
    {
        $targetDir = $directory !== null && trim($directory) !== ''
            ? rtrim($directory, '/\\')
            : app_path('Services/TelegramAi/Tools');

        if (! is_dir($targetDir)) {
            return $this;
        }

        $files = glob($targetDir . DIRECTORY_SEPARATOR . '*.php') ?: [];
        sort($files);

        $discoveredTools = [];

        foreach ($files as $filePath) {
            $fileName = basename($filePath);
            if ($fileName === 'TelegramAiToolInterface.php' || str_ends_with($fileName, 'Interface.php')) {
                continue;
            }

            $className = pathinfo($filePath, PATHINFO_FILENAME);
            $fqcn = 'App\\Services\\TelegramAi\\Tools\\' . $className;

            if (! class_exists($fqcn) && is_file($filePath)) {
                $parsedFqcn = $this->extractFqcnFromFile($filePath, $className);
                if ($parsedFqcn !== null) {
                    $fqcn = $parsedFqcn;
                }

                if (! class_exists($fqcn, false) && ! interface_exists($fqcn, false) && ! trait_exists($fqcn, false)) {
                    require_once $filePath;
                }
            }

            if (! class_exists($fqcn)) {
                continue;
            }

            $reflection = new ReflectionClass($fqcn);
            if (
                $reflection->isAbstract()
                || $reflection->isInterface()
                || ! $reflection->isInstantiable()
                || ! $reflection->isSubclassOf(TelegramAiToolInterface::class)
            ) {
                continue;
            }

            $tool = app($fqcn);
            if ($tool instanceof TelegramAiToolInterface) {
                $discoveredTools[] = $tool;
            }
        }

        usort($discoveredTools, function (TelegramAiToolInterface $a, TelegramAiToolInterface $b): int {
            $priorityA = $this->resolveToolPriority($a);
            $priorityB = $this->resolveToolPriority($b);

            if ($priorityA !== $priorityB) {
                return $priorityA <=> $priorityB;
            }

            return strcmp($a->name(), $b->name());
        });

        foreach ($discoveredTools as $tool) {
            $this->register($tool);
        }

        return $this;
    }

    /**
     * Đăng ký một Tool độc lập vào Registry (luôn giữ fallback_schema_query ở vị trí cuối cùng).
     */
    public function register(TelegramAiToolInterface $tool): self
    {
        $this->tools[$tool->name()] = $tool;
        $this->sortToolsByPriority();

        return $this;
    }

    /**
     * Lấy một Tool theo tên định danh.
     */
    public function get(string $name): ?TelegramAiToolInterface
    {
        return $this->tools[$name] ?? null;
    }

    /**
     * Lấy toàn bộ các Tool đã đăng ký.
     *
     * @return array<string, TelegramAiToolInterface>
     */
    public function all(): array
    {
        return $this->tools;
    }

    /**
     * Lấy danh sách các role được phép gọi một Tool.
     *
     * @return array<int, string>
     */
    public function getAllowedRolesForTool(TelegramAiToolInterface $tool): array
    {
        if (method_exists($tool, 'allowedRoles')) {
            $roles = (array) $tool->allowedRoles();
        } else {
            $roles = $this->defaultToolRoles[$tool->name()] ?? ['*'];
        }

        $normalized = array_values(array_filter(array_map(
            static fn ($role) => strtolower(trim((string) $role)),
            $roles
        )));

        return ! empty($normalized) ? $normalized : ['*'];
    }

    /**
     * Kiểm tra xem người nhận Telegram có quyền sử dụng Tool này hay không.
     */
    public function isToolAllowedForRecipient(TelegramAiToolInterface $tool, ?TelegramRecipient $recipient = null): bool
    {
        if ($recipient === null) {
            return true;
        }

        $allowedRoles = $this->getAllowedRolesForTool($tool);

        if (in_array('*', $allowedRoles, true)) {
            return true;
        }

        $recipientRole = strtolower(trim((string) ($recipient->target_role ?? '')));
        if ($recipientRole === '') {
            return false;
        }

        return in_array($recipientRole, $allowedRoles, true);
    }

    /**
     * Trả về mảng functionDeclarations theo chuẩn Google Gemini API.
     * Nếu truyền $recipient, chỉ trả về declaration của những Tool mà $recipient->target_role được phép sử dụng.
     */
    public function getFunctionDeclarations(?TelegramRecipient $recipient = null): array
    {
        $declarations = [];

        foreach ($this->tools as $tool) {
            if ($recipient !== null && ! $this->isToolAllowedForRecipient($tool, $recipient)) {
                continue;
            }

            $declarations[] = [
                'name'        => $tool->name(),
                'description' => $tool->description(),
                'parameters'  => $tool->parametersSchema(),
            ];
        }

        return $declarations;
    }

    /**
     * Thực thi một Tool theo tên định danh với ngữ cảnh người nhận Telegram (có kiểm tra quyền theo target_role).
     */
    public function execute(string $name, array $args, TelegramRecipient $recipient): array
    {
        $tool = $this->get($name);

        if (! $tool) {
            return [
                'error' => "Tool '{$name}' is not registered.",
            ];
        }

        if (! $this->isToolAllowedForRecipient($tool, $recipient)) {
            $errorMsg = $tool->name() === 'get_revenue_summary'
                ? 'Bạn không có quyền truy cập báo cáo doanh thu và sổ quỹ.'
                : 'Bạn không có quyền truy cập chức năng này.';

            return [
                'error'             => $errorMsg,
                'permission_denied' => true,
            ];
        }

        return $tool->execute($args, $recipient);
    }

    /**
     * Định dạng kết quả của Tool sang văn bản HTML tiếng Việt (nếu Tool có phương thức formatHtml).
     */
    public function formatHtml(string $name, array $result): ?string
    {
        if (! empty($result['permission_denied']) && isset($result['error']) && trim((string) $result['error']) !== '') {
            $safeError = htmlspecialchars(trim((string) $result['error']), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            return "<b>Từ chối quyền truy cập</b>\n{$safeError}";
        }

        $tool = $this->get($name);

        if (! $tool || ! method_exists($tool, 'formatHtml')) {
            return null;
        }

        return (string) $tool->formatHtml($result);
    }

    /**
     * Xác định độ ưu tiên sắp xếp của một Tool (số nhỏ đứng trước, fallback_schema_query luôn đứng cuối cùng).
     */
    protected function resolveToolPriority(TelegramAiToolInterface $tool): int
    {
        $name = strtolower(trim($tool->name()));
        $shortClass = class_basename($tool);

        if ($name === 'fallback_schema_query' || $shortClass === 'FallbackSchemaQueryTool') {
            return 1000;
        }

        return match ($name) {
            'lookup_repair_orders', 'lookup_order'    => 10,
            'get_revenue_summary'                     => 20,
            'check_inventory_parts', 'check_inventory' => 30,
            'lookup_warranties', 'lookup_warranty'    => 40,
            default                                   => 100,
        };
    }

    /**
     * Sắp xếp lại danh sách $this->tools để các Tool chuyên biệt luôn đứng trước và fallback_schema_query luôn đứng cuối.
     */
    protected function sortToolsByPriority(): void
    {
        if (count($this->tools) <= 1) {
            return;
        }

        $indexed = [];
        $position = 0;
        foreach ($this->tools as $name => $tool) {
            $indexed[] = [
                'name'     => $name,
                'tool'     => $tool,
                'priority' => $this->resolveToolPriority($tool),
                'position' => $position++,
            ];
        }

        usort($indexed, static function (array $a, array $b): int {
            if ($a['priority'] !== $b['priority']) {
                return $a['priority'] <=> $b['priority'];
            }

            return $a['position'] <=> $b['position'];
        });

        $sorted = [];
        foreach ($indexed as $item) {
            $sorted[$item['name']] = $item['tool'];
        }

        $this->tools = $sorted;
    }

    /**
     * Đọc namespace và tên class từ nội dung file PHP (hỗ trợ trường hợp truyền thư mục tùy chỉnh khi test).
     */
    protected function extractFqcnFromFile(string $filePath, string $defaultClassName): ?string
    {
        $contents = @file_get_contents($filePath);
        if (! is_string($contents) || $contents === '') {
            return null;
        }

        $namespace = '';
        if (preg_match('/^\s*namespace\s+([^;]+);/m', $contents, $nsMatches)) {
            $namespace = trim($nsMatches[1]);
        }

        $className = $defaultClassName;
        if (preg_match('/^\s*(?:final\s+|abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/m', $contents, $classMatches)) {
            $className = trim($classMatches[1]);
        }

        return $namespace !== '' ? ($namespace . '\\' . $className) : $className;
    }
}


