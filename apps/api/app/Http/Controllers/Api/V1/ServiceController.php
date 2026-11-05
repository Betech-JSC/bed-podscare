<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CommonIssue;
use App\Models\DeviceModel;
use App\Models\Part;
use App\Models\RepairService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceController extends Controller
{
    /**
     * Bảng ánh xạ mã SKU lịch sử sang mã SKU thật trong Kho (parts).
     *
     * @var array<string, array{sku: string, name: string}>
     */
    protected const WAREHOUSE_SKU_ALIASES = [
        'LK-AP-PIN-CAP'     => ['sku' => 'BAT-APP2-01', 'name' => 'Pin tai nghe AirPods Pro 2'],
        'LK-AP-SEAL-KEO'    => ['sku' => 'MESH-APP-02', 'name' => 'Lưới chống bụi AirPods Pro'],
        'LK-AP-MIC-ANC'     => ['sku' => 'MESH-APP-02', 'name' => 'Lưới chống bụi AirPods Pro'],
        'LK-AP-LOA-ANC'     => ['sku' => 'MESH-APP-02', 'name' => 'Lưới chống bụi AirPods Pro'],
        'LK-AP-DRIVER'      => ['sku' => 'MESH-APP-02', 'name' => 'Lưới chống bụi AirPods Pro'],
        'LK-AP-MESH'        => ['sku' => 'MESH-APP-02', 'name' => 'Lưới chống bụi AirPods Pro'],
        'LK-AP-CASE-FLEX'   => ['sku' => 'FLEX-CASE-01', 'name' => 'Cáp flex hộp sạc AirPods Pro'],
        'LK-AP-CASE-PIN'    => ['sku' => 'CASE-APP2-04', 'name' => 'Hộp sạc AirPods Pro 2 USB-C'],
        'MIC-APP-ANC'       => ['sku' => 'MESH-APP-02', 'name' => 'Lưới chống bụi AirPods Pro'],
        'DRV-APP-TITAN'     => ['sku' => 'MESH-APP-02', 'name' => 'Lưới chống bụi AirPods Pro'],
        'CAP-FLEX-APP'      => ['sku' => 'FLEX-CASE-01', 'name' => 'Cáp flex hộp sạc AirPods Pro'],
        'BAT-CASE-APP'      => ['sku' => 'CASE-APP2-04', 'name' => 'Hộp sạc AirPods Pro 2 USB-C'],
        'IC-CHG-APP'        => ['sku' => 'CASE-APP2-04', 'name' => 'Hộp sạc AirPods Pro 2 USB-C'],
        'LK-AW-PIN'         => ['sku' => 'AW-BAT-01', 'name' => 'Pin Apple Watch chuẩn dung lượng'],
        'AW-PIN-STD'        => ['sku' => 'AW-BAT-01', 'name' => 'Pin Apple Watch chuẩn dung lượng'],
        'BAT-AW-STD'        => ['sku' => 'AW-BAT-01', 'name' => 'Pin Apple Watch chuẩn dung lượng'],
        'LK-AW-SEAL'        => ['sku' => 'AW-BAT-01', 'name' => 'Pin Apple Watch chuẩn dung lượng'],
        'SEAL-AW-WP'        => ['sku' => 'AW-BAT-01', 'name' => 'Pin Apple Watch chuẩn dung lượng'],
        'LK-AW-GLASS-TOUCH' => ['sku' => 'AW-GLASS-01', 'name' => 'Mặt kính cảm ứng Apple Watch'],
        'AW-GLASS-TOUCH'    => ['sku' => 'AW-GLASS-01', 'name' => 'Mặt kính cảm ứng Apple Watch'],
        'GLS-AW-OCA'        => ['sku' => 'AW-GLASS-01', 'name' => 'Mặt kính cảm ứng Apple Watch'],
        'TP-AW-ZIN'         => ['sku' => 'AW-GLASS-01', 'name' => 'Mặt kính cảm ứng Apple Watch'],
        'FLEX-AW-CROWN'     => ['sku' => 'AW-GLASS-01', 'name' => 'Mặt kính cảm ứng Apple Watch'],
        'TAP-AW-ENG'        => ['sku' => 'AW-GLASS-01', 'name' => 'Mặt kính cảm ứng Apple Watch'],
        'LK-PEN-TIP-COIL'   => ['sku' => 'APEN-TIP-01', 'name' => 'Linh kiện đầu ngòi & cell pin Apple Pencil'],
        'PEN-BAT-CELL'      => ['sku' => 'APEN-TIP-01', 'name' => 'Linh kiện đầu ngòi & cell pin Apple Pencil'],
        'PEN-TIP-COIL'      => ['sku' => 'APEN-TIP-01', 'name' => 'Linh kiện đầu ngòi & cell pin Apple Pencil'],
    ];
    /**
     * Bảng giá & danh mục gói dịch vụ sửa chữa.
     */
    public function index(Request $request): JsonResponse
    {
        $query = RepairService::with('deviceModel')->where('is_active', true);

        if ($cat = $request->input('category')) {
            $query->where('category', $cat);
        }

        if ($deviceId = $request->input('device_model_id')) {
            $query->where(function ($q) use ($deviceId) {
                $q->where('device_model_id', $deviceId)->orWhereNull('device_model_id');
            });
        }

        $services = $query->orderBy('base_price', 'asc')->get();

        return $this->success($services, 'Lấy bảng giá dịch vụ thành công.');
    }

    /**
     * Danh sách các sự cố / lỗi thường gặp theo nhóm thiết bị / danh mục.
     */
    public function commonIssues(Request $request): JsonResponse
    {
        $query = CommonIssue::active();

        if ($modelId = $request->input('device_model_id')) {
            $hasModelSpecific = CommonIssue::active()->where('device_model_id', $modelId)->exists();
            if ($hasModelSpecific) {
                $query->where('device_model_id', $modelId);
            } else {
                $model = DeviceModel::find($modelId);
                $cat = $request->input('category') ?: ($model?->category ?? 'AirPods');
                $query->where('category', $cat);
            }
        } elseif ($category = $request->input('category')) {
            $query->where('category', $category);
        } else {
            $query->where('category', 'AirPods');
        }

        $tenantId = $request->user()?->tenant_id;
        $partsQuery = Part::withoutGlobalScopes();
        if ($tenantId) {
            $partsQuery->where(function ($q) use ($tenantId) {
                $q->where('tenant_id', $tenantId)->orWhereNull('tenant_id');
            });
        }
        $partsBySku = $partsQuery->get()->keyBy(fn (Part $p) => strtoupper((string) $p->sku));

        $issues = $query->orderBy('order_index', 'asc')->get()
            ->map(function (CommonIssue $issue) use ($partsBySku) {
                $item = $this->enrichCommonIssueMetadata($issue);
                if (! empty($item['linked_parts']) && is_array($item['linked_parts'])) {
                    $normalizedParts = [];
                    $seenSkus = [];
                    foreach ($item['linked_parts'] as $lp) {
                        if (! is_array($lp)) {
                            continue;
                        }
                        $rawSku = strtoupper(trim((string) ($lp['part_sku'] ?? ($lp['sku'] ?? ''))));
                        if ($rawSku !== '' && isset(self::WAREHOUSE_SKU_ALIASES[$rawSku])) {
                            $alias = self::WAREHOUSE_SKU_ALIASES[$rawSku];
                            $rawSku = $alias['sku'];
                            $lp['part_sku'] = $alias['sku'];
                            $lp['part_name'] = $alias['name'];
                        }
                        if ($rawSku !== '' && isset($seenSkus[$rawSku])) {
                            continue;
                        }
                        if ($rawSku !== '') {
                            $seenSkus[$rawSku] = true;
                        }
                        if ($rawSku !== '' && $partsBySku->has($rawSku)) {
                            /** @var Part $matchedPart */
                            $matchedPart = $partsBySku->get($rawSku);
                            $lp['part_id'] = $matchedPart->id;
                            $lp['stock_quantity'] = (int) $matchedPart->stock_quantity;
                        }
                        $normalizedParts[] = $lp;
                    }
                    $item['linked_parts'] = $normalizedParts;
                }
                return $item;
            })
            ->values();

        return $this->success($issues, 'Lấy danh mục lỗi thường gặp thành công.');
    }

    /**
     * Bổ sung metadata chuẩn (issue_code, keywords, watch_sizes, linked_parts) cho từng lỗi thường gặp.
     */
    protected function enrichCommonIssueMetadata(CommonIssue $issue): array
    {
        $data = $issue->toArray();
        $category = (string) ($issue->category ?? 'AirPods');
        $issueName = (string) ($issue->issue_name ?? '');
        $solution = (string) ($issue->solution ?? '');
        $lowerName = mb_strtolower($issueName . ' ' . $solution);

        $catPrefix = match ($category) {
            'AirPods'      => 'AP',
            'Apple Watch'  => 'AW',
            'Apple Pencil' => 'PEN',
            'MacBook'      => 'MAC',
            'iPad'         => 'IPD',
            default        => 'GEN',
        };

        $index = (int) ($issue->order_index ?: ($issue->id ?: 1));
        $data['issue_code'] = $data['issue_code'] ?? sprintf('ISS-%s-%02d', $catPrefix, $index);

        if (empty($data['watch_sizes'])) {
            $data['watch_sizes'] = $category === 'Apple Watch'
                ? ['40mm', '41mm', '42mm', '44mm', '45mm', '46mm', '49mm (Ultra)']
                : [];
        }

        if (empty($data['linked_parts']) || empty($data['keywords'])) {
            $preset = $this->resolveIssuePreset($category, $lowerName, $issueName, $solution, $catPrefix, $index);
            if (empty($data['linked_parts'])) {
                $data['linked_parts'] = $preset['linked_parts'];
            }
            if (empty($data['keywords'])) {
                $data['keywords'] = $preset['keywords'];
            }
        }

        return $data;
    }

    /**
     * Ánh xạ linh kiện đi kèm (linked_parts) và từ khóa tìm kiếm nhanh (keywords) theo danh mục & tên lỗi.
     *
     * @return array{linked_parts: array<int, array<string, mixed>>, keywords: array<int, string>}
     */
    protected function resolveIssuePreset(
        string $category,
        string $lowerName,
        string $issueName,
        string $solution,
        string $catPrefix,
        int $index
    ): array {
        if ($category === 'AirPods') {
            if (str_contains($lowerName, 'pin') && ! str_contains($lowerName, 'hộp sạc')) {
                return [
                    'keywords' => ['pin', 'chai pin', 'tut pin', 'thay pin', 'airpods'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'BAT-APP2-01',
                            'part_name' => 'Pin tai nghe AirPods Pro 2',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Tai trái / Tai phải',
                        ],
                    ],
                ];
            }
            if (str_contains($lowerName, 'anc') || str_contains($lowerName, 'chống ồn') || str_contains($lowerName, 'rít') || str_contains($lowerName, 'xuyên âm') || str_contains($lowerName, 'mic')) {
                return [
                    'keywords' => ['anc', 'chong on', 're', 'rit gio', 'micro', 'mang am'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'MESH-APP-02',
                            'part_name' => 'Lưới chống bụi AirPods Pro',
                            'quantity'  => 1,
                            'unit'      => 'bộ',
                            'position'  => 'Màng âm ngoài',
                        ],
                        [
                            'part_sku'  => 'FLEX-CASE-01',
                            'part_name' => 'Cáp flex hộp sạc AirPods Pro',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Tai trái / Tai phải',
                        ],
                    ],
                ];
            }
            if (str_contains($lowerName, 'loa') || str_contains($lowerName, 'nhỏ tiếng') || str_contains($lowerName, 'bass') || str_contains($lowerName, 'rè')) {
                return [
                    'keywords' => ['loa', 'nho tieng', 're bass', 'driver', 'mang loa'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'MESH-APP-02',
                            'part_name' => 'Lưới chống bụi AirPods Pro',
                            'quantity'  => 1,
                            'unit'      => 'bộ',
                            'position'  => 'Màng loa',
                        ],
                    ],
                ];
            }
            if (str_contains($lowerName, 'hộp sạc') || str_contains($lowerName, 'case') || str_contains($lowerName, 'chân tiếp xúc')) {
                return [
                    'keywords' => ['hop sac', 'case', 'khong nhan sac', 'cap flex', 'chan sac'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'FLEX-CASE-01',
                            'part_name' => 'Cáp flex hộp sạc AirPods Pro',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Hộp sạc (Dock)',
                        ],
                        [
                            'part_sku'  => 'CASE-APP2-04',
                            'part_name' => 'Hộp sạc AirPods Pro 2 USB-C',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Hộp sạc (Dock)',
                        ],
                    ],
                ];
            }

            return [
                'keywords' => ['ket noi', 'mat ket noi', 'pin', 'airpods'],
                'linked_parts' => [
                    [
                        'part_sku'  => 'BAT-APP2-01',
                        'part_name' => 'Pin tai nghe AirPods Pro 2',
                        'quantity'  => 1,
                        'unit'      => 'cái',
                        'position'  => 'Tai trái / Tai phải',
                    ],
                ],
            ];
        }

        if ($category === 'Apple Watch') {
            if (str_contains($lowerName, 'pin') || str_contains($lowerName, 'nguồn')) {
                return [
                    'keywords' => ['pin', 'pin phong', 'phu man', 'tut nguon', 'apple watch'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'AW-BAT-01',
                            'part_name' => 'Pin Apple Watch chuẩn dung lượng',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Thân đồng hồ',
                        ],
                    ],
                ];
            }

            return [
                'keywords' => ['vo kinh', 'ep kinh', 'liet cam ung', 'digital crown', 'apple watch'],
                'linked_parts' => [
                    [
                        'part_sku'  => 'AW-GLASS-01',
                        'part_name' => 'Mặt kính cảm ứng Apple Watch',
                        'quantity'  => 1,
                        'unit'      => 'cái',
                        'position'  => 'Màn hình cảm ứng',
                    ],
                ],
            ];
        }

        // Apple Pencil hoặc danh mục khác
        $words = array_values(array_filter(
            preg_split('/[\s,\/\-]+/u', mb_strtolower($issueName)),
            fn ($w) => mb_strlen($w) >= 2
        ));

        return [
            'keywords' => array_values(array_unique(array_merge([mb_strtolower($category)], array_slice($words, 0, 5)))),
            'linked_parts' => [
                [
                    'part_sku'  => 'APEN-TIP-01',
                    'part_name' => 'Linh kiện đầu ngòi & cell pin Apple Pencil',
                    'quantity'  => 1,
                    'unit'      => 'cái',
                    'position'  => 'Cụm linh kiện chính',
                ],
            ],
        ];
    }

    /**
     * Chi tiết dịch vụ sửa chữa.
     */
    public function show(int $id): JsonResponse
    {
        $service = RepairService::with('deviceModel')->find($id);

        if (! $service) {
            return $this->empty('Không tìm thấy dịch vụ.');
        }

        return $this->success($service, 'Lấy chi tiết dịch vụ thành công.');
    }
}
