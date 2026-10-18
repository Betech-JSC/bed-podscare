<?php

namespace App\Services\TelegramAi\Tools;

use App\Models\RepairOrder;
use App\Models\TelegramRecipient;
use App\Services\TelegramAi\Contracts\TelegramAiToolInterface;
use App\Services\TelegramAi\TelegramAiAssistantService;

class LookupOrderTool implements TelegramAiToolInterface
{
    public function name(): string
    {
        return 'lookup_repair_orders';
    }

    public function description(): string
    {
        return 'Tra cứu thông tin chi tiết một hoặc nhiều đơn sửa chữa của cửa hàng theo mã đơn (order_code), số điện thoại khách hàng (customer_phone), tên khách hàng (customer_name), trạng thái đơn (status), phân loại đơn (order_type: in_store, cod, warranty), hoặc lấy danh sách đơn mới nhất.';
    }

    public function parametersSchema(): array
    {
        return [
            'type'       => 'OBJECT',
            'properties' => [
                'order_code' => [
                    'type'        => 'STRING',
                    'description' => 'Mã đơn sửa chữa cần tìm (ví dụ: PCQ117102602).',
                ],
                'customer_phone' => [
                    'type'        => 'STRING',
                    'description' => 'Số điện thoại khách hàng cần tra cứu đơn.',
                ],
                'customer_name' => [
                    'type'        => 'STRING',
                    'description' => 'Tên khách hàng cần tra cứu đơn.',
                ],
                'status' => [
                    'type'        => 'STRING',
                    'description' => 'Trạng thái đơn sửa chữa (inspecting, waiting_approval, quote_pending, rejected, waiting_tech, assigned, in_repair, waiting_parts, rework_needed, waiting_qc, qc_pending, ready_for_return, waiting_pickup, completed, cancelled). Hãy ánh xạ câu hỏi tiếng Việt tương ứng: "đang đợi kỹ thuật" -> waiting_tech, "đang sửa" -> in_repair, "đợi khách duyệt" -> waiting_approval, "đợi linh kiện" -> waiting_parts, "đợi QC" -> waiting_qc, "đợi khách nhận" -> waiting_pickup.',
                ],
                'order_type' => [
                    'type'        => 'STRING',
                    'description' => 'Phân loại đơn: in_store (Khách tại cửa hàng), cod (Đơn COD khách tỉnh), warranty (Tiếp nhận bảo hành).',
                ],
                'limit' => [
                    'type'        => 'INTEGER',
                    'description' => 'Số lượng đơn tối đa cần lấy (mặc định 5, tối đa 10).',
                ],
            ],
        ];
    }

    /**
     * Chuyển đổi mã trạng thái kỹ thuật của BE sang nhãn tiếng Việt thân thiện (dạng "Đang đợi...").
     */
    public static function formatStatusLabel(string $status): string
    {
        return match (strtolower(trim($status))) {
            'received'          => 'Mới tiếp nhận (Đang đợi kiểm tra)',
            'inspecting'        => 'Đang kiểm tra tình trạng máy',
            'waiting_approval',
            'quote_pending',
            'waiting_customer',
            'quoted'            => 'Đang đợi khách duyệt báo giá',
            'approved'          => 'Khách đã duyệt báo giá',
            'rejected'          => 'Khách từ chối sửa',
            'waiting_tech'      => 'Đang đợi kỹ thuật viên tiếp nhận',
            'assigned'          => 'Kỹ thuật viên đã nhận máy',
            'in_repair',
            'repairing',
            'in_progress'       => 'Đang trong quá trình sửa chữa',
            'waiting_parts'     => 'Đang đợi linh kiện thay thế',
            'rework_needed'     => 'Cần kiểm tra / sửa lại',
            'waiting_qc',
            'qc_pending',
            'qc_inspecting'     => 'Đang đợi kiểm định chất lượng (QC)',
            'qc_passed'         => 'Đã đạt kiểm định QC',
            'ready_for_return'  => 'Sẵn sàng trả máy cho khách',
            'waiting_pickup',
            'ready_for_pickup'  => 'Đang đợi khách đến nhận máy',
            'completed'         => 'Đã hoàn tất',
            'delivered',
            'handed_over'       => 'Đã bàn giao cho khách',
            'cancelled'         => 'Đã hủy đơn',
            default             => 'Đang xử lý',
        };
    }

