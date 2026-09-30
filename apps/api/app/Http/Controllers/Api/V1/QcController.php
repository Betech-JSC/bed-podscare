<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\QcChecklistResult;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class QcController extends Controller
{
    /**
     * Danh sách biên bản kiểm tra chất lượng QC.
     */
    public function index(Request $request): JsonResponse
    {
        $query = QcInspection::with(['repairOrder.customer', 'inspector:id,name', 'checklistResults']);

        if ($orderId = $request->input('repair_order_id')) {
            $query->where('repair_order_id', $orderId);
        }

        if ($result = $request->input('result')) {
            $query->where('result', $result);
        }

        $inspections = $query->latest('id')->paginate($request->input('per_page', 15));

        return $this->success($inspections, 'Lấy danh sách biên bản QC thành công.');
    }

    /**
     * Nộp biên bản kiểm tra chất lượng (QC Checklist 6 tiêu chí).
     */
    public function store(Request $request): JsonResponse
    {
        $inputOrderId = $request->input('repair_order_id');
        if ($inputOrderId && ! is_numeric($inputOrderId)) {
            $foundOrder = RepairOrder::where('order_code', $inputOrderId)->first();
            if ($foundOrder) {
                $request->merge(['repair_order_id' => $foundOrder->id]);
            }
        }

        $validated = $request->validate([
            'repair_order_id'       => 'required|exists:repair_orders,id',
            'result'                => 'required|in:pass,fail',
            'notes'                 => 'nullable|string',
            'rework_reason'         => 'required_if:result,fail|nullable|string',
            'criteria'              => 'required|array|min:1',
            'criteria.*.criterion'  => 'required|string',
            'criteria.*.is_passed'  => 'required|boolean',
        ]);

        return DB::transaction(function () use ($request, $validated) {
            $order = RepairOrder::findOrFail($validated['repair_order_id']);

            $inspection = QcInspection::create([
                'repair_order_id' => $order->id,
                'inspector_id'    => $request->user()?->id ?? 1,
                'result'          => $validated['result'],
                'notes'           => $validated['notes'] ?? null,
                'rework_reason'   => $validated['rework_reason'] ?? null,
            ]);

            foreach ($validated['criteria'] as $item) {
                QcChecklistResult::create([
                    'qc_inspection_id' => $inspection->id,
                    'criterion'        => $item['criterion'],
                    'is_passed'        => $item['is_passed'],
                ]);
            }

            // Cập nhật trạng thái đơn sửa chữa
            if ($validated['result'] === 'pass') {
                $order->update([
                    'status'          => 'ready_for_return',
                    'qc_inspector_id' => $request->user()?->id ?? 1,
                    'qc_passed_at'    => Carbon::now(),
                    'qc_note'         => $validated['notes'] ?? 'Đạt 6/6 tiêu chuẩn kỹ thuật',
                ]);
            } else {
                $order->update([
                    'status'          => 'rework_needed',
                    'qc_inspector_id' => $request->user()?->id ?? 1,
                    'qc_note'         => $validated['rework_reason'],
                ]);
            }

            AuditLog::create([
                'user_id'        => $request->user()?->id,
                'user_name'      => $request->user()?->name ?? 'QC Inspector',
                'action'         => 'Kiểm định QC: ' . ($validated['result'] === 'pass' ? 'ĐẠT' : 'KHÔNG ĐẠT'),
                'auditable_type' => 'QcInspection',
                'auditable_id'   => $inspection->id,
                'details'        => "Đơn {$order->order_code} đánh giá " . strtoupper($validated['result']),
                'ip_address'     => $request->ip(),
            ]);

            return $this->success(
                $inspection->load('checklistResults'),
                'Nộp kết quả kiểm tra QC thành công.',
                201
            );
        });
    }
}
