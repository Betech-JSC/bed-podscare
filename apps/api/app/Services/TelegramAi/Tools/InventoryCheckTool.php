<?php

namespace App\Services\TelegramAi\Tools;

use App\Models\BranchPart;
use App\Models\Part;
use App\Models\TelegramRecipient;
use App\Services\TelegramAi\Contracts\TelegramAiToolInterface;
use App\Services\TelegramAi\TelegramAiAssistantService;

class InventoryCheckTool implements TelegramAiToolInterface
{
    public function name(): string
    {
        return 'check_inventory_parts';
    }

    public function description(): string
    {
        return 'Kiểm tra số lượng tồn kho linh kiện, giá bán lẻ, vị trí lưu kho hoặc lọc danh sách các linh kiện sắp hết hàng / hết hàng (low_stock_only = true) của cửa hàng theo từ khóa (keyword: tên linh kiện, mã SKU, dòng máy tương thích, danh mục), dòng thiết bị (device_category), danh mục (category), và tiêu chí sắp xếp (sort_by: stock_asc, stock_desc, price_desc, name_asc).';
    }

    public function parametersSchema(): array
    {
        return [
            'type'       => 'OBJECT',
            'properties' => [
                'keyword' => [
                    'type'        => 'STRING',
                    'description' => 'Từ khóa tìm kiếm linh kiện (tên linh kiện, mã SKU, hoặc dòng máy tương thích như AirPods 2, AirPods Pro, Vỏ thép đen). Bỏ trống nếu muốn xem toàn bộ hoặc lọc linh kiện sắp hết.',
                ],
                'device_category' => [
                    'type'        => 'STRING',
                    'description' => 'Lọc linh kiện theo dòng máy tương thích hoặc danh mục thiết bị (ví dụ: AirPods, Apple Watch, iPhone, iPad, MacBook).',
                ],
                'category' => [
                    'type'        => 'STRING',
                    'description' => 'Lọc theo danh mục linh kiện (ví dụ: Pin, Vỏ, Loa, Mic, Cáp) hoặc dòng thiết bị.',
                ],
                'low_stock_only' => [
                    'type'        => 'BOOLEAN',
                    'description' => 'Đặt là true nếu chỉ muốn liệt kê các linh kiện sắp hết hàng hoặc đã hết hàng (stock_quantity <= min_stock_alert).',
                ],
                'sort_by' => [
                    'type'        => 'STRING',
                    'description' => 'Tiêu chí sắp xếp danh sách linh kiện: "stock_asc" (tồn kho tăng dần - mặc định), "stock_desc" (tồn kho giảm dần), "price_desc" (giá bán lẻ cao đến thấp), "name_asc" (tên linh kiện A-Z).',
                ],
                'limit' => [
                    'type'        => 'INTEGER',
                    'description' => 'Số lượng linh kiện tối đa trả về (mặc định 10, tối đa 20).',
                ],
            ],
        ];
    }

    /**
     * Escape các ký tự wildcard SQL (%, _, \) trước khi đưa vào điều kiện LIKE.
     */
    protected function escapeLike(string $value): string
    {
        return strtr($value, [
            '\\' => '\\\\',
            '%'  => '\\%',
            '_'  => '\\_',
        ]);
    }

