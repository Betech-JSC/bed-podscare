<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\RepairOrder;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use App\Support\PiiHelper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class WarrantyController extends Controller
{
    /**
     * Danh sách sổ bảo hành điện tử.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Warranty::with([
            'repairOrder.technician',
            'repairOrder.qcInspections',
            'repairOrder.branch',
            'customer',
            'deviceModel',
        ]);

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($phone = $request->input('phone') ?: $request->input('customer_phone')) {
            $query->whereHas('customer', function ($cq) use ($phone) {
                $cq->where('phone', 'like', "%{$phone}%");
            });
        }

        if ($serial = $request->input('serial_number') ?: $request->input('serial')) {
            $query->whereHas('repairOrder', function ($rq) use ($serial) {
                $rq->where('serial_number', 'like', "%{$serial}%");
            });
        }

        if ($search = $request->input('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('warranty_code', 'like', "%{$search}%")
                  ->orWhereHas('repairOrder', function ($rq) use ($search) {
                      $rq->where('serial_number', 'like', "%{$search}%");
                  })
                  ->orWhereHas('customer', function ($sq) use ($search) {
                      $sq->where('phone', 'like', "%{$search}%")
                         ->orWhere('name', 'like', "%{$search}%");
                  });
            });
        }

        $warranties = $query->latest('id')->paginate($request->input('per_page', 15));

        return $this->success($warranties, 'Lấy danh sách bảo hành thành công.');
    }

    /**
     * Lịch sử sửa chữa và hồ sơ bệnh án thiết bị theo SĐT khách hàng hoặc Serial máy.
     */
    public function history(Request $request): JsonResponse
    {
        $phone = $request->input('phone') ?: $request->input('customer_phone');
        $serial = $request->input('serial_number') ?: $request->input('serial');
        $customerId = $request->input('customer_id');
        $orderCode = $request->input('order_code');

        if (! $phone && ! $serial && ! $customerId && ! $orderCode) {
            return $this->failure('Vui lòng cung cấp Số điện thoại (phone), Số Serial (serial_number) hoặc mã đơn (order_code) để tra cứu hồ sơ bệnh án.', 422);
        }

        $ordersQuery = RepairOrder::with([
            'customer',
            'deviceModel',
            'technician:id,name,phone,email',
            'qcInspector:id,name',
            'handedOverByUser:id,name',
            'qcInspections',
            'branch:id,name,address',
            'warranties',
        ]);

        $ordersQuery->where(function ($q) use ($phone, $serial, $customerId, $orderCode) {
            $applied = false;
            if ($phone) {
                $q->whereHas('customer', function ($cq) use ($phone) {
                    $cq->where('phone', 'like', "%{$phone}%");
                });
                $applied = true;
            }
            if ($serial) {
                if ($applied) {
                    $q->orWhere('serial_number', 'like', "%{$serial}%");
                } else {
                    $q->where('serial_number', 'like', "%{$serial}%");
                    $applied = true;
                }
            }
            if ($customerId) {
                if ($applied) {
                    $q->orWhere('customer_id', $customerId);
                } else {
                    $q->where('customer_id', $customerId);
                    $applied = true;
                }
            }
            if ($orderCode) {
                if ($applied) {
                    $q->orWhere('order_code', 'like', "%{$orderCode}%");
                } else {
                    $q->where('order_code', 'like', "%{$orderCode}%");
                }
            }
        });

        $orders = $ordersQuery->latest('id')->get();

        $customer = null;
        if ($orders->isNotEmpty()) {
            $customer = $orders->first()->customer;
        } elseif ($phone) {
            $customer = Customer::where('phone', 'like', "%{$phone}%")->first();
        }

        $formattedOrders = $orders->map(function ($order) {
            $partsSummary = $order->parts_used_summary;
            if (empty($partsSummary) && ! empty($order->parts_needed)) {
                $partsSummary = is_array($order->parts_needed) ? implode(', ', $order->parts_needed) : (string) $order->parts_needed;
            }

            $latestQc = $order->qcInspections->sortByDesc('id')->first();
            $qcResult = $latestQc ? [
                'result'     => $latestQc->result,
                'notes'      => $latestQc->notes,
                'passed'     => $latestQc->result === 'pass',
                'inspector'  => $order->qcInspector?->name,
                'checked_at' => $latestQc->created_at?->toIso8601String(),
            ] : [
                'result'     => $order->qc_passed_at ? 'pass' : null,
                'notes'      => $order->qc_note,
                'passed'     => (bool) $order->qc_passed_at,
                'inspector'  => $order->qcInspector?->name,
                'checked_at' => $order->qc_passed_at?->toIso8601String(),
            ];

            return [
                'id'                    => $order->id,
                'order_code'            => $order->order_code,
                'status'                => $order->status,
                'order_type'            => $order->order_type,
                'serial_number'         => $order->serial_number,
                'device_model_name'     => $order->deviceModel?->name,
                'device_model_id'       => $order->device_model_id,
                'created_at'            => $order->created_at?->toIso8601String(),
                'handed_over_at'        => $order->handed_over_at?->toIso8601String(),
                'total_price'           => (float) $order->total_price,
                'total_price_formatted' => number_format((float) $order->total_price, 0, ',', '.') . ' ₫',
                'issue_description'     => $order->issue_description,
                'appearance_notes'      => $order->appearance_notes,
                'repair_note'           => $order->repair_note,
                'technician_name'       => $order->technician?->name ?? 'Chưa phân công',
                'technician_id'         => $order->technician_id,
                'parts_used_summary'    => $partsSummary,
                'additional_services'   => $order->additional_services ?? [],
                'warranty_terms_days'   => $order->warranty_terms_days,
                'qc_result'             => $qcResult,
                'branch_name'           => $order->branch?->name,
                'warranties'            => $order->warranties->map(fn($w) => [
                    'id'            => $w->id,
                    'warranty_code' => $w->warranty_code,
                    'status'        => $w->status,
                    'end_date'      => $w->end_date?->toDateString(),
                    'duration_days' => $w->duration_days,
                ]),
            ];
        });

        return $this->success([
            'customer'      => $customer ? [
                'id'    => $customer->id,
                'name'  => $customer->name,
                'phone' => $customer->phone,
                'email' => $customer->email,
            ] : null,
            'total_repairs' => $formattedOrders->count(),
            'orders'        => $formattedOrders,
        ], 'Lấy hồ sơ bệnh án thiết bị thành công.');
    }

    /**
     * Tra cứu sổ bảo hành điện tử theo Mã bảo hành hoặc Số điện thoại.
     */
    public function lookup(Request $request): JsonResponse
    {
        $code = $request->input('code');
        $phone = $request->input('phone');

        if (! $code && ! $phone) {
            return $this->failure('Vui lòng cung cấp mã bảo hành (code) hoặc số điện thoại (phone).', 422);
        }

        $query = Warranty::with(['repairOrder', 'customer', 'deviceModel', 'claims']);

        if ($code) {
            $query->where('warranty_code', $code);
        }

        if ($phone) {
            $query->whereHas('customer', function ($q) use ($phone) {
                $q->where('phone', $phone);
            });
        }

        $results = $query->latest('id')->get();

        if ($results->isEmpty()) {
            return $this->empty('Không tìm thấy thông tin bảo hành phù hợp.');
        }

        // Áp dụng Data Masking nếu tra cứu công khai bằng mã bảo hành mà chưa xác thực số điện thoại
        foreach ($results as $warranty) {
            $isVerified = false;
            if (! empty($phone) && $warranty->customer && ! empty($warranty->customer->phone)) {
                $isVerified = PiiHelper::isPhoneMatching($phone, $warranty->customer->phone);
            }

            if (! $isVerified && $warranty->customer) {
                $warranty->customer->name = PiiHelper::maskName($warranty->customer->name);
                $warranty->customer->phone = PiiHelper::maskPhone($warranty->customer->phone);
                $warranty->customer->makeHidden(['email', 'notes']);
            }
        }

        return $this->success($results, 'Tra cứu thông tin bảo hành thành công.');
    }

    /**
     * Danh sách yêu cầu khiếu nại / tiếp nhận bảo hành.
     */
    public function claims(Request $request): JsonResponse
    {
        $query = WarrantyClaim::with(['warranty.customer', 'warranty.deviceModel', 'reworkOrder', 'receivedByUser:id,name']);

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $claims = $query->latest('id')->paginate($request->input('per_page', 15));

        return $this->success($claims, 'Lấy danh sách yêu cầu bảo hành thành công.');
    }

    /**
     * Tiếp nhận yêu cầu bảo hành phát sinh.
     */
    public function createClaim(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'warranty_id'       => 'required|exists:warranties,id',
            'issue_description' => 'required|string',
            'resolution_mode'   => 'required|in:store_check,send_tech,replace_part,rejected',
            'notes'             => 'nullable|string',
        ]);

        return DB::transaction(function () use ($request, $validated) {
            $warranty = Warranty::findOrFail($validated['warranty_id']);

            if ($warranty->status !== 'active' || Carbon::parse($warranty->end_date)->endOfDay()->isPast()) {
                return $this->failure('Sổ bảo hành đã hết hạn hoặc không còn hiệu lực để tiếp nhận khiếu nại.', 422);
            }

            $date = date('Ym');
            do {
                $rand = str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
                $claimCode = "CLM-{$date}-{$rand}";
            } while (WarrantyClaim::where('claim_code', $claimCode)->exists());

            $claim = WarrantyClaim::create([
                'claim_code'          => $claimCode,
                'warranty_id'         => $warranty->id,
                'issue_description'   => $validated['issue_description'],
                'resolution_mode'     => $validated['resolution_mode'],
                'notes'               => $validated['notes'] ?? null,
                'status'              => 'received',
                'received_by_user_id' => $request->user()->id,
            ]);

            AuditLog::create([
                'user_id'        => $request->user()->id,
                'user_name'      => $request->user()->name,
                'action'         => 'Tiếp nhận bảo hành',
                'auditable_type' => 'WarrantyClaim',
                'auditable_id'   => $claim->id,
                'details'        => "Tiếp nhận khiếu nại {$claimCode} cho sổ bảo hành {$warranty->warranty_code}",
                'ip_address'     => $request->ip(),
            ]);

            return $this->success($claim->load('warranty'), 'Tiếp nhận yêu cầu bảo hành thành công.', 201);
        });
    }
}
