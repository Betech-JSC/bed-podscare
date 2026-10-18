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
        return 'Kiểm tra số lượng tồn kho linh kiện, giá bán lẻ, vị trí lưu kho hoặc lọc danh sách các linh kiện sắp hết hàng / hết hàng (low_stock_only = true) của cửa hàng theo từ khóa (keyword: tên linh kiện, mã SKU, dòng máy tương thích, danh mục).';
    }

    public function parametersSchema(): array
    {
        return [
            'type'       => 'OBJECT',
            'properties' => [
                'keyword' => [
                    'type'        => 'STRING',
                    'description' => 'Từ khóa tìm kiếm linh kiện (tên linh kiện, mã SKU, hoặc dòng máy tương thích như AirPods 2, AirPods Pro). Bỏ trống nếu muốn xem toàn bộ hoặc lọc linh kiện sắp hết.',
                ],
                'low_stock_only' => [
                    'type'        => 'BOOLEAN',
                    'description' => 'Đặt là true nếu chỉ muốn liệt kê các linh kiện sắp hết hàng hoặc đã hết hàng (stock_quantity <= min_stock_alert).',
                ],
                'limit' => [
                    'type'        => 'INTEGER',
                    'description' => 'Số lượng linh kiện tối đa trả về (mặc định 10, tối đa 20).',
                ],
            ],
        ];
    }

    public function execute(array $args, TelegramRecipient $recipient): array
    {
        // Bước 1: Tự kiểm tra & chuẩn hóa tham số đầu vào (Sanitize & Normalize)
        $keyword = trim((string) ($args['keyword'] ?? ''));
        $lowStockOnly = filter_var($args['low_stock_only'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $limit = max(1, min(20, (int) ($args['limit'] ?? 10)));
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

        if ($keyword !== '') {
            $query->where(function ($q) use ($keyword) {
                $q->where('name', 'like', "%{$keyword}%")
                    ->orWhere('sku', 'like', "%{$keyword}%")
                    ->orWhere('compatible_models', 'like', "%{$keyword}%")
                    ->orWhere('category', 'like', "%{$keyword}%");
            });
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
        $parts = $query
            ->orderBy('stock_quantity', 'asc')
            ->orderBy('id', 'asc')
            ->limit($limit)
            ->get();

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
                'keyword'        => $keyword !== '' ? $keyword : null,
                'low_stock_only' => $lowStockOnly,
                'limit'          => $limit,
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

