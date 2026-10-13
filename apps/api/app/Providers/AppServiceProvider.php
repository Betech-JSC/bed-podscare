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