    public function execute(array $args, TelegramRecipient $recipient): array
    {
        // Bước 1: Tự kiểm tra & chuẩn hóa lại tham số đầu vào (Sanitize & Normalize)
        $orderCode = strtoupper(ltrim(trim((string) ($args['order_code'] ?? '')), '#'));
        $customerPhone = preg_replace('/[\s.\-]+/', '', trim((string) ($args['customer_phone'] ?? ''))) ?? '';
        $customerName = trim((string) ($args['customer_name'] ?? ''));
        $status = strtolower(trim((string) ($args['status'] ?? '')));
        $orderType = strtolower(trim((string) ($args['order_type'] ?? '')));
        $limit = max(1, min(10, (int) ($args['limit'] ?? 5)));
        $branchDisplay = TelegramAiAssistantService::resolveBranchDisplay($recipient);

        // Bước 2: Thực thi Eloquent Query khóa cứng tenant_id & branch_id
        $query = RepairOrder::withoutGlobalScopes()
            ->with([
                'customer'      => fn ($q) => $q->withoutGlobalScopes(),
                'deviceModel',
                'branch'        => fn ($q) => $q->withoutGlobalScopes(),
                'technician'    => fn ($q) => $q->withoutGlobalScopes(),
                'createdByUser' => fn ($q) => $q->withoutGlobalScopes(),
            ])
            ->where('tenant_id', (int) $recipient->tenant_id);

        if ($recipient->branch_id !== null) {
            $query->where('branch_id', (int) $recipient->branch_id);
        }

        if ($orderCode !== '') {
            $query->where(function ($q) use ($orderCode) {
                $q->where('order_code', $orderCode)
                    ->orWhere('order_code', 'like', "%{$orderCode}%")
                    ->orWhere('intake_batch_code', $orderCode)
                    ->orWhere('intake_batch_code', 'like', "%{$orderCode}%");
            });
        }

        if ($customerPhone !== '') {
            $query->whereHas('customer', function ($q) use ($customerPhone) {
                $q->withoutGlobalScopes()->where('phone', 'like', "%{$customerPhone}%");
            });
        }

        if ($customerName !== '') {
            $query->whereHas('customer', function ($q) use ($customerName) {
                $q->withoutGlobalScopes()->where('name', 'like', "%{$customerName}%");
            });
        }

        if ($status !== '') {
            if (in_array($status, ['waiting_tech', 'received'], true)) {
                $query->whereIn('status', ['waiting_tech', 'received']);
            } elseif (in_array($status, ['waiting_approval', 'quote_pending', 'waiting_customer', 'quoted'], true)) {
                $query->whereIn('status', ['waiting_approval', 'quote_pending', 'waiting_customer', 'quoted']);
            } elseif (in_array($status, ['in_repair', 'repairing', 'in_progress'], true)) {
                $query->whereIn('status', ['in_repair', 'repairing', 'in_progress']);
            } elseif (in_array($status, ['waiting_qc', 'qc_pending', 'qc_inspecting'], true)) {
                $query->whereIn('status', ['waiting_qc', 'qc_pending', 'qc_inspecting']);
            } elseif (in_array($status, ['waiting_pickup', 'ready_for_pickup', 'ready_for_return'], true)) {
                $query->whereIn('status', ['waiting_pickup', 'ready_for_pickup', 'ready_for_return']);
            } elseif (in_array($status, ['completed', 'delivered', 'handed_over'], true)) {
                $query->whereIn('status', ['completed', 'delivered', 'handed_over']);
            } else {
                $query->where('status', $status);
            }
        }

        if ($orderType !== '' && in_array($orderType, ['in_store', 'cod', 'warranty'], true)) {
            $query->where('order_type', $orderType);
        }

        $totalMatched = (clone $query)->count();
        $orders = $query->orderByDesc('id')->limit($limit)->get();

        $items = $orders->map(function (RepairOrder $order) use ($branchDisplay): array {
            $type = strtolower((string) ($order->order_type ?: 'in_store'));
            $orderTypeLabel = match ($type) {
                'cod'      => 'Đơn COD (Khách tỉnh)',
                'warranty' => 'Tiếp nhận bảo hành',
                default    => 'Khách tại cửa hàng',
            };

            $rawStatus = (string) $order->status;
            $totalPrice = (float) ($order->total_price ?? 0);

            return [
                'order_code'        => (string) $order->order_code,
                'intake_batch_code' => $order->intake_batch_code,
                'status'            => $rawStatus,
                'status_label'      => self::formatStatusLabel($rawStatus),
                'order_type'        => $type,
                'order_type_label'  => $orderTypeLabel,
                'branch_name'       => (string) ($order->branch?->name ?? $branchDisplay),
                'customer_name'     => (string) ($order->customer?->name ?? 'Khách lẻ'),
                'customer_phone'    => (string) ($order->customer?->phone ?? ''),
                'device_name'       => (string) ($order->deviceModel?->name ?? 'Thiết bị AirPods'),
                'issue_description' => (string) ($order->issue_description ?? ''),
                'total_price'       => $totalPrice,
                'formatted_price'   => number_format($totalPrice, 0, ',', '.') . ' đ',
                'technician_name'   => (string) ($order->technician?->name ?? 'Chưa phân công'),
                'received_by_name'  => (string) ($order->createdByUser?->name ?? 'Hệ thống'),
                'shipping_address'  => (string) ($order->shipping_address ?? ''),
                'created_at'        => optional($order->created_at)->format('H:i - d/m/Y'),
            ];
        })->values()->all();

        if ($recipient->branch_id === null) {
            $itemBranches = array_values(array_unique(array_filter(array_column($items, 'branch_name'))));
            if (count($itemBranches) === 1) {
                $branchDisplay = (string) $itemBranches[0];
            }
        }

        return [
            'branch_name'     => $branchDisplay,
            'branch_scope'    => $branchDisplay,
            'filters_applied' => [
                'order_code'     => $orderCode !== '' ? $orderCode : null,
                'customer_phone' => $customerPhone !== '' ? $customerPhone : null,
                'customer_name'  => $customerName !== '' ? $customerName : null,
                'status'         => $status !== '' ? $status : null,
                'order_type'     => in_array($orderType, ['in_store', 'cod', 'warranty'], true) ? $orderType : null,
                'limit'          => $limit,
            ],
            'total_matched'  => $totalMatched,
            'returned_count' => count($items),
            'orders'         => $items,
        ];
    }

