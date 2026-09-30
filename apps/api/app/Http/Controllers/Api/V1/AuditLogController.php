<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    /**
     * Danh sách nhật ký hoạt động hệ thống (Audit Trail).
     *
     * Hỗ trợ sắp xếp mới nhất, eager load user/causer, phân trang mặc định 50 bản ghi,
     * và lọc theo module (auditable_type) hoặc action.
     */
    public function index(Request $request): JsonResponse
    {
        $query = AuditLog::with(['user:id,name,email,role,avatar_url', 'auditable'])->latest('id');

        // Lọc theo module / auditable_type (ví dụ: RepairOrder, Payment, Warranty...)
        if ($module = $request->input('module', $request->input('auditable_type'))) {
            $query->where(function ($q) use ($module) {
                $q->where('auditable_type', $module)
                  ->orWhere('auditable_type', 'like', "%{$module}%");
            });
        }

        // Lọc theo action
        if ($action = $request->input('action')) {
            $query->where('action', 'like', "%{$action}%");
        }

        // Lọc theo người thực hiện
        if ($userId = $request->input('user_id')) {
            $query->where('user_id', $userId);
        }

        // Tìm kiếm tổng hợp theo q
        if ($search = $request->input('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('details', 'like', "%{$search}%")
                  ->orWhere('action', 'like', "%{$search}%")
                  ->orWhere('user_name', 'like', "%{$search}%")
                  ->orWhere('auditable_type', 'like', "%{$search}%");
            });
        }

        // Phân trang mặc định 50 bản ghi
        $perPage = (int) $request->input('per_page', $request->input('limit', 50));
        $perPage = max(1, min($perPage, 100));

        $logs = $query->paginate($perPage);

        return $this->success($logs, 'Lấy danh sách nhật ký hoạt động thành công.');
    }

    /**
     * Chi tiết một bản ghi nhật ký hoạt động.
     */
    public function show(int $id): JsonResponse
    {
        $log = AuditLog::with(['user:id,name,email,role,avatar_url', 'auditable'])->find($id);

        if (! $log) {
            return $this->empty('Không tìm thấy bản ghi nhật ký hoạt động.');
        }

        return $this->success($log, 'Lấy chi tiết nhật ký hoạt động thành công.');
    }
}
