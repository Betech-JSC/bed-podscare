<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CustomerController extends Controller
{
    /**
     * Tìm kiếm & danh sách khách hàng.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Customer::query();

        if ($search = $request->input('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('phone', 'like', "%{$search}%")
                  ->orWhere('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if ($type = $request->input('customer_type')) {
            $query->where('customer_type', $type);
        }

        if ($request->boolean('all') || $request->input('per_page') === 'all') {
            $items = $query->orderByDesc('id')->limit(1000)->get();
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
            ], 'Lấy danh sách khách hàng thành công.');
        }

        $perPage = max(1, min(500, (int) $request->input('per_page', 15)));
        $customers = $query->orderByDesc('id')
            ->paginate($perPage);

        return $this->success($customers, 'Lấy danh sách khách hàng thành công.');
    }

    /**
     * Tạo mới hoặc cập nhật thông tin khách hàng.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone'         => 'required|string|max:20',
            'name'          => 'required|string|max:255',
            'email'         => 'nullable|email|max:255',
            'customer_type' => 'nullable|in:retail,dealer,vip',
            'source'        => 'nullable|in:store,website,facebook,referral,other',
            'notes'         => 'nullable|string',
        ]);

        $customer = Customer::updateOrCreate(
            ['phone' => $validated['phone']],
            $validated
        );

        return $this->success($customer, 'Lưu thông tin khách hàng thành công.', 201);
    }

    /**
     * Cập nhật thông tin hồ sơ khách hàng.
     */
    public function update(Request $request, int|string $id): JsonResponse
    {
        $customer = Customer::find($id);

        if (! $customer) {
            return $this->failure('Không tìm thấy khách hàng.', 404);
        }

        $user = $request->user();
        $tenantId = $user?->tenant_id ?? $customer->tenant_id;

        $phoneRule = Rule::unique('customers', 'phone')->ignore($customer->id);
        if ($tenantId) {
            $phoneRule->where('tenant_id', $tenantId);
        }

        $validated = $request->validate([
            'name'          => 'sometimes|required|string|max:255',
            'phone'         => [
                'sometimes',
                'required',
                'string',
                'regex:/^(0|\+?84)[35789]\d{8}$/',
                $phoneRule,
            ],
            'address'       => 'nullable|string|max:500',
            'email'         => 'nullable|email|max:255',
            'customer_type' => 'nullable|in:retail,dealer,vip',
            'source'        => 'nullable|in:store,website,facebook,referral,other',
            'notes'         => 'nullable|string',
        ], [
            'name.required'  => 'Họ và tên khách hàng không được để trống.',
            'phone.required' => 'Số điện thoại không được để trống.',
            'phone.regex'    => 'Số điện thoại không đúng định dạng số điện thoại Việt Nam.',
            'phone.unique'   => 'Số điện thoại này đã được sử dụng bởi khách hàng khác.',
            'email.email'    => 'Địa chỉ email không đúng định dạng.',
        ]);

        $customer->update($validated);

        return $this->success($customer->fresh(), 'Cập nhật thông tin khách hàng thành công.');
    }

    /**
     * Chi tiết khách hàng kèm các đơn sửa chữa & bảo hành.
     */
    public function show(int $id): JsonResponse
    {
        $customer = Customer::with(['repairOrders' => function ($q) {
            $q->latest()->limit(50)->with(['deviceModel', 'warranties', 'branch', 'technician']);
        }, 'warranties.deviceModel'])->find($id);

        if (! $customer) {
            return $this->empty('Không tìm thấy khách hàng.');
        }

        return $this->success($customer, 'Lấy thông tin khách hàng thành công.');
    }

    /**
     * Lịch sử sửa chữa của khách hàng.
     */
    public function history(Request $request, int $id): JsonResponse
    {
        $customer = Customer::find($id);

        if (! $customer) {
            return $this->empty('Không tìm thấy khách hàng.');
        }

        $history = $customer->repairOrders()
            ->with(['deviceModel', 'branch', 'technician', 'payments', 'warranties'])
            ->latest()
            ->paginate($request->input('per_page', 20));

        return $this->success($history, 'Lấy lịch sử sửa chữa của khách hàng thành công.');
    }
}
