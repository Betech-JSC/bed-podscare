<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            BranchSeeder::class,
            UserSeeder::class,
            DeviceModelSeeder::class,
            RepairServiceSeeder::class,
            PartSeeder::class,
            PartnerSeeder::class,
            CustomerAndOrderSeeder::class,
        ]);
    }
}
