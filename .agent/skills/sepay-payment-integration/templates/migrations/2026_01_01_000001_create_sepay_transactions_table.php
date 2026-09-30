<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Bảng ghi nhận và quản lý các giao dịch thanh toán qua SePay VietQR.
     */
    public function up(): void
    {
        Schema::create('sepay_transactions', function (Blueprint $table) {
            $table->id();
            
            // Khóa ngoại liên kết đối tượng (User hoặc Order)
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->unsignedBigInteger('order_id')->nullable()->index();
            $table->string('order_type', 100)->nullable(); // App\Models\Order hoặc Contact
            
            // Mã đối soát SePay - Cú pháp chuyển khoản duy nhất
            $table->string('reference_code', 50)->unique();
            
            // Loại giao dịch và số tiền
            $table->string('type', 50)->default('order_payment'); // order_payment, topup, deposit
            $table->decimal('amount', 14, 2);                      // Số tiền yêu cầu thanh toán
            $table->decimal('amount_paid', 14, 2)->default(0);     // Số tiền thực tế ngân hàng đã nhận
            $table->decimal('debt_amount', 14, 2)->default(0);     // Công nợ còn lại (nếu cọc/chuyển thiếu)
            
            // Trạng thái giao dịch
            // pending: Đang chờ khách quét QR
            // completed: Đã thanh toán đủ (PAID_FULL)
            // underpaid: Chuyển thiếu tiền, dưới mức cọc tối thiểu
            // deposited: Đã thanh toán cọc một phần
            // expired: Mã QR quá hạn
            // failed: Lỗi giao dịch
            $table->enum('status', ['pending', 'completed', 'underpaid', 'deposited', 'expired', 'failed'])->default('pending');
            
            // ID giao dịch từ SePay - RẤT QUAN TRỌNG: Dùng làm Idempotency Key chống cộng tiền trùng lặp
            $table->string('sepay_transaction_id', 100)->nullable()->unique();
            
            // Cổng & thông tin ngân hàng
            $table->string('bank_code', 20)->nullable();
            $table->text('qr_url')->nullable();                    // URL ảnh VietQR sinh động
            
            // Thời gian hiệu lực và dữ liệu kiểm toán
            $table->timestamp('expires_at')->nullable();           // Thời điểm mã QR hết hạn
            $table->json('meta')->nullable();                      // Toàn bộ raw payload từ Webhook
            
            $table->timestamps();
            
            // Indexes tối ưu truy vấn
            $table->index(['reference_code', 'status']);
            $table->index(['created_at', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sepay_transactions');
    }
};
