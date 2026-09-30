<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $branchQ1 = Branch::where('code', 'Q1')->first();
        $branchQ3 = Branch::where('code', 'Q3')->first();

        $users = [
            [
                'name' => 'Minh Lê',
                'email' => 'admin@podscare.vn',
                'phone' => '0901 000 001',
                'password' => Hash::make('password'),
                'role' => 'admin',
                'branch_id' => $branchQ1?->id,
                'avatar_url' => 'https://ui-avatars.com/api/?name=Minh+Le&background=10B981&color=fff',
                'is_active' => true,
            ],
            [
                'name' => 'Lan Phạm',
                'email' => 'cskh.lan@podscare.vn',
                'phone' => '0902 000 002',
                'password' => Hash::make('password'),
                'role' => 'cskh',
                'branch_id' => $branchQ1?->id,
                'avatar_url' => 'https://ui-avatars.com/api/?name=Lan+Pham&background=3B82F6&color=fff',
                'is_active' => true,
            ],
            [
                'name' => 'Tuấn K.',
                'email' => 'ktv.tuan@podscare.vn',
                'phone' => '0903 000 003',
                'password' => Hash::make('password'),
                'role' => 'technician',
                'branch_id' => $branchQ1?->id,
                'avatar_url' => 'https://ui-avatars.com/api/?name=Tuan+K&background=F59E0B&color=fff',
                'is_active' => true,
            ],
            [
                'name' => 'Duy T.',
                'email' => 'ktv.duy@podscare.vn',
                'phone' => '0903 000 004',
                'password' => Hash::make('password'),
                'role' => 'technician',
                'branch_id' => $branchQ3?->id,
                'avatar_url' => 'https://ui-avatars.com/api/?name=Duy+T&background=F59E0B&color=fff',
                'is_active' => true,
            ],
            [
                'name' => 'Hải N.',
                'email' => 'qc.inspector@podscare.vn',
                'phone' => '0904 000 005',
                'password' => Hash::make('password'),
                'role' => 'qc',
                'branch_id' => $branchQ1?->id,
                'avatar_url' => 'https://ui-avatars.com/api/?name=Hai+N&background=8B5CF6&color=fff',
                'is_active' => true,
            ],
            [
                'name' => 'Việt Trần',
                'email' => 'kho.viet@podscare.vn',
                'phone' => '0905 000 006',
                'password' => Hash::make('password'),
                'role' => 'inventory',
                'branch_id' => $branchQ1?->id,
                'avatar_url' => 'https://ui-avatars.com/api/?name=Viet+Tran&background=EC4899&color=fff',
                'is_active' => true,
            ],
        ];

        foreach ($users as $user) {
            User::updateOrCreate(['email' => $user['email']], $user);
        }
    }
}
