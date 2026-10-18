<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'sepay' => [
        'api_key'        => env('SEPAY_WEBHOOK_SECRET', 'fixo_secret_sepay_platform_2026'),
        'webhook_secret' => env('SEPAY_WEBHOOK_SECRET', 'fixo_secret_sepay_platform_2026'),
        'account_number' => env('SEPAY_ACCOUNT_NUMBER', '0388960848'),
        'bank_name'      => env('SEPAY_BANK_CODE', 'MB'),
        'bank_code'      => env('SEPAY_BANK_CODE', 'MB'),
        'account_name'   => env('SEPAY_ACCOUNT_HOLDER', 'CONG TY FIXO VIET NAM'),
        'account_holder' => env('SEPAY_ACCOUNT_HOLDER', 'CONG TY FIXO VIET NAM'),
        'qr_template'    => env('SEPAY_QR_TEMPLATE', 'compact2'),
    ],

    'telegram' => [
        'bot_token'      => env('TELEGRAM_BOT_TOKEN', ''),
        'bot_username'   => env('TELEGRAM_BOT_USERNAME', 'PodsCareNotifyBot'),
        'webhook_secret' => env('TELEGRAM_WEBHOOK_SECRET', ''),
        'frontend_url'   => env('FRONTEND_URL', env('APP_URL', 'http://localhost:3000')),
    ],

    'gemini' => [
        'api_key'         => env('GEMINI_API_KEY', ''),
        'model'           => env('GEMINI_MODEL', 'gemini-2.0-flash'),
        'fallback_models' => env('GEMINI_FALLBACK_MODELS', 'gemini-2.0-flash-lite,gemini-2.5-flash'),
        'timeout'         => (int) env('GEMINI_TIMEOUT', 15),
    ],

];
