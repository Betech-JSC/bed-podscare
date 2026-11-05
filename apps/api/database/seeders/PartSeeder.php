<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\BranchPart;
use App\Models\Part;
use Illuminate\Database\Seeder;

class PartSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Giữ nguyên 9 mã SKU lịch sử để tương thích ngược 100% với các đơn hàng và bài test cũ
        $legacyParts = [
            [
                'sku' => 'BAT-APP2-01',
                'name' => 'Pin tai nghe AirPods Pro 2',
                'category' => 'Pin',
                'compatible_models' => 'AirPods Pro 2',
                'storage_location' => 'Kệ A · Tầng 2',
                'stock_quantity' => 18,
                'min_stock_alert' => 5,
                'cost_price' => 180000.00,
                'retail_price' => 280000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
            [
                'sku' => 'CASE-APP2-04',
                'name' => 'Hộp sạc AirPods Pro 2 USB-C',
                'category' => 'Hộp sạc',
                'compatible_models' => 'AirPods Pro 2',
                'storage_location' => 'Kệ B · Tầng 1',
                'stock_quantity' => 4,
                'min_stock_alert' => 2,
                'cost_price' => 850000.00,
                'retail_price' => 1150000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
            [
                'sku' => 'MESH-APP-02',
                'name' => 'Lưới chống bụi AirPods Pro',
                'category' => 'Linh kiện',
                'compatible_models' => 'AirPods Pro, AirPods Pro 2',
                'storage_location' => 'Kệ A · Hộc 3',
                'stock_quantity' => 42,
                'min_stock_alert' => 10,
                'cost_price' => 25000.00,
                'retail_price' => 65000.00,
                'unit' => 'bộ',
                'is_active' => true,
            ],
            [
                'sku' => 'BAT-APP3-02',
                'name' => 'Pin tai nghe AirPods 3',
                'category' => 'Pin',
                'compatible_models' => 'AirPods 3',
                'storage_location' => 'Kệ A · Tầng 2',
                'stock_quantity' => 11,
                'min_stock_alert' => 5,
                'cost_price' => 150000.00,
                'retail_price' => 240000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
            [
                'sku' => 'FLEX-CASE-01',
                'name' => 'Cáp flex hộp sạc AirPods Pro',
                'category' => 'Linh kiện',
                'compatible_models' => 'AirPods Pro',
                'storage_location' => 'Kệ B · Hộc 1',
                'stock_quantity' => 3,
                'min_stock_alert' => 2,
                'cost_price' => 120000.00,
                'retail_price' => 190000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
            [
                'sku' => 'BAT-APP-01',
                'name' => 'Pin tai nghe AirPods Pro',
                'category' => 'Pin',
                'compatible_models' => 'AirPods Pro',
                'storage_location' => 'Kệ A · Tầng 1',
                'stock_quantity' => 26,
                'min_stock_alert' => 5,
                'cost_price' => 160000.00,
                'retail_price' => 260000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
            [
                'sku' => 'AW-BAT-01',
                'name' => 'Pin Apple Watch chuẩn dung lượng',
                'category' => 'battery',
                'compatible_models' => 'Apple Watch Series / SE / Ultra',
                'storage_location' => 'Kệ C · Tầng 1',
                'stock_quantity' => 25,
                'min_stock_alert' => 5,
                'cost_price' => 180000.00,
                'retail_price' => 450000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
            [
                'sku' => 'AW-GLASS-01',
                'name' => 'Mặt kính cảm ứng Apple Watch',
                'category' => 'screen',
                'compatible_models' => 'Apple Watch Series / SE / Ultra',
                'storage_location' => 'Kệ C · Tầng 2',
                'stock_quantity' => 20,
                'min_stock_alert' => 5,
                'cost_price' => 220000.00,
                'retail_price' => 550000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
            [
                'sku' => 'APEN-TIP-01',
                'name' => 'Linh kiện đầu ngòi & cell pin Apple Pencil',
                'category' => 'accessory',
                'compatible_models' => 'Apple Pencil 1, Apple Pencil 2, USB-C, Pro',
                'storage_location' => 'Kệ D · Hộc 1',
                'stock_quantity' => 20,
                'min_stock_alert' => 5,
                'cost_price' => 150000.00,
                'retail_price' => 350000.00,
                'unit' => 'cái',
                'is_active' => true,
            ],
        ];

        // 2. Tạo danh mục SKU chuẩn tách riêng Trái (L) / Phải (R) cho 6 dòng AirPods theo docs/device-issue-parts-mapping.csv
        $airpodsModels = [
            'AP2' => [
                'model_name' => 'AirPods 2',
                'bat_label'  => 'Pin tai nghe AirPods 2',
                'bat'        => [120000, 220000],
                'spk'        => [130000, 250000],
                'mic'        => [110000, 220000],
                'mesh'       => [20000, 60000],
                'case_bat'   => [160000, 300000],
                'case_flex'  => [120000, 250000],
            ],
            'AP3' => [
                'model_name' => 'AirPods 3',
                'bat_label'  => 'Pin tai nghe AirPods 3',
                'bat'        => [150000, 250000],
                'spk'        => [160000, 280000],
                'mic'        => [140000, 250000],
                'mesh'       => [25000, 70000],
                'case_bat'   => [190000, 350000],
                'case_flex'  => [140000, 280000],
            ],
            'APP1' => [
                'model_name' => 'AirPods Pro',
                'bat_label'  => 'Pin tai nghe AirPods Pro',
                'bat'        => [160000, 260000],
                'spk'        => [190000, 350000],
                'mic'        => [150000, 280000],
                'mesh'       => [25000, 70000],
                'case_bat'   => [200000, 380000],
                'case_flex'  => [150000, 300000],
            ],
            'APP2L' => [
                'model_name' => 'AirPods Pro 2 (Lightning)',
                'bat_label'  => 'Pin tai nghe AirPods Pro 2 (Lightning)',
                'bat'        => [180000, 280000],
                'spk'        => [220000, 380000],
                'mic'        => [170000, 300000],
                'mesh'       => [30000, 80000],
                'case_bat'   => [230000, 420000],
                'case_flex'  => [170000, 320000],
            ],
            'APP2C' => [
                'model_name' => 'AirPods Pro 2 (USB-C)',
                'bat_label'  => 'Pin tai nghe AirPods Pro 2 (USB-C)',
                'bat'        => [190000, 300000],
                'spk'        => [230000, 400000],
                'mic'        => [180000, 320000],
                'mesh'       => [30000, 80000],
                'case_bat'   => [250000, 450000],
                'case_flex'  => [180000, 350000],
            ],
            'APM' => [
                'model_name' => 'AirPods Max',
                'bat_label'  => 'Pin củ tai AirPods Max',
                'bat'        => [350000, 650000],
                'spk'        => [450000, 800000],
                'mic'        => [280000, 500000],
                'mesh'       => [120000, 250000],
                'case_bat'   => null,
                'case_flex'  => null,
            ],
        ];

        $airpodsParts = [];
        foreach ($airpodsModels as $prefix => $cfg) {
            $mName = $cfg['model_name'];
            foreach (['L' => 'Tai Trái (L)', 'R' => 'Tai Phải (R)'] as $side => $sideLabel) {
                $airpodsParts[] = [
                    'sku'               => "BAT-{$prefix}-{$side}",
                    'name'              => "{$cfg['bat_label']} - {$sideLabel}",
                    'category'          => 'Pin',
                    'compatible_models' => $mName,
                    'storage_location'  => 'Kệ A · Tầng 1',
                    'stock_quantity'    => 20,
                    'min_stock_alert'   => 5,
                    'cost_price'        => (float) $cfg['bat'][0],
                    'retail_price'      => (float) $cfg['bat'][1],
                    'unit'              => 'viên',
                    'is_active'         => true,
                ];
                $airpodsParts[] = [
                    'sku'               => "SPK-{$prefix}-{$side}",
                    'name'              => "Cụm loa Driver {$mName} - {$sideLabel}",
                    'category'          => 'Loa / Âm thanh',
                    'compatible_models' => $mName,
                    'storage_location'  => 'Kệ A · Tầng 2',
                    'stock_quantity'    => 20,
                    'min_stock_alert'   => 5,
                    'cost_price'        => (float) $cfg['spk'][0],
                    'retail_price'      => (float) $cfg['spk'][1],
                    'unit'              => 'cái',
                    'is_active'         => true,
                ];
                $airpodsParts[] = [
                    'sku'               => "MIC-{$prefix}-{$side}",
                    'name'              => "Cụm cáp Mic {$mName} - {$sideLabel}",
                    'category'          => 'Mic / Cảm biến',
                    'compatible_models' => $mName,
                    'storage_location'  => 'Kệ A · Tầng 3',
                    'stock_quantity'    => 20,
                    'min_stock_alert'   => 5,
                    'cost_price'        => (float) $cfg['mic'][0],
                    'retail_price'      => (float) $cfg['mic'][1],
                    'unit'              => 'cái',
                    'is_active'         => true,
                ];
                $airpodsParts[] = [
                    'sku'               => "MESH-{$prefix}-{$side}",
                    'name'              => "Lưới chống bụi âm thanh {$mName} - {$sideLabel}",
                    'category'          => 'Linh kiện',
                    'compatible_models' => $mName,
                    'storage_location'  => 'Kệ A · Hộc 3',
                    'stock_quantity'    => 30,
                    'min_stock_alert'   => 10,
                    'cost_price'        => (float) $cfg['mesh'][0],
                    'retail_price'      => (float) $cfg['mesh'][1],
                    'unit'              => 'cái',
                    'is_active'         => true,
                ];
            }

            if ($cfg['case_bat'] !== null) {
                $airpodsParts[] = [
                    'sku'               => "BAT-CASE-{$prefix}",
                    'name'              => "Pin hộp sạc {$mName}",
                    'category'          => 'Hộp sạc',
                    'compatible_models' => $mName,
                    'storage_location'  => 'Kệ B · Tầng 1',
                    'stock_quantity'    => 15,
                    'min_stock_alert'   => 5,
                    'cost_price'        => (float) $cfg['case_bat'][0],
                    'retail_price'      => (float) $cfg['case_bat'][1],
                    'unit'              => 'viên',
                    'is_active'         => true,
                ];
            }

            if ($cfg['case_flex'] !== null) {
                $airpodsParts[] = [
                    'sku'               => "FLEX-CASE-{$prefix}",
                    'name'              => "Cáp flex chân sạc hộp sạc {$mName}",
                    'category'          => 'Hộp sạc',
                    'compatible_models' => $mName,
                    'storage_location'  => 'Kệ B · Hộc 1',
                    'stock_quantity'    => 15,
                    'min_stock_alert'   => 5,
                    'cost_price'        => (float) $cfg['case_flex'][0],
                    'retail_price'      => (float) $cfg['case_flex'][1],
                    'unit'              => 'cái',
                    'is_active'         => true,
                ];
            }
        }

        // Linh kiện đặc thù của AirPods Max (Khớp xoay & Chân sạc)
        $airpodsParts[] = [
            'sku'               => 'FLEX-SWIVEL-APM',
            'name'              => 'Cáp flex xoay khớp nối AirPods Max',
            'category'          => 'Linh kiện',
            'compatible_models' => 'AirPods Max',
            'storage_location'  => 'Kệ B · Tầng 2',
            'stock_quantity'    => 10,
            'min_stock_alert'   => 3,
            'cost_price'        => 320000.00,
            'retail_price'      => 600000.00,
            'unit'              => 'bộ',
            'is_active'         => true,
        ];
        $airpodsParts[] = [
            'sku'               => 'FLEX-PORT-APM',
            'name'              => 'Cáp cụm chân sạc Lightning AirPods Max',
            'category'          => 'Linh kiện',
            'compatible_models' => 'AirPods Max',
            'storage_location'  => 'Kệ B · Tầng 2',
            'stock_quantity'    => 10,
            'min_stock_alert'   => 3,
            'cost_price'        => 280000.00,
            'retail_price'      => 550000.00,
            'unit'              => 'cái',
            'is_active'         => true,
        ];

        // 3. Tạo danh mục SKU chuẩn cho 5 dòng Apple Watch theo docs/device-issue-parts-mapping.csv
        $watchModels = [
            'AWS7-45' => [
                'model_name' => 'Apple Watch Series 7 45mm',
                'bat'        => [180000, 450000],
                'gls'        => [220000, 550000],
                'scr'        => [950000, 1650000],
                'crw'        => [160000, 380000],
                'tap'        => [170000, 400000],
            ],
            'AWS8-45' => [
                'model_name' => 'Apple Watch Series 8 45mm',
                'bat'        => [200000, 480000],
                'gls'        => [250000, 600000],
                'scr'        => [1100000, 1850000],
                'crw'        => [180000, 420000],
                'tap'        => [190000, 450000],
            ],
            'AWS9-45' => [
                'model_name' => 'Apple Watch Series 9 45mm',
                'bat'        => [220000, 520000],
                'gls'        => [280000, 680000],
                'scr'        => [1350000, 2200000],
                'crw'        => [200000, 450000],
                'tap'        => [210000, 480000],
            ],
            'AWU1-49' => [
                'model_name' => 'Apple Watch Ultra 49mm',
                'bat'        => [320000, 750000],
                'gls'        => [420000, 950000],
                'scr'        => [2100000, 3400000],
                'crw'        => [280000, 650000],
                'tap'        => [300000, 680000],
            ],
            'AWU2-49' => [
                'model_name' => 'Apple Watch Ultra 2 49mm',
                'bat'        => [350000, 850000],
                'gls'        => [460000, 1050000],
                'scr'        => [2400000, 3800000],
                'crw'        => [320000, 720000],
                'tap'        => [340000, 750000],
            ],
        ];

        $watchParts = [];
        foreach ($watchModels as $prefix => $cfg) {
            $mName = $cfg['model_name'];
            $watchParts[] = [
                'sku'               => "BAT-{$prefix}",
                'name'              => "Pin {$mName} chuẩn dung lượng",
                'category'          => 'Pin',
                'compatible_models' => $mName,
                'storage_location'  => 'Kệ C · Tầng 1',
                'stock_quantity'    => 15,
                'min_stock_alert'   => 5,
                'cost_price'        => (float) $cfg['bat'][0],
                'retail_price'      => (float) $cfg['bat'][1],
                'unit'              => 'viên',
                'is_active'         => true,
            ];
            $watchParts[] = [
                'sku'               => "GLS-{$prefix}",
                'name'              => "Mặt kính cảm ứng {$mName}",
                'category'          => 'Màn hình / Kính',
                'compatible_models' => $mName,
                'storage_location'  => 'Kệ C · Tầng 2',
                'stock_quantity'    => 15,
                'min_stock_alert'   => 5,
                'cost_price'        => (float) $cfg['gls'][0],
                'retail_price'      => (float) $cfg['gls'][1],
                'unit'              => 'cái',
                'is_active'         => true,
            ];
            $watchParts[] = [
                'sku'               => "SCR-{$prefix}",
                'name'              => "Màn hình OLED nguyên bộ {$mName}",
                'category'          => 'Màn hình / Kính',
                'compatible_models' => $mName,
                'storage_location'  => 'Kệ C · Tầng 2',
                'stock_quantity'    => 8,
                'min_stock_alert'   => 2,
                'cost_price'        => (float) $cfg['scr'][0],
                'retail_price'      => (float) $cfg['scr'][1],
                'unit'              => 'bộ',
                'is_active'         => true,
            ];
            $watchParts[] = [
                'sku'               => "CRW-{$prefix}",
                'name'              => "Cáp nút xoay Digital Crown {$mName}",
                'category'          => 'Linh kiện',
                'compatible_models' => $mName,
                'storage_location'  => 'Kệ C · Tầng 3',
                'stock_quantity'    => 12,
                'min_stock_alert'   => 3,
                'cost_price'        => (float) $cfg['crw'][0],
                'retail_price'      => (float) $cfg['crw'][1],
                'unit'              => 'cái',
                'is_active'         => true,
            ];
            $watchParts[] = [
                'sku'               => "TAP-{$prefix}",
                'name'              => "Cụm rung Taptic Engine & Loa {$mName}",
                'category'          => 'Linh kiện',
                'compatible_models' => $mName,
                'storage_location'  => 'Kệ C · Tầng 3',
                'stock_quantity'    => 12,
                'min_stock_alert'   => 3,
                'cost_price'        => (float) $cfg['tap'][0],
                'retail_price'      => (float) $cfg['tap'][1],
                'unit'              => 'cái',
                'is_active'         => true,
            ];
        }

        // 4. Tạo danh mục SKU chuẩn cho 2 dòng Apple Pencil theo docs/device-issue-parts-mapping.csv
        $pencilModels = [
            'PEN2' => [
                'model_name' => 'Apple Pencil 2',
                'bat'        => [150000, 350000],
                'tip'        => [120000, 300000],
                'pcb'        => [180000, 400000],
            ],
            'PENPRO' => [
                'model_name' => 'Apple Pencil Pro',
                'bat'        => [220000, 480000],
                'tip'        => [180000, 420000],
                'pcb'        => [250000, 550000],
            ],
        ];

        $pencilParts = [];
        foreach ($pencilModels as $prefix => $cfg) {
            $mName = $cfg['model_name'];
            $pencilParts[] = [
                'sku'               => "BAT-{$prefix}",
                'name'              => "Cell pin {$mName} chuyên dụng",
                'category'          => 'Pin',
                'compatible_models' => $mName,
                'storage_location'  => 'Kệ D · Hộc 1',
                'stock_quantity'    => 15,
                'min_stock_alert'   => 5,
                'cost_price'        => (float) $cfg['bat'][0],
                'retail_price'      => (float) $cfg['bat'][1],
                'unit'              => 'viên',
                'is_active'         => true,
            ];
            $pencilParts[] = [
                'sku'               => "TIP-{$prefix}",
                'name'              => "Cụm đầu cảm ứng lực & ngòi {$mName}",
                'category'          => 'Linh kiện',
                'compatible_models' => $mName,
                'storage_location'  => 'Kệ D · Hộc 2',
                'stock_quantity'    => 20,
                'min_stock_alert'   => 5,
                'cost_price'        => (float) $cfg['tip'][0],
                'retail_price'      => (float) $cfg['tip'][1],
                'unit'              => 'bộ',
                'is_active'         => true,
            ];
            $pencilParts[] = [
                'sku'               => "PCB-{$prefix}",
                'name'              => "IC mạch Bluetooth & cuộn sạc {$mName}",
                'category'          => 'Linh kiện',
                'compatible_models' => $mName,
                'storage_location'  => 'Kệ D · Hộc 3',
                'stock_quantity'    => 10,
                'min_stock_alert'   => 3,
                'cost_price'        => (float) $cfg['pcb'][0],
                'retail_price'      => (float) $cfg['pcb'][1],
                'unit'              => 'cái',
                'is_active'         => true,
            ];
        }

        $allParts = array_merge($legacyParts, $airpodsParts, $watchParts, $pencilParts);
        $branches = Branch::withoutGlobalScopes()->get();
        $firstBranch = $branches->first();

        foreach ($allParts as $partData) {
            $part = Part::withoutGlobalScopes()->updateOrCreate(['sku' => $partData['sku']], $partData);

            if ($firstBranch) {
                foreach ($branches as $branch) {
                    $qty = ($branch->id === $firstBranch->id) ? (int) $part->stock_quantity : 0;
                    BranchPart::firstOrCreate(
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
}
