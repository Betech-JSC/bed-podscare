<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Meta Threads Graph API & OAuth 2.0 Configuration
    |--------------------------------------------------------------------------
    */

    'default_app_group' => env('THREADS_DEFAULT_APP_GROUP', 'primary_dev_app'),

    'max_accounts' => (int) env('THREADS_MAX_ACCOUNTS', 20),

    'graph_base_url' => rtrim((string) env('THREADS_GRAPH_BASE_URL', 'https://graph.threads.net'), '/'),

    'graph_version' => (string) env('THREADS_GRAPH_VERSION', 'v1.0'),

    'oauth_authorize_url' => (string) env('THREADS_OAUTH_AUTHORIZE_URL', 'https://threads.net/oauth/authorize'),

    'oauth_scopes' => (string) env('THREADS_OAUTH_SCOPES', 'threads_basic,threads_content_publish'),

    'redirect_uri' => (string) env(
        'THREADS_REDIRECT_URI',
        rtrim((string) env('APP_URL', 'http://localhost:8010'), '/') . '/api/v1/threads/oauth/callback'
    ),

    'frontend_redirect_url' => (string) env(
        'THREADS_FRONTEND_REDIRECT_URL',
        rtrim((string) env('FRONTEND_URL', 'http://localhost:3010'), '/') . '/threads'
    ),

    'oauth_state_ttl_seconds' => (int) env('THREADS_OAUTH_STATE_TTL_SECONDS', 900),

    /*
    |--------------------------------------------------------------------------
    | AES-256-GCM Token Encryption & Auto-Refresh
    |--------------------------------------------------------------------------
    */

    'token_encryption_key' => env('THREADS_TOKEN_ENCRYPTION_KEY'),

    'token_refresh_threshold_days' => (int) env('THREADS_TOKEN_REFRESH_THRESHOLD_DAYS', 14),

    'token_min_age_hours' => (int) env('THREADS_TOKEN_MIN_AGE_HOURS', 24),

    'long_lived_token_ttl_seconds' => (int) env('THREADS_LONG_LIVED_TTL_SECONDS', 5184000), // 60 days

    /*
    |--------------------------------------------------------------------------
    | Publishing Limits, Validation & Retry Backoff
    |--------------------------------------------------------------------------
    */

    'max_chars' => 500,

    'max_unique_links' => 5,

    'min_carousel_items' => 2,

    'max_carousel_items' => 20,

    'quota_total_24h' => 250,

    'min_quota_remaining_ratio' => 0.10,

    'min_quota_remaining_percent' => 10,

    'default_daily_post_cap' => 8,

    'default_active_hours_start' => '08:00',

    'default_active_hours_end' => '22:00',

    'retry_backoff_minutes' => [5, 30, 120],

    'backoff_minutes' => [5, 30, 120],

    'max_retries' => 3,

    'container_poll_max_attempts' => 6,

    'container_poll_interval_ms' => 500,

    'auto_chain_delay_min_seconds' => 30,

    'auto_chain_delay_max_seconds' => 60,

    'duplicate_window_hours' => 24,

    'jitter_min_minutes' => 3,

    'jitter_max_minutes' => 12,

    'default_jitter_minutes' => 8,

    'telegram_alert_chat_id' => (string) env('THREADS_TELEGRAM_ALERT_CHAT_ID', env('TELEGRAM_ADMIN_CHAT_ID', '')),

    /*
    |--------------------------------------------------------------------------
    | Meta App Groups (Development Mode / Multi-App Expansion)
    |--------------------------------------------------------------------------
    */

    'app_groups' => [
        'primary_dev_app' => [
            'label' => 'Meta Development App #1 (Threads Tester - 20 Accounts)',
            'app_id' => (string) env('THREADS_APP_ID', 'threads_dev_app_01'),
            'app_secret' => (string) env('THREADS_APP_SECRET', 'threads_dev_secret_01'),
            'redirect_uri' => (string) env(
                'THREADS_REDIRECT_URI',
                rtrim((string) env('APP_URL', 'http://localhost:8010'), '/') . '/api/v1/threads/oauth/callback'
            ),
        ],
        'app_group_2' => [
            'label' => 'Meta Development App #2 (Expansion)',
            'app_id' => (string) env('THREADS_SECONDARY_APP_ID', 'threads_dev_app_02'),
            'app_secret' => (string) env('THREADS_SECONDARY_APP_SECRET', 'threads_dev_secret_02'),
            'redirect_uri' => (string) env(
                'THREADS_SECONDARY_REDIRECT_URI',
                rtrim((string) env('APP_URL', 'http://localhost:8010'), '/') . '/api/v1/threads/oauth/callback'
            ),
        ],
    ],
];
