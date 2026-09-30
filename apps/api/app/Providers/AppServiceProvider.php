<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        \Illuminate\Database\Eloquent\Relations\Relation::morphMap([
            'RepairOrder'          => \App\Models\RepairOrder::class,
            'RepairQuote'          => \App\Models\RepairQuote::class,
            'QcInspection'         => \App\Models\QcInspection::class,
            'InventoryTransaction' => \App\Models\InventoryTransaction::class,
            'Payment'              => \App\Models\Payment::class,
            'Shipment'             => \App\Models\Shipment::class,
            'Warranty'             => \App\Models\Warranty::class,
            'WarrantyClaim'        => \App\Models\WarrantyClaim::class,
            'User'                 => \App\Models\User::class,
            'Customer'             => \App\Models\Customer::class,
            'Part'                 => \App\Models\Part::class,
            'Branch'               => \App\Models\Branch::class,
        ]);
    }
}
