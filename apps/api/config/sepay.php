<?php

return [
    'account_number' => env('SEPAY_ACCOUNT_NUMBER', '0388960848'),
    'bank_code'      => env('SEPAY_BANK_CODE', 'MB'),
    'account_holder' => env('SEPAY_ACCOUNT_HOLDER', 'CONG TY FIXO VIET NAM'),
    'webhook_secret' => env('SEPAY_WEBHOOK_SECRET', 'fixo_secret_sepay_platform_2026'),
    'qr_template'    => env('SEPAY_QR_TEMPLATE', 'compact2'),
];
