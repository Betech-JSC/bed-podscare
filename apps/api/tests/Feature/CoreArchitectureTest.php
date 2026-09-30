<?php

namespace Tests\Feature;

use App\Http\Controllers\Controller;
use App\Services\BaseWorkflowService;
use App\Traits\ApiResponse;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class DummyWorkflowService extends BaseWorkflowService
{
    public const ALLOWED_TRANSITIONS = [
        'PENDING' => ['PROCESSING', 'CANCELLED'],
        'PROCESSING' => ['COMPLETED', 'FAILED'],
    ];
}

class DummyController extends Controller
{
    public function testSuccess()
    {
        return $this->success(['foo' => 'bar'], 'Operation successful', 200);
    }

    public function testFailure()
    {
        return $this->failure('Something went wrong', 422, ['field' => ['Invalid value']], 'ERR_VALIDATION');
    }

    public function testEmpty()
    {
        return $this->empty('Item not found');
    }

    public function testDelete()
    {
        return $this->delete();
    }
}

class CoreArchitectureTest extends TestCase
{
    /**
     * Test all Blueprint macros registered by MacroServiceProvider.
     */
    public function test_blueprint_macros_are_registered(): void
    {
        $this->assertTrue(Blueprint::hasMacro('addTimestamps'), 'Blueprint macro addTimestamps should be registered');
        $this->assertTrue(Blueprint::hasMacro('addStatus'), 'Blueprint macro addStatus should be registered');
        $this->assertTrue(Blueprint::hasMacro('addSeo'), 'Blueprint macro addSeo should be registered');
        $this->assertTrue(Blueprint::hasMacro('addInjectCode'), 'Blueprint macro addInjectCode should be registered');
    }

    /**
     * Test Blueprint macro execution in creating a test table.
     */
    public function test_blueprint_macros_execute_correctly_in_schema(): void
    {
        Schema::dropIfExists('test_macros_table');
        
        Schema::create('test_macros_table', function (Blueprint $table) {
            $table->id();
            $table->addStatus('ACTIVE');
            $table->addTimestamps();
            $table->addSeo();
            $table->addInjectCode();
        });

        $this->assertTrue(Schema::hasTable('test_macros_table'));
        $this->assertTrue(Schema::hasColumn('test_macros_table', 'status'));
        $this->assertTrue(Schema::hasColumn('test_macros_table', 'created_by'));
        $this->assertTrue(Schema::hasColumn('test_macros_table', 'updated_by'));
        $this->assertTrue(Schema::hasColumn('test_macros_table', 'deleted_by'));
        $this->assertTrue(Schema::hasColumn('test_macros_table', 'created_at'));
        $this->assertTrue(Schema::hasColumn('test_macros_table', 'updated_at'));
        $this->assertTrue(Schema::hasColumn('test_macros_table', 'deleted_at'));
        $this->assertTrue(Schema::hasColumn('test_macros_table', 'seo_slug'));
        $this->assertTrue(Schema::hasColumn('test_macros_table', 'inject_head'));

        Schema::dropIfExists('test_macros_table');
    }

    /**
     * Test Route::macro('module') is registered and registers routes properly.
     */
    public function test_route_macro_module_is_registered(): void
    {
        $this->assertTrue(Route::hasMacro('module'), 'Route macro module should be registered');

        Route::module(DummyController::class, [
            'prefix' => 'api/test-dummies',
            'only' => ['index', 'form', 'store', 'destroy', 'restore'],
        ]);

        $this->assertTrue(Route::has('api/test-dummies.index'));
        $this->assertTrue(Route::has('api/test-dummies.form'));
        $this->assertTrue(Route::has('api/test-dummies.store'));
        $this->assertTrue(Route::has('api/test-dummies.destroy'));
        $this->assertTrue(Route::has('api/test-dummies.restore'));
    }

    /**
     * Test Collection macro paginate is registered.
     */
    public function test_collection_macro_paginate_is_registered(): void
    {
        $this->assertTrue(Collection::hasMacro('paginate'), 'Collection macro paginate should be registered');

        $collection = collect(range(1, 30));
        $paginated = $collection->paginate(10);

        $this->assertInstanceOf(\Illuminate\Pagination\LengthAwarePaginator::class, $paginated);
        $this->assertEquals(30, $paginated->total());
        $this->assertEquals(10, $paginated->perPage());
    }

    /**
     * Test ApiResponse trait methods on Controller.
     */
    public function test_controller_uses_api_response_trait(): void
    {
        $controller = new DummyController();

        // 1. Success response
        $success = $controller->testSuccess();
        $this->assertEquals(200, $success->status());
        $data = $success->getData(true);
        $this->assertTrue($data['success']);
        $this->assertEquals('Operation successful', $data['message']);
        $this->assertEquals(['foo' => 'bar'], $data['data']);

        // 2. Failure response
        $failure = $controller->testFailure();
        $this->assertEquals(422, $failure->status());
        $failData = $failure->getData(true);
        $this->assertFalse($failData['success']);
        $this->assertEquals('Something went wrong', $failData['message']);
        $this->assertEquals('ERR_VALIDATION', $failData['error_code']);
        $this->assertArrayHasKey('field', $failData['errors']);

        // 3. Empty response
        $empty = $controller->testEmpty();
        $this->assertEquals(404, $empty->status());
        $emptyData = $empty->getData(true);
        $this->assertFalse($emptyData['success']);
        $this->assertNull($emptyData['data']);

        // 4. Delete response
        $delete = $controller->testDelete();
        $this->assertEquals(204, $delete->status());
    }

    /**
     * Test BaseWorkflowService state transition validation.
     */
    public function test_base_workflow_service_state_validation(): void
    {
        $service = new DummyWorkflowService();

        // Next allowed statuses
        $allowed = $service->getNextAllowedStatuses('PENDING');
        $this->assertEquals(['PROCESSING', 'CANCELLED'], $allowed);

        // Invalid transition throws DomainException
        $this->expectException(\DomainException::class);
        $service->validateTransition('PENDING', 'COMPLETED');
    }
}
