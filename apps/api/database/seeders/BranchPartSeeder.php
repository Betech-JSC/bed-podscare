<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\Part;
use Illuminate\Database\Seeder;

class BranchPartSeeder extends Seeder
{
    public function run(): void
    {
        $branches = Branch::all();
        $parts = Part::all();

        if ($branches->isEmpty() || $parts->isEmpty()) {
            return;
        }

        $firstBranch = $branches->first();

        foreach ($parts as $part) {
            foreach ($branches as $branch) {
                $qty = ($branch->id === $firstBranch->id) ? (int) $part->stock_quantity : 0;
                BranchPart::updateOrCreate(
                    [
                        'branch_id' => $branch->id,
                        'part_id'   => $part->id,
                    ],
                    [
                        'stock_quantity'  => $qty,
                        'min_stock_alert' => $part->min_stock_alert ?? 5,
                    ]
                );
            }
        }
    }
}
