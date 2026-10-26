<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    protected static bool $testingTelegramMemoryColumnsEnsured = false;

    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(
            \App\Services\TelegramAi\TelegramAiToolRegistry::class,
            fn () => (new \App\Services\TelegramAi\TelegramAiToolRegistry())->discoverToolsFromDirectory()
        );

        $this->app->singleton(
            \App\Services\TelegramAi\TelegramAiMemoryService::class,
            fn ($app) => new \App\Services\TelegramAi\TelegramAiMemoryService(
                $app->make(\App\Services\TelegramAi\GeminiFunctionCallingClient::class)
            )
        );
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        config(['app.timezone' => 'Asia/Ho_Chi_Minh']);
        date_default_timezone_set('Asia/Ho_Chi_Minh');

        \Illuminate\Database\Eloquent\Model::preventLazyLoading(! $this->app->isProduction());
        \Laravel\Sanctum\Sanctum::usePersonalAccessTokenModel(\App\Models\PersonalAccessToken::class);
        \App\Models\Scopes\TenantScope::clearCache();
        \App\Models\SystemSetting::clearCache();

        RateLimiter::for('tenant-registration', function (Request $request) {
            return Limit::perMinutes(15, 5)
                ->by($request->ip())
                ->response(function (Request $request, array $headers) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Bạn đã gửi quá nhiều yêu cầu đăng ký gian hàng từ địa chỉ mạng này. Vui lòng thử lại sau 15 phút.',
                    ], 429, $headers);
                });
        });

        if ($this->app->runningUnitTests() && ! self::$testingTelegramMemoryColumnsEnsured) {
            try {
                if (\Illuminate\Support\Facades\Schema::hasTable('telegram_recipients')) {
                    \Illuminate\Support\Facades\Schema::table('telegram_recipients', function (\Illuminate\Database\Schema\Blueprint $table) {
                        if (! \Illuminate\Support\Facades\Schema::hasColumn('telegram_recipients', 'ai_message_count')) {
                            $table->unsignedInteger('ai_message_count')->default(0)->after('connected_at');
                        }
                        if (! \Illuminate\Support\Facades\Schema::hasColumn('telegram_recipients', 'ai_context_summary')) {
                            $table->text('ai_context_summary')->nullable()->after('ai_message_count');
                        }
                        if (! \Illuminate\Support\Facades\Schema::hasColumn('telegram_recipients', 'ai_recent_messages')) {
                            $table->json('ai_recent_messages')->nullable()->after('ai_context_summary');
                        }
                        if (! \Illuminate\Support\Facades\Schema::hasColumn('telegram_recipients', 'ai_last_interaction_at')) {
                            $table->timestamp('ai_last_interaction_at')->nullable()->after('ai_recent_messages');
                        }
                    });
                }
                self::$testingTelegramMemoryColumnsEnsured = true;
            } catch (\Throwable) {
                // Bỏ qua nếu kết nối DB chưa sẵn sàng
            }
        }

        \Illuminate\Database\Eloquent\Relations\Relation::morphMap([
            // Branch & Aliases
            'Branch'               => \App\Models\Branch::class,
            'branch'               => \App\Models\Branch::class,

            // Repair Order & Aliases
            'RepairOrder'          => \App\Models\RepairOrder::class,
            'repair_order'         => \App\Models\RepairOrder::class,
            'repair_orders'        => \App\Models\RepairOrder::class,
            'order'                => \App\Models\RepairOrder::class,

            // User & Customer
            'User'                 => \App\Models\User::class,
            'user'                 => \App\Models\User::class,
            'Customer'             => \App\Models\Customer::class,
            'customer'             => \App\Models\Customer::class,

            // Part & Inventory
            'Part'                 => \App\Models\Part::class,
            'part'                 => \App\Models\Part::class,
            'InventoryTransaction' => \App\Models\InventoryTransaction::class,
            'inventory_transaction'=> \App\Models\InventoryTransaction::class,
            'inventory'            => \App\Models\InventoryTransaction::class,

            // Quotes & QC
            'RepairQuote'          => \App\Models\RepairQuote::class,
            'repair_quote'         => \App\Models\RepairQuote::class,
            'quote'                => \App\Models\RepairQuote::class,
            'QcInspection'         => \App\Models\QcInspection::class,
            'qc_inspection'        => \App\Models\QcInspection::class,
            'qc'                   => \App\Models\QcInspection::class,

            // Payment, Shipment, Warranty
            'Payment'              => \App\Models\Payment::class,
            'payment'              => \App\Models\Payment::class,
            'Shipment'             => \App\Models\Shipment::class,
            'shipment'             => \App\Models\Shipment::class,
            'Warranty'             => \App\Models\Warranty::class,
            'warranty'             => \App\Models\Warranty::class,
            'WarrantyClaim'        => \App\Models\WarrantyClaim::class,
            'warranty_claim'       => \App\Models\WarrantyClaim::class,

            // Device & Hardware
            'DeviceModel'          => \App\Models\DeviceModel::class,
            'device_model'         => \App\Models\DeviceModel::class,
            'device'               => \App\Models\DeviceModel::class,

            // Shifts, Cash, Suppliers & Tenants
            'WorkShift'            => \App\Models\WorkShift::class,
            'work_shift'           => \App\Models\WorkShift::class,
            'shift'                => \App\Models\WorkShift::class,
            'Supplier'             => \App\Models\Supplier::class,
            'supplier'             => \App\Models\Supplier::class,
            'GoodsReceipt'         => \App\Models\GoodsReceipt::class,
            'goods_receipt'        => \App\Models\GoodsReceipt::class,
            'CashTransaction'      => \App\Models\CashTransaction::class,
            'cash_transaction'     => \App\Models\CashTransaction::class,
            'Tenant'               => \App\Models\Tenant::class,
            'tenant'               => \App\Models\Tenant::class,
        ]);
    }
}
