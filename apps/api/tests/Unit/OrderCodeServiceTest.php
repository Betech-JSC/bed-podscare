<?php

namespace Tests\Unit;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceModel;
use App\Models\RepairOrder;
use App\Models\User;
use App\Services\OrderCodeService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class OrderCodeServiceTest extends TestCase
{
    use DatabaseTransactions;

    private OrderCodeService $service;
    private Branch $branch1;
    private Branch $branch2;
    private Customer $customer;
    private DeviceModel $device;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new OrderCodeService();

        $this->branch1 = Branch::create([
            'code'      => '1',
            'name'      => 'Chi nhánh Quận 1 Test',
            'phone'     => '0901111111',
            'address'   => '100 Lê Lợi',
            'is_active' => true,
        ]);

        $this->branch2 = Branch::create([
            'code'      => '2',
            'name'      => 'Chi nhánh Quận 2 Test',
            'phone'     => '0902222222',
            'address'   => '200 Mai Chí Thọ',
            'is_active' => true,
        ]);

        $this->customer = Customer::first() ?? Customer::create([
            'name'  => 'Khách Test',
            'phone' => '0988' . random_int(100000, 999999),
        ]);

        $this->device = DeviceModel::first() ?? DeviceModel::create([
            'name'       => 'AirPods Pro 2',
            'model_code' => 'A2698_' . uniqid(),
            'category'   => 'airpods',
        ]);

        $this->user = User::first() ?? User::create([
            'name'     => 'Tester',
            'email'    => 'tester_' . uniqid() . '@podscare.vn',
            'password' => bcrypt('password'),
            'role'     => 'admin',
        ]);
    }

    private function createOrderWithCode(string $code, int $branchId): RepairOrder
    {
        return RepairOrder::create([
            'order_code'         => $code,
            'branch_id'          => $branchId,
            'customer_id'        => $this->customer->id,
            'device_model_id'    => $this->device->id,
            'issue_description'  => 'Test order code logic',
            'status'             => 'waiting_tech',
            'total_price'        => 300000,
            'created_by_user_id' => $this->user->id,
        ]);
    }

    /**
     * Test format chuẩn PC{branch_code}{DDMMYY}{STT} với STT 01 khi chưa có đơn nào trong ngày.
     */
    public function test_generate_order_code_standard_format(): void
    {
        $customDate = Carbon::create(2026, 10, 12, 9, 0, 0);
        $code = $this->service->generate($this->branch1->id, $customDate);

        // Branch 1 + 12/10/26 + STT 01 -> PC112102601
        $this->assertSame('PC112102601', $code);
    }

    /**
     * Test tăng STT tuần tự khi đã có đơn trong ngày tại cùng chi nhánh.
     */
    public function test_generate_order_code_increments_sequence(): void
    {
        $customDate = Carbon::create(2026, 10, 12, 10, 0, 0);

        // Tạo đơn đầu tiên 01
        $this->createOrderWithCode('PC112102601', $this->branch1->id);

        $nextCode = $this->service->generate($this->branch1->id, $customDate);
        $this->assertSame('PC112102602', $nextCode);

        // Tạo đơn thứ hai 02
        $this->createOrderWithCode('PC112102602', $this->branch1->id);

        $thirdCode = $this->service->generate($this->branch1->id, $customDate);
        $this->assertSame('PC112102603', $thirdCode);
    }

    /**
     * Test sinh mã với ngày tùy biến (DDMMYY 6 chữ số).
     */
    public function test_generate_order_code_with_custom_date(): void
    {
        $customDate = Carbon::create(2026, 5, 9, 14, 30, 0);
        $code = $this->service->generate($this->branch1->id, $customDate);

        // Ngày 09 tháng 05 năm 2026 -> 090526
        $this->assertSame('PC109052601', $code);
    }

    /**
     * Test fallback về branch_id khi không tìm thấy branch trong DB.
     */
    public function test_generate_order_code_falls_back_to_branch_id_when_branch_not_found(): void
    {
        $nonExistentBranchId = 9999;
        $customDate = Carbon::create(2026, 10, 12, 8, 0, 0);
        $code = $this->service->generate($nonExistentBranchId, $customDate);

        $expectedCode = 'PC999912102601';
        $this->assertSame($expectedCode, $code);
    }

    /**
     * Test xử lý biên khi số thứ tự vượt quá 99 (> 99 đơn trong ngày).
     */
    public function test_generate_order_code_handles_sequence_exceeding_99(): void
    {
        $customDate = Carbon::create(2026, 10, 12, 18, 0, 0);

        // Đã có đơn thứ 99
        $this->createOrderWithCode('PC112102699', $this->branch1->id);

        $code100 = $this->service->generate($this->branch1->id, $customDate);
        $this->assertSame('PC1121026100', $code100);
    }

    /**
     * Test reset STT về 01 khi sang ngày mới.
     */
    public function test_generate_order_code_resets_sequence_on_new_day(): void
    {
        $day1 = Carbon::create(2026, 10, 12, 16, 0, 0);
        $day2 = Carbon::create(2026, 10, 13, 8, 0, 0);

        $this->createOrderWithCode('PC112102605', $this->branch1->id);

        $codeDay2 = $this->service->generate($this->branch1->id, $day2);
        $this->assertSame('PC113102601', $codeDay2);
    }

    /**
     * Test tính độc lập STT giữa các chi nhánh trong cùng một ngày.
     */
    public function test_generate_order_code_is_independent_per_branch(): void
    {
        $date = Carbon::create(2026, 10, 12, 11, 0, 0);

        // Chi nhánh 1 đã tạo đến đơn 05
        $this->createOrderWithCode('PC112102605', $this->branch1->id);

        // Chi nhánh 2 tạo đơn đầu tiên của ngày hôm đó
        $codeBranch2 = $this->service->generate($this->branch2->id, $date);
        $this->assertSame('PC212102601', $codeBranch2);
    }
}
