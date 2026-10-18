<?php

namespace App\Services\TelegramAi;

use App\Models\TelegramRecipient;
use App\Services\TelegramAi\Contracts\TelegramAiToolInterface;

class TelegramAiToolRegistry
{
    /**
     * @var array<string, TelegramAiToolInterface>
     */
    protected array $tools = [];

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
     * Đăng ký một Tool độc lập vào Registry.
     */
    public function register(TelegramAiToolInterface $tool): self
    {
        $this->tools[$tool->name()] = $tool;

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
     * Trả về mảng functionDeclarations theo chuẩn Google Gemini API.
     */
    public function getFunctionDeclarations(): array
    {
        $declarations = [];

        foreach ($this->tools as $tool) {
            $declarations[] = [
                'name'        => $tool->name(),
                'description' => $tool->description(),
                'parameters'  => $tool->parametersSchema(),
            ];
        }

        return $declarations;
    }

    /**
     * Thực thi một Tool theo tên định danh với ngữ cảnh người nhận Telegram.
     */
    public function execute(string $name, array $args, TelegramRecipient $recipient): array
    {
        $tool = $this->get($name);

        if (! $tool) {
            return [
                'error' => "Tool '{$name}' is not registered.",
            ];
        }

        return $tool->execute($args, $recipient);
    }

    /**
     * Định dạng kết quả của Tool sang văn bản HTML tiếng Việt (nếu Tool có phương thức formatHtml).
     */
    public function formatHtml(string $name, array $result): ?string
    {
        $tool = $this->get($name);

        if (! $tool || ! method_exists($tool, 'formatHtml')) {
            return null;
        }

        return (string) $tool->formatHtml($result);
    }
}

