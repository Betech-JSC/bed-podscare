<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SaasInvoice;
use App\Models\SepayTransaction;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SePayPlatformWebhookController extends Controller
{
    /**
     * Xử lý webhook từ SePay Platform VietQR.
     */
    public function handle(Request $request): JsonResponse
    {
        // 1. Xác thực Secret API Key SePay
        $secret = config('sepay.webhook_secret') ?? config('services.sepay.api_key');

        $headerKey = $request->header('SePay-Api-Key') 
            ?? $request->header('X-SePay-Api-Key') 
            ?? $request->header('sepay-api-key')
            ?? $request->bearerToken();

        $authHeader = $request->header('Authorization');
        if (! $headerKey && $authHeader) {
            if (preg_match('/(?:Apikey|Bearer)\s+(.+)/i', $authHeader, $matches)) {
                $headerKey = trim($matches[1]);
            } else {
                $headerKey = trim($authHeader);
            }
        }

        if (! $headerKey) {
            $headerKey = $request->input('api_key');
        }

        if (empty($secret) || empty($headerKey) || ! hash_equals((string) $secret, (string) $headerKey)) {
            Log::warning('SePay Webhook unauthorized attempt', [
                'ip'        => $request->ip(),
                'headerKey' => $headerKey,
            ]);

            return response()->json([
                'success' => false,
                'error'   => 'Unauthorized',
                'message' => 'Mã xác thực Webhook không hợp lệ.',
            ], 401);
        }

        $payload = $request->all();
        $sepayTxId = (string) ($payload['id'] ?? $payload['transaction_id'] ?? '');
        $content = (string) ($payload['content'] ?? $payload['description'] ?? '');
        $transferAmount = (float) ($payload['transferAmount'] ?? $payload['amount'] ?? 0);

        return DB::transaction(function () use ($request, $payload, $sepayTxId, $content, $transferAmount) {
            // 2. Idempotency Check chống trùng lặp giao dịch
            if (! empty($sepayTxId) && SepayTransaction::where('sepay_transaction_id', $sepayTxId)->exists()) {
                return response()->json([
                    'success' => true,
                    'message' => 'already_processed',
                    'code'    => 'ALREADY_PROCESSED',
                ], 200);
            }

            // 3. Tách mã hóa đơn từ nội dung chuyển khoản: FIXSUB{id}
            if (! preg_match('/FIXSUB(\d+)/i', $content, $matches)) {
                Log::warning("SePay webhook unrecognized reference: {$content}", $payload);

                if (! empty($sepayTxId)) {
                    SepayTransaction::create([
                        'sepay_transaction_id' => $sepayTxId,
                        'reference_code'       => 'UNRECOGNIZED',
                        'amount'               => $transferAmount,
                        'accumulated'          => $payload['accumulated'] ?? null,
                        'account_number'       => $payload['accountNumber'] ?? null,
                        'transaction_content'  => $content,
                        'bank_brand'           => $payload['gateway'] ?? $payload['bank_brand'] ?? null,
                        'gateway'              => $payload['gateway'] ?? null,
                        'transaction_date'     => $payload['transactionDate'] ?? now(),
                        'raw_payload'          => $payload,
                    ]);
                }

                return response()->json([
                    'success' => false,
                    'message' => 'Unrecognized reference code',
                ], 200);
            }

            $invoiceId = (int) $matches[1];
            $refCode = 'FIXSUB' . $invoiceId;

            // 4. Khóa dòng hóa đơn bằng lockForUpdate
            $invoice = SaasInvoice::where('id', $invoiceId)
                ->orWhere('reference_code', $refCode)
                ->lockForUpdate()
                ->first();

            if (! $invoice) {
                Log::warning("SePay webhook invoice not found: {$refCode}", $payload);

                return response()->json([
                    'success' => false,
                    'message' => 'Invoice not found',
                ], 200);
            }

            if ($invoice->status === 'paid') {
                return response()->json([
                    'success' => true,
                    'message' => 'Invoice already paid',
                ], 200);
            }

            // 5. Kiểm tra số tiền chuyển khoản
            if ($transferAmount < (float) $invoice->amount) {
                Log::error("SePay webhook underpaid for invoice {$invoiceId}: expected {$invoice->amount}, got {$transferAmount}");

                return response()->json([
                    'success' => false,
                    'error'   => 'Amount insufficient',
                    'message' => 'Số tiền chuyển khoản không đủ giá trị hóa đơn.',
                ], 422);
            }

            // 6. Cập nhật hóa đơn
            $invoice->update([
                'status'  => 'paid',
                'paid_at' => now(),
            ]);

            // 7. Lưu vết giao dịch SePay (Idempotency key)
            SepayTransaction::create([
                'sepay_transaction_id' => $sepayTxId ?: ('TXN_' . uniqid()),
                'saas_invoice_id'      => $invoice->id,
                'reference_code'       => $invoice->reference_code,
                'amount'               => $transferAmount,
                'accumulated'          => $payload['accumulated'] ?? null,
                'account_number'       => $payload['accountNumber'] ?? null,
                'transaction_content'  => $content,
                'bank_brand'           => $payload['gateway'] ?? $payload['bank_brand'] ?? null,
                'gateway'              => $payload['gateway'] ?? null,
                'transaction_date'     => $payload['transactionDate'] ?? now(),
                'raw_payload'          => $payload,
            ]);

            // 8. Khóa dòng Tenant và gia hạn ngày sử dụng
            $tenant = Tenant::where('id', $invoice->tenant_id)->lockForUpdate()->first();
            if ($tenant) {
                $daysToAdd = ($invoice->billing_cycle === 'yearly') ? 365 : 30;
                $baseDate = ($tenant->expires_at && $tenant->expires_at->isFuture())
                    ? $tenant->expires_at
                    : now();

                $newExpiresAt = $baseDate->copy()->addDays($daysToAdd);

                $tenant->update([
                    'plan'            => $invoice->plan_id,
                    'current_plan_id' => $invoice->plan_id,
                    'billing_cycle'   => $invoice->billing_cycle,
                    'expires_at'      => $newExpiresAt,
                    'status'          => 'active',
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Subscription activated successfully',
            ], 200);
        });
    }
}
