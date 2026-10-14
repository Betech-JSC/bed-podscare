<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\RepairOrder;
use DateTimeInterface;

class OrderCodeService
{
    /**
     * Sinh mã đơn hàng sửa chữa định danh dạng PC{branch_code}{DDMMYY}{STT}
     *
     * @param int $branchId ID của chi nhánh tiếp nhận
     * @param DateTimeInterface|null $date Ngày tiếp nhận (mặc định là ngày giờ hiện tại)
     * @return string Mã đơn hàng định danh (ví dụ: PC112102601)
     */
    public function generate(int $branchId, ?DateTimeInterface $date = null): string
    {
        // 1. Xác định mã chi nhánh: ưu tiên $branch->code ?? $branch->id, nếu là số vd 1 thì là '1'
        $branch = Branch::find($branchId);
        $rawCode = !empty($branch?->code) ? (string) $branch->code : (string) ($branch?->id ?? $branchId);
        $branchCode = trim($rawCode);

        // 2. Định dạng ngày tháng: DDMMYY 6 chữ số (ngày 2 số, tháng 2 số, 2 số cuối của năm)
        $dateFormatted = $date ? $date->format('dmy') : \Carbon\Carbon::now('Asia/Ho_Chi_Minh')->format('dmy');

        // 3. Tiền tố: PC{branch_code}{DDMMYY}
        $prefix = "PC{$branchCode}{$dateFormatted}";

        // 4. Tìm đơn hàng có mã lớn nhất trong ngày tại chi nhánh đó với lockForUpdate()
        $lastOrder = RepairOrder::where('branch_id', $branchId)
            ->where('order_code', 'like', "{$prefix}%")
            ->orderByDesc('order_code')
            ->lockForUpdate()
            ->first();

        // 5. Xác định số thứ tự tiếp theo
        $lastSeq = 0;
        if ($lastOrder && !empty($lastOrder->order_code)) {
            $seqPart = substr($lastOrder->order_code, strlen($prefix));
            if (is_numeric($seqPart)) {
                $lastSeq = (int) $seqPart;
            } else {
                $lastSeq = (int) substr($lastOrder->order_code, -2);
            }
        }

        $nextSeq = $lastSeq + 1;

        // 6. Định dạng STT: 2 số '01' đến '99', nếu >= 100 thì giữ nguyên số để không crash
        $stt = $nextSeq >= 100
            ? (string) $nextSeq
            : str_pad((string) $nextSeq, 2, '0', STR_PAD_LEFT);

        $orderCode = "{$prefix}{$stt}";

        // 7. Phòng vệ kép đảm bảo không bị duplicate key trong trường hợp hiếm gặp
        while (RepairOrder::where('order_code', $orderCode)->exists()) {
            $nextSeq++;
            $stt = $nextSeq >= 100
                ? (string) $nextSeq
                : str_pad((string) $nextSeq, 2, '0', STR_PAD_LEFT);
            $orderCode = "{$prefix}{$stt}";
        }

        return $orderCode;
    }
}
