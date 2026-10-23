<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Partner;
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
            $query->where('status', $status);
        }

        if ($serviceType = $request->input('service_type')) {
            $query->where('service_type', $serviceType);
        }

        if ($search = $request->input('q', $request->input('search'))) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('code', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%")
                  ->orWhere('contact_person', 'like', "%{$search}%");
            });
        }

        $perPage = (int) $request->input('per_page', 50);
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
