<?php

namespace App\Console\Commands;

use App\Models\Branch;
use App\Models\RepairOrder;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class NormalizeOrderCodesAndPrices extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'orders:normalize-codes-and-prices {--dry-run : Chỉ xem trước không ghi DB}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Chuẩn hóa toàn bộ đơn sửa chữa có giá mồi 1đ / số lẻ ...001đ và chuyển đổi mã đơn FX... sang PC{branch_code}{DDMMYY}{STT}';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $priceAdjustedOrders = [];
        $priceAdjustedPaymentsCount = 0;
        $priceAdjustedCashTxCount = 0;
        $priceAdjustedShiftsCount = 0;
        $priceAdjustedCustomersCount = 0;
        $codeRenamedOrders = [];

        $runner = function () use (
            $dryRun,
            &$priceAdjustedOrders,
            &$priceAdjustedPaymentsCount,
            &$priceAdjustedCashTxCount,
            &$priceAdjustedShiftsCount,
            &$priceAdjustedCustomersCount,
            &$codeRenamedOrders
        ) {
            $affectedCustomerIds = [];
            $affectedShiftIds = [];

            // =========================================================================
            // PHẦN A: CHUẨN HÓA GIÁ MỒI 1Đ VÀ SỐ LẺ ...001Đ (% 1000 === 1)
            // =========================================================================
            $orders = RepairOrder::withoutGlobalScopes()
                ->with('payments')
                ->orderBy('id')
                ->get();

            foreach ($orders as $order) {
                $oldInitial = $order->initial_price !== null ? (float) $order->initial_price : null;
                $oldTotal = (float) ($order->total_price ?? 0);
                $services = is_array($order->additional_services) ? $order->additional_services : [];

                $servicesModified = false;
                $additionalSum = 0.0;
                $normalizedServices = [];

                foreach ($services as $srv) {
                    $oldSrvPrice = (float) ($srv['price'] ?? 0);
                    $normSrvPrice = RepairOrder::normalizeVndAmount($oldSrvPrice);
                    if ($normSrvPrice !== $oldSrvPrice) {
                        $servicesModified = true;
                    }
                    $srv['price'] = $normSrvPrice;
                    $additionalSum += $normSrvPrice;
                    $normalizedServices[] = $srv;
                }

                $newInitial = $oldInitial !== null ? RepairOrder::normalizeVndAmount($oldInitial) : null;

                if (! empty($normalizedServices)) {
                    $base = $newInitial !== null
                        ? $newInitial
                        : RepairOrder::normalizeVndAmount(max(0.0, $oldTotal - $additionalSum));
                    if ($newInitial === null) {
                        $newInitial = $base;
                    }
                    $newTotal = RepairOrder::normalizeVndAmount($base + $additionalSum);
                } else {
                    $newTotal = RepairOrder::normalizeVndAmount($oldTotal);
                }

                $initialChanged = ($oldInitial !== null && $newInitial !== $oldInitial)
                    || ($oldInitial === null && $newInitial !== null);
                $totalChanged = $newTotal !== $oldTotal;

                if ($initialChanged || $totalChanged || $servicesModified) {
                    $priceAdjustedOrders[] = [
                        'id'          => $order->id,
                        'order_code'  => $order->order_code,
                        'old_initial' => $oldInitial,
                        'new_initial' => $newInitial,
                        'old_total'   => $oldTotal,
                        'new_total'   => $newTotal,
                    ];

                    if ($order->customer_id) {
                        $affectedCustomerIds[$order->customer_id] = true;
                    }

                    if (! $dryRun) {
                        $updateData = [
                            'initial_price' => $newInitial,
                            'total_price'   => $newTotal,
                        ];
                        if ($servicesModified) {
                            $updateData['additional_services'] = json_encode(array_values($normalizedServices), JSON_UNESCAPED_UNICODE);
                        }
                        DB::table('repair_orders')
                            ->where('id', $order->id)
                            ->update($updateData);
                    }
                }

                foreach ($order->payments as $payment) {
                    $oldPayAmt = (float) ($payment->amount ?? 0);
                    $newPayAmt = RepairOrder::normalizeVndAmount($oldPayAmt);
                    if ($newPayAmt !== $oldPayAmt) {
                        $priceAdjustedPaymentsCount++;
                        if ($order->customer_id) {
                            $affectedCustomerIds[$order->customer_id] = true;
                        }
                        if (! $dryRun) {
                            DB::table('payments')
                                ->where('id', $payment->id)
                                ->update(['amount' => $newPayAmt]);
                        }
                    }
                }
            }

            // Chuẩn hóa cash_transactions
            $cashTxs = DB::table('cash_transactions')->orderBy('id')->get();
            foreach ($cashTxs as $tx) {
                $oldTxAmt = (float) ($tx->amount ?? 0);
                $newTxAmt = RepairOrder::normalizeVndAmount($oldTxAmt);
                if ($newTxAmt !== $oldTxAmt) {
                    $priceAdjustedCashTxCount++;
                    if ($tx->shift_id) {
                        $affectedShiftIds[$tx->shift_id] = true;
                    }
                    if (! $dryRun) {
                        DB::table('cash_transactions')
                            ->where('id', $tx->id)
                            ->update(['amount' => $newTxAmt]);
                    }
                }
            }

            // Chuẩn hóa work_shifts bị ảnh hưởng hoặc có số lẻ % 1000 === 1
            $shifts = DB::table('work_shifts')->orderBy('id')->get();
            foreach ($shifts as $shift) {
                $oldSysIn = (float) ($shift->system_cash_in ?? 0);
                $oldSysOut = (float) ($shift->system_cash_out ?? 0);
                $oldOpening = (float) ($shift->opening_cash ?? 0);
                $oldExpected = (float) ($shift->expected_cash ?? 0);

                $newSysIn = isset($affectedShiftIds[$shift->id])
                    ? (float) DB::table('cash_transactions')
                        ->where('shift_id', $shift->id)
                        ->where('type', 'income')
                        ->where('payment_method', 'cash')
                        ->sum('amount')
                    : RepairOrder::normalizeVndAmount($oldSysIn);

                $newSysOut = isset($affectedShiftIds[$shift->id])
                    ? (float) DB::table('cash_transactions')
                        ->where('shift_id', $shift->id)
                        ->where('type', 'expense')
                        ->where('payment_method', 'cash')
                        ->sum('amount')
                    : RepairOrder::normalizeVndAmount($oldSysOut);

                $newSysIn = RepairOrder::normalizeVndAmount($newSysIn);
                $newSysOut = RepairOrder::normalizeVndAmount($newSysOut);
                $newOpening = RepairOrder::normalizeVndAmount($oldOpening);
                $newExpected = RepairOrder::normalizeVndAmount($newOpening + $newSysIn - $newSysOut);

                if ($newSysIn !== $oldSysIn || $newSysOut !== $oldSysOut || $newExpected !== $oldExpected) {
                    $priceAdjustedShiftsCount++;
                    if (! $dryRun) {
                        $shiftUpdates = [
                            'opening_cash'   => $newOpening,
                            'system_cash_in' => $newSysIn,
                            'system_cash_out'=> $newSysOut,
                            'expected_cash'  => $newExpected,
                        ];
                        if ($shift->actual_cash !== null) {
                            $shiftUpdates['difference_amount'] = (float) $shift->actual_cash - $newExpected;
                        }
                        DB::table('work_shifts')
                            ->where('id', $shift->id)
                            ->update($shiftUpdates);
                    }
                }
            }

            // Chuẩn hóa customers.total_spent
            $customers = DB::table('customers')->orderBy('id')->get();
            foreach ($customers as $customer) {
                $oldSpent = (float) ($customer->total_spent ?? 0);
                $normSpent = RepairOrder::normalizeVndAmount($oldSpent);

                if (isset($affectedCustomerIds[$customer->id]) || $normSpent !== $oldSpent) {
                    $recalcSpent = (float) DB::table('payments as p')
                        ->join('repair_orders as ro', 'p.repair_order_id', '=', 'ro.id')
                        ->where('ro.customer_id', $customer->id)
                        ->where('p.status', 'paid')
                        ->sum('p.amount');
                    $newSpent = $recalcSpent > 0 ? RepairOrder::normalizeVndAmount($recalcSpent) : $normSpent;

                    if ($newSpent !== $oldSpent) {
                        $priceAdjustedCustomersCount++;
                        if (! $dryRun) {
                            DB::table('customers')
                                ->where('id', $customer->id)
                                ->update(['total_spent' => $newSpent]);
                        }
                    }
                }
            }

            // =========================================================================
            // PHẦN B: ĐỔI TOÀN BỘ MÃ ĐƠN FX... SANG PC{branch_code}{DDMMYY}{STT}
            // =========================================================================
            $branches = Branch::withoutGlobalScopes()->get()->keyBy('id');

            $allOrderCodes = DB::table('repair_orders')
                ->pluck('order_code', 'id')
                ->all();

            $usedCodes = [];
            $maxSeqByPrefix = [];

            foreach ($allOrderCodes as $id => $code) {
                if (! $code) {
                    continue;
                }
                $usedCodes[$code] = true;
            }

            $fxOrders = DB::table('repair_orders')
                ->where('order_code', 'like', 'FX%')
                ->orderBy('created_at', 'asc')
                ->orderBy('id', 'asc')
                ->get(['id', 'order_code', 'branch_id', 'created_at']);

            foreach ($fxOrders as $fxOrder) {
                $oldCode = (string) $fxOrder->order_code;
                $branch = $branches->get($fxOrder->branch_id);
                $rawBranchCode = ! empty($branch?->code)
                    ? (string) $branch->code
                    : (string) ($branch?->id ?? $fxOrder->branch_id ?? 1);
                $branchCode = trim($rawBranchCode);

                $dateStr = $fxOrder->created_at
                    ? Carbon::parse($fxOrder->created_at)->timezone('Asia/Ho_Chi_Minh')->format('dmy')
                    : Carbon::now('Asia/Ho_Chi_Minh')->format('dmy');

                $prefix = "PC{$branchCode}{$dateStr}";

                if (! isset($maxSeqByPrefix[$prefix])) {
                    $maxSeq = 0;
                    foreach (array_keys($usedCodes) as $existingCode) {
                        if (str_starts_with($existingCode, $prefix)) {
                            $seqPart = substr($existingCode, strlen($prefix));
                            if (is_numeric($seqPart)) {
                                $seqInt = (int) $seqPart;
                                if ($seqInt > $maxSeq) {
                                    $maxSeq = $seqInt;
                                }
                            }
                        }
                    }
                    $maxSeqByPrefix[$prefix] = $maxSeq;
                }

                $nextSeq = $maxSeqByPrefix[$prefix] + 1;
                do {
                    $stt = $nextSeq >= 100
                        ? (string) $nextSeq
                        : str_pad((string) $nextSeq, 2, '0', STR_PAD_LEFT);
                    $newCode = "{$prefix}{$stt}";
                    if (isset($usedCodes[$newCode])) {
                        $nextSeq++;
                    } else {
                        break;
                    }
                } while (true);

                $maxSeqByPrefix[$prefix] = $nextSeq;
                unset($usedCodes[$oldCode]);
                $usedCodes[$newCode] = true;

                $codeRenamedOrders[] = [
                    'id'       => $fxOrder->id,
                    'old_code' => $oldCode,
                    'new_code' => $newCode,
                ];

                if (! $dryRun) {
                    DB::table('repair_orders')
                        ->where('id', $fxOrder->id)
                        ->update(['order_code' => $newCode]);

                    // 1. Đồng bộ trong cash_transactions (notes, recipient_payer)
                    $txRefs = DB::table('cash_transactions')
                        ->where('notes', 'like', "%{$oldCode}%")
                        ->orWhere('recipient_payer', 'like', "%{$oldCode}%")
                        ->get(['id', 'notes', 'recipient_payer']);

                    foreach ($txRefs as $txRef) {
                        DB::table('cash_transactions')
                            ->where('id', $txRef->id)
                            ->update([
                                'notes'           => $txRef->notes !== null ? str_replace($oldCode, $newCode, $txRef->notes) : null,
                                'recipient_payer' => $txRef->recipient_payer !== null ? str_replace($oldCode, $newCode, $txRef->recipient_payer) : null,
                            ]);
                    }

                    // 2. Đồng bộ trong inventory_transactions (notes)
                    $invRefs = DB::table('inventory_transactions')
                        ->where('notes', 'like', "%{$oldCode}%")
                        ->get(['id', 'notes']);

                    foreach ($invRefs as $invRef) {
                        DB::table('inventory_transactions')
                            ->where('id', $invRef->id)
                            ->update([
                                'notes' => str_replace($oldCode, $newCode, (string) $invRef->notes),
                            ]);
                    }

                    // 3. Đồng bộ trong notifications (title, message)
                    $notifRefs = DB::table('notifications')
                        ->where('title', 'like', "%{$oldCode}%")
                        ->orWhere('message', 'like', "%{$oldCode}%")
                        ->get(['id', 'title', 'message']);

                    foreach ($notifRefs as $notifRef) {
                        DB::table('notifications')
                            ->where('id', $notifRef->id)
                            ->update([
                                'title'   => $notifRef->title !== null ? str_replace($oldCode, $newCode, $notifRef->title) : null,
                                'message' => $notifRef->message !== null ? str_replace($oldCode, $newCode, $notifRef->message) : null,
                            ]);
                    }

                    // 4. Đồng bộ trong audit_logs (details, metadata, new_values)
                    $auditRefs = DB::table('audit_logs')
                        ->where('details', 'like', "%{$oldCode}%")
                        ->orWhere('metadata', 'like', "%{$oldCode}%")
                        ->orWhere('new_values', 'like', "%{$oldCode}%")
                        ->get(['id', 'details', 'metadata', 'new_values']);

                    foreach ($auditRefs as $auditRef) {
                        DB::table('audit_logs')
                            ->where('id', $auditRef->id)
                            ->update([
                                'details'    => $auditRef->details !== null ? str_replace($oldCode, $newCode, $auditRef->details) : null,
                                'metadata'   => $auditRef->metadata !== null ? str_replace($oldCode, $newCode, $auditRef->metadata) : null,
                                'new_values' => $auditRef->new_values !== null ? str_replace($oldCode, $newCode, $auditRef->new_values) : null,
                            ]);
                    }
                }
            }
        };

        if ($dryRun) {
            $runner();
            $this->warn('=== CHẾ ĐỘ XEM TRƯỚC (DRY-RUN) — KHÔNG GHI CƠ SỞ DỮ LIỆU ===');
        } else {
            DB::transaction($runner);
            $this->info('=== ĐÃ CHUẨN HÓA MÃ ĐƠN VÀ GIÁ TIỀN THÀNH CÔNG ===');
        }

        $this->table(
            ['Hạng mục chuẩn hóa', 'Số lượng bản ghi'],
            [
                ['Đơn sửa chữa khử giá 1đ / số lẻ ...001đ', count($priceAdjustedOrders)],
                ['Phiếu thanh toán (payments) khử số lẻ', $priceAdjustedPaymentsCount],
                ['Phiếu sổ quỹ (cash_transactions) khử số lẻ', $priceAdjustedCashTxCount],
                ['Ca trực (work_shifts) đồng bộ lại quỹ', $priceAdjustedShiftsCount],
                ['Khách hàng (customers.total_spent) đồng bộ lại', $priceAdjustedCustomersCount],
                ['Đơn sửa chữa đổi mã FX... -> PC...', count($codeRenamedOrders)],
            ]
        );

        return self::SUCCESS;
    }
}
