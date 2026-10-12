<?php

namespace App\Services;

use App\Models\Supplier;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Str;

class SupplierService
{
    /**
     * Lấy danh sách nhà cung cấp có phân trang hoặc toàn bộ.
     */
    public function getSuppliers(int $tenantId, array $filters = []): LengthAwarePaginator|Collection
    {
        $query = Supplier::where('tenant_id', $tenantId);

        if (! empty($filters['search'])) {
            $search = trim($filters['search']);
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('code', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        if (isset($filters['is_active'])) {
            $query->where('is_active', filter_var($filters['is_active'], FILTER_VALIDATE_BOOLEAN));
        }

        if (! empty($filters['has_debt'])) {
            $query->where('debt_balance', '>', 0);
        }

        $query->orderBy('name', 'asc');

        if (! empty($filters['all'])) {
            return $query->get();
        }

        $perPage = (int) ($filters['per_page'] ?? 15);
        return $query->paginate($perPage);
    }

    /**
     * Tạo mới nhà cung cấp.
     */
    public function createSupplier(int $tenantId, array $data): Supplier
    {
        $code = ! empty($data['code']) ? trim(strtoupper($data['code'])) : $this->generateSupplierCode($tenantId);

        return Supplier::create([
            'tenant_id'    => $tenantId,
            'code'         => $code,
            'name'         => trim($data['name']),
            'phone'        => trim($data['phone']),
            'email'        => ! empty($data['email']) ? trim($data['email']) : null,
            'address'      => $data['address'] ?? null,
            'tax_code'     => $data['tax_code'] ?? null,
            'debt_balance' => 0.00,
            'notes'        => $data['notes'] ?? null,
            'is_active'    => isset($data['is_active']) ? (bool) $data['is_active'] : true,
        ]);
    }

    /**
     * Cập nhật thông tin nhà cung cấp.
     */
    public function updateSupplier(Supplier $supplier, array $data): Supplier
    {
        $fillable = ['name', 'phone', 'email', 'address', 'tax_code', 'notes', 'is_active'];
        $updateData = [];

        foreach ($fillable as $field) {
            if (array_key_exists($field, $data)) {
                $updateData[$field] = $data[$field];
            }
        }

        if (! empty($data['code'])) {
            $updateData['code'] = trim(strtoupper($data['code']));
        }

        $supplier->update($updateData);

        return $supplier->refresh();
    }

    /**
     * Xóa mềm hoặc vô hiệu hóa nhà cung cấp.
     */
    public function deleteSupplier(Supplier $supplier): bool
    {
        if ((float) $supplier->debt_balance > 0) {
            throw new \DomainException("Không thể xóa nhà cung cấp đang có công nợ ({$supplier->debt_balance} ₫). Hãy thanh toán hết công nợ trước.");
        }

        if ($supplier->goodsReceipts()->exists()) {
            // Nếu đã từng có phiếu nhập kho, chuyển trạng thái is_active = false thay vì xóa cứng
            $supplier->is_active = false;
            return $supplier->save();
        }

        return $supplier->delete();
    }

    /**
     * Sinh mã nhà cung cấp tự động duy nhất trong tenant.
     */
    public function generateSupplierCode(int $tenantId): string
    {
        do {
            $code = 'SUP-' . strtoupper(Str::random(5));
        } while (Supplier::withoutGlobalScopes()->where('tenant_id', $tenantId)->where('code', $code)->exists());

        return $code;
    }
}
