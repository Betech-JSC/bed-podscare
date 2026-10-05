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

        // 1. Kiểm tra nếu request tải lên file dạng multipart
        $hasUploadFile = $request->hasFile('logo') || $request->hasFile('file') || $request->hasFile('image')
            || ($request->file('logo') instanceof \Illuminate\Http\UploadedFile)
            || ($request->file('file') instanceof \Illuminate\Http\UploadedFile)
            || ($request->file('image') instanceof \Illuminate\Http\UploadedFile);

        if ($hasUploadFile) {
            $request->validate([
                'logo'  => 'nullable|file|mimes:jpeg,png,jpg,svg,webp,svg+xml|max:5120',
                'file'  => 'nullable|file|mimes:jpeg,png,jpg,svg,webp,svg+xml|max:5120',
                'image' => 'nullable|file|mimes:jpeg,png,jpg,svg,webp,svg+xml|max:5120',
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

        // 2. Hỗ trợ Base64 Data URL (Dual-layer resilience khi client gửi JSON hoặc proxy bị chặn multipart)
        $base64Input = $request->input('logo_base64')
            ?? (is_string($request->input('logo')) ? $request->input('logo') : null)
            ?? (is_string($request->input('image')) ? $request->input('image') : null)
            ?? (is_string($request->input('file')) ? $request->input('file') : null);

        if (! empty($base64Input)) {
            $binaryData = null;
            $extension = 'png';

            if (preg_match('/^data:image\/([a-zA-Z0-9\+\-]+);base64,(.+)$/si', $base64Input, $matches)) {
                $mimeSub = strtolower($matches[1]);
                $encodedData = $matches[2];
                $allowedMimes = [
                    'png'      => 'png',
                    'jpeg'     => 'jpg',
                    'jpg'      => 'jpg',
                    'webp'     => 'webp',
                    'svg+xml'  => 'svg',
                    'svg'      => 'svg',
                ];

                if (! isset($allowedMimes[$mimeSub])) {
                    return response()->json([
                        'message' => 'The logo field must be a file of type: jpeg, png, jpg, svg, webp.',
                        'errors'  => [
                            'logo' => ['The logo field must be a file of type: jpeg, png, jpg, svg, webp.'],
                        ],
                    ], 422);
                }

                $extension = $allowedMimes[$mimeSub];
                $binaryData = base64_decode($encodedData, true);
            } else {
                // Chuỗi Base64 thuần không có prefix Data URL
                $binaryData = base64_decode($base64Input, true);
            }

            if ($binaryData === false || strlen($binaryData) === 0) {
                return response()->json([
                    'message' => 'Dữ liệu ảnh base64 không hợp lệ.',
                    'errors'  => [
                        'logo' => ['Dữ liệu ảnh base64 không hợp lệ.'],
                    ],
                ], 422);
            }

            // Giới hạn dung lượng tối đa 5MB (5120 KB = 5,242,880 bytes)
            if (strlen($binaryData) > 5 * 1024 * 1024) {
                return response()->json([
                    'message' => 'The logo field must not be greater than 5120 kilobytes.',
                    'errors'  => [
                        'logo' => ['The logo field must not be greater than 5120 kilobytes.'],
                    ],
                ], 422);
            }

            // Kiểm tra an toàn MIME type qua finfo
            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $detectedMime = $finfo->buffer($binaryData);

            $validMimeMap = [
                'image/png'     => 'png',
                'image/jpeg'    => 'jpg',
                'image/webp'    => 'webp',
                'image/svg+xml' => 'svg',
            ];

            // Bảo vệ an toàn SVG và kiểm tra định dạng
            if ($extension === 'svg' || str_contains($binaryData, '<svg')) {
                if (str_contains($binaryData, '<?php') || str_contains($binaryData, '<script')) {
                    return response()->json([
                        'message' => 'Tệp ảnh chứa mã độc hại nguy hiểm.',
                        'errors'  => [
                            'logo' => ['Tệp ảnh chứa mã độc hại nguy hiểm.'],
                        ],
                    ], 422);
                }
                $extension = 'svg';
            } elseif (isset($validMimeMap[$detectedMime])) {
                $extension = $validMimeMap[$detectedMime];
            } else {
                return response()->json([
                    'message' => 'The logo field must be a file of type: jpeg, png, jpg, svg, webp.',
                    'errors'  => [
                        'logo' => ['The logo field must be a file of type: jpeg, png, jpg, svg, webp.'],
                    ],
                ], 422);
            }

            // Xóa logo cũ trên public disk nếu có
            $this->deleteDiskLogoFile($tenant->logo_url);

            // Lưu file logo mới từ dữ liệu Base64
            $filename = 'logo_' . time() . '_' . Str::random(8) . '.' . $extension;
            $relativePath = "tenants/{$tenant->id}/branding/{$filename}";
            Storage::disk('public')->put($relativePath, $binaryData);
            $url = asset("storage/{$relativePath}");

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

        // 3. Nếu không có file và cũng không có base64, thực hiện validate chuẩn để trả về lỗi 422
        $request->validate([
            'logo'  => 'required|file|mimes:jpeg,png,jpg,svg,webp,svg+xml|max:5120',
        ]);

        return $this->failure('Vui lòng chọn file ảnh logo hợp lệ.', 422);
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
