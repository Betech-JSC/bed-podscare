<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    /**
     * Danh sách chi nhánh hoạt động.
     */
    public function index(Request $request): JsonResponse
    {
        $branches = Branch::where('is_active', true)
            ->withCount(['users', 'repairOrders'])
            ->get();

        return $this->success($branches, 'Lấy danh sách chi nhánh thành công.');
    }

    /**
     * Chi tiết chi nhánh.
     */
    public function show(int $id): JsonResponse
    {
        $branch = Branch::with(['users:id,branch_id,name,role,phone,avatar_url'])
            ->find($id);

        if (! $branch) {
            return $this->empty('Không tìm thấy chi nhánh.');
        }

        return $this->success($branch, 'Lấy chi tiết chi nhánh thành công.');
    }
}
