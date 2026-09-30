<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\OrderOperationalEvent;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Notification;
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
                'inspector_id'    => $request->user()->id,
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
                    'qc_inspector_id' => $request->user()->id,
                    'qc_passed_at'    => Carbon::now(),
                    'qc_note'         => $validated['notes'] ?? 'Đạt 6/6 tiêu chuẩn kỹ thuật',
                ]);

                $notif = Notification::create([
                    'branch_id'  => $order->branch_id,
                    'order_id'   => $order->id,
                    'type'       => 'qc_action',
                    'title'      => 'Đạt chuẩn kiểm định QC',
                    'message'    => "Đơn {$order->order_code} đã vượt qua 6/6 tiêu chuẩn QC và sẵn sàng giao trả.",
                    'severity'   => 'success',
                    'action_url' => "/repairs?id={$order->id}",
                ]);

                OrderOperationalEvent::dispatch(
                    $notif->id,
                    $order->id,
                    $order->order_code,
                    $notif->title,
                    $notif->message,
                    'success',
                    now()->toIso8601String(),
                    "/repairs?id={$order->id}",
                    $order->branch_id,
                    'cskh',
                    null,
                    'qc_action',
                    'qc.passed'
                );
            } else {
                $order->update([
                    'status'          => 'rework_needed',
                    'qc_inspector_id' => $request->user()->id,
                    'qc_note'         => $validated['rework_reason'],
                ]);

                $notif = Notification::create([
                    'branch_id'  => $order->branch_id,
                    'order_id'   => $order->id,
                    'type'       => 'qc_action',
                    'title'      => 'QC không đạt chuẩn - Cần sửa lại',
                    'message'    => "Đơn {$order->order_code} không đạt kiểm định QC: " . ($validated['rework_reason'] ?? 'Cần kiểm tra và sửa lại.'),
                    'severity'   => 'danger',
                    'action_url' => "/repairs?id={$order->id}",
                ]);

                OrderOperationalEvent::dispatch(
                    $notif->id,
                    $order->id,
                    $order->order_code,
                    $notif->title,
                    $notif->message,
                    'danger',
                    now()->toIso8601String(),
                    "/repairs?id={$order->id}",
                    $order->branch_id,
                    'technician',
                    $order->technician_id,
                    'qc_action',
                    'qc.rework_needed'
                );
            }

            AuditLog::create([
                'user_id'        => $request->user()->id,
                'user_name'      => $request->user()->name,
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
