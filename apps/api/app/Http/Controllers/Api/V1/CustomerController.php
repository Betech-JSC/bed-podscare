<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        $customers = $query->orderByDesc('id')
            ->paginate($request->input('per_page', 15));

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