    /**
     * Kết xuất trực tiếp kết quả tra cứu đơn sửa chữa sang văn bản HTML tiếng Việt chuẩn gửi về Telegram.
     * Tuyệt đối chỉ hiển thị nhãn trạng thái tiếng Việt (status_label), không hiển thị mã kỹ thuật BE.
     */
    public function formatHtml(array $result): string
    {
        $branchScope = htmlspecialchars(
            (string) ($result['branch_scope'] ?? $result['branch_name'] ?? 'Chi nhánh chính'),
            ENT_QUOTES | ENT_SUBSTITUTE,
            'UTF-8'
        );
        $totalMatched = (int) ($result['total_matched'] ?? 0);
        $orders = is_array($result['orders'] ?? null) ? $result['orders'] : [];

        if ($totalMatched === 0 || empty($orders)) {
            return "<b>Kết quả tra cứu đơn sửa chữa</b>\nKhông tìm thấy đơn sửa chữa nào khớp với điều kiện tra cứu tại chi nhánh <b>{$branchScope}</b>.";
        }

        $lines = [
            "<b>Kết quả tra cứu đơn sửa chữa</b>",
            "Chi nhánh: <b>{$branchScope}</b> (Tìm thấy <b>{$totalMatched}</b> đơn)",
        ];

        foreach ($orders as $order) {
            if (! is_array($order)) {
                continue;
            }

            $orderCode = htmlspecialchars((string) ($order['order_code'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $orderBranch = htmlspecialchars((string) ($order['branch_name'] ?? $branchScope), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $orderTypeLabel = htmlspecialchars((string) ($order['order_type_label'] ?? 'Khách tại cửa hàng'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $customerName = htmlspecialchars((string) ($order['customer_name'] ?? 'Khách lẻ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $customerPhone = htmlspecialchars((string) ($order['customer_phone'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $deviceName = htmlspecialchars((string) ($order['device_name'] ?? 'Thiết bị AirPods'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $issueDescription = htmlspecialchars((string) (($order['issue_description'] ?? '') ?: 'Đang kiểm tra'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $rawStatusLabel = trim((string) ($order['status_label'] ?? ''));
            if ($rawStatusLabel === '') {
                $rawStatusLabel = self::formatStatusLabel((string) ($order['status'] ?? ''));
            }
            $statusLabel = htmlspecialchars($rawStatusLabel, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $technicianName = htmlspecialchars((string) (($order['technician_name'] ?? '') ?: 'Chưa phân công'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $formattedPrice = htmlspecialchars((string) ($order['formatted_price'] ?? '0 đ'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $createdAt = htmlspecialchars((string) ($order['created_at'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            $customerInfo = $customerPhone !== ''
                ? "<b>{$customerName}</b> - <code>{$customerPhone}</code>"
                : "<b>{$customerName}</b>";

            $lines[] = "- Mã đơn: <code>{$orderCode}</code> | Chi nhánh: <b>{$orderBranch}</b> | Phân loại: {$orderTypeLabel}\n"
                . "  Khách hàng: {$customerInfo} | Thiết bị: {$deviceName}\n"
                . "  Tình trạng lỗi: {$issueDescription}\n"
                . "  Trạng thái: <b>{$statusLabel}</b> | Kỹ thuật viên: {$technicianName}\n"
                . "  Chi phí: <b>{$formattedPrice}</b> | Thời gian: {$createdAt}";
        }

        return implode("\n", $lines);
    }
}

