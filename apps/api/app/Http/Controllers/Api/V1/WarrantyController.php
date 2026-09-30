<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Warranty;
use App\Models\WarrantyClaim;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class WarrantyController extends Controller
{
    /**
     * Danh sách sổ bảo hành điện tử.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Warranty::with(['repairOrder', 'customer', 'deviceModel']);

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($search = $request->input('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('warranty_code', 'like', "%{$search}%")
                  ->orWhereHas('customer', function ($sq) use ($search) {
                      $sq->where('phone', 'like', "%{$search}%")
                         ->orWhere('name', 'like', "%{$search}%");
                  });
            });
        }

        $warranties = $query->latest('id')->paginate($request->input('per_page', 15));

        return $this->success($warranties, 'Lấy danh sách bảo hành thành công.');
    }

    /**
     * Tra cứu sổ bảo hành điện tử theo Mã bảo hành hoặc Số điện thoại.
     */
    public function lookup(Request $request): JsonResponse
    {
        $code = $request->input('code');
        $phone = $request->input('phone');

        if (! $code && ! $phone) {
            return $this->failure('Vui lòng cung cấp mã bảo hành (code) hoặc số điện thoại (phone).', 422);
        }

        $query = Warranty::with(['repairOrder', 'customer', 'deviceModel', 'claims']);

        if ($code) {
            $query->where('warranty_code', $code);
        }

        if ($phone) {
            $query->whereHas('customer', function ($q) use ($phone) {
                $q->where('phone', $phone);
            });
        }

        $results = $query->latest('id')->get();

        if ($results->isEmpty()) {
            return $this->empty('Không tìm thấy thông tin bảo hành phù hợp.');
        }

        return $this->success($results, 'Tra cứu thông tin bảo hành thành công.');
    }

    /**
     * Danh sách yêu cầu khiếu nại / tiếp nhận bảo hành.
     */
    public function claims(Request $request): JsonResponse
    {
        $query = WarrantyClaim::with(['warranty.customer', 'warranty.deviceModel', 'reworkOrder', 'receivedByUser:id,name']);

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $claims = $query->latest('id')->paginate($request->input('per_page', 15));

        return $this->success($claims, 'Lấy danh sách yêu cầu bảo hành thành công.');
    }

    /**
     * Tiếp nhận yêu cầu bảo hành phát sinh.
     */
    public function createClaim(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'warranty_id'       => 'required|exists:warranties,id',
            'issue_description' => 'required|string',
            'resolution_mode'   => 'required|in:store_check,send_tech,replace_part,rejected',
            'notes'             => 'nullable|string',
        ]);

        return DB::transaction(function () use ($request, $validated) {
            $warranty = Warranty::findOrFail($validated['warranty_id']);

            $date = date('Ym');
            $rand = str_pad((string) random_int(1, 99), 2, '0', STR_PAD_LEFT);
            $claimCode = "CLM-{$date}-{$rand}";

            $claim = WarrantyClaim::create([
                'claim_code'          => $claimCode,
                'warranty_id'         => $warranty->id,
                'issue_description'   => $validated['issue_description'],
                'resolution_mode'     => $validated['resolution_mode'],
                'notes'               => $validated['notes'] ?? null,
                'status'              => 'received',
                'received_by_user_id' => $request->user()->id,
            ]);

            AuditLog::create([
                'user_id'        => $request->user()->id,
                'user_name'      => $request->user()->name,
                'action'         => 'Tiếp nhận bảo hành',
                'auditable_type' => 'WarrantyClaim',
                'auditable_id'   => $claim->id,
                'details'        => "Tiếp nhận khiếu nại {$claimCode} cho sổ bảo hành {$warranty->warranty_code}",
                'ip_address'     => $request->ip(),
            ]);

            return $this->success($claim->load('warranty'), 'Tiếp nhận yêu cầu bảo hành thành công.', 201);
        });
    }
}