    protected function applyCategoryCondition($query, string $rawCategory): void
    {
        $trimmed = trim($rawCategory);
        $normalized = mb_strtolower($trimmed, 'UTF-8');
        if ($normalized === '') {
            return;
        }

        $escaped = $this->escapeLike($trimmed);

        $query->where(function ($sub) use ($escaped, $normalized) {
            $sub->where('category', 'like', "%{$escaped}%")
                ->orWhere('compatible_models', 'like', "%{$escaped}%")
                ->orWhere('name', 'like', "%{$escaped}%");

            if (str_contains($normalized, 'watch') || str_contains($normalized, 'đồng hồ')) {
                $sub->orWhere('category', 'like', '%apple_watch%')
                    ->orWhere('category', 'like', '%Watch%')
                    ->orWhere('compatible_models', 'like', '%Watch%')
                    ->orWhere('name', 'like', '%Watch%');
            } elseif (str_contains($normalized, 'airpod') || str_contains($normalized, 'tai nghe')) {
                $sub->orWhere('category', 'like', '%airpods%')
                    ->orWhere('category', 'like', '%AirPods%')
                    ->orWhere('compatible_models', 'like', '%AirPods%')
                    ->orWhere('name', 'like', '%AirPods%');
            } elseif (str_contains($normalized, 'iphone')) {
                $sub->orWhere('category', 'like', '%iphone%')
                    ->orWhere('compatible_models', 'like', '%iPhone%')
                    ->orWhere('name', 'like', '%iPhone%');
            } elseif (str_contains($normalized, 'ipad')) {
                $sub->orWhere('category', 'like', '%ipad%')
                    ->orWhere('compatible_models', 'like', '%iPad%')
                    ->orWhere('name', 'like', '%iPad%');
            } elseif (str_contains($normalized, 'macbook')) {
                $sub->orWhere('category', 'like', '%macbook%')
                    ->orWhere('compatible_models', 'like', '%MacBook%')
                    ->orWhere('name', 'like', '%MacBook%');
            }
        });
    }

    protected function applyKeywordTokenCondition($query, string $token): void
    {
        $escaped = $this->escapeLike($token);
        $like = "%{$escaped}%";
        $query->where(function ($q) use ($like) {
            $q->where('name', 'like', $like)
                ->orWhere('sku', 'like', $like)
                ->orWhere('compatible_models', 'like', $like)
                ->orWhere('category', 'like', $like);
        });
    }

    /**
     * Chuẩn hóa an toàn tham số đầu vào thành chuỗi đơn (chống lỗi Array to string conversion khi LLM trả về mảng).
     */
    protected function scalarString(mixed $value, string $default = ''): string
    {
        if (is_array($value)) {
            $parts = [];
            array_walk_recursive($value, static function (mixed $item) use (&$parts): void {
                if (is_string($item) || is_int($item) || is_float($item)) {
                    $trimmed = trim((string) $item);
                    if ($trimmed !== '') {
                        $parts[] = $trimmed;
                    }
                }
            });

            return ! empty($parts) ? implode(' ', $parts) : $default;
        }

        if (is_string($value) || is_int($value) || is_float($value)) {
            $trimmed = trim((string) $value);

            return $trimmed !== '' ? $trimmed : $default;
        }

        return $default;
    }

