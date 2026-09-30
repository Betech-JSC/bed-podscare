<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('branch_parts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('part_id')->constrained('parts')->cascadeOnDelete();
            $table->integer('stock_quantity')->default(0);
            $table->integer('min_stock_alert')->default(5);
            $table->timestamps();

            $table->unique(['branch_id', 'part_id'], 'uq_branch_parts_branch_part');
            $table->index(['branch_id', 'stock_quantity'], 'idx_branch_parts_branch_stock');
        });

        // Đồng bộ dữ liệu tồn kho ban đầu từ bảng parts sang các chi nhánh hiện có
        $branches = DB::table('branches')->get();
        $parts = DB::table('parts')->get();

        if ($branches->isNotEmpty() && $parts->isNotEmpty()) {
            $now = now();
            $firstBranch = $branches->first();

            foreach ($parts as $part) {
                foreach ($branches as $branch) {
                    $qty = ($branch->id === $firstBranch->id) ? (int) $part->stock_quantity : 0;
                    DB::table('branch_parts')->insertOrIgnore([
                        'branch_id'       => $branch->id,
                        'part_id'         => $part->id,
                        'stock_quantity'  => $qty,
                        'min_stock_alert' => $part->min_stock_alert ?? 5,
                        'created_at'      => $now,
                        'updated_at'      => $now,
                    ]);
                }
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('branch_parts');
    }
};
