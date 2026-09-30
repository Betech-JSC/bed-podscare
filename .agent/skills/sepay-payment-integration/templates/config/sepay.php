<?php

return [
    /*
    |--------------------------------------------------------------------------
    | SePay Bank Account Information
    |--------------------------------------------------------------------------
    | Thông tin tài khoản ngân hàng nhận tiền tích hợp với SePay.
    | Đăng ký và cấu hình tại: https://sepay.vn
    */
    'account_number'   => env('SEPAY_ACCOUNT_NUMBER', ''),
    'bank_code'        => env('SEPAY_BANK_CODE', 'MB'),       // MB, VCB, ACB, TCB, VPB, TPB...
    'account_holder'   => env('SEPAY_ACCOUNT_HOLDER', ''),    // Tên chủ tài khoản (in hoa không dấu)
    'webhook_secret'   => env('SEPAY_WEBHOOK_SECRET', ''),    // Secret key để xác thực header Authorization: Apikey {secret}
    'reference_prefix' => env('SEPAY_REFERENCE_PREFIX', 'PAY'),// Tiền tố nhận diện mã chuyển khoản (VD: PAY, ORDER, FK)

    /*
    |--------------------------------------------------------------------------
    | Bank Name Mapping
    |--------------------------------------------------------------------------
    | Ánh xạ mã ngân hàng sang tên đầy đủ để hiển thị thân thiện trên UI.
    */
    'bank_names' => [
        'MB'   => 'Ngân hàng TMCP Quân đội (MB Bank)',
        'VCB'  => 'Ngân hàng TMCP Ngoại thương (Vietcombank)',
        'TCB'  => 'Ngân hàng TMCP Kỹ thương (Techcombank)',
        'ACB'  => 'Ngân hàng TMCP Á Châu (ACB)',
        'BIDV' => 'Ngân hàng TMCP Đầu tư và Phát triển (BIDV)',
        'VPB'  => 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)',
        'TPB'  => 'Ngân hàng TMCP Tiên Phong (TPBank)',
        'STB'  => 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)',
        'HDB'  => 'Ngân hàng TMCP Phát triển TP.HCM (HDBank)',
        'MSB'  => 'Ngân hàng TMCP Hàng Hải (MSB)',
        'VIB'  => 'Ngân hàng TMCP Quốc tế (VIB)',
        'SHB'  => 'Ngân hàng TMCP Sài Gòn – Hà Nội (SHB)',
        'OCB'  => 'Ngân hàng TMCP Phương Đông (OCB)',
        'LPB'  => 'Ngân hàng TMCP Bưu Điện Liên Việt (LPBank)',
        'CAKE' => 'Ngân hàng số CAKE by VPBank',
    ],

    /*
    |--------------------------------------------------------------------------
    | QR Code Settings
    |--------------------------------------------------------------------------
    */
    'qr_expires_minutes' => env('SEPAY_QR_EXPIRES_MINUTES', 15),

    /*
    |--------------------------------------------------------------------------
    | VietQR API Settings
    | Docs: https://www.vietqr.io/danh-sach-api/tao-ma-qr/
    | Template: compact, compact2, qr_only, print
    |--------------------------------------------------------------------------
    */
    'vietqr_base_url' => env('VIETQR_BASE_URL', 'https://img.vietqr.io/image'),
    'qr_template'     => env('SEPAY_QR_TEMPLATE', 'compact'),
];
