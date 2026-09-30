<?php

namespace App\Providers;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Routing\Router;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

/**
 * ServiceProvider đăng ký toàn bộ các Macros hữu dụng cho hệ thống:
 * 1. Router::macro('module') - Tự động hóa routing CRUD chuẩn.
 * 2. Blueprint macros: addTimestamps, addStatus, addSeo, addInjectCode.
 * 3. Collection::macro('paginate') - Phân trang nhanh cho Collections.
 */
class MacroServiceProvider extends ServiceProvider
{
    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->registerMacroBlueprint();
        $this->registerMacroRoute();
        $this->registerMacroCollection();
    }

    /**
     * Đăng ký các macros cho Database Schema Blueprint.
     */
    private function registerMacroBlueprint(): void
    {
        // 1. addTimestamps: Audit columns + timestamps + softDeletes
        Blueprint::macro('addTimestamps', function () {
            /** @var Blueprint $this */
            $this->unsignedBigInteger('created_by')->nullable()->index();
            $this->unsignedBigInteger('updated_by')->nullable()->index();
            $this->unsignedBigInteger('deleted_by')->nullable()->index();

            $this->timestamps();
            $this->softDeletes();
        });

        // 2. addStatus: Cột trạng thái mặc định
        Blueprint::macro('addStatus', function (string $default = 'ACTIVE') {
            /** @var Blueprint $this */
            $this->string('status', 50)->default($default)->index();
        });

        // 3. addSeo: Các cột chuẩn cho tối ưu hóa công cụ tìm kiếm
        Blueprint::macro('addSeo', function () {
            /** @var Blueprint $this */
            $this->string('seo_meta_title')->nullable();
            $this->string('seo_slug')->nullable()->index();
            $this->text('seo_meta_description')->nullable();
            $this->string('seo_meta_keywords')->nullable();
            $this->string('seo_meta_robots')->nullable();
            $this->string('seo_canonical')->nullable();
            $this->string('seo_image')->nullable();
            $this->text('seo_schemas')->nullable();
        });

        // 4. addInjectCode: Chèn mã code JavaScript/HTML động vào head & body
        Blueprint::macro('addInjectCode', function () {
            /** @var Blueprint $this */
            $this->text('inject_head')->nullable();
            $this->text('inject_body_start')->nullable();
            $this->text('inject_body_end')->nullable();
        });
    }

    /**
     * Đăng ký Macro cho Router: Route::module($controller, $options)
     */
    private function registerMacroRoute(): void
    {
        Router::macro('module', function (string $controller, array $options = []) {
            $actions = ['index', 'form', 'store', 'destroy', 'restore'];

            if (isset($options['only'])) {
                $actions = array_intersect($actions, (array) $options['only']);
            }

            if (isset($options['except'])) {
                $actions = array_diff($actions, (array) $options['except']);
            }

            // Tự động nhận diện URI resource (VD: OrderController -> orders, ProductCategoryController -> product-categories)
            $rawName = str_replace(['Controller', 'App\\Http\\Controllers\\Backend\\', 'App\\Http\\Controllers\\'], '', class_basename($controller));
            $resource = $options['prefix'] ?? Str::plural(Str::kebab($rawName));

            if (in_array('index', $actions, true)) {
                Route::get($resource, [$controller, 'index'])->name("{$resource}.index");
            }

            if (in_array('form', $actions, true)) {
                Route::get("{$resource}/form/{id?}", [$controller, 'form'])->name("{$resource}.form");
            }

            if (in_array('store', $actions, true)) {
                Route::post("{$resource}/store/{id?}", [$controller, 'store'])->name("{$resource}.store");
            }

            if (in_array('destroy', $actions, true)) {
                Route::post("{$resource}/destroy/{id}", [$controller, 'destroy'])->name("{$resource}.destroy");
            }

            if (in_array('restore', $actions, true)) {
                Route::post("{$resource}/restore/{id}", [$controller, 'restore'])->name("{$resource}.restore");
            }

            // Đăng ký thêm các action tùy biến (VD: $options['appends'] = ['status', 'export'])
            if (isset($options['appends']) && is_array($options['appends'])) {
                foreach ($options['appends'] as $action) {
                    Route::any("{$resource}/{$action}", [$controller, $action])->name("{$resource}.{$action}");
                }
            }

            // Đồng bộ name lookups cho RouteCollection
            app('router')->getRoutes()->refreshNameLookups();
        });
    }

    /**
     * Đăng ký Macro phân trang cho Laravel Collection: $collection->paginate($perPage)
     */
    private function registerMacroCollection(): void
    {
        Collection::macro('paginate', function (int $perPage = 15, ?int $total = null, ?int $page = null, string $pageName = 'page') {
            /** @var Collection $this */
            $page = $page ?: LengthAwarePaginator::resolveCurrentPage($pageName);

            return new LengthAwarePaginator(
                $this->forPage($page, $perPage)->values(),
                $total ?: $this->count(),
                $perPage,
                $page,
                [
                    'path'     => LengthAwarePaginator::resolveCurrentPath(),
                    'pageName' => $pageName,
                ]
            );
        });
    }
}
