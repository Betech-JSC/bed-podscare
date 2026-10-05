<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class TenantSettingController extends Controller
{
    /**
     * Lấy thông tin nhận diện thương hiệu của Tenant hiện tại.
     */
    public function getSettings(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return $this->failure('Chưa xác thực danh tính.', 401);
        }

        $tenant = $user->tenant;
        if (! $tenant && $user->role === 'super_admin') {
            $tenant = Tenant::where('code', 'fixo-master')->first() ?? Tenant::first();
        }

        if (! $tenant) {
            return $this->failure('Không tìm thấy thông tin gian hàng.', 404);
        }

        return $this->success([
            'tenant_id'           => $tenant->id,
            'name'                => $tenant->name,
            'code'                => $tenant->code,
            'logo_url'            => $tenant->logo_url,
            'hotline'             => $tenant->hotline,
            'receipt_footer_note' => $tenant->receipt_footer_note,
        ], 'Lấy thông tin nhận diện thương hiệu thành công.');
    }

    /**
     * Alias for getSettings (RESTful resource show).
     */
    public function show(Request $request): JsonResponse
    {
        return $this->getSettings($request);
    }

    /**
     * Cập nhật thông tin hotline và lời dặn chân phiếu in.
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return $this->failure('Chưa xác thực danh tính.', 401);
        }

        $tenant = $user->tenant;
        if (! $tenant) {
            return $this->failure('Không tìm thấy thông tin gian hàng.', 404);
        }

        $validated = $request->validate([
            'name'                => 'nullable|string|max:255',
            'hotline'             => 'nullable|string|max:50',
            'receipt_footer_note' => 'nullable|string|max:255',
        ]);

        if ($request->has('name') && ! empty($validated['name'])) {
            $tenant->name = $validated['name'];
        }
        if ($request->has('hotline')) {
            $tenant->hotline = $validated['hotline'];
        }
        if ($request->has('receipt_footer_note')) {
            $tenant->receipt_footer_note = $validated['receipt_footer_note'];
        }

        $tenant->save();

        return $this->success([
            'tenant_id'           => $tenant->id,
            'name'                => $tenant->name,
            'code'                => $tenant->code,
            'logo_url'            => $tenant->logo_url,
            'hotline'             => $tenant->hotline,
            'receipt_footer_note' => $tenant->receipt_footer_note,
        ], 'Cập nhật cấu hình thương hiệu thành công.');
    }

    /**
     * Alias for updateSettings (RESTful resource update).
     */
    public function update(Request $request): JsonResponse
    {
        return $this->updateSettings($request);
    }

    /**
     * Tải lên logo thương hiệu riêng của gian hàng.
     */
    public function uploadLogo(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return $this->failure('Chưa xác thực danh tính.', 401);
        }

        $tenant = $user->tenant;
        if (! $tenant) {
            return $this->failure('Không tìm thấy thông tin gian hàng.', 404);
        }

        $request->validate([
            'logo'  => 'nullable|file|mimes:jpeg,png,jpg,svg,webp|max:2048',
            'file'  => 'nullable|file|mimes:jpeg,png,jpg,svg,webp|max:2048',
            'image' => 'nullable|file|mimes:jpeg,png,jpg,svg,webp|max:2048',
        ]);

        $file = $request->file('logo') ?? $request->file('file') ?? $request->file('image');
        if (! $file) {
            return $this->failure('Vui lòng chọn file ảnh logo hợp lệ.', 422);
        }

        // Xóa logo cũ trên public disk nếu có
        $this->deleteDiskLogoFile($tenant->logo_url);

        // Lưu file logo mới
        $extension = $file->getClientOriginalExtension() ?: 'png';
        $filename = 'logo_' . time() . '_' . Str::random(8) . '.' . $extension;
        $path = $file->storeAs("tenants/{$tenant->id}/branding", $filename, 'public');
        $url = asset("storage/{$path}");

        $tenant->logo_url = $url;
        $tenant->save();

        return $this->success([
            'tenant_id'           => $tenant->id,
            'name'                => $tenant->name,
            'code'                => $tenant->code,
            'logo_url'            => $tenant->logo_url,
            'hotline'             => $tenant->hotline,
            'receipt_footer_note' => $tenant->receipt_footer_note,
        ], 'Tải lên logo thương hiệu thành công.');
    }

    /**
     * Xóa logo thương hiệu của gian hàng (fallback về logo mặc định).
     */
    public function deleteLogo(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return $this->failure('Chưa xác thực danh tính.', 401);
        }

        $tenant = $user->tenant;
        if (! $tenant) {
            return $this->failure('Không tìm thấy thông tin gian hàng.', 404);
        }

        $this->deleteDiskLogoFile($tenant->logo_url);

        $tenant->logo_url = null;
        $tenant->save();

        return $this->success([
            'tenant_id'           => $tenant->id,
            'name'                => $tenant->name,
            'code'                => $tenant->code,
            'logo_url'            => null,
            'hotline'             => $tenant->hotline,
            'receipt_footer_note' => $tenant->receipt_footer_note,
        ], 'Xóa logo thương hiệu thành công.');
    }

    /**
     * Xóa file ảnh lưu trữ trên public storage nếu tồn tại.
     */
    protected function deleteDiskLogoFile(?string $logoUrl): void
    {
        if (! $logoUrl) {
            return;
        }

        $relativePos = strpos($logoUrl, '/storage/');
        if ($relativePos !== false) {
            $relative = substr($logoUrl, $relativePos + strlen('/storage/'));
            if ($relative && Storage::disk('public')->exists($relative)) {
                Storage::disk('public')->delete($relative);
            }
        }
    }
}
