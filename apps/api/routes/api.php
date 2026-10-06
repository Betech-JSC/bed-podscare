<?php

use App\Http\Controllers\Api\V1\AuditLogController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BranchController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\DeviceController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\KpiController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\PartnerController;
use App\Http\Controllers\Api\V1\PaymentController;
use App\Http\Controllers\Api\V1\PlatformBillingController;
use App\Http\Controllers\Api\V1\QcController;
use App\Http\Controllers\Api\V1\QuoteController;
use App\Http\Controllers\Api\V1\SaasBillingController;
use App\Http\Controllers\Api\V1\SePayPlatformWebhookController;
use App\Http\Controllers\Api\V1\ServiceController;
use App\Http\Controllers\Api\V1\ShipmentController;
use App\Http\Controllers\Api\V1\SuperAdminController;
use App\Http\Controllers\Api\V1\TenantRegistrationController;
use App\Http\Controllers\Api\V1\TenantSettingController;
use App\Http\Controllers\Api\V1\TrackingController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\WarrantyController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| PodsCare Repair OS - API Routes (v1)
|--------------------------------------------------------------------------
*/

Route::prefix('v1')->group(function () {

    // --- 1. PUBLIC ROUTES (Không cần xác thực) ---
    Route::middleware('throttle:60,1')->group(function () {
        Route::prefix('auth')->group(function () {
            Route::post('/login', [AuthController::class, 'login'])->name('api.v1.auth.login');
        });

        // Tenant public registration
        Route::post('/tenants/register', [TenantRegistrationController::class, 'register'])->name('api.v1.tenants.register');

        // Public customer tracking portal
        Route::get('/tracking/{code}', [TrackingController::class, 'track'])->name('api.v1.tracking.show');

        // Public catalog & checklist template
        Route::get('/devices/checklist-template', [DeviceController::class, 'checklistTemplate'])->name('api.v1.devices.template');
        Route::get('/devices/categories', [DeviceController::class, 'categories'])->name('api.v1.devices.categories');
        Route::get('/devices', [DeviceController::class, 'index'])->name('api.v1.devices.index');
        Route::get('/devices/{id}', [DeviceController::class, 'show'])->name('api.v1.devices.show');

        Route::get('/services/common-issues', [ServiceController::class, 'commonIssues'])->name('api.v1.services.common_issues');
        Route::get('/services', [ServiceController::class, 'index'])->name('api.v1.services.index');
        Route::get('/services/{id}', [ServiceController::class, 'show'])->name('api.v1.services.show');

        // Public branches
        Route::get('/branches', [BranchController::class, 'index'])->name('api.v1.branches.index');
        Route::get('/branches/{id}', [BranchController::class, 'show'])->name('api.v1.branches.show');

        Route::get('/warranties/lookup', [WarrantyController::class, 'lookup'])->name('api.v1.warranties.lookup');

        // SePay VietQR Platform Webhooks
        Route::post('/webhooks/sepay', [SePayPlatformWebhookController::class, 'handle'])->name('api.v1.webhooks.sepay');
        Route::post('/saas/sepay/webhook', [SePayPlatformWebhookController::class, 'handle'])->name('api.v1.saas.sepay.webhook');
    });


    // --- 2. PROTECTED ROUTES (Yêu cầu Bearer Token - Sanctum) ---
    Route::middleware('auth:sanctum')->group(function () {

        // Auth management
        Route::prefix('auth')->group(function () {
            Route::post('/logout', [AuthController::class, 'logout'])->name('api.v1.auth.logout');
            Route::get('/me', [AuthController::class, 'me'])->name('api.v1.auth.me');
        });

        // Users & Role Management
        Route::middleware('role:admin')->group(function () {
            Route::get('/users', [UserController::class, 'index'])->name('api.v1.users.index');
            Route::post('/users', [UserController::class, 'store'])->name('api.v1.users.store');
            Route::put('/users/{id}', [UserController::class, 'update'])->name('api.v1.users.update');
            Route::post('/users/{id}/toggle-status', [UserController::class, 'toggleStatus'])->name('api.v1.users.toggle_status');
        });

        // Device Models & Dynamic Checklists Management
        Route::middleware('role:admin,super_admin')->group(function () {
            Route::post('/devices', [DeviceController::class, 'store'])->name('api.v1.devices.store');
            Route::put('/devices/{id}', [DeviceController::class, 'update'])->name('api.v1.devices.update');
            Route::delete('/devices/{id}', [DeviceController::class, 'destroy'])->name('api.v1.devices.destroy');
            Route::post('/devices/categories', [DeviceController::class, 'storeCategory'])->name('api.v1.devices.categories.store');
        });

        // Branches (write operations protected by admin role)
        Route::post('/branches', [BranchController::class, 'store'])->name('api.v1.branches.store');
        Route::put('/branches/{id}', [BranchController::class, 'update'])->name('api.v1.branches.update');
        Route::post('/branches/{id}/toggle-status', [BranchController::class, 'toggleStatus'])->name('api.v1.branches.toggle_status');

        // Customers
        Route::get('/customers', [CustomerController::class, 'index'])->name('api.v1.customers.index');
        Route::post('/customers', [CustomerController::class, 'store'])->name('api.v1.customers.store');
        Route::get('/customers/{id}', [CustomerController::class, 'show'])->name('api.v1.customers.show');
        Route::get('/customers/{id}/history', [CustomerController::class, 'history'])->name('api.v1.customers.history');

        // Repair Orders & FSM Workflow
        Route::get('/orders', [OrderController::class, 'index'])->name('api.v1.orders.index');
        Route::get('/repairs', [OrderController::class, 'index'])->name('api.v1.repairs.index');
        Route::post('/orders', [OrderController::class, 'store'])->name('api.v1.orders.store');
        Route::post('/repairs', [OrderController::class, 'store'])->name('api.v1.repairs.store');
        Route::get('/orders/{id}', [OrderController::class, 'show'])->name('api.v1.orders.show');
        Route::get('/repairs/{id}', [OrderController::class, 'show'])->name('api.v1.repairs.show');
        Route::put('/orders/{id}', [OrderController::class, 'update'])->name('api.v1.orders.update');
        Route::put('/repairs/{id}', [OrderController::class, 'update'])->name('api.v1.repairs.update');
        Route::post('/orders/{id}/transition', [OrderController::class, 'transition'])->name('api.v1.orders.transition');
        Route::post('/repairs/{id}/transition', [OrderController::class, 'transition'])->name('api.v1.repairs.transition');
        Route::patch('/orders/{id}/parts-note', [OrderController::class, 'updatePartsNote'])->name('api.v1.orders.parts_note');
        Route::patch('/repairs/{id}/parts-note', [OrderController::class, 'updatePartsNote'])->name('api.v1.repairs.parts_note');
        Route::post('/orders/{id}/assign-technician', [OrderController::class, 'assignTechnician'])->name('api.v1.orders.assign_technician');
        Route::post('/repairs/{id}/assign-technician', [OrderController::class, 'assignTechnician'])->name('api.v1.repairs.assign_technician');
        Route::get('/orders/{id}/allowed-transitions', [OrderController::class, 'allowedTransitions'])->name('api.v1.orders.allowed_transitions');
        Route::get('/repairs/{id}/allowed-transitions', [OrderController::class, 'allowedTransitions'])->name('api.v1.repairs.allowed_transitions');
        Route::post('/orders/{id}/checklists', [OrderController::class, 'storeChecklist'])->name('api.v1.orders.checklists');
        Route::post('/repairs/{id}/checklists', [OrderController::class, 'storeChecklist'])->name('api.v1.repairs.checklists');
        Route::post('/orders/{id}/photos', [OrderController::class, 'uploadPhoto'])->name('api.v1.orders.photos');
        Route::post('/repairs/{id}/photos', [OrderController::class, 'uploadPhoto'])->name('api.v1.repairs.photos');

        // Quotes
        Route::get('/quotes', [QuoteController::class, 'index'])->name('api.v1.quotes.index');
        Route::post('/quotes', [QuoteController::class, 'store'])->name('api.v1.quotes.store');
        Route::post('/quotes/{id}/approve', [QuoteController::class, 'approve'])->name('api.v1.quotes.approve');
        Route::post('/quotes/{id}/reject', [QuoteController::class, 'reject'])->name('api.v1.quotes.reject');

        // QC Inspections
        Route::get('/qc', [QcController::class, 'index'])->name('api.v1.qc.index');
        Route::post('/qc', [QcController::class, 'store'])->name('api.v1.qc.store');

        // Inventory
        Route::get('/inventory/parts', [InventoryController::class, 'parts'])->name('api.v1.inventory.parts.index');
        Route::get('/inventory/parts/{id}', [InventoryController::class, 'showPart'])->name('api.v1.inventory.parts.show');
        Route::get('/inventory/transactions', [InventoryController::class, 'transactions'])->name('api.v1.inventory.transactions.index');
        Route::post('/inventory/transactions', [InventoryController::class, 'createTransaction'])->name('api.v1.inventory.transactions.store');

        // Shipments
        Route::get('/shipments', [ShipmentController::class, 'index'])->name('api.v1.shipments.index');
        Route::post('/shipments', [ShipmentController::class, 'store'])->name('api.v1.shipments.store');
        Route::post('/shipments/{id}/proofs', [ShipmentController::class, 'uploadProof'])->name('api.v1.shipments.proofs');
        Route::put('/shipments/{id}/status', [ShipmentController::class, 'updateStatus'])->name('api.v1.shipments.update_status');


        // Warranties
        Route::get('/warranties', [WarrantyController::class, 'index'])->name('api.v1.warranties.index');
        Route::get('/warranties/claims', [WarrantyController::class, 'claims'])->name('api.v1.warranties.claims.index');
        Route::post('/warranties/claims', [WarrantyController::class, 'createClaim'])->name('api.v1.warranties.claims.store');

        // Payments
        Route::get('/payments', [PaymentController::class, 'index'])->name('api.v1.payments.index');
        Route::post('/payments', [PaymentController::class, 'store'])->name('api.v1.payments.store');
        Route::get('/payments/{id}', [PaymentController::class, 'show'])->name('api.v1.payments.show');
        Route::post('/payments/{id}/vietqr', [PaymentController::class, 'vietqr'])->name('api.v1.payments.vietqr');
        Route::post('/payments/{id}/confirm', [PaymentController::class, 'confirm'])->name('api.v1.payments.confirm');

        // Notifications
        Route::get('/notifications', [NotificationController::class, 'index'])->name('api.v1.notifications.index');
        Route::patch('/notifications/{id}/read', [NotificationController::class, 'markAsRead'])->name('api.v1.notifications.mark_read');
        Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead'])->name('api.v1.notifications.mark_all_read');

        // Audit Logs
        Route::get('/audit-logs', [AuditLogController::class, 'index'])->name('api.v1.audit_logs.index');
        Route::get('/audit-logs/{id}', [AuditLogController::class, 'show'])->name('api.v1.audit_logs.show');

        // Partners
        Route::get('/partners', [PartnerController::class, 'index'])->name('api.v1.partners.index');
        Route::post('/partners', [PartnerController::class, 'store'])->name('api.v1.partners.store');
        Route::get('/partners/{id}', [PartnerController::class, 'show'])->name('api.v1.partners.show');
        Route::put('/partners/{id}', [PartnerController::class, 'update'])->name('api.v1.partners.update');

        // Staff KPI & Performance
        Route::get('/kpi/dashboard', [KpiController::class, 'dashboard'])->name('api.v1.kpi.dashboard');
        Route::get('/kpi/staff', [KpiController::class, 'staff'])->name('api.v1.kpi.staff');

        // SaaS Subscription & Billing
        Route::prefix('saas')->group(function () {
            Route::get('/current', [SaasBillingController::class, 'current'])->name('api.v1.saas.current');
            Route::get('/current-plan', [SaasBillingController::class, 'current'])->name('api.v1.saas.current_plan');
            Route::get('/plans', [SaasBillingController::class, 'plans'])->name('api.v1.saas.plans');
            Route::post('/subscribe', [SaasBillingController::class, 'subscribe'])->name('api.v1.saas.subscribe');
            Route::get('/invoices/{refCode}/status', [SaasBillingController::class, 'invoiceStatus'])->name('api.v1.saas.invoices.status');
        });

        // Tenant Brand & Receipt Settings
        Route::prefix('tenant')->group(function () {
            Route::get('/settings', [TenantSettingController::class, 'getSettings'])->name('api.v1.tenant.settings.get');
            Route::post('/settings', [TenantSettingController::class, 'updateSettings'])->middleware('role:admin')->name('api.v1.tenant.settings.update');
            Route::post('/logo', [TenantSettingController::class, 'uploadLogo'])->middleware('role:admin')->name('api.v1.tenant.logo.upload');
            Route::delete('/logo', [TenantSettingController::class, 'deleteLogo'])->middleware('role:admin')->name('api.v1.tenant.logo.delete');
        });

        // Platform Super Admin Portal
        Route::middleware('super_admin')->prefix('platform')->group(function () {
            Route::get('/dashboard-stats', [SuperAdminController::class, 'dashboardStats'])->name('api.v1.platform.dashboard_stats');
            Route::get('/stores', [SuperAdminController::class, 'stores'])->name('api.v1.platform.stores.index');
            Route::post('/stores/{id}/approve', [SuperAdminController::class, 'approveStore'])->name('api.v1.platform.stores.approve');
            Route::post('/stores/{id}/suspend', [SuperAdminController::class, 'suspendStore'])->name('api.v1.platform.stores.suspend');
            Route::post('/stores/{id}/activate', [SuperAdminController::class, 'activateStore'])->name('api.v1.platform.stores.activate');

            // Platform Billing & SaaS Operations
            Route::get('/billing-stats', [PlatformBillingController::class, 'billingStats'])->name('api.v1.platform.billing_stats');
            Route::get('/transactions', [PlatformBillingController::class, 'transactions'])->name('api.v1.platform.transactions');
            Route::post('/stores/{id}/remind-fee', [PlatformBillingController::class, 'remindFee'])->name('api.v1.platform.stores.remind_fee');
            Route::post('/stores/{id}/renew', [PlatformBillingController::class, 'renewStore'])->name('api.v1.platform.stores.renew');

            // Platform Plans Management
            Route::get('/plans', [PlatformBillingController::class, 'plans'])->name('api.v1.platform.plans.index');
            Route::put('/plans/{id}', [PlatformBillingController::class, 'updatePlan'])->name('api.v1.platform.plans.update');

            // Platform SePay Integration
            Route::get('/integrations/sepay', [PlatformBillingController::class, 'getSepayConfig'])->name('api.v1.platform.integrations.sepay.get');
            Route::post('/integrations/sepay', [PlatformBillingController::class, 'updateSepayConfig'])->name('api.v1.platform.integrations.sepay.update');
            Route::post('/integrations/sepay/test-connection', [PlatformBillingController::class, 'testSepayConnection'])->name('api.v1.platform.integrations.sepay.test_connection');
        });
    });
});