    public function execute(array $args, TelegramRecipient $recipient): array
    {
        // Bước 1: Tự kiểm tra & chuẩn hóa tham số đầu vào (Sanitize & Normalize)
        $keyword = $this->scalarString($args['keyword'] ?? '');
        $deviceCategory = $this->scalarString($args['device_category'] ?? '');
        $category = $this->scalarString($args['category'] ?? '');
        $lowStockOnly = filter_var($args['low_stock_only'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $rawSortBy = strtolower($this->scalarString($args['sort_by'] ?? 'stock_asc', 'stock_asc'));
        $allowedSortBy = ['stock_asc', 'stock_desc', 'price_desc', 'name_asc'];
        $sortBy = in_array($rawSortBy, $allowedSortBy, true) ? $rawSortBy : 'stock_asc';
        $limit = max(1, min(20, (int) $this->scalarString($args['limit'] ?? null, '10')));
        $tenantId = (int) $recipient->tenant_id;
        $recipientBranchId = $recipient->branch_id !== null ? (int) $recipient->branch_id : null;
        $branchDisplay = TelegramAiAssistantService::resolveBranchDisplay($recipient);

        // Bước 2: Thực thi Eloquent Query khóa cứng tenant_id (và ưu tiên số liệu branch_id nếu có)
        $query = Part::withoutGlobalScopes()
            ->with([
                'branchParts.branch' => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->where('tenant_id', $tenantId)
            ->where('is_active', true);

        if ($deviceCategory !== '') {
            $this->applyCategoryCondition($query, $deviceCategory);
        }

        if ($category !== '') {
            $this->applyCategoryCondition($query, $category);
        }

        if ($keyword !== '') {
            $exactClone = clone $query;
            $this->applyKeywordTokenCondition($exactClone, $keyword);

            if ($exactClone->count() > 0) {
                $this->applyKeywordTokenCondition($query, $keyword);
            } else {
                $lookupHelper = new LookupOrderTool();
                $tokens = $lookupHelper->extractSearchTokens($keyword);
                if (! empty($tokens)) {
                    foreach ($tokens as $token) {
                        $this->applyKeywordTokenCondition($query, $token);
                    }
                } else {
                    $this->applyKeywordTokenCondition($query, $keyword);
                }
            }
        }

        if ($lowStockOnly === true) {
            if ($recipientBranchId !== null) {
                $query->where(function ($q) use ($recipientBranchId) {
                    $q->whereColumn('stock_quantity', '<=', 'min_stock_alert')
                        ->orWhere('stock_quantity', '<=', 0)
                        ->orWhereHas('branchParts', function ($bpQuery) use ($recipientBranchId) {
                            $bpQuery->where('branch_id', $recipientBranchId)
                                ->where(function ($sub) {
                                    $sub->whereColumn('stock_quantity', '<=', 'min_stock_alert')
                                        ->orWhere('stock_quantity', '<=', 0);
                                });
                        });
                });
            } else {
                $query->where(function ($q) {
                    $q->whereColumn('stock_quantity', '<=', 'min_stock_alert')
                        ->orWhere('stock_quantity', '<=', 0);
                });
            }
        }

        $totalMatched = (clone $query)->count();

        match ($sortBy) {
            'stock_desc' => $query->orderBy('stock_quantity', 'desc')->orderBy('id', 'asc'),
            'price_desc' => $query->orderBy('retail_price', 'desc')->orderBy('id', 'asc'),
            'name_asc'   => $query->orderBy('name', 'asc')->orderBy('id', 'asc'),
            default      => $query->orderBy('stock_quantity', 'asc')->orderBy('id', 'asc'),
        };

        $parts = $query->limit($limit)->get();

        $items = $parts->map(function (Part $part) use ($recipient, $recipientBranchId): array {
            $totalStockQuantity = (int) $part->stock_quantity;
            $minStockAlert = (int) $part->min_stock_alert;

            /** @var BranchPart|null $matchedBranchPart */
            $matchedBranchPart = $recipientBranchId !== null
                ? $part->branchParts->firstWhere('branch_id', $recipientBranchId)
                : null;

            $effectiveStock = $matchedBranchPart !== null
                ? (int) $matchedBranchPart->stock_quantity
                : $totalStockQuantity;

            $effectiveMinAlert = $matchedBranchPart !== null
                ? (int) $matchedBranchPart->min_stock_alert
                : $minStockAlert;

            $retailPrice = (float) ($part->retail_price ?? 0);

            $branchStocks = $part->branchParts->map(function (BranchPart $bp): array {
                $bpStock = (int) $bp->stock_quantity;
                $bpMinAlert = (int) $bp->min_stock_alert;

                return [
                    'branch_id'       => (int) $bp->branch_id,
                    'branch_name'     => (string) ($bp->branch?->name ?? "Chi nhánh #{$bp->branch_id}"),
                    'stock_quantity'  => $bpStock,
                    'min_stock_alert' => $bpMinAlert,
                    'is_low_stock'    => $bpStock <= $bpMinAlert,
                ];
            })->values()->all();

            $item = [
                'sku'                    => (string) $part->sku,
                'name'                   => (string) $part->name,
                'category'               => (string) ($part->category ?? ''),
                'compatible_models'      => (string) ($part->compatible_models ?? ''),
                'storage_location'       => (string) ($part->storage_location ?? ''),
                'unit'                   => (string) ($part->unit ?: 'cái'),
                'stock_quantity'         => $effectiveStock,
                'total_stock_quantity'   => $totalStockQuantity,
                'branch_stock_quantity'  => $matchedBranchPart !== null ? (int) $matchedBranchPart->stock_quantity : null,
                'min_stock_alert'        => $effectiveMinAlert,
                'is_low_stock'           => ($effectiveStock <= $effectiveMinAlert) || ($totalStockQuantity <= $minStockAlert),
                'retail_price'           => $retailPrice,
                'formatted_retail_price' => number_format($retailPrice, 0, ',', '.') . ' đ',
                'branch_stocks'          => $branchStocks,
            ];

            if ($recipient->target_role === 'admin') {
                $costPrice = (float) ($part->cost_price ?? 0);
                $item['cost_price'] = $costPrice;
                $item['formatted_cost_price'] = number_format($costPrice, 0, ',', '.') . ' đ';
            }

            return $item;
        })->values()->all();

        return [
            'branch_name'     => $branchDisplay,
            'branch_scope'    => $branchDisplay,
            'filters_applied' => [
                'keyword'         => $keyword !== '' ? $keyword : null,
                'device_category' => $deviceCategory !== '' ? $deviceCategory : null,
                'category'        => $category !== '' ? $category : null,
                'low_stock_only'  => $lowStockOnly,
                'sort_by'         => $sortBy,
                'limit'           => $limit,
            ],
            'total_matched'  => $totalMatched,
            'returned_count' => count($items),
            'parts'          => $items,
        ];
    }

    /**
     * Kết xuất trực tiếp kết quả kiểm tra tồn kho linh kiện sang văn bản HTML tiếng Việt chuẩn gửi về Telegram.
     */
    public function formatHtml(array $result): string
    {
        $branchScope = htmlspecialchars(
            (string) ($result['branch_scope'] ?? $result['branch_name'] ?? 'Chi nhánh chính'),
            ENT_QUOTES | ENT_SUBSTITUTE,
            'UTF-8'
        );
        $totalMatched = (int) ($result['total_matched'] ?? 0);
        $parts = is_array($result['parts'] ?? null) ? $result['parts'] : [];

        if ($totalMatched === 0 || empty($parts)) {
            return "<b>Kết quả kiểm tra tồn kho linh kiện</b>\nKhông tìm thấy linh kiện nào khớp với từ khóa tra cứu tại chi nhánh <b>{$branchScope}</b>.";
        }

        $lines = [
            "<b>Kết quả kiểm tra tồn kho linh kiện</b>",
            "Chi nhánh: <b>{$branchScope}</b> (Tìm thấy <b>{$totalMatched}</b> linh kiện)",
        ];

        foreach ($parts as $part) {
            if (! is_array($part)) {
                continue;
            }

            $name = htmlspecialchars((string) ($part['name'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $sku = htmlspecialchars((string) ($part['sku'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $stockQuantity = (int) ($part['stock_quantity'] ?? 0);
            $unit = htmlspecialchars((string) ($part['unit'] ?? 'cái'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $formattedRetailPrice = htmlspecialchars((string) ($part['formatted_retail_price'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $storageLocation = htmlspecialchars((string) (($part['storage_location'] ?? '') ?: 'Chưa xếp vị trí'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $minStockAlert = (int) ($part['min_stock_alert'] ?? 0);
            $isLowStock = ! empty($part['is_low_stock']);
            $stockStatusLabel = $stockQuantity <= 0
                ? 'Đã hết hàng'
                : ($isLowStock ? 'Sắp hết hàng (cần nhập thêm)' : 'Đủ hàng');

            $lines[] = "- Tên linh kiện: <b>{$name}</b> | Mã SKU: <code>{$sku}</code>\n"
                . "  Tồn kho: <b>{$stockQuantity} {$unit}</b> (Cảnh báo tồn tối thiểu: {$minStockAlert} {$unit}) | Trạng thái: <b>{$stockStatusLabel}</b>\n"
                . "  Giá bán lẻ: <b>{$formattedRetailPrice}</b> | Vị trí: {$storageLocation}";
        }

        return implode("\n", $lines);
    }
}

