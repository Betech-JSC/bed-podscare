<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\OrderOperationalEvent;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\IntakeChecklist;
use App\Models\IntakePhoto;
use App\Models\Notification;
use App\Models\QcInspection;
use App\Models\RepairOrder;
use App\Models\User;
use App\Models\Warranty;
use App\Services\OrderCodeService;
use App\Services\OrderWorkflowService;
use App\Support\PhoneHelper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class OrderController extends Controller
{
    public function __construct(
        protected OrderWorkflowService $workflowService,
        protected ?OrderCodeService $orderCodeService = null
    ) {
        $this->orderCodeService = $orderCodeService ?? app(OrderCodeService::class);
    }
    /**
     * Danh sách đơn sửa chữa với bộ lọc.
     */
    public function index(Request $request): JsonResponse
    {
        $query = RepairOrder::with([
            'customer',
            'deviceModel',
            'branch',
            'technician',
            'qcInspector',
            'createdByUser:id,name,role',
            'tenant:id,name,code,logo_url,hotline,receipt_footer_note',
            'payments',
        ]);

        $status = $request->input('status');
        $statusesInput = $request->input('statuses');
        $filter = $request->input('filter');

        $rawMultiStatuses = $statusesInput ?? ((is_array($status) || (is_string($status) && str_contains($status, ','))) ? $status : null);
        $multiStatusList = [];
        if ($rawMultiStatuses !== null) {
            $parsedList = is_array($rawMultiStatuses)
                ? $rawMultiStatuses
                : array_map('trim', explode(',', (string) $rawMultiStatuses));
            $multiStatusList = array_values(array_filter($parsedList, fn ($s) => is_string($s) && $s !== ''));
        }

        $singleStatus = ($rawMultiStatuses === null && is_string($status)) ? trim($status) : null;

        $user = $request->user();
        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true)) {
            $query->where('branch_id', $user->branch_id);
        } elseif ($branchId = $request->input('branch_id')) {
            if ($branchId !== 'all') {
                $query->where('branch_id', $branchId);
            }
        }

        if ($techId = $request->input('technician_id')) {
            if ($techId === 'unassigned') {
                $query->whereNull('technician_id');
            } else {
                $query->where('technician_id', (int) $techId);
            }
        }

        if ($batchCode = $request->input('intake_batch_code')) {
            $query->where('intake_batch_code', $batchCode);
        }

        if ($request->boolean('unpaid_only') || $request->input('payment_status') === 'unpaid') {
            $query->whereDoesntHave('payments', function ($pq) {
                $pq->whereIn('status', ['paid', 'completed']);
            });
        }

        $rawSearch = $request->input('q') ?? $request->input('search');
        $search = PhoneHelper::sanitizeText($rawSearch);

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('order_code', 'like', "%{$search}%")
                  ->orWhere('serial_number', 'like', "%{$search}%")
                  ->orWhere('issue_description', 'like', "%{$search}%")
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

        // Xử lý bộ lọc thời gian và phân quyền phạm vi lịch sử (Shift Scope & RBAC)
        $tz = 'Asia/Ho_Chi_Minh';
        $dateFilter = (string) $request->input('date_filter', 'today');
        $dateType = (string) $request->input('date_type', 'created_at');
        $isCompletedDate = in_array($dateType, ['completed_at', 'handed_over_at'], true);
        $isTechnician = $user && $user->role === 'technician';

        $filterDateRange = function ($q, $start, $end) use ($isCompletedDate) {
            if ($isCompletedDate) {
                $q->where(function ($sq) use ($start, $end) {
                    $sq->whereBetween('handed_over_at', [$start, $end])
                       ->orWhere(function ($sub) use ($start, $end) {
                           $sub->whereNull('handed_over_at')
                               ->whereBetween('updated_at', [$start, $end]);
                       });
                });
            } else {
                $q->whereBetween('created_at', [$start, $end]);
            }
        };

        $filterDateFrom = function ($q, $start) use ($isCompletedDate) {
            if ($isCompletedDate) {
                $q->where(function ($sq) use ($start) {
                    $sq->where('handed_over_at', '>=', $start)
                       ->orWhere(function ($sub) use ($start) {
                           $sub->whereNull('handed_over_at')
                               ->where('updated_at', '>=', $start);
                       });
                });
            } else {
                $q->where('created_at', '>=', $start);
            }
        };

        $filterDateTo = function ($q, $end) use ($isCompletedDate) {
            if ($isCompletedDate) {
                $q->where(function ($sq) use ($end) {
                    $sq->where('handed_over_at', '<=', $end)
                       ->orWhere(function ($sub) use ($end) {
                           $sub->whereNull('handed_over_at')
                               ->where('updated_at', '<=', $end);
                       });
                });
            } else {
                $q->where('created_at', '<=', $end);
            }
        };

        // Nếu có date cụ thể (YYYY-MM-DD), ưu tiên lọc theo ngày đó thay vì preset
        $specificDate = $request->input('date') ?? $request->input('exact_date');
        $hasSpecificDate = false;

        if ($specificDate && is_string($specificDate) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $specificDate)) {
            try {
                $parsed = Carbon::createFromFormat('Y-m-d', $specificDate, $tz);
                if ($parsed && $parsed->format('Y-m-d') === $specificDate) {
                    $dayStart = $parsed->copy()->startOfDay();
                    $dayEnd = $parsed->copy()->endOfDay();
                    $filterDateRange($query, $dayStart, $dayEnd);
                    $hasSpecificDate = true;
                }
            } catch (\Throwable $e) {
                $hasSpecificDate = false;
            }
        }

        // Hỗ trợ lọc theo khoảng từ ngày - đến ngày (from_date / to_date)
        $fromDate = $request->input('from_date');
        $toDate = $request->input('to_date');
        $hasDateRange = false;

        if (! $hasSpecificDate) {
            if ($fromDate && is_string($fromDate) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fromDate)) {
                try {
                    $parsedFrom = Carbon::createFromFormat('Y-m-d', $fromDate, $tz);
                    if ($parsedFrom && $parsedFrom->format('Y-m-d') === $fromDate) {
                        $filterDateFrom($query, $parsedFrom->copy()->startOfDay());
                        $hasDateRange = true;
                    }
                } catch (\Throwable $e) {
                }
            }

            if ($toDate && is_string($toDate) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $toDate)) {
                try {
                    $parsedTo = Carbon::createFromFormat('Y-m-d', $toDate, $tz);
                    if ($parsedTo && $parsedTo->format('Y-m-d') === $toDate) {
                        $filterDateTo($query, $parsedTo->copy()->endOfDay());
                        $hasDateRange = true;
                    }
                } catch (\Throwable $e) {
                }
            }
        }

        if (! $hasSpecificDate && ! $hasDateRange) {
            $isQcQueueFilter = in_array($singleStatus, ['waiting_qc', 'qc_pending', 'qc_inspecting'], true)
                || in_array($filter, ['waiting_qc', 'qc_pending', 'qc_inspecting'], true)
                || count(array_intersect($multiStatusList, ['waiting_qc', 'qc_pending', 'qc_inspecting'])) > 0;

            $hasSpecialPartsFilter = $request->has('special_parts_status')
                || $request->boolean('special_parts')
                || $request->input('special_parts') === 'true'
                || $isQcQueueFilter
                || ! empty($multiStatusList)
                || $request->boolean('unpaid_only')
                || $request->boolean('quote_candidates')
                || $request->input('payment_status') === 'unpaid'
                || in_array($singleStatus, ['special_parts', 'open', 'in_workshop', 'waiting_pickup', 'ready_for_return', 'waiting_parts', 'overdue', 'waiting_approval', 'quote_pending', 'quote_candidates'], true)
                || in_array($filter, ['open', 'in_workshop', 'waiting_pickup', 'ready_for_return', 'waiting_parts', 'overdue', 'waiting_approval', 'quote_pending', 'quote_candidates'], true);

            if ($search !== '' && ($dateFilter === 'today' || ! $request->filled('date_filter'))) {
                $dateFilter = 'all';
            } elseif ($hasSpecialPartsFilter && ! $request->has('date_filter')) {
                $dateFilter = 'all';
            } elseif ($isTechnician) {
                if ($search === '' && (in_array($dateFilter, ['all', '30_days'], true) || ! in_array($dateFilter, ['today', '3_days', 'yesterday', '7_days'], true))) {
                    $dateFilter = '7_days';
                }
            } else {
                if (! in_array($dateFilter, ['today', '3_days', 'yesterday', '7_days', '30_days', 'all'], true)) {
                    $dateFilter = 'today';
                }
            }

            if ($dateFilter === 'today') {
                $todayStart = Carbon::today($tz)->startOfDay();
                $todayEnd = Carbon::today($tz)->endOfDay();
                if ($isTechnician && ! $isCompletedDate) {
                    // KTV xem ca hôm nay: Bao gồm các đơn hôm nay HOẶC các đơn dở dang từ 7 ngày gần nhất (hôm nay và 6 ngày trước)
                    $sevenDaysAgoStart = Carbon::today($tz)->subDays(6)->startOfDay();
                    $query->where(function ($q) use ($todayStart, $todayEnd, $sevenDaysAgoStart) {
                        $q->whereBetween('created_at', [$todayStart, $todayEnd])
                          ->orWhere(function ($sub) use ($sevenDaysAgoStart) {
                              $sub->where('created_at', '>=', $sevenDaysAgoStart)
                                  ->whereNotIn('status', ['completed', 'cancelled', 'rejected']);
                          });
                    });
                } else {
                    $filterDateRange($query, $todayStart, $todayEnd);
                }
            } elseif ($dateFilter === 'yesterday') {
                $yesterdayStart = Carbon::yesterday($tz)->startOfDay();
                $yesterdayEnd = Carbon::yesterday($tz)->endOfDay();
                $filterDateRange($query, $yesterdayStart, $yesterdayEnd);
            } elseif ($dateFilter === '3_days') {
                $filterDateFrom($query, Carbon::today($tz)->subDays(2)->startOfDay());
            } elseif ($dateFilter === '7_days') {
                $filterDateFrom($query, Carbon::today($tz)->subDays(6)->startOfDay());
            } elseif ($dateFilter === '30_days') {
                $filterDateFrom($query, Carbon::now($tz)->subDays(30)->startOfDay());
            } elseif ($dateFilter === 'all') {
                if ($isTechnician && ! $isCompletedDate && ! $isQcQueueFilter && $search === '') {
                    $query->where('created_at', '>=', Carbon::today($tz)->subDays(6)->startOfDay());
                }
            }
        }

        // Bản sao truy vấn trước khi lọc theo status và order_type để tính thống kê đối chiếu trạng thái toàn cục
        $baseSummaryQuery = clone $query;

        if ($filter === 'overdue' || $singleStatus === 'overdue') {
            $query->whereNotIn('status', ['completed', 'cancelled', 'rejected', 'ready_for_return', 'waiting_pickup'])
                  ->where('created_at', '<=', Carbon::now('Asia/Ho_Chi_Minh')->subHours(24));
        }

        if (! empty($multiStatusList)) {
            $expandedStatuses = [];
            $includeSpecialPartsPending = false;

            foreach ($multiStatusList as $st) {
                $norm = $this->normalizeStatus($st);
                if ($norm === 'waiting_qc') {
                    array_push($expandedStatuses, 'waiting_qc', 'qc_pending', 'qc_inspecting');
                } elseif ($norm === 'waiting_approval') {
                    array_push($expandedStatuses, 'waiting_approval', 'quote_pending');
                } elseif (in_array($norm, ['waiting_pickup', 'ready_for_return'], true)) {
                    array_push($expandedStatuses, 'waiting_pickup', 'ready_for_return');
                } elseif ($norm === 'received') {
                    array_push($expandedStatuses, 'received', 'new', 'pending');
                } elseif ($norm === 'quote_candidates') {
                    array_push($expandedStatuses, 'waiting_approval', 'quote_pending', 'inspecting', 'received', 'new', 'pending');
                } else {
                    $expandedStatuses[] = $st;
                    if ($norm && $norm !== $st) {
                        $expandedStatuses[] = $norm;
                    }
                }

                if ($st === 'waiting_parts') {
                    $includeSpecialPartsPending = true;
                }
            }

            $expandedStatuses = array_values(array_unique($expandedStatuses));

            if ($includeSpecialPartsPending) {
                $query->where(function ($q) use ($expandedStatuses) {
                    $q->whereIn('status', $expandedStatuses)
                      ->orWhere(function ($sq) {
                          $sq->where('special_parts_status', 'pending')
                             ->whereNotIn('status', ['completed', 'cancelled', 'rejected']);
                      });
                });
            } else {
                $query->whereIn('status', $expandedStatuses);
            }
        } elseif ($singleStatus && ! in_array($singleStatus, ['overdue', 'special_parts', 'all'], true)) {
            if ($singleStatus === 'open') {
                $query->whereNotIn('status', ['completed', 'cancelled', 'rejected']);
            } elseif ($singleStatus === 'in_workshop') {
                $query->whereNotIn('status', ['completed', 'cancelled', 'rejected', 'ready_for_return', 'waiting_pickup']);
            } elseif (in_array($singleStatus, ['waiting_pickup', 'ready_for_return'], true)) {
                $query->whereIn('status', ['waiting_pickup', 'ready_for_return']);
            } elseif ($singleStatus === 'waiting_parts') {
                $query->where(function ($q) {
                    $q->where('status', 'waiting_parts')
                      ->orWhere('special_parts_status', 'pending');
                })->whereNotIn('status', ['completed', 'cancelled', 'rejected']);
            } elseif ($singleStatus === 'quote_candidates') {
                $query->whereIn('status', ['waiting_approval', 'quote_pending', 'inspecting', 'received', 'new', 'pending']);
            } else {
                $normalized = $this->normalizeStatus($singleStatus);
                if ($normalized === 'waiting_qc') {
                    $query->whereIn('status', ['waiting_qc', 'qc_pending', 'qc_inspecting']);
                } elseif ($normalized === 'waiting_approval') {
                    $query->whereIn('status', ['waiting_approval', 'quote_pending']);
                } elseif ($normalized === 'received') {
                    $query->whereIn('status', ['received', 'new', 'pending']);
                } else {
                    $query->where('status', $singleStatus);
                }
            }
        } elseif ($filter && $filter !== 'overdue') {
            if ($filter === 'open') {
                $query->whereNotIn('status', ['completed', 'cancelled', 'rejected']);
            } elseif ($filter === 'in_workshop') {
                $query->whereNotIn('status', ['completed', 'cancelled', 'rejected', 'ready_for_return', 'waiting_pickup']);
            } elseif (in_array($filter, ['waiting_pickup', 'ready_for_return'], true)) {
                $query->whereIn('status', ['waiting_pickup', 'ready_for_return']);
            } elseif ($filter === 'waiting_parts') {
                $query->where(function ($q) {
                    $q->where('status', 'waiting_parts')
                      ->orWhere('special_parts_status', 'pending');
                })->whereNotIn('status', ['completed', 'cancelled', 'rejected']);
            } elseif ($filter === 'quote_candidates') {
                $query->whereIn('status', ['waiting_approval', 'quote_pending', 'inspecting', 'received', 'new', 'pending']);
            }
        }

        if ($request->boolean('quote_candidates')) {
            $query->whereIn('status', ['waiting_approval', 'quote_pending', 'inspecting', 'received', 'new', 'pending']);
        }

        // Bản sao truy vấn sau khi lọc status nhưng trước khi lọc order_type / special_parts để đếm đúng số lượng từng tab loại đơn
        $typeSummaryQuery = clone $query;

        if ($singleStatus === 'special_parts') {
            $query->specialPartsPending();
        }

        if ($specialPartsStatus = $request->input('special_parts_status')) {
            if ($specialPartsStatus === 'pending') {
                $query->specialPartsPending();
            } elseif ($specialPartsStatus === 'purchased') {
                $query->specialPartsPurchased();
            } elseif ($specialPartsStatus === 'all') {
                $query->whereNotNull('special_parts_status');
            } else {
                $query->where('special_parts_status', $specialPartsStatus);
            }
        } elseif ($request->boolean('special_parts') || $request->input('special_parts') === 'true') {
            $query->specialPartsPending();
        }

        if ($orderType = $request->input('order_type')) {
            if ($orderType === 'special_parts') {
                $query->specialPartsPending();
            } elseif ($orderType !== 'all') {
                $query->where('order_type', $orderType);
            }
        }

        $baseStats = (clone $baseSummaryQuery)->withOnly([])->reorder()->selectRaw("
            COUNT(*) as all_count,
            SUM(CASE WHEN status NOT IN ('completed', 'cancelled', 'rejected') THEN 1 ELSE 0 END) as open_count,
            SUM(CASE WHEN status NOT IN ('completed', 'cancelled', 'rejected', 'ready_for_return', 'waiting_pickup') THEN 1 ELSE 0 END) as in_workshop_count,
            SUM(CASE WHEN status IN ('ready_for_return', 'waiting_pickup') THEN 1 ELSE 0 END) as waiting_pickup_count,
            SUM(CASE WHEN status IN ('waiting_qc', 'qc_pending', 'qc_inspecting') THEN 1 ELSE 0 END) as waiting_qc_count,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
            SUM(CASE WHEN technician_id IS NULL THEN 1 ELSE 0 END) as unassigned_count
        ")->first();

        $typeStats = (clone $typeSummaryQuery)->withOnly([])->reorder()->selectRaw("
            COUNT(*) as total_count,
            SUM(CASE WHEN order_type = 'in_store' OR order_type IS NULL THEN 1 ELSE 0 END) as in_store_count,
            SUM(CASE WHEN order_type = 'cod' THEN 1 ELSE 0 END) as cod_count,
            SUM(CASE WHEN order_type = 'warranty' THEN 1 ELSE 0 END) as warranty_count,
            SUM(CASE WHEN special_parts_status = 'pending' THEN 1 ELSE 0 END) as special_parts_count
        ")->first();

        $summary = [
            'total'                => (int) ($typeStats->total_count ?? 0),
            'in_store_count'       => (int) ($typeStats->in_store_count ?? 0),
            'cod_count'            => (int) ($typeStats->cod_count ?? 0),
            'warranty_count'       => (int) ($typeStats->warranty_count ?? 0),
            'special_parts_count'  => (int) ($typeStats->special_parts_count ?? 0),
            'unassigned_count'     => (int) ($baseStats->unassigned_count ?? 0),
            'all_count'            => (int) ($baseStats->all_count ?? 0),
            'open_count'           => (int) ($baseStats->open_count ?? 0),
            'in_workshop_count'    => (int) ($baseStats->in_workshop_count ?? 0),
            'waiting_pickup_count' => (int) ($baseStats->waiting_pickup_count ?? 0),
            'waiting_qc_count'     => (int) ($baseStats->waiting_qc_count ?? 0),
            'completed_count'      => (int) ($baseStats->completed_count ?? 0),
        ];

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
            ], 'Lấy danh sách đơn sửa chữa thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $orders = $query->latest('id')->paginate($perPage);
        $paginated = $orders->toArray();
        $paginated['summary'] = $summary;

        return $this->success($paginated, 'Lấy danh sách đơn sửa chữa thành công.');
    }

    /**
     * Tạo rule kiểm tra tồn tại theo tenant_id (trừ super_admin).
     */
    protected function tenantExistsRule(string $table, ?User $user): \Illuminate\Validation\Rules\Exists
    {
        $rule = Rule::exists($table, 'id');
        if ($user && $user->role !== 'super_admin') {
            if (empty($user->tenant_id)) {
                $rule->whereRaw('1 = 0');
            } else {
                $tenantId = (int) $user->tenant_id;
                $rule->where(function ($q) use ($tenantId) {
                    $q->where('tenant_id', $tenantId);
                    if ($tenantId === 1) {
                        $q->orWhereNull('tenant_id');
                    }
                });
            }
        }

        return $rule;
    }

    /**
     * Tạo mới đơn sửa chữa tiếp nhận tại quầy.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $user?->loadMissing('tenant');
        $isStaff = $user && ! in_array($user->role, ['admin', 'super_admin'], true);
        $tenant = $user?->tenant;

        if ($tenant) {
            app(\App\Services\QuotaService::class)->checkSubscriptionActive($tenant);
        }

        if ($request->has('customer_name') && is_string($request->input('customer_name'))) {
            $request->merge(['customer_name' => PhoneHelper::sanitizeText($request->input('customer_name'))]);
        }
        if ($request->has('customer_phone') && is_string($request->input('customer_phone'))) {
            $request->merge(['customer_phone' => PhoneHelper::normalizeForStorage($request->input('customer_phone'))]);
        }
        if ($request->has('serial_number') && is_string($request->input('serial_number'))) {
            $request->merge(['serial_number' => PhoneHelper::sanitizeText($request->input('serial_number'))]);
        }

        $rules = [
            'branch_id'             => [($isStaff && $user->branch_id) ? 'nullable' : 'required', $this->tenantExistsRule('branches', $user)],
            'created_by_user_id'    => ['nullable', 'integer'],
            'customer_id'           => ['required_without:customer_phone', 'nullable', $this->tenantExistsRule('customers', $user)],
            'customer_name'         => 'required_with:customer_phone|string|max:255',
            'customer_phone'        => 'nullable|string|max:20',
            'device_model_id'       => 'required|exists:device_models,id',
            'serial_number'         => 'nullable|string|max:100',
            'intake_battery_level'  => 'nullable|string|max:50',
            'accessories'           => 'nullable|string|max:255',
            'issue_description'     => 'required|string',
            'appearance_notes'      => 'nullable|string',
            'test_note'             => 'nullable|string',
            'intake_batch_code'     => 'nullable|string|max:50',
            'estimated_price'       => 'nullable|numeric|min:0',
            'warranty_terms_days'   => 'nullable|integer|min:0',
            'status'                => 'nullable|string',
            'order_type'            => 'nullable|string|in:in_store,cod,warranty',
            'shipping_address'      => 'nullable|string|max:500',
            'checklists'            => 'nullable|array',
            'checklists.*.item_name'=> 'required_with:checklists|string',
            'checklists.*.status'   => 'required_with:checklists|in:pass,fail,not_tested',
            'checklists.*.note'     => 'nullable|string',
        ];

        $validated = $request->validate($rules);
        $validated['estimated_price'] = RepairOrder::normalizeVndAmount($validated['estimated_price'] ?? 0);

        if ($isStaff && $user->branch_id) {
            $validated['branch_id'] = $user->branch_id;
        }

        $cskhUserId = $validated['created_by_user_id'] ?? null;
        if ($cskhUserId) {
            $validUser = User::where('id', $cskhUserId)
                ->where('tenant_id', $user->tenant_id)
                ->first();
            if (! $validUser) {
                return $this->failure('Nhân viên tiếp nhận không hợp lệ hoặc không thuộc cửa hàng.', 422, [
                    'created_by_user_id' => ['Nhân viên tiếp nhận không hợp lệ hoặc không thuộc cửa hàng.'],
                ]);
            }
            $creatorId = $validUser->id;
        } else {
            $creatorId = $user->id;
        }

        return DB::transaction(function () use ($request, $validated, $creatorId, $tenant) {
            if ($tenant) {
                $quotaService = app(\App\Services\QuotaService::class);
                $quotaService->checkSubscriptionActive($tenant);
                $quotaService->checkOrderQuota($tenant);
            }

            // 1. Tìm hoặc tạo khách hàng
            $customerId = $validated['customer_id'] ?? null;
            if (! $customerId && ! empty($validated['customer_phone'])) {
                $normalizedPhone = PhoneHelper::normalizeForStorage($validated['customer_phone']);
                $cleanName = PhoneHelper::sanitizeText($validated['customer_name'] ?? '') ?: 'Khách lẻ';

                $customer = Customer::where(function ($q) use ($normalizedPhone) {
                    $q->where('phone', $normalizedPhone);
                    PhoneHelper::applyPhoneColumnSearch($q, 'phone', $normalizedPhone, 'or');
                })->first();

                if ($customer) {
                    if ($customer->phone !== $normalizedPhone) {
                        $existsOther = Customer::where('phone', $normalizedPhone)
                            ->where('id', '!=', $customer->id)
                            ->exists();
                        if (! $existsOther) {
                            $customer->update(['phone' => $normalizedPhone]);
                        }
                    }
                } else {
                    $customer = Customer::create([
                        'phone' => $normalizedPhone,
                        'name'  => $cleanName,
                    ]);
                }
                $customerId = $customer->id;
            }

            // 2. Tự động sinh mã đơn định danh PC{branch_code}{DDMMYY}{STT} theo chi nhánh và ngày
            $orderCode = $this->orderCodeService->generate((int) $validated['branch_id']);

            // 3. Tạo RepairOrder: mặc định trạng thái waiting_tech để KTV nhận đơn tức thì
            $initialStatus = $validated['status'] ?? 'waiting_tech';

            $order = RepairOrder::create([
                'order_code'            => $orderCode,
                'intake_batch_code'     => $validated['intake_batch_code'] ?? null,
                'branch_id'             => $validated['branch_id'],
                'customer_id'           => $customerId,
                'device_model_id'       => $validated['device_model_id'],
                'serial_number'         => $validated['serial_number'] ?? null,
                'intake_battery_level'  => $validated['intake_battery_level'] ?? null,
                'accessories'           => $validated['accessories'] ?? null,
                'issue_description'     => $validated['issue_description'],
                'appearance_notes'      => $validated['appearance_notes'] ?? null,
                'test_note'             => $validated['test_note'] ?? null,
                'status'                => $initialStatus,
                'order_type'            => $validated['order_type'] ?? 'in_store',
                'shipping_address'      => $validated['shipping_address'] ?? null,
                'customer_approved_at'  => $initialStatus === 'waiting_tech' ? now() : null,
                'initial_price'         => $validated['estimated_price'] ?? 0.00,
                'total_price'           => $validated['estimated_price'] ?? 0.00,
                'warranty_terms_days'   => $validated['warranty_terms_days'] ?? 90,
                'created_by_user_id'    => $creatorId,
            ]);

            // 4. Lưu checklists nếu có
            if (! empty($validated['checklists'])) {
                $now = now();
                $intakeRows = [];
                foreach ($validated['checklists'] as $item) {
                    $intakeRows[] = [
                        'repair_order_id' => $order->id,
                        'item_name'       => $item['item_name'],
                        'status'          => $item['status'] ?? 'not_tested',
                        'note'            => $item['note'] ?? null,
                        'created_at'      => $now,
                        'updated_at'      => $now,
                    ];
                }
                if (! empty($intakeRows)) {
                    IntakeChecklist::insert($intakeRows);
                }
            }

            // 5. Ghi Audit Log
            AuditLog::create([
                'user_id'        => $request->user()->id,
                'user_name'      => $request->user()->name,
                'action'         => 'Tiếp nhận đơn mới',
                'auditable_type' => 'RepairOrder',
                'auditable_id'   => $order->id,
                'details'        => "Tiếp nhận đơn {$orderCode} tại chi nhánh",
                'ip_address'     => $request->ip(),
            ]);

            // 6. Tạo thông báo vận hành và phát sự kiện realtime tức thì cho kỹ thuật viên
            $order->loadMissing('branch');
            $branchName = $order->branch?->name ?? 'chi nhánh';

            $notification = Notification::create([
                'tenant_id'   => $order->tenant_id,
                'branch_id'   => $order->branch_id,
                'order_id'    => $order->id,
                'target_role' => 'technician',
                'type'        => 'order_created',
                'title'       => 'Tiếp nhận đơn mới',
                'message'     => "Đơn {$order->order_code} đã được tiếp nhận tại {$branchName}.",
                'severity'    => 'info',
                'action_url'  => "/repairs?id={$order->id}",
            ]);

            $eventTimestamp = now()->toIso8601String();
            DB::afterCommit(function () use ($notification, $order, $branchName, $eventTimestamp) {
                $resolvedTenantId = $notification->tenant_id !== null
                    ? (int) $notification->tenant_id
                    : ($order->tenant_id !== null ? (int) $order->tenant_id : null);

                OrderOperationalEvent::dispatch(
                    $notification->id,
                    $order->id,
                    $order->order_code,
                    'Tiếp nhận đơn mới',
                    "Đơn {$order->order_code} đã được tiếp nhận tại {$branchName}.",
                    'info',
                    $eventTimestamp,
                    "/repairs?id={$order->id}",
                    $order->branch_id !== null ? (int) $order->branch_id : null,
                    'technician',
                    null,
                    'order_created',
                    'order.created',
                    $resolvedTenantId
                );
            });

            \App\Jobs\SendTelegramNewOrderNotificationJob::dispatch($order->id);

            return $this->success(
                $order->load([
                    'customer',
                    'deviceModel',
                    'intakeChecklists',
                    'createdByUser:id,name,role',
                    'tenant:id,name,code,logo_url,hotline,receipt_footer_note',
                ]),
                'Tạo đơn sửa chữa thành công.',
                201
            );
        });
    }

    /**
     * Tìm kiếm đơn sửa chữa linh hoạt theo cả ID số nguyên và mã chuỗi order_code.
     */
    protected function resolveOrder(string|int $id, array $with = []): ?RepairOrder
    {
        $query = ! empty($with) ? RepairOrder::with($with) : RepairOrder::query();

        if (is_numeric($id)) {
            $order = (clone $query)->find((int) $id);
            if ($order) {
                return $order;
            }
        }

        $code = (string) $id;
        $altCode = str_starts_with($code, 'PC')
            ? 'FX' . substr($code, 2)
            : (str_starts_with($code, 'FX') ? 'PC' . substr($code, 2) : null);

        return $query->where(function ($q) use ($code, $altCode) {
            $q->where('order_code', $code);
            if ($altCode) {
                $q->orWhere('order_code', $altCode);
            }
        })->first();
    }

    /**
     * Kiểm tra phân quyền chi nhánh tập trung.
     */
    protected function authorizeOrderBranch(RepairOrder $order, $user): void
    {
        if ($user && ! in_array($user->role, ['admin', 'super_admin'], true) && (int) $order->branch_id !== (int) $user->branch_id) {
            abort(403, 'Bạn không có quyền truy cập đơn hàng thuộc chi nhánh khác.');
        }
    }

    /**
     * Chi tiết đơn sửa chữa toàn diện.
     */
    public function show(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id, [
            'customer',
            'deviceModel',
            'branch',
            'createdByUser:id,name,role',
            'technician:id,name,phone,avatar_url',
            'qcInspector:id,name,role',
            'intakeChecklists',
            'intakePhotos',
            'quotes.items',
            'qcInspections.checklistResults',
            'inventoryTransactions.part',
            'shipments.proofs',
            'payments',
            'warranties',
            'tenant:id,name,code,logo_url,hotline,receipt_footer_note',
        ]);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        if ($order->intake_batch_code) {
            $order->load(['batchOrders.deviceModel', 'batchOrders.customer']);
        }

        return $this->success($order, 'Lấy chi tiết đơn sửa chữa thành công.');
    }

    /**
     * Cập nhật thông tin đơn sửa chữa (cho phép Admin/Super Admin sửa toàn diện).
     */
    public function update(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id, ['customer']);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        if ($order->status === 'completed') {
            $priceFieldsChanged = false;
            if ($request->has('total_price')) {
                $reqTotal = $request->input('total_price');
                if ($reqTotal === null ? $order->total_price !== null : (float) $reqTotal != (float) ($order->total_price ?? 0)) {
                    $priceFieldsChanged = true;
                }
            }
            if ($request->has('initial_price')) {
                $reqInitial = $request->input('initial_price');
                if ($reqInitial === null ? $order->initial_price !== null : (float) $reqInitial != (float) ($order->initial_price ?? 0)) {
                    $priceFieldsChanged = true;
                }
            }
            if ($request->has('estimated_price')) {
                $reqEst = $request->input('estimated_price');
                if ($reqEst === null ? $order->total_price !== null : (float) $reqEst != (float) ($order->total_price ?? 0)) {
                    $priceFieldsChanged = true;
                }
            }

            if ($priceFieldsChanged) {
                return $this->failure('Không thể chỉnh sửa giá của đơn hàng đã hoàn tất.', 422);
            }
        }

        $user = $request->user();
        $isAdmin = $user && in_array($user->role, ['admin', 'super_admin'], true);

        if ($request->has('customer_name') && is_string($request->input('customer_name'))) {
            $request->merge(['customer_name' => PhoneHelper::sanitizeText($request->input('customer_name'))]);
        }
        if ($request->has('customer_phone') && is_string($request->input('customer_phone'))) {
            $request->merge(['customer_phone' => PhoneHelper::normalizeForStorage($request->input('customer_phone'))]);
        }
        if ($request->has('serial_number') && is_string($request->input('serial_number'))) {
            $request->merge(['serial_number' => PhoneHelper::sanitizeText($request->input('serial_number'))]);
        }

        if ($isAdmin) {
            $validated = $request->validate([
                'customer_id'           => ['nullable', $this->tenantExistsRule('customers', $user)],
                'customer_name'         => 'nullable|string|max:255',
                'customer_phone'        => 'nullable|string|max:20',
                'device_model_id'       => 'nullable|exists:device_models,id',
                'serial_number'         => 'nullable|string|max:100',
                'issue_description'     => 'nullable|string',
                'accessories'           => 'nullable|string|max:255',
                'appearance_notes'      => 'nullable|string',
                'test_note'             => 'nullable|string',
                'price_note'            => 'nullable|string|max:255',
                'repair_note'           => 'nullable|string',
                'parts_used_summary'    => 'nullable|string',
                'estimated_price'       => 'nullable|numeric|min:0',
                'total_price'           => 'nullable|numeric|min:0',
                'initial_price'         => 'nullable|numeric|min:0',
                'order_type'            => 'nullable|string|in:in_store,cod,warranty',
                'shipping_address'      => 'nullable|string|max:500',
                'status'                => 'nullable|string',
                'branch_id'             => ['nullable', $this->tenantExistsRule('branches', $user)],
                'technician_id'         => ['nullable', $this->tenantExistsRule('users', $user)],
                'warranty_terms_days'   => 'nullable|integer|min:0',
            ]);

            try {
                return DB::transaction(function () use ($order, $validated, $user, $request) {
                    // Cập nhật thông tin khách hàng nếu có
                    if (! empty($validated['customer_name']) || ! empty($validated['customer_phone'])) {
                        $cleanName = ! empty($validated['customer_name'])
                            ? PhoneHelper::sanitizeText($validated['customer_name'])
                            : null;
                        $normalizedPhone = ! empty($validated['customer_phone'])
                            ? PhoneHelper::normalizeForStorage($validated['customer_phone'])
                            : null;

                        $order->loadMissing('customer');
                        if ($order->customer) {
                            $customerUpdates = [];
                            if ($cleanName !== null && $cleanName !== '') {
                                $customerUpdates['name'] = $cleanName;
                            }
                            if ($normalizedPhone !== null && $normalizedPhone !== '') {
                                $customerUpdates['phone'] = $normalizedPhone;
                            }
                            if (! empty($customerUpdates)) {
                                $order->customer->update($customerUpdates);
                            }
                        } else {
                            $newCustomer = Customer::create([
                                'tenant_id' => $order->tenant_id,
                                'name'      => $cleanName ?: 'Khách lẻ',
                                'phone'     => $normalizedPhone ?: '0900000000',
                            ]);
                            $order->customer_id = $newCustomer->id;
                            $order->save();
                        }
                    }

                    $orderUpdates = array_filter($validated, function ($k) {
                        return ! in_array($k, ['customer_name', 'customer_phone'], true);
                    }, ARRAY_FILTER_USE_KEY);

                    $requestedStatus = $orderUpdates['status'] ?? null;
                    unset($orderUpdates['status']);

                    foreach (['estimated_price', 'total_price', 'initial_price'] as $priceKey) {
                        if (array_key_exists($priceKey, $orderUpdates) && $orderUpdates[$priceKey] !== null) {
                            $orderUpdates[$priceKey] = RepairOrder::normalizeVndAmount($orderUpdates[$priceKey]);
                        }
                    }

                    if (isset($orderUpdates['estimated_price'])) {
                        if (! isset($orderUpdates['total_price'])) {
                            $orderUpdates['total_price'] = $orderUpdates['estimated_price'];
                        }
                        unset($orderUpdates['estimated_price']);
                    }

                    if (isset($orderUpdates['total_price']) && ! isset($orderUpdates['initial_price'])) {
                        if ($order->initial_price === null || (float) $order->initial_price <= 1) {
                            if (empty($order->additional_services)) {
                                $orderUpdates['initial_price'] = $orderUpdates['total_price'];
                            } else {
                                $orderUpdates['initial_price'] = 0.0;
                            }
                        }
                    }

                    $oldPrice = (float) ($order->total_price ?? 0);
                    $isPriceModified = isset($orderUpdates['total_price']) && (float) $orderUpdates['total_price'] !== $oldPrice;
                    $newPrice = isset($orderUpdates['total_price']) ? (float) $orderUpdates['total_price'] : $oldPrice;
                    $priceDiff = $newPrice - $oldPrice;

                    $oldValues = $order->only(array_keys($orderUpdates));

                    if (! empty($orderUpdates)) {
                        $order->update($orderUpdates);
                    }

                    if ($requestedStatus !== null) {
                        $normalizedRequested = $this->normalizeStatus((string) $requestedStatus);
                        $normalizedCurrent = $this->normalizeStatus((string) $order->status);
                        if ($normalizedRequested !== $normalizedCurrent) {
                            $this->workflowService->transition($order, $normalizedRequested, [
                                'user'          => $user,
                                'admin_id'      => $user->id,
                                'admin_name'    => $user->name,
                                'technician_id' => $orderUpdates['technician_id'] ?? $order->technician_id,
                                'reason'        => $request->input('reason') ?? 'Cập nhật trạng thái từ biểu mẫu chỉnh sửa đơn',
                                'ip'            => $request->ip(),
                                'user_agent'    => $request->userAgent(),
                            ]);
                        }
                    }

                    app(\App\Services\AuditLogService::class)->logFieldDiff(
                        $order->tenant_id,
                        $user,
                        'Cập nhật toàn diện đơn hàng',
                        $order,
                        $oldValues,
                        $orderUpdates,
                        "Admin {$user->name} cập nhật thông tin đơn {$order->order_code}"
                    );

                    if ($isPriceModified) {
                        $reason = $orderUpdates['price_note'] ?? ($request->input('reason') ?? 'Điều chỉnh giá đơn hàng');
                        app(\App\Services\AuditLogService::class)->logFieldDiff(
                            $order->tenant_id,
                            $user,
                            'Sửa giá đơn hàng',
                            $order,
                            ['total_price' => $oldPrice],
                            ['total_price' => $newPrice],
                            "Điều chỉnh giá đơn {$order->order_code}: " . number_format($oldPrice) . " ₫ -> " . number_format($newPrice) . " ₫ (chênh lệch: " . number_format($priceDiff) . " ₫). Lý do: {$reason}",
                            [
                                'old_price'  => $oldPrice,
                                'new_price'  => $newPrice,
                                'difference' => $priceDiff,
                                'reason'     => $reason,
                                'order_id'   => $order->id,
                                'order_code' => $order->order_code,
                            ]
                        );
                    }

                    return $this->success(
                        $order->fresh([
                            'customer',
                            'deviceModel',
                            'branch',
                            'technician',
                            'createdByUser:id,name,role',
                            'tenant:id,name,code,logo_url,hotline,receipt_footer_note',
                        ]),
                        'Admin cập nhật thông tin đơn sửa chữa thành công.'
                    );
                });
            } catch (\DomainException $e) {
                return $this->failure($e->getMessage(), 422);
            } catch (\Symfony\Component\HttpKernel\Exception\ConflictHttpException $e) {
                return $this->failure($e->getMessage(), 409);
            }
        }

        if ($request->has('shipping_address') && (! $user || ! in_array($user->role, ['cskh', 'admin', 'super_admin'], true))) {
            return $this->failure('Bạn không có quyền cập nhật địa chỉ giao hàng.', 403);
        }

        $rules = [
            'technician_id'         => ['nullable', $this->tenantExistsRule('users', $user)],
            'serial_number'         => 'nullable|string|max:100',
            'accessories'           => 'nullable|string|max:255',
            'appearance_notes'      => 'nullable|string',
            'test_note'             => 'nullable|string',
            'price_note'            => 'nullable|string|max:255',
            'repair_note'           => 'nullable|string',
            'parts_used_summary'    => 'nullable|string',
        ];

        if ($user && $user->role === 'cskh') {
            $rules['shipping_address'] = 'nullable|string|max:500';
        }

        $validated = $request->validate($rules);

        $order->update($validated);

        return $this->success(
            $order->fresh([
                'customer',
                'deviceModel',
                'branch',
                'technician',
                'createdByUser:id,name,role',
                'tenant:id,name,code,logo_url,hotline,receipt_footer_note',
            ]),
            'Cập nhật đơn sửa chữa thành công.'
        );
    }

    /**
     * Xóa vĩnh viễn đơn sửa chữa an toàn (Chỉ Quản trị viên Store Admin / Super Admin).
     */
    public function destroy(Request $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! in_array($user->role, ['admin', 'super_admin'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Bạn không có quyền xóa đơn sửa chữa. Chỉ Quản trị viên mới có quyền thực hiện.',
            ], 403);
        }

        $order = $this->resolveOrder($id);
        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa cần xóa.');
        }

        $this->authorizeOrderBranch($order, $user);

        return DB::transaction(function () use ($order, $user, $request) {
            $orderCode = $order->order_code;
            $orderId = $order->id;
            $tenantId = $order->tenant_id;

            // 1. Quotes and quote items
            $quoteIds = $order->quotes()->pluck('id');
            if ($quoteIds->isNotEmpty()) {
                \App\Models\QuoteItem::whereIn('quote_id', $quoteIds)->delete();
                $order->quotes()->delete();
            }

            // 2. QC inspections and checklist results
            $qcIds = $order->qcInspections()->pluck('id');
            if ($qcIds->isNotEmpty()) {
                \App\Models\QcChecklistResult::whereIn('qc_inspection_id', $qcIds)->delete();
                $order->qcInspections()->delete();
            }

            // 3. Shipments and proofs
            $shipmentIds = $order->shipments()->pluck('id');
            if ($shipmentIds->isNotEmpty()) {
                \App\Models\ShipmentProof::whereIn('shipment_id', $shipmentIds)->delete();
                $order->shipments()->delete();
            }

            // 4. Warranties and claims
            $warrantyIds = $order->warranties()->pluck('id');
            if ($warrantyIds->isNotEmpty()) {
                \App\Models\WarrantyClaim::whereIn('warranty_id', $warrantyIds)->delete();
                $order->warranties()->delete();
            }

            // 5. Intake photos
            $photos = $order->intakePhotos()->get(['id', 'photo_url']);
            if ($photos->isNotEmpty()) {
                foreach ($photos as $photo) {
                    if ($photo->photo_url) {
                        $path = str_replace(url('/storage') . '/', '', $photo->photo_url);
                        Storage::disk('public')->delete($path);
                    }
                }
                $order->intakePhotos()->delete();
            }

            // 6. Checklists
            $order->intakeChecklists()->delete();

            // 7. Inventory transactions: Hoàn trả linh kiện về kho và bảo lưu lịch sử giao dịch
            $this->workflowService->reverseInventoryForOrder($order, $user->id, 'deleted');
            $order->inventoryTransactions()->update(['repair_order_id' => null]);

            // 8. Payments
            $order->payments()->delete();

            // 9. Notifications
            Notification::where('order_id', $orderId)->delete();

            // 10. Delete the repair order
            $order->delete();

            // 11. Audit log
            AuditLog::create([
                'tenant_id'      => $tenantId,
                'user_id'        => $user->id,
                'user_name'      => $user->name,
                'action'         => 'Xóa đơn hàng',
                'auditable_type' => 'RepairOrder',
                'auditable_id'   => $orderId,
                'details'        => "Admin {$user->name} đã xóa vĩnh viễn đơn hàng {$orderCode} và toàn bộ dữ liệu phụ thuộc.",
                'ip_address'     => $request->ip(),
            ]);

            return $this->success(null, "Đã xóa vĩnh viễn đơn hàng {$orderCode} thành công.");
        });
    }

    /**
     * Chuyển trạng thái quy trình sửa chữa theo FSM (State Machine) thông qua OrderWorkflowService.
     */
    public function transition(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        $validated = $request->validate([
            'status'              => 'required_without:transition|nullable|string',
            'transition'          => 'required_without:status|nullable|string',
            'expected_updated_at' => 'nullable|string',
            'decline_reason'      => 'nullable|string',
            'repair_note'         => 'nullable|string',
            'parts_needed'        => 'nullable|string|max:1000',
            'parts_used'          => 'nullable|string',
            'final_check_result'  => 'nullable|string|max:500',
            'rework_reason'       => 'nullable|string',
            'technician_id'       => ['nullable', $this->tenantExistsRule('users', $request->user())],
        ]);

        $rawStatus = (string) ($validated['transition'] ?? $validated['status']);
        $normalizedStatus = $this->normalizeStatus($rawStatus);

        try {
            $updatedOrder = $this->workflowService->transition($order, $normalizedStatus, [
                'expected_updated_at' => $validated['expected_updated_at'] ?? null,
                'user'                => $request->user(),
                'admin_id'            => $request->user()?->id,
                'admin_name'          => $request->user()?->name,
                'technician_id'       => $validated['technician_id'] ?? null,
                'decline_reason'      => $validated['decline_reason'] ?? null,
                'repair_note'         => $validated['repair_note'] ?? null,
                'parts_needed'        => $validated['parts_needed'] ?? $request->input('parts_needed'),
                'parts_used'          => $validated['parts_used'] ?? null,
                'final_check_result'  => $validated['final_check_result'] ?? null,
                'rework_reason'       => $validated['rework_reason'] ?? null,
                'ip'                  => $request->ip(),
                'user_agent'          => $request->userAgent(),
            ]);

            return $this->success($updatedOrder, "Chuyển trạng thái đơn sang '{$updatedOrder->status}' thành công.");
        } catch (ConflictHttpException $e) {
            return $this->failure($e->getMessage(), 409);
        } catch (\DomainException $e) {
            return $this->failure($e->getMessage(), 422);
        }
    }

    /**
     * Cập nhật ghi chú linh kiện độc lập mà không đổi trạng thái đơn hàng.
     */
    public function updatePartsNote(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        $validated = $request->validate([
            'parts_needed' => 'nullable|string|max:1000',
            'repair_note'  => 'nullable|string|max:2000',
            'parts_note'   => 'nullable|string|max:2000',
        ]);

        $updates = [];
        if ($request->has('parts_needed')) {
            $updates['parts_needed'] = $validated['parts_needed'];
        }
        $note = $validated['repair_note'] ?? $validated['parts_note'] ?? null;
        if ($note !== null) {
            $updates['repair_note'] = $note;
        }

        if (! empty($updates)) {
            $order->update($updates);
        }

        AuditLog::create([
            'user_id'        => $request->user()?->id,
            'user_name'      => $request->user()?->name ?? 'Kỹ thuật viên',
            'action'         => 'Cập nhật ghi chú linh kiện',
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $order->id,
            'details'        => "Cập nhật yêu cầu linh kiện: " . ($order->parts_needed ?? 'Trống') . (! empty($order->repair_note) ? " | Ghi chú: {$order->repair_note}" : ''),
            'ip_address'     => $request->ip(),
        ]);

        return $this->success($order->fresh(), 'Đã lưu ghi chú linh kiện thành công.');
    }

    /**
     * KTV gửi hoặc cập nhật yêu cầu linh kiện đặc biệt (mua ngoài).
     */
    public function requestSpecialPart(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        if ($request->has('note') && ! $request->has('special_parts_needed')) {
            $request->merge(['special_parts_needed' => $request->input('note')]);
        }

        $validated = $request->validate([
            'special_parts_needed' => 'required|string|min:1|max:2000',
            'pause_order'          => 'nullable|boolean',
        ], [
            'special_parts_needed.required' => 'Nội dung linh kiện cần mua ngoài không được để trống.',
            'special_parts_needed.min'      => 'Nội dung linh kiện cần mua ngoài không được để trống.',
        ]);

        $user = $request->user();
        $now = Carbon::now();
        $note = trim($validated['special_parts_needed']);

        $updates = [
            'special_parts_needed'       => $note,
            'special_parts_status'       => 'pending',
            'special_parts_requested_at' => $now,
        ];

        // Nếu KTV chọn tạm dừng đơn và trạng thái hiện tại chưa phải waiting_parts
        if ($request->boolean('pause_order') && $order->status !== 'waiting_parts') {
            try {
                $this->workflowService->transition($order, 'waiting_parts', [
                    'reason'       => 'KTV yêu cầu linh kiện đặc biệt (mua ngoài)',
                    'parts_needed' => $order->parts_needed ?: $note,
                    'user'         => $user,
                ]);
            } catch (\Throwable $e) {
                $updates['status'] = 'waiting_parts';
                $updates['paused_at'] = $now;
                if (empty($order->parts_needed)) {
                    $updates['parts_needed'] = $note;
                }
            }
        }

        $order->update($updates);

        AuditLog::create([
            'tenant_id'      => $order->tenant_id,
            'user_id'        => $user?->id,
            'user_name'      => $user?->name ?? 'Kỹ thuật viên',
            'action'         => 'Yêu cầu linh kiện đặc biệt',
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $order->id,
            'details'        => "KTV " . ($user?->name ?? 'KTV') . " yêu cầu linh kiện ngoài: {$note}" . ($request->boolean('pause_order') ? ' (Tạm dừng đơn)' : ''),
            'ip_address'     => $request->ip(),
        ]);

        $notificationTitle = "Yêu cầu linh kiện đặc biệt: {$order->order_code}";
        $notificationMsg = "Đơn {$order->order_code} cần mua ngoài linh kiện: {$note}";

        $notification = Notification::create([
            'tenant_id'   => $order->tenant_id,
            'branch_id'   => $order->branch_id,
            'order_id'    => $order->id,
            'user_id'     => null,
            'target_role' => 'cskh',
            'type'        => 'special_part_requested',
            'title'       => $notificationTitle,
            'message'     => $notificationMsg,
            'severity'    => 'warning',
            'action_url'  => "/repairs?id={$order->id}",
        ]);

        $eventTimestamp = $now->toIso8601String();
        DB::afterCommit(function () use ($notification, $order, $notificationTitle, $notificationMsg, $eventTimestamp) {
            $resolvedTenantId = $notification->tenant_id !== null
                ? (int) $notification->tenant_id
                : ($order->tenant_id !== null ? (int) $order->tenant_id : null);
            $resolvedBranchId = $order->branch_id !== null ? (int) $order->branch_id : null;

            OrderOperationalEvent::dispatch(
                $notification->id,
                $order->id,
                $order->order_code ?? (string) $order->id,
                $notificationTitle,
                $notificationMsg,
                'warning',
                $eventTimestamp,
                "/repairs?id={$order->id}",
                $resolvedBranchId,
                'cskh',
                null,
                'special_part_requested',
                'order.special_part_requested',
                $resolvedTenantId
            );

            OrderOperationalEvent::dispatch(
                $notification->id,
                $order->id,
                $order->order_code ?? (string) $order->id,
                $notificationTitle,
                $notificationMsg,
                'warning',
                $eventTimestamp,
                "/repairs?id={$order->id}",
                $resolvedBranchId,
                'admin',
                null,
                'special_part_requested',
                'order.special_part_requested',
                $resolvedTenantId
            );
        });

        return $this->success(
            $order->fresh(['customer', 'technician', 'branch', 'deviceModel', 'createdByUser:id,name,role']),
            'Đã gửi yêu cầu linh kiện đặc biệt thành công.'
        );
    }

    /**
     * Admin/CSKH bấm 1 nút xác nhận đã mua linh kiện đặc biệt (mua ngoài).
     */
    public function fulfillSpecialPart(Request $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        if ($user && ! in_array($user->role, ['admin', 'cskh', 'super_admin'], true)) {
            return $this->failure('Chỉ Quản trị viên (Admin) hoặc CSKH mới có quyền xác nhận đã mua linh kiện ngoài.', 403);
        }

        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $user);

        $now = Carbon::now();
        $updates = [
            'special_parts_status'       => 'purchased',
            'special_parts_fulfilled_at' => $now,
        ];

        if ($request->boolean('resume_order') && $order->status === 'waiting_parts') {
            try {
                $this->workflowService->transition($order, 'in_repair', [
                    'reason' => 'Đã có linh kiện đặc biệt mua ngoài',
                    'user'   => $user,
                ]);
            } catch (\Throwable $e) {
                $updates['status'] = 'in_repair';
                $updates['paused_at'] = null;
            }
        }

        $order->update($updates);

        AuditLog::create([
            'tenant_id'      => $order->tenant_id,
            'user_id'        => $user?->id,
            'user_name'      => $user?->name ?? 'Admin',
            'action'         => 'Xác nhận đã mua linh kiện đặc biệt',
            'auditable_type' => 'RepairOrder',
            'auditable_id'   => $order->id,
            'details'        => ($user?->name ?? 'Quầy') . " đã xác nhận mua xong linh kiện ngoài cho đơn {$order->order_code}",
            'ip_address'     => $request->ip(),
        ]);

        $notificationTitle = "Đã có linh kiện đặc biệt: {$order->order_code}";
        $notificationMsg = "Quầy đã mua linh kiện ngoài cho đơn {$order->order_code}. KTV có thể tiếp tục xử lý.";

        $notification = Notification::create([
            'tenant_id'   => $order->tenant_id,
            'branch_id'   => $order->branch_id,
            'order_id'    => $order->id,
            'user_id'     => $order->technician_id,
            'target_role' => 'technician',
            'type'        => 'special_part_fulfilled',
            'title'       => $notificationTitle,
            'message'     => $notificationMsg,
            'severity'    => 'success',
            'action_url'  => "/repairs?id={$order->id}",
        ]);

        $eventTimestamp = $now->toIso8601String();
        DB::afterCommit(function () use ($notification, $order, $notificationTitle, $notificationMsg, $eventTimestamp) {
            $resolvedTenantId = $notification->tenant_id !== null
                ? (int) $notification->tenant_id
                : ($order->tenant_id !== null ? (int) $order->tenant_id : null);

            OrderOperationalEvent::dispatch(
                $notification->id,
                $order->id,
                $order->order_code ?? (string) $order->id,
                $notificationTitle,
                $notificationMsg,
                'success',
                $eventTimestamp,
                "/repairs?id={$order->id}",
                $order->branch_id !== null ? (int) $order->branch_id : null,
                'technician',
                $order->technician_id !== null ? (int) $order->technician_id : null,
                'special_part_fulfilled',
                'order.special_part_fulfilled',
                $resolvedTenantId
            );
        });

        return $this->success(
            $order->fresh(['customer', 'technician', 'branch', 'deviceModel', 'createdByUser:id,name,role']),
            'Đã xác nhận mua linh kiện thành công.'
        );
    }

    /**
     * Phân công kỹ thuật viên cho đơn sửa chữa.
     */
    public function assignTechnician(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        $validated = $request->validate([
            'technician_id' => ['required', $this->tenantExistsRule('users', $request->user())],
        ]);

        $order->update(['technician_id' => $validated['technician_id']]);

        return $this->success($order, 'Phân công kỹ thuật viên thành công.');
    }

    /**
     * Bàn giao đơn sửa chữa cho KTV khác hoặc hoàn trả về hàng đợi tiếp nhận chung.
     */
    public function handover(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        $user = $request->user();
        if (! in_array($user->role, ['admin', 'super_admin'], true) && (int) $order->technician_id !== (int) $user->id) {
            return $this->failure('Bạn không có quyền bàn giao đơn hàng của kỹ thuật viên khác.', 403);
        }

        if (! in_array($order->status, ['assigned', 'in_repair', 'waiting_parts', 'rework_needed'], true)) {
            return $this->failure('Chỉ có thể bàn giao đơn hàng đang trong ca kỹ thuật xử lý.', 422);
        }

        $validated = $request->validate([
            'target'         => 'required|string|in:queue,technician',
            'technician_id'  => 'required_if:target,technician|nullable|exists:users,id',
            'reason_tag'     => 'required|string|in:wrong_order,complex_repair,shift_change,missing_parts_tools',
            'handover_notes' => 'nullable|string',
        ]);

        $notes = trim((string) ($validated['handover_notes'] ?? ''));
        if ($validated['reason_tag'] === 'complex_repair' && mb_strlen($notes) < 3) {
            return $this->failure('Vui lòng nhập ghi chú chi tiết (tối thiểu 3 ký tự) khi bàn giao ca máy khó để hỗ trợ thợ sau.', 422);
        }

        if ($validated['target'] === 'technician') {
            $targetUser = User::find($validated['technician_id']);
            if (! $targetUser || (int) $targetUser->branch_id !== (int) $order->branch_id) {
                return $this->failure('Kỹ thuật viên tiếp nhận phải thuộc cùng chi nhánh với đơn hàng.', 422);
            }
            if ((int) $targetUser->id === (int) $user->id) {
                return $this->failure('Không thể bàn giao đơn hàng cho chính bản thân.', 422);
            }
            if (! $targetUser->is_active) {
                return $this->failure('Kỹ thuật viên tiếp nhận hiện không ở trạng thái hoạt động.', 422);
            }
        }

        $reasonLabels = [
            'wrong_order'         => 'Nhận nhầm đơn',
            'complex_repair'      => 'Máy khó / Cần thợ chuyên',
            'shift_change'        => 'Đổi ca / Hết giờ làm',
            'missing_parts_tools' => 'Thiếu linh kiện / Dụng cụ',
        ];
        $reasonLabel = $reasonLabels[$validated['reason_tag']] ?? $validated['reason_tag'];

        return DB::transaction(function () use ($order, $user, $validated, $reasonLabel, $notes, $request) {
            $lockedOrder = RepairOrder::where('id', $order->id)->lockForUpdate()->firstOrFail();
            $now = Carbon::now();

            if ($validated['target'] === 'queue') {
                $newStatus = 'waiting_tech';
                $newTechId = null;
                $targetName = 'Hàng đợi chung';
            } else {
                $newStatus = 'assigned';
                $newTechId = (int) $validated['technician_id'];
                $targetUser = User::find($newTechId);
                $targetName = $targetUser?->name ?? 'KTV #' . $newTechId;
            }

            $this->workflowService->transition($lockedOrder, $newStatus, [
                'technician_id' => $newTechId,
                'user'          => $user,
            ]);

            $lockedOrder->status = $newStatus;
            $lockedOrder->technician_id = $newTechId;
            $lockedOrder->tech_accepted_at = $newTechId ? $now : null;

            $effectiveNotes = ! empty($notes) ? $notes : "Lý do: {$reasonLabel}";
            $handoverEntry = "[" . $now->format('H:i d/m') . " Bàn giao từ {$user->name}]: {$effectiveNotes}";
            $lockedOrder->repair_note = trim(($lockedOrder->repair_note ? $lockedOrder->repair_note . "\n" : '') . $handoverEntry);
            $lockedOrder->save();

            AuditLog::create([
                'tenant_id'      => $lockedOrder->tenant_id,
                'user_id'        => $user->id,
                'user_name'      => $user->name,
                'action'         => 'Bàn giao kỹ thuật',
                'auditable_type' => 'RepairOrder',
                'auditable_id'   => $lockedOrder->id,
                'details'        => "KTV {$user->name} đã bàn giao đơn {$lockedOrder->order_code} cho {$targetName}. Lý do: {$reasonLabel}." . (! empty($notes) ? " Ghi chú: {$notes}" : ''),
                'ip_address'     => $request->ip(),
            ]);

            $notificationTitle = $validated['target'] === 'queue'
                ? 'Đơn hàng mới trong hàng đợi chờ nhận'
                : 'Bạn nhận được đơn bàn giao mới';
            $notificationMsg = $validated['target'] === 'queue'
                ? "Đơn {$lockedOrder->order_code} đã được KTV {$user->name} bàn giao trả về hàng đợi chung: {$reasonLabel}"
                : "KTV {$user->name} đã bàn giao đơn {$lockedOrder->order_code} cho {$targetName}: {$reasonLabel}";

            $notification = Notification::create([
                'tenant_id'   => $lockedOrder->tenant_id,
                'branch_id'   => $lockedOrder->branch_id,
                'order_id'    => $lockedOrder->id,
                'user_id'     => $newTechId,
                'target_role' => 'technician',
                'type'        => 'order_handover',
                'title'       => $notificationTitle,
                'message'     => $notificationMsg,
                'severity'    => 'info',
            ]);

            $eventTimestamp = $now->toIso8601String();
            DB::afterCommit(function () use ($notification, $lockedOrder, $notificationTitle, $notificationMsg, $eventTimestamp, $newTechId) {
                $resolvedTenantId = $notification->tenant_id !== null
                    ? (int) $notification->tenant_id
                    : ($lockedOrder->tenant_id !== null ? (int) $lockedOrder->tenant_id : null);

                OrderOperationalEvent::dispatch(
                    $notification->id,
                    $lockedOrder->id,
                    $lockedOrder->order_code ?? (string) $lockedOrder->id,
                    $notificationTitle,
                    $notificationMsg,
                    'info',
                    $eventTimestamp,
                    "/repairs?id={$lockedOrder->id}",
                    $lockedOrder->branch_id !== null ? (int) $lockedOrder->branch_id : null,
                    'technician',
                    $newTechId !== null ? (int) $newTechId : null,
                    'order_handover',
                    'order.handover',
                    $resolvedTenantId
                );
            });

            return $this->success(
                $lockedOrder->fresh(['customer', 'technician', 'branch', 'deviceModel', 'createdByUser:id,name,role']),
                'Bàn giao đơn sửa chữa thành công.'
            );
        });
    }

    /**
     * Lấy danh sách các trạng thái tiếp theo được phép chuyển kèm nhãn tiếng Việt cho đơn hàng.
     */
    public function allowedTransitions(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        $allowed = $this->workflowService->getNextAllowedStatusesWithLabels($order->status);

        return $this->success([
            'order_id'          => $order->id,
            'current_status'    => $order->status,
            'current_label'     => $this->workflowService->getStatusLabel($order->status),
            'allowed_statuses'  => $allowed,
        ], 'Lấy danh sách trạng thái tiếp theo hợp lệ thành công.');
    }

    /**
     * Chuẩn hóa trạng thái / alias trước khi đưa vào FSM Workflow hoặc bộ lọc.
     */
    public function normalizeStatus(?string $status): ?string
    {
        if (! $status) {
            return $status;
        }

        return match ($status) {
            'quote_pending'               => 'waiting_approval',
            'qc_inspecting', 'qc_pending' => 'waiting_qc',
            default                       => $status,
        };
    }

    /**
     * Cập nhật / lưu checklist kiểm tra tại quầy.
     */
    public function storeChecklist(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        $validated = $request->validate([
            'items'             => 'required|array',
            'items.*.item_name' => 'required|string',
            'items.*.status'    => 'required|in:pass,fail,not_tested',
            'items.*.note'      => 'nullable|string',
        ]);

        $existingItems = IntakeChecklist::where('repair_order_id', $order->id)
            ->get()
            ->keyBy('item_name');

        $now = now();
        $newRows = [];

        foreach ($validated['items'] as $item) {
            $itemName = $item['item_name'];
            $itemStatus = $item['status'];
            $itemNote = $item['note'] ?? null;

            $existing = $existingItems->get($itemName);
            if ($existing) {
                if ($existing->status !== $itemStatus || $existing->note !== $itemNote) {
                    $existing->update([
                        'status' => $itemStatus,
                        'note'   => $itemNote,
                    ]);
                }
            } elseif (isset($newRows[$itemName])) {
                $newRows[$itemName]['status'] = $itemStatus;
                $newRows[$itemName]['note'] = $itemNote;
            } else {
                $newRows[$itemName] = [
                    'repair_order_id' => $order->id,
                    'item_name'       => $itemName,
                    'status'          => $itemStatus,
                    'note'            => $itemNote,
                    'created_at'      => $now,
                    'updated_at'      => $now,
                ];
            }
        }

        if (! empty($newRows)) {
            IntakeChecklist::insert(array_values($newRows));
        }

        return $this->success(
            $order->intakeChecklists()->get(),
            'Lưu danh sách kiểm tra tiếp nhận thành công.'
        );
    }

    /**
     * Upload ảnh chụp hiện trạng thiết bị lúc tiếp nhận.
     */
    public function uploadPhoto(Request $request, int|string $id): JsonResponse
    {
        $order = $this->resolveOrder($id);

        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $request->user());

        $validated = $request->validate([
            'file'      => 'nullable|file|mimes:jpeg,png,jpg,webp|max:10240',
            'photo'     => 'nullable|file|mimes:jpeg,png,jpg,webp|max:10240',
            'photo_url' => 'nullable|string',
            'caption'   => 'nullable|string|max:255',
        ]);

        $uploadedFile = $request->file('photo') ?? $request->file('file');
        $photoUrl = $validated['photo_url'] ?? null;

        if (! $uploadedFile && ! $photoUrl) {
            return $this->failure('Vui lòng tải lên tệp ảnh (photo/file) hoặc cung cấp đường dẫn ảnh (photo_url).', 422);
        }

        if ($uploadedFile) {
            $path = $uploadedFile->store("orders/{$order->id}", 'public');
            $photoUrl = url(Storage::url($path));
        }

        $photo = IntakePhoto::create([
            'repair_order_id'     => $order->id,
            'photo_url'           => $photoUrl,
            'caption'             => $validated['caption'] ?? 'Ảnh hiện trạng tiếp nhận',
            'uploaded_by_user_id' => $request->user()->id,
        ]);

        return $this->success($photo, 'Tải ảnh hiện trạng tiếp nhận thành công.', 201);
    }

    /**
     * Thêm dịch vụ sửa chữa bổ sung phát sinh tại quầy CSKH.
     */
    public function addAdditionalService(Request $request, int|string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user || in_array($user->role, ['technician'], true) || ! in_array($user->role, ['cskh', 'admin', 'super_admin'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Bạn không có quyền thực hiện thao tác này.',
            ], 403);
        }

        $order = $this->resolveOrder($id);
        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $user);

        if (in_array($order->status, ['completed', 'delivered', 'cancelled'], true)) {
            return $this->failure('Không thể thêm dịch vụ cho đơn hàng đã hoàn tất hoặc đã hủy.', 422);
        }

        $validated = $request->validate([
            'name'       => 'required|string|min:2|max:255',
            'price'      => 'required|numeric|gt:0',
            'service_id' => 'nullable|integer',
            'note'       => 'nullable|string|max:500',
        ], [
            'name.required'  => 'Vui lòng chọn hoặc nhập tên dịch vụ bổ sung',
            'price.required' => 'Đơn giá dịch vụ là bắt buộc, vui lòng nhập tay số tiền đã báo khách',
            'price.gt'       => 'Đơn giá dịch vụ bổ sung phải lớn hơn 0 VNĐ',
        ]);

        $savedOrder = DB::transaction(function () use ($order, $validated, $user, $request) {
            /** @var RepairOrder $lockedOrder */
            $lockedOrder = RepairOrder::where('id', $order->id)->lockForUpdate()->firstOrFail();

            $serviceItem = $lockedOrder->addAdditionalService($validated, $user);

            AuditLog::create([
                'user_id'        => $user->id,
                'user_name'      => $user->name,
                'action'         => 'Thêm dịch vụ bổ sung',
                'auditable_type' => 'RepairOrder',
                'auditable_id'   => $lockedOrder->id,
                'details'        => "Thêm dịch vụ: {$validated['name']} (" . number_format($validated['price']) . " đ) cho đơn {$lockedOrder->order_code}",
                'ip_address'     => $request->ip(),
            ]);

            // 1. Thông báo tài chính cho quầy CSKH / Admin (có kèm đơn giá dịch vụ bổ sung VNĐ)
            $cskhNotification = Notification::create([
                'tenant_id'   => $lockedOrder->tenant_id,
                'branch_id'   => $lockedOrder->branch_id,
                'order_id'    => $lockedOrder->id,
                'target_role' => 'cskh',
                'type'        => 'additional_service_added',
                'title'       => "Đã bổ sung dịch vụ: {$validated['name']}",
                'message'     => "Khách hàng vừa bổ sung dịch vụ: {$validated['name']} (+" . number_format($validated['price']) . " ₫) cho đơn {$lockedOrder->order_code}.",
                'severity'    => 'warning',
                'action_url'  => "/repairs?id={$lockedOrder->id}",
            ]);

            // 2. Thông báo kỹ thuật độc lập cho xưởng (ẩn tuyệt đối số tiền VNĐ)
            $techTitle = "Yêu cầu làm thêm hạng mục: {$validated['name']}";
            $techMessage = "Khách hàng vừa bổ sung hạng mục kỹ thuật: {$validated['name']} cho đơn {$lockedOrder->order_code}.";

            $techNotification = Notification::create([
                'tenant_id'   => $lockedOrder->tenant_id,
                'branch_id'   => $lockedOrder->branch_id,
                'order_id'    => $lockedOrder->id,
                'user_id'     => $lockedOrder->technician_id,
                'target_role' => 'technician',
                'type'        => 'additional_service_added',
                'title'       => $techTitle,
                'message'     => $techMessage,
                'severity'    => 'warning',
                'action_url'  => "/repairs?id={$lockedOrder->id}",
            ]);

            $eventTimestamp = now()->toIso8601String();
            DB::afterCommit(function () use ($cskhNotification, $techNotification, $lockedOrder, $techTitle, $techMessage, $eventTimestamp) {
                $resolvedTenantId = $cskhNotification->tenant_id !== null
                    ? (int) $cskhNotification->tenant_id
                    : ($lockedOrder->tenant_id !== null ? (int) $lockedOrder->tenant_id : null);
                $resolvedBranchId = $lockedOrder->branch_id !== null ? (int) $lockedOrder->branch_id : null;

                OrderOperationalEvent::dispatch(
                    $cskhNotification->id,
                    $lockedOrder->id,
                    $lockedOrder->order_code ?? (string) $lockedOrder->id,
                    $cskhNotification->title,
                    $cskhNotification->message,
                    'warning',
                    $eventTimestamp,
                    "/repairs?id={$lockedOrder->id}",
                    $resolvedBranchId,
                    'cskh',
                    null,
                    'additional_service_added',
                    'order.additional_service_added',
                    $resolvedTenantId
                );

                OrderOperationalEvent::dispatch(
                    $techNotification->id,
                    $lockedOrder->id,
                    $lockedOrder->order_code ?? (string) $lockedOrder->id,
                    $techTitle,
                    $techMessage,
                    'warning',
                    $eventTimestamp,
                    "/repairs?id={$lockedOrder->id}",
                    $resolvedBranchId,
                    'technician',
                    $lockedOrder->technician_id !== null ? (int) $lockedOrder->technician_id : null,
                    'additional_service_added',
                    'order.additional_service_added',
                    $resolvedTenantId
                );
            });

            return $lockedOrder;
        });

        return $this->success(
            $savedOrder->fresh(['customer', 'deviceModel', 'technician', 'createdByUser:id,name,role']),
            'Thêm dịch vụ bổ sung thành công.'
        );
    }

    /**
     * Xóa / hủy dịch vụ sửa chữa bổ sung khi khách đổi ý.
     */
    public function deleteAdditionalService(Request $request, int|string $id, string $serviceId): JsonResponse
    {
        $user = $request->user();
        if (! $user || in_array($user->role, ['technician'], true) || ! in_array($user->role, ['cskh', 'admin', 'super_admin'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Bạn không có quyền thực hiện thao tác này.',
            ], 403);
        }

        $order = $this->resolveOrder($id);
        if (! $order) {
            return $this->empty('Không tìm thấy đơn sửa chữa.');
        }

        $this->authorizeOrderBranch($order, $user);

        if (in_array($order->status, ['completed', 'delivered', 'cancelled'], true)) {
            return $this->failure('Không thể xóa dịch vụ cho đơn hàng đã hoàn tất hoặc đã hủy.', 422);
        }

        $deleted = false;
        $removedItem = null;

        $savedOrder = DB::transaction(function () use ($order, $serviceId, $user, $request, &$deleted, &$removedItem) {
            /** @var RepairOrder $lockedOrder */
            $lockedOrder = RepairOrder::where('id', $order->id)->lockForUpdate()->firstOrFail();

            $services = $lockedOrder->additional_services ?? [];
            foreach ($services as $s) {
                if (($s['id'] ?? null) === $serviceId) {
                    $removedItem = $s;
                    break;
                }
            }

            if (! $removedItem) {
                return null;
            }

            $deleted = $lockedOrder->removeAdditionalService($serviceId);

            if ($deleted) {
                AuditLog::create([
                    'user_id'        => $user->id,
                    'user_name'      => $user->name,
                    'action'         => 'Hủy dịch vụ bổ sung',
                    'auditable_type' => 'RepairOrder',
                    'auditable_id'   => $lockedOrder->id,
                    'details'        => "Hủy dịch vụ: {$removedItem['name']} cho đơn {$lockedOrder->order_code}",
                    'ip_address'     => $request->ip(),
                ]);

                $notification = Notification::create([
                    'tenant_id'   => $lockedOrder->tenant_id,
                    'branch_id'   => $lockedOrder->branch_id,
                    'order_id'    => $lockedOrder->id,
                    'user_id'     => $lockedOrder->technician_id,
                    'target_role' => 'technician',
                    'type'        => 'additional_service_deleted',
                    'title'       => "Đã hủy dịch vụ bổ sung: {$removedItem['name']}",
                    'message'     => "Dịch vụ {$removedItem['name']} đã được hủy cho đơn {$lockedOrder->order_code}",
                    'severity'    => 'info',
                    'action_url'  => "/repairs?id={$lockedOrder->id}",
                ]);

                $eventTimestamp = now()->toIso8601String();
                $removedName = $removedItem['name'];
                DB::afterCommit(function () use ($notification, $lockedOrder, $removedName, $eventTimestamp) {
                    $resolvedTenantId = $notification->tenant_id !== null
                        ? (int) $notification->tenant_id
                        : ($lockedOrder->tenant_id !== null ? (int) $lockedOrder->tenant_id : null);

                    OrderOperationalEvent::dispatch(
                        $notification->id,
                        $lockedOrder->id,
                        $lockedOrder->order_code ?? (string) $lockedOrder->id,
                        "Đã hủy dịch vụ bổ sung: {$removedName}",
                        "Dịch vụ {$removedName} đã được hủy cho đơn {$lockedOrder->order_code}",
                        'info',
                        $eventTimestamp,
                        "/repairs?id={$lockedOrder->id}",
                        $lockedOrder->branch_id !== null ? (int) $lockedOrder->branch_id : null,
                        'technician',
                        $lockedOrder->technician_id !== null ? (int) $lockedOrder->technician_id : null,
                        'additional_service_deleted',
                        'order.additional_service_deleted',
                        $resolvedTenantId
                    );
                });
            }

            return $lockedOrder;
        });

        if (! $savedOrder || ! $deleted) {
            return response()->json([
                'success' => false,
                'message' => 'Không tìm thấy dịch vụ bổ sung cần xóa.',
            ], 404);
        }

        return $this->success(
            $savedOrder->fresh(['customer', 'deviceModel', 'technician', 'createdByUser:id,name,role']),
            'Xóa dịch vụ bổ sung thành công.'
        );
    }
}
