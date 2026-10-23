<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Part;
use App\Models\Supplier;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WorkShift;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class GoodsReceiptSupplierDebtAndLogoutTest extends TestCase
{
    use DatabaseTransactions;

    protected Tenant $tenant;
    protected Branch $branch;
    protected User $admin;
    protected Supplier $supplier;
    protected Part $part;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'code'       => 'gr_debt_auth_' . uniqid(),
            'name'       => 'PodsCare Inventory & Auth Store',
            'status'     => 'active',
            'plan'       => 'pro',
            'expires_at' => now()->addYear(),
        ]);

        $this->branch = Branch::create([
            'tenant_id' => $this->tenant->id,
            'code'      => 'CN_GR_' . uniqid(),
            'name'      => 'Chi Nhánh Kho',
            'address'   => '200 Điện Biên Phủ',
            'phone'     => '0905556667',
            'is_active' => true,
        ]);

        $this->admin = User::forceCreate([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->branch->id,
            'name'      => 'Admin Kho',
            'email'     => 'admin_gr_' . uniqid() . '@podscare.vn',
            'phone'     => '091' . rand(1000000, 9999999),
            'password'  => Hash::make('password123'),
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $this->supplier = Supplier::create([
            'tenant_id'    => $this->tenant->id,
            'code'         => 'NCC_GR_' . uniqid(),
            'name'         => 'Nhà Cung Cấp Linh Kiện A',
            'phone'        => '098' . rand(1000000, 9999999),
            'debt_balance' => 0,
            'is_active'    => true,
        ]);

        $this->part = Part::create([
            'tenant_id'        => $this->tenant->id,
            'sku'              => 'SKU_GR_' . uniqid(),
            'name'             => 'Vỏ sạc AirPods 3',
            'category'         => 'Vỏ máy',
            'storage_location' => 'Kệ B2',
            'cost_price'       => 150000,
            'sell_price'       => 350000,
            'stock_quantity'   => 5,
            'min_stock_alert'  => 2,
        ]);
    }

    /**
     * 1. Kiểm thử GET /api/v1/goods-receipts/{id}, GET /api/v1/suppliers/{id}/debt-transactions
     *    và POST /api/v1/suppliers/{id}/debt/pay (kèm chặn trả vượt công nợ HTTP 422).
     */
    public function test_goods_receipt_show_and_supplier_debt_transactions_and_pay_endpoint(): void
    {
        // Mở ca làm việc để hỗ trợ thanh toán
        WorkShift::create([
            'tenant_id'    => $this->tenant->id,
            'branch_id'    => $this->branch->id,
            'cashier_id'   => $this->admin->id,
            'shift_code'   => 'SH_GR_' . uniqid(),
            'status'       => 'open',
            'opening_cash' => 2000000,
            'opened_at'    => now(),
        ]);

        // Tạo phiếu nhập kho ghi nợ 500.000đ (nhập 5 x 100.000đ, trả trước 0đ)
        $createRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/goods-receipts', [
                'supplier_id'    => $this->supplier->id,
                'branch_id'      => $this->branch->id,
                'items'          => [
                    [
                        'part_id'    => $this->part->id,
                        'quantity'   => 5,
                        'unit_price' => 100000,
                    ],
                ],
                'paid_amount'    => 0,
                'payment_method' => 'none',
                'notes'          => 'Nhập lô vỏ sạc đợt 1',
            ]);

        $createRes->assertStatus(201);
        $receiptId = $createRes->json('data.id');

        // 1. Xem chi tiết phiếu nhập kho GET /api/v1/goods-receipts/{id}
        $showRes = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/v1/goods-receipts/{$receiptId}");

        $showRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $receiptId)
            ->assertJsonPath('data.supplier_id', $this->supplier->id);
        $this->assertEquals(500000.0, (float) $showRes->json('data.debt_amount'));

        // 2. Trả nợ NCC qua alias POST /api/v1/suppliers/{id}/debt/pay (200.000đ chuyển khoản)
        $payRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/v1/suppliers/{$this->supplier->id}/debt/pay", [
                'amount'         => 200000,
                'payment_method' => 'bank_transfer',
                'branch_id'      => $this->branch->id,
                'notes'          => 'Thanh toán đợt 1',
            ]);

        $payRes->assertStatus(201)
            ->assertJsonPath('success', true);
        $this->assertEquals(300000.0, (float) $payRes->json('data.debt_after'));

        // 3. Chặn trả vượt quá số dư nợ còn lại (300.000đ) -> HTTP 422
        $overPayRes = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/v1/suppliers/{$this->supplier->id}/debt/pay", [
                'amount'         => 400000,
                'payment_method' => 'bank_transfer',
                'branch_id'      => $this->branch->id,
            ]);
        $overPayRes->assertStatus(422);

        // 4. Lấy lịch sử biến động công nợ GET /api/v1/suppliers/{id}/debt-transactions
        $historyRes = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/v1/suppliers/{$this->supplier->id}/debt-transactions");

        $historyRes->assertStatus(200)
            ->assertJsonPath('success', true);
        $this->assertCount(2, $historyRes->json('data.data'));
    }

    /**
     * 2. Kiểm thử POST /api/v1/auth/logout thu hồi Sanctum PersonalAccessToken hiện hành.
     */
    public function test_auth_logout_revokes_current_sanctum_token(): void
    {
        $newToken = $this->admin->createToken('test_session_token');
        $plainTextToken = $newToken->plainTextToken;
        $tokenId = $newToken->accessToken->id;

        $this->assertNotNull(PersonalAccessToken::find($tokenId));

        $logoutRes = $this->withHeader('Authorization', 'Bearer ' . $plainTextToken)
            ->postJson('/api/v1/auth/logout');

        $logoutRes->assertStatus(200)
            ->assertJsonPath('success', true);

        // Token đã bị xóa khỏi bảng personal_access_tokens
        $this->assertNull(PersonalAccessToken::find($tokenId));
    }
}
