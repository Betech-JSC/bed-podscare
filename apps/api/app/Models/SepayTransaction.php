<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SepayTransaction extends Model
{
    use HasFactory;

    protected $table = 'sepay_transactions';

    protected $fillable = [
        'sepay_transaction_id',
        'saas_invoice_id',
        'reference_code',
        'amount',
        'accumulated',
        'account_number',
        'transaction_content',
        'bank_brand',
        'gateway',
        'transaction_date',
        'raw_payload',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'accumulated' => 'decimal:2',
            'transaction_date' => 'datetime',
            'raw_payload' => 'array',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(SaasInvoice::class, 'saas_invoice_id');
    }
}
