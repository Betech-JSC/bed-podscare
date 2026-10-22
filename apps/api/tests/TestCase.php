<?php

namespace Tests;

use App\Models\Scopes\TenantScope;
use App\Models\SystemSetting;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        TenantScope::clearCache();
        SystemSetting::clearCache();
        \App\Services\QuotaService::clearCache();
    }
}
