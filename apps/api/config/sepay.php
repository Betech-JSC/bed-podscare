<?php

return [
    'account_number' => env('SEPAY_ACCOUNT_NUMBER'),
    'bank_code'      => env('SEPAY_BANK_CODE'),
    'account_holder' => env('SEPAY_ACCOUNT_HOLDER'),
    'webhook_secret' => env('SEPAY_WEBHOOK_SECRET'),
    'qr_template'    => env('SEPAY_QR_TEMPLATE', 'compact2'),
];

