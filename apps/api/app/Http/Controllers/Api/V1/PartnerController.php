<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use App\Support\PhoneHelper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PartnerController extends Controller
{
    /**
     * Danh sách đối tác & đại lý tiếp nhận.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user('sanctum') ?? $request->user();

        $query = Partner::query()
            ->withCount([
                'shipments' => function ($q) use ($user) {
                    if (! $user) {
                        $q->whereRaw('1 = 0');
                        return;
                    }

                    if ($user->role !== 'super_admin') {
                        $q->whereHas('repairOrder', function ($ro) use ($user) {
                            $ro->withoutGlobalScopes()->where('tenant_id', $user->tenant_id);
                            if (! in_array($user->role, ['admin', 'super_admin'], true) && $user->branch_id) {
                                $ro->where('branch_id', $user->branch_id);
                            }
                        });
                    }
                },
            ])
            ->latest('id');

        if ($status = $request->input('status')) {
            if ($status !== 'all') {
                $query->where('status', $status);
            }
        }

        if ($serviceType = $request->input('service_type')) {
            if ($serviceType !== 'all') {
                $query->where('service_type', $serviceType);
            }
        }

        $rawSearch = $request->input('q') ?? $request->input('search');
        $search = PhoneHelper::sanitizeText($rawSearch);
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('code', 'like', "%{$search}%")
                  ->orWhere('contact_person', 'like', "%{$search}%")
                  ->orWhere('service_type', 'like', "%{$search}%");
                PhoneHelper::applyPhoneColumnSearch($q, 'phone', $search, 'or');

                $q->orWhereHas('shipments', function ($sq) use ($search) {
                    $sq->where('shipment_code', 'like', "%{$search}%")
                       ->orWhere('tracking_code', 'like', "%{$search}%")
                       ->orWhere('notes', 'like', "%{$search}%")
                       ->orWhereHas('repairOrder', function ($rq) use ($search) {
                           $rq->withoutGlobalScopes()
                              ->where(function ($sub) use ($search) {
                                  $sub->where('order_code', 'like', "%{$search}%")
                                      ->orWhereHas('customer', function ($cq) use ($search) {
                                          $cq->withoutGlobalScopes()->where('name', 'like', "%{$search}%");
                                      })
                                      ->orWhereHas('deviceModel', function ($dq) use ($search) {
                                          $dq->where('name', 'like', "%{$search}%");
                                      });
                              });
                       });
                });
            });
        }

        if ($request->boolean('all') || $request->input('per_page') === 'all') {
            $items = $query->limit(1000)->get();
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
            ], 'Lấy danh sách đối tác thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $partners = $query->paginate($perPage);

        return $this->success($partners, 'Lấy danh sách đối tác thành công.');
    }

    /**
     * Tạo mới thông tin đối tác.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! in_array($user->role, ['admin', 'super_admin'], true)) {
            abort(403, 'Chỉ quản trị viên mới có quyền thêm đối tác.');
        }

        $validated = $request->validate([
            'code'           => 'required|string|max:50|unique:partners,code',
            'name'           => 'required|string|max:255',
            'service_type'   => 'required|string|max:100',
            'contact_person' => 'nullable|string|max:255',
            'phone'          => 'nullable|string|max:50',
            'status'         => 'nullable|string|in:active,inactive',
            'api_config'     => 'nullable|array',
        ]);

        $partner = Partner::create([
            'code'           => $validated['code'],
            'name'           => $validated['name'],
            'service_type'   => $validated['service_type'],
            'contact_person' => $validated['contact_person'] ?? null,
            'phone'          => $validated['phone'] ?? null,
            'status'         => $validated['status'] ?? 'active',
            'api_config'     => $validated['api_config'] ?? null,
        ]);

        return $this->created($partner, 'Tạo đối tác thành công.');
    }

    /**
     * Xem thông tin chi tiết đối tác.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user('sanctum') ?? $request->user();

        $partner = Partner::with([
            'shipments' => function ($q) use ($user) {
                if (! $user) {
                    $q->whereRaw('1 = 0');
                    return;
                }

                if ($user->role !== 'super_admin') {
                    $q->whereHas('repairOrder', function ($ro) use ($user) {
                        $ro->withoutGlobalScopes()->where('tenant_id', $user->tenant_id);
                        if (! in_array($user->role, ['admin', 'super_admin'], true) && $user->branch_id) {
                            $ro->where('branch_id', $user->branch_id);
                        }
                    });
                }
            },
        ])->find($id);

        if (! $partner) {
            return $this->empty('Không tìm thấy đối tác.');
        }

        return $this->success($partner, 'Lấy chi tiết đối tác thành công.');
    }

    /**
     * Cập nhật thông tin đối tác.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (! $user || ! in_array($user->role, ['admin', 'super_admin'], true)) {
            abort(403, 'Chỉ quản trị viên mới có quyền cập nhật đối tác.');
        }

        $partner = Partner::find($id);

        if (! $partner) {
            return $this->empty('Không tìm thấy đối tác.');
        }

        $validated = $request->validate([
            'code'           => "nullable|string|max:50|unique:partners,code,{$id}",
            'name'           => 'nullable|string|max:255',
            'service_type'   => 'nullable|string|max:100',
            'contact_person' => 'nullable|string|max:255',
            'phone'          => 'nullable|string|max:50',
            'status'         => 'nullable|string|in:active,inactive',
            'api_config'     => 'nullable|array',
        ]);

        $partner->update(array_filter($validated, fn ($val) => $val !== null));

        return $this->success($partner, 'Cập nhật đối tác thành công.');
    }
}
