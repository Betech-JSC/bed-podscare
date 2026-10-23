<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\RepairOrder;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use App\Services\WarrantyReworkService;
use App\Support\PhoneHelper;
use App\Support\PiiHelper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class WarrantyController extends Controller
{
    /**
     * Áp dụng lọc cách ly theo Tenant và Chi nhánh trên truy vấn RepairOrder.
     */
    protected function applyOrderTenantAndBranchScope($rq, ?\App\Models\User $user): void
    {
        if (! $user) {
            return;
        }

        if ($user->role !== 'super_admin' && ! empty($user->tenant_id)) {
            $masterTenantId = \App\Models\Scopes\TenantScope::resolveMasterTenantId();
            $isMaster = $masterTenantId && (int) $user->tenant_id === (int) $masterTenantId;
            $rq->where(function ($tq) use ($user, $isMaster) {
                $tq->where('repair_orders.tenant_id', $user->tenant_id);
                if ($isMaster) {
                    $tq->orWhereNull('repair_orders.tenant_id');
                }
            });
        }

        if (! in_array($user->role, ['admin', 'super_admin'], true) && ! empty($user->branch_id)) {
            $rq->where('repair_orders.branch_id', $user->branch_id);
        }
    }

    /**
     * Danh sách sổ bảo hành điện tử.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $baseQuery = Warranty::query()->whereHas('repairOrder', function ($rq) use ($user) {
            $this->applyOrderTenantAndBranchScope($rq, $user);
        });

        $todayDate = now()->startOfDay()->toDateString();
        $expiringLimit = now()->addDays(7)->endOfDay()->toDateTimeString();

        $totalCount = (clone $baseQuery)->count();
        $activeCount = (clone $baseQuery)
            ->where('status', 'active')
            ->where('end_date', '>=', $todayDate)
            ->count();
        $expiringSoonCount = (clone $baseQuery)
            ->where('status', 'active')
            ->where('end_date', '>=', $todayDate)
            ->where('end_date', '<=', $expiringLimit)
            ->count();
        $expiredCount = (clone $baseQuery)
            ->where(function ($q) use ($todayDate) {
                $q->where('status', '!=', 'active')
                  ->orWhere('end_date', '<', $todayDate)
                  ->orWhereNull('end_date');
            })
            ->count();

        $summary = [
            'total'                    => $totalCount,
            'active'                   => $activeCount,
            'expiring_soon'            => $expiringSoonCount,
            'expired'                  => $expiredCount,
            'total_warranties'         => $totalCount,
            'active_count'             => $activeCount,
            'expiring_soon_count'      => $expiringSoonCount,
            'expired_or_revoked_count' => $expiredCount,
        ];

        $query = (clone $baseQuery)->with([
            'repairOrder.technician',
            'repairOrder.qcInspections',
            'repairOrder.branch',
            'customer',
            'deviceModel',
        ]);

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($repairOrderId = $request->input('repair_order_id')) {
            $query->where('repair_order_id', $repairOrderId);
        }

        $phone = PhoneHelper::sanitizeText($request->input('phone') ?: $request->input('customer_phone'));
        if ($phone !== '') {
            $query->whereHas('customer', function ($cq) use ($phone) {
                PhoneHelper::applyPhoneColumnSearch($cq, 'phone', $phone, 'and');
            });
        }

        $serial = PhoneHelper::sanitizeText($request->input('serial_number') ?: $request->input('serial'));
        if ($serial !== '') {
            $query->whereHas('repairOrder', function ($rq) use ($serial) {
                $rq->where('serial_number', 'like', "%{$serial}%");
            });
        }

        $rawSearch = $request->input('q') ?? $request->input('search');
        $search = PhoneHelper::sanitizeText($rawSearch);
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('warranty_code', 'like', "%{$search}%")
                  ->orWhereHas('repairOrder', function ($rq) use ($search) {
                      $rq->where('serial_number', 'like', "%{$search}%")
                         ->orWhere('order_code', 'like', "%{$search}%");
                  })
                  ->orWhereHas('customer', function ($sq) use ($search) {
                      $sq->where(function ($inner) use ($search) {
                          $inner->where('name', 'like', "%{$search}%");
                          PhoneHelper::applyPhoneColumnSearch($inner, 'phone', $search, 'or');
                      });
                  })
                  ->orWhereHas('deviceModel', function ($dq) use ($search) {
                      $dq->where('name', 'like', "%{$search}%");
                  });
            });
        }

        if ($request->boolean('all') || $request->input('per_page') === 'all') {
            $items = $query->latest('id')->limit(1000)->get();
            $total = $items->count();

            return $this->success([
                'current_page'   => 1,
                'data'           => $items,
                'first_page_url' => $request->fullUrlWithQuery(['page' => 1]),
                'from'           => $total > 0 ? 1 : null,
                'last_page'      => 1,
                'last_page_url'  => $request->fullUrlWithQuery(['page' => 1]),
                'next_page_url'  => null,
                'path'           => $request->url(),
                'per_page'       => max($total, 1),
                'prev_page_url'  => null,
                'to'             => $total > 0 ? $total : null,
                'total'          => $total,
                'summary'        => $summary,
            ], 'Lấy danh sách bảo hành thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $warranties = $query->latest('id')->paginate($perPage);
        $paginated = $warranties->toArray();
        $paginated['summary'] = $summary;

        return $this->success($paginated, 'Lấy danh sách bảo hành thành công.');
    }

    /**
     * Lịch sử sửa chữa và hồ sơ bệnh án thiết bị theo SĐT khách hàng hoặc Serial máy.
     */
    public function history(Request $request): JsonResponse
    {
        $phone = PhoneHelper::sanitizeText($request->input('phone') ?: $request->input('customer_phone'));
        $serial = PhoneHelper::sanitizeText($request->input('serial_number') ?: $request->input('serial'));
        $customerId = $request->input('customer_id');
        $orderCode = PhoneHelper::sanitizeText($request->input('order_code'));

        if ($phone === '' && $serial === '' && ! $customerId && $orderCode === '') {
            return $this->failure('Vui lòng cung cấp Số điện thoại (phone), Số Serial (serial_number) hoặc mã đơn (order_code) để tra cứu hồ sơ bệnh án.', 422);
        }

        $user = $request->user();
        $ordersQuery = RepairOrder::with([
            'customer:id,name,phone,email',
            'deviceModel:id,name',
            'technician:id,name,phone,email',
            'qcInspector:id,name',
            'handedOverByUser:id,name',
            'qcInspections:id,repair_order_id,result,notes,created_at',
            'branch:id,name,address',
            'warranties:id,repair_order_id,warranty_code,status,end_date,duration_days',
        ]);

        $this->applyOrderTenantAndBranchScope($ordersQuery, $user);

        $ordersQuery->where(function ($q) use ($phone, $serial, $customerId, $orderCode) {
            $applied = false;
            if ($phone !== '') {
                $q->whereHas('customer', function ($cq) use ($phone) {
                    PhoneHelper::applyPhoneColumnSearch($cq, 'phone', $phone, 'and');
                });
                $applied = true;
            }
            if ($serial !== '') {
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
            if ($orderCode !== '') {
                if ($applied) {
                    $q->orWhere('order_code', 'like', "%{$orderCode}%");
                } else {
                    $q->where('order_code', 'like', "%{$orderCode}%");
                }
            }
        });

        $limit = min(max((int) $request->input('limit', 200), 1), 500);
        $orders = $ordersQuery->latest('id')->limit($limit)->get();

        $customer = null;
        if ($orders->isNotEmpty()) {
            $customer = $orders->first()->customer;
        } elseif ($phone !== '' && (! $user || in_array($user->role, ['admin', 'super_admin'], true))) {
            $customer = Customer::where(function ($cq) use ($phone) {
                PhoneHelper::applyPhoneColumnSearch($cq, 'phone', $phone, 'and');
            })->first();
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
        $code = PhoneHelper::sanitizeText($request->input('code'));
        $phone = PhoneHelper::sanitizeText($request->input('phone') ?? $request->input('q'));

        if ($code === '' && $phone === '') {
            return $this->failure('Vui lòng cung cấp mã bảo hành (code) hoặc số điện thoại (phone).', 422);
        }

        $user = $request->user('sanctum') ?? $request->user();
        $query = Warranty::with(['repairOrder', 'customer', 'deviceModel', 'claims']);

        if ($user) {
            $query->whereHas('repairOrder', function ($rq) use ($user) {
                $this->applyOrderTenantAndBranchScope($rq, $user);
            });
        }

        $codeTokens = $code !== '' ? PhoneHelper::extractSearchTokens($code) : null;

        if ($code !== '' && $phone !== '') {
            $query->where(function ($q) use ($code) {
                $q->where('warranty_code', $code)
                  ->orWhere('warranty_code', 'like', "%{$code}%")
                  ->orWhereHas('repairOrder', fn ($rq) => $rq->withoutGlobalScopes()->where('order_code', 'like', "%{$code}%"));
            });
            $query->whereHas('customer', function ($q) use ($phone) {
                $q->withoutGlobalScopes();
                PhoneHelper::applyPhoneColumnSearch($q, 'phone', $phone, 'and');
            });
        } elseif ($code !== '') {
            $query->where(function ($q) use ($code, $codeTokens) {
                $q->where('warranty_code', $code)
                  ->orWhere('warranty_code', 'like', "%{$code}%")
                  ->orWhereHas('repairOrder', fn ($rq) => $rq->withoutGlobalScopes()->where('order_code', 'like', "%{$code}%"));

                if ($codeTokens && $codeTokens['isPhoneLike']) {
                    $q->orWhereHas('customer', function ($cq) use ($code) {
                        $cq->withoutGlobalScopes();
                        PhoneHelper::applyPhoneColumnSearch($cq, 'phone', $code, 'and');
                    });
                }
            });
        } elseif ($phone !== '') {
            $phoneTokens = PhoneHelper::extractSearchTokens($phone);
            $query->where(function ($q) use ($phone, $phoneTokens) {
                $q->whereHas('customer', function ($cq) use ($phone) {
                    $cq->withoutGlobalScopes();
                    PhoneHelper::applyPhoneColumnSearch($cq, 'phone', $phone, 'and');
                });
                if (! $phoneTokens['isPhoneLike']) {
                    $q->orWhere('warranty_code', 'like', "%{$phone}%")
                      ->orWhereHas('repairOrder', fn ($rq) => $rq->withoutGlobalScopes()->where('order_code', 'like', "%{$phone}%"));
                }
            });
        }

        $limit = min(max((int) $request->input('limit', 200), 1), 500);
        $results = $query->latest('id')->limit($limit)->get();

        if ($results->isEmpty()) {
            return $this->empty('Không tìm thấy thông tin bảo hành phù hợp.');
        }

        // Chỉ mở khóa PII khi cung cấp đồng thời cả code và phone khớp nhau, hoặc khi nhân sự đăng nhập đúng Tenant
        foreach ($results as $warranty) {
            $isVerified = false;

            if ($user) {
                $isVerified = true;
            } elseif ($code !== '' && $phone !== '' && $warranty->customer && ! empty($warranty->customer->phone)) {
                $isVerified = PiiHelper::isPhoneMatching($phone, $warranty->customer->phone);
            }

            if (! $isVerified) {
                if ($warranty->customer) {
                    $warranty->customer->name = PiiHelper::maskName($warranty->customer->name);
                    $warranty->customer->phone = PiiHelper::maskPhone($warranty->customer->phone);
                    $warranty->customer->makeHidden(['email', 'notes', 'address']);
                }
                if ($warranty->repairOrder) {
                    $warranty->repairOrder->makeHidden([
                        'shipping_address',
                        'repair_note',
                        'test_note',
                        'parts_needed',
                        'special_parts_needed',
                        'qc_note',
                        'price_note',
                        'initial_price',
                        'total_price',
                        'estimated_price',
                    ]);
                }
            } elseif (! $user && $warranty->repairOrder) {
                // Ngay cả khi đã xác thực SĐT công khai, vẫn ẩn các ghi chú kỹ thuật nội bộ của xưởng
                $warranty->repairOrder->makeHidden([
                    'test_note',
                    'parts_needed',
                    'special_parts_needed',
                    'qc_note',
                ]);
            }
        }

        return $this->success($results, 'Tra cứu thông tin bảo hành thành công.');
    }

    /**
     * Danh sách yêu cầu khiếu nại / tiếp nhận bảo hành.
     */
    public function claims(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = WarrantyClaim::with([
            'warranty.customer',
            'warranty.deviceModel',
            'warranty.repairOrder',
            'reworkOrder',
            'receivedByUser:id,name',
        ])->whereHas('warranty.repairOrder', function ($rq) use ($user) {
            $this->applyOrderTenantAndBranchScope($rq, $user);
        });

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $rawSearch = $request->input('q') ?? $request->input('search');
        $search = PhoneHelper::sanitizeText($rawSearch);
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('claim_code', 'like', "%{$search}%")
                  ->orWhere('issue_description', 'like', "%{$search}%")
                  ->orWhereHas('reworkOrder', function ($roq) use ($search) {
                      $roq->where('order_code', 'like', "%{$search}%")
                          ->orWhere('serial_number', 'like', "%{$search}%");
                  })
                  ->orWhereHas('warranty', function ($wq) use ($search) {
                      $wq->where('warranty_code', 'like', "%{$search}%")
                         ->orWhereHas('repairOrder', function ($rq) use ($search) {
                             $rq->where('serial_number', 'like', "%{$search}%")
                                ->orWhere('order_code', 'like', "%{$search}%");
                         })
                         ->orWhereHas('deviceModel', function ($dq) use ($search) {
                             $dq->where('name', 'like', "%{$search}%");
                         })
                         ->orWhereHas('customer', function ($cq) use ($search) {
                             $cq->where(function ($inner) use ($search) {
                                 $inner->where('name', 'like', "%{$search}%");
                                 PhoneHelper::applyPhoneColumnSearch($inner, 'phone', $search, 'or');
                             });
                         });
                  });
            });
        }

        if ($request->boolean('all') || $request->input('per_page') === 'all') {
            $items = $query->latest('id')->limit(1000)->get();
            $total = $items->count();

            return $this->success([
                'current_page'   => 1,
                'data'           => $items,
                'first_page_url' => $request->fullUrlWithQuery(['page' => 1]),
                'from'           => $total > 0 ? 1 : null,
                'last_page'      => 1,
                'last_page_url'  => $request->fullUrlWithQuery(['page' => 1]),
                'next_page_url'  => null,
                'path'           => $request->url(),
                'per_page'       => max($total, 1),
                'prev_page_url'  => null,
                'to'             => $total > 0 ? $total : null,
                'total'          => $total,
            ], 'Lấy danh sách yêu cầu bảo hành thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $claims = $query->latest('id')->paginate($perPage);

        return $this->success($claims, 'Lấy danh sách yêu cầu bảo hành thành công.');
    }

    /**
     * Kiểm tra quyền truy cập sổ bảo hành / khiếu nại theo phạm vi Tenant và Chi nhánh của đơn sửa chữa.
     */
    protected function authorizeWarrantyOrderScope(?RepairOrder $repairOrder, ?\App\Models\User $user, string $actionMessage = 'thao tác bảo hành'): void
    {
        if (! $user) {
            return;
        }

        if ($user->role !== 'super_admin' && ! empty($user->tenant_id)) {
            $masterTenantId = \App\Models\Scopes\TenantScope::resolveMasterTenantId();
            $isMaster = $masterTenantId && (int) $user->tenant_id === (int) $masterTenantId;
            $orderTenantId = $repairOrder?->tenant_id;
            if (! $repairOrder || ($orderTenantId !== null && (int) $orderTenantId !== (int) $user->tenant_id) || ($orderTenantId === null && ! $isMaster)) {
                abort(403, "Bạn không có quyền {$actionMessage} cho đơn hàng của cửa hàng khác.");
            }
        }

        if (! in_array($user->role, ['admin', 'super_admin'], true) && ! empty($user->branch_id)) {
            if (! $repairOrder || (int) $repairOrder->branch_id !== (int) $user->branch_id) {
                abort(403, "Bạn không có quyền {$actionMessage} cho đơn hàng của chi nhánh khác.");
            }
        }
    }

    /**
     * Tiếp nhận yêu cầu bảo hành phát sinh.
     */
    public function createClaim(Request $request, WarrantyReworkService $reworkService): JsonResponse
    {
        $validated = $request->validate([
            'warranty_id'       => 'required|exists:warranties,id',
            'issue_description' => 'required|string',
            'resolution_mode'   => 'required|in:store_check,send_tech,replace_part,rejected',
            'notes'             => 'nullable|string',
        ]);

        $user = $request->user();

        return DB::transaction(function () use ($request, $validated, $reworkService, $user) {
            $warranty = Warranty::with('repairOrder')->lockForUpdate()->findOrFail($validated['warranty_id']);
            $repairOrder = $warranty->repairOrder ?? RepairOrder::withoutGlobalScopes()->find($warranty->repair_order_id);

            $this->authorizeWarrantyOrderScope($repairOrder, $user, 'tiếp nhận bảo hành');

            if ($warranty->status === 'revoked') {
                return $this->failure('Sổ bảo hành đã bị thu hồi do đơn hàng đã được hoàn tiền, không thể tiếp nhận khiếu nại.', 422);
            }

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

            // Tự động kích hoạt đơn rework nếu resolution_mode là send_tech, replace_part, store_check
            if (in_array($validated['resolution_mode'], ['send_tech', 'replace_part', 'store_check'], true)) {
                $reworkService->createReworkOrderFromClaim($claim, $request->user());
            }

            AuditLog::create([
                'user_id'        => $request->user()->id,
                'user_name'      => $request->user()->name,
                'action'         => 'Tiếp nhận bảo hành',
                'auditable_type' => 'WarrantyClaim',
                'auditable_id'   => $claim->id,
                'details'        => "Tiếp nhận khiếu nại {$claimCode} cho sổ bảo hành {$warranty->warranty_code}",
                'ip_address'     => $request->ip(),
            ]);

            return $this->success($claim->fresh(['warranty', 'reworkOrder']), 'Tiếp nhận yêu cầu bảo hành thành công.', 201);
        });
    }

    /**
     * Cập nhật trạng thái / hướng xử lý yêu cầu khiếu nại bảo hành.
     */
    public function updateClaim(Request $request, int|string $id): JsonResponse
    {
        $validated = $request->validate([
            'status'          => 'sometimes|required|in:received,in_progress,resolved,completed,rejected',
            'resolution_mode' => 'sometimes|required|in:store_check,send_tech,replace_part,rejected,rework',
            'notes'           => 'nullable|string',
        ]);

        $user = $request->user();

        return DB::transaction(function () use ($request, $validated, $id, $user) {
            $claim = WarrantyClaim::with(['warranty.repairOrder', 'reworkOrder'])->lockForUpdate()->find($id);
            if (! $claim || ! $claim->warranty) {
                return $this->failure('Không tìm thấy yêu cầu bảo hành.', 404);
            }

            $repairOrder = $claim->warranty->repairOrder
                ?? RepairOrder::withoutGlobalScopes()->find($claim->warranty->repair_order_id);

            $this->authorizeWarrantyOrderScope($repairOrder, $user, 'cập nhật khiếu nại bảo hành');

            $claim->fill($validated);
            $claim->save();

            if ($user) {
                AuditLog::create([
                    'user_id'        => $user->id,
                    'user_name'      => $user->name,
                    'action'         => 'Cập nhật khiếu nại bảo hành',
                    'auditable_type' => 'WarrantyClaim',
                    'auditable_id'   => $claim->id,
                    'details'        => "Cập nhật khiếu nại {$claim->claim_code}",
                    'ip_address'     => $request->ip(),
                ]);
            }

            return $this->success($claim->fresh(['warranty', 'reworkOrder']), 'Cập nhật yêu cầu bảo hành thành công.');
        });
    }

    /**
     * Thu hồi sổ bảo hành điện tử.
     */
    public function revoke(Request $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! in_array($user->role, ['admin', 'super_admin'], true)) {
            return $this->failure('Chỉ quản trị viên (Admin) mới có quyền thu hồi sổ bảo hành.', 403);
        }

        $validated = $request->validate([
            'reason'         => 'nullable|string|max:255',
            'revoked_reason' => 'nullable|string|max:255',
        ]);

        return DB::transaction(function () use ($request, $validated, $id, $user) {
            $warranty = Warranty::with('repairOrder')->lockForUpdate()->find($id);
            if (! $warranty) {
                return $this->failure('Không tìm thấy thông tin bảo hành.', 404);
            }

            $repairOrder = $warranty->repairOrder
                ?? RepairOrder::withoutGlobalScopes()->find($warranty->repair_order_id);

            $this->authorizeWarrantyOrderScope($repairOrder, $user, 'thu hồi sổ bảo hành');

            $reason = $validated['revoked_reason'] ?? $validated['reason'] ?? 'Thu hồi sổ bảo hành theo yêu cầu quản trị';

            $warranty->update([
                'status'         => 'revoked',
                'revoked_at'     => now(),
                'revoked_reason' => $reason,
            ]);

            if ($user) {
                AuditLog::create([
                    'user_id'        => $user->id,
                    'user_name'      => $user->name,
                    'action'         => 'Thu hồi sổ bảo hành',
                    'auditable_type' => 'Warranty',
                    'auditable_id'   => $warranty->id,
                    'details'        => "Thu hồi sổ bảo hành {$warranty->warranty_code}: {$reason}",
                    'ip_address'     => $request->ip(),
                ]);
            }

            return $this->success($warranty->fresh(['repairOrder', 'customer', 'deviceModel']), 'Thu hồi sổ bảo hành thành công.');
        });
    }
}
