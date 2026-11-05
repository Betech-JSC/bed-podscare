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
        $contextModel = null;

        $modelId = $request->input('device_model_id') ?? $request->input('model_id');
        if ($modelId) {
            $contextModel = DeviceModel::find($modelId);
            $hasModelSpecific = CommonIssue::active()->where('device_model_id', $modelId)->exists();
            if ($hasModelSpecific) {
                $query->where('device_model_id', $modelId);
            } else {
                $cat = $request->input('category') ?: ($contextModel?->category ?? 'AirPods');
                $query->where('category', $cat);
            }
        } elseif ($modelName = $request->input('model_name')) {
            $contextModel = DeviceModel::where('name', $modelName)->first();
            $cat = $request->input('category') ?: ($contextModel?->category ?? 'AirPods');
            $query->where('category', $cat);
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
            ->map(function (CommonIssue $issue) use ($partsBySku, $contextModel) {
                $item = $this->enrichCommonIssueMetadata($issue, $contextModel);
                if (! empty($item['linked_parts']) && is_array($item['linked_parts'])) {
                    $normalizedParts = [];
                    $seenSkus = [];
                    foreach ($item['linked_parts'] as $lp) {
                        if (! is_array($lp)) {
                            continue;
                        }
                        $rawSku = strtoupper(trim((string) ($lp['part_sku'] ?? ($lp['sku'] ?? ''))));
                        if ($rawSku !== '' && ! $partsBySku->has($rawSku) && isset(self::WAREHOUSE_SKU_ALIASES[$rawSku])) {
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
    protected function enrichCommonIssueMetadata(CommonIssue $issue, ?DeviceModel $contextModel = null): array
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
        $effectiveModel = $contextModel ?? ($issue->relationLoaded('deviceModel') ? $issue->deviceModel : null);
        $modelInfo = $this->resolveDeviceModelPrefixAndLabel($category, $issueName, $effectiveModel);

        if (empty($data['watch_sizes'])) {
            $data['watch_sizes'] = $category === 'Apple Watch'
                ? ['40mm', '41mm', '42mm', '44mm', '45mm', '46mm', '49mm (Ultra)']
                : [];
        }

        if (empty($data['linked_parts']) || empty($data['keywords']) || empty($data['issue_code'])) {
            $preset = $this->resolveIssuePreset($category, $lowerName, $issueName, $solution, $catPrefix, $index, $modelInfo);
            if (empty($data['issue_code'])) {
                $data['issue_code'] = $preset['issue_code'] ?? sprintf('ISS-%s-%02d', $catPrefix, $index);
            }
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
     * Xác định tiền tố mã model (AP2, AP3, APP1, APP2L, APP2C, APM, AWS7-45, ..., PEN2, PENPRO) và nhãn dòng máy.
     *
     * @return array{prefix: string, label: string}
     */
    protected function resolveDeviceModelPrefixAndLabel(string $category, string $issueName, ?DeviceModel $model = null): array
    {
        $combined = mb_strtolower(trim(($model?->name ?? '') . ' ' . ($model?->model_code ?? '') . ' ' . $issueName));

        if ($category === 'AirPods' || str_contains($combined, 'airpods')) {
            if (str_contains($combined, 'airpods max') || str_contains($combined, 'a2096') || str_contains($combined, 'mgyh3')) {
                return ['prefix' => 'APM', 'label' => 'AirPods Max'];
            }
            if (
                str_contains($combined, 'pro 2')
                || str_contains($combined, 'a2698')
                || str_contains($combined, 'a2699')
                || str_contains($combined, 'a3047')
                || str_contains($combined, 'a3048')
                || str_contains($combined, 'mtjv3')
                || str_contains($combined, 'mqd83')
            ) {
                if (str_contains($combined, 'lightning') || str_contains($combined, 'a2698') || str_contains($combined, 'a2699') || str_contains($combined, 'mqd83')) {
                    return ['prefix' => 'APP2L', 'label' => 'AirPods Pro 2 (Lightning)'];
                }
                return ['prefix' => 'APP2C', 'label' => 'AirPods Pro 2 (USB-C)'];
            }
            if (str_contains($combined, 'airpods pro') || str_contains($combined, 'a2083') || str_contains($combined, 'a2084') || str_contains($combined, 'mlwk3')) {
                return ['prefix' => 'APP1', 'label' => 'AirPods Pro'];
            }
            if (str_contains($combined, 'airpods 3') || str_contains($combined, 'a2564') || str_contains($combined, 'a2565') || str_contains($combined, 'mme73')) {
                return ['prefix' => 'AP3', 'label' => 'AirPods 3'];
            }
            if (str_contains($combined, 'airpods 2') || str_contains($combined, 'a2031') || str_contains($combined, 'a2032') || str_contains($combined, 'mv7n2')) {
                return ['prefix' => 'AP2', 'label' => 'AirPods 2'];
            }

            return ['prefix' => 'APP2C', 'label' => 'AirPods Pro 2 (USB-C)'];
        }

        if ($category === 'Apple Watch' || str_contains($combined, 'apple watch')) {
            if (str_contains($combined, 'ultra 2') || str_contains($combined, 'mreg3')) {
                return ['prefix' => 'AWU2-49', 'label' => 'Apple Watch Ultra 2 49mm'];
            }
            if (str_contains($combined, 'ultra') || str_contains($combined, 'a2622')) {
                return ['prefix' => 'AWU1-49', 'label' => 'Apple Watch Ultra 49mm'];
            }
            if (str_contains($combined, 'series 7') || str_contains($combined, 's7') || str_contains($combined, 'a2474')) {
                return ['prefix' => 'AWS7-45', 'label' => 'Apple Watch Series 7 45mm'];
            }
            if (str_contains($combined, 'series 8') || str_contains($combined, 's8') || str_contains($combined, 'a2771')) {
                return ['prefix' => 'AWS8-45', 'label' => 'Apple Watch Series 8 45mm'];
            }

            return ['prefix' => 'AWS9-45', 'label' => 'Apple Watch Series 9 45mm'];
        }

        if ($category === 'Apple Pencil' || str_contains($combined, 'pencil')) {
            if (str_contains($combined, 'pencil pro') || str_contains($combined, 'mx2d3')) {
                return ['prefix' => 'PENPRO', 'label' => 'Apple Pencil Pro'];
            }

            return ['prefix' => 'PEN2', 'label' => 'Apple Pencil 2'];
        }

        return ['prefix' => 'GEN', 'label' => $model?->name ?? $category];
    }

    /**
     * Xác định phạm vi bên tai nghe AirPods (L, R, LR, hoặc GENERIC) từ chuỗi tên lỗi.
     */
    protected function resolveAirPodsSideScope(string $issueName): string
    {
        $lower = mb_strtolower($issueName);

        if (
            str_contains($lower, 'cả 2 tai')
            || str_contains($lower, '2 tai')
            || str_contains($lower, 'hai tai')
            || str_contains($lower, 'cả hai tai')
            || str_contains($lower, 'cả 2 bên')
            || str_contains($lower, '2 bên')
            || str_contains($lower, 'l + r')
            || str_contains($lower, 'l+r')
        ) {
            return 'LR';
        }

        if (str_contains($lower, 'tai trái') || str_contains($lower, 'bên trái') || preg_match('/\(\s*l\s*\)/i', $issueName)) {
            return 'L';
        }

        if (str_contains($lower, 'tai phải') || str_contains($lower, 'bên phải') || preg_match('/\(\s*r\s*\)/i', $issueName)) {
            return 'R';
        }

        return 'GENERIC';
    }

    /**
     * Xây dựng mảng linked_parts theo phạm vi L / R / LR cho tai nghe AirPods.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function buildAirPodsEarLinkedParts(
        string $partType,
        string $prefix,
        string $basePartName,
        string $unit,
        string $scope
    ): array {
        $leftItem = [
            'part_sku'  => "{$partType}-{$prefix}-L",
            'part_name' => "{$basePartName} - Tai Trái (L)",
            'quantity'  => 1,
            'unit'      => $unit,
            'position'  => 'Tai trái (L)',
        ];

        $rightItem = [
            'part_sku'  => "{$partType}-{$prefix}-R",
            'part_name' => "{$basePartName} - Tai Phải (R)",
            'quantity'  => 1,
            'unit'      => $unit,
            'position'  => 'Tai phải (R)',
        ];

        if ($scope === 'LR') {
            return [$leftItem, $rightItem];
        }

        if ($scope === 'R') {
            return [$rightItem];
        }

        return [$leftItem];
    }

    /**
     * Ánh xạ linh kiện đi kèm (linked_parts) và từ khóa tìm kiếm nhanh (keywords) theo danh mục & tên lỗi.
     *
     * @param  array{prefix: string, label: string}  $modelInfo
     * @return array{issue_code?: string, linked_parts: array<int, array<string, mixed>>, keywords: array<int, string>}
     */
    protected function resolveIssuePreset(
        string $category,
        string $lowerName,
        string $issueName,
        string $solution,
        string $catPrefix,
        int $index,
        array $modelInfo = ['prefix' => 'APP2C', 'label' => 'AirPods Pro 2 (USB-C)']
    ): array {
        $lowerIssue = mb_strtolower($issueName);
        $prefix = $modelInfo['prefix'];
        $modelLabel = $modelInfo['label'];

        if ($category === 'AirPods') {
            $scope = $this->resolveAirPodsSideScope($issueName);
            $scopeSuffix = $scope === 'GENERIC' ? 'L' : $scope;

            // 1. Hộp sạc / Case / Khớp xoay AirPods Max
            if (str_contains($lowerIssue, 'xoay') || str_contains($lowerIssue, 'headband')) {
                return [
                    'issue_code' => 'ISS-APM-FLEX-SWIVEL',
                    'keywords'   => ['cap xoay', 'khop noi', 'headband', 'airpods max'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'FLEX-SWIVEL-APM',
                            'part_name' => 'Cáp flex xoay khớp nối AirPods Max',
                            'quantity'  => 1,
                            'unit'      => 'bộ',
                            'position'  => 'Khung Headband',
                        ],
                    ],
                ];
            }

            if (str_contains($lowerIssue, 'chân sạc lightning') || ($prefix === 'APM' && str_contains($lowerIssue, 'chân sạc'))) {
                return [
                    'issue_code' => 'ISS-APM-FLEX-PORT',
                    'keywords'   => ['chan sac', 'cong sac', 'lightning', 'airpods max'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'FLEX-PORT-APM',
                            'part_name' => 'Cáp cụm chân sạc Lightning AirPods Max',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Cổng sạc',
                        ],
                    ],
                ];
            }

            if (str_contains($lowerIssue, 'hộp sạc') || str_contains($lowerIssue, 'case') || str_contains($lowerIssue, 'chân tiếp xúc')) {
                $casePrefix = $prefix === 'APM' ? 'APP2C' : $prefix;
                $caseLabel = $prefix === 'APM' ? 'AirPods Pro 2 (USB-C)' : $modelLabel;

                if (str_contains($lowerIssue, 'pin hộp sạc') || (str_contains($lowerIssue, 'pin') && ! str_contains($lowerIssue, 'cáp'))) {
                    return [
                        'issue_code' => "ISS-{$casePrefix}-CASE-BAT",
                        'keywords'   => ['pin hop sac', 'case', 'pin dock', 'airpods'],
                        'linked_parts' => [
                            [
                                'part_sku'  => "BAT-CASE-{$casePrefix}",
                                'part_name' => "Pin hộp sạc {$caseLabel}",
                                'quantity'  => 1,
                                'unit'      => 'viên',
                                'position'  => 'Hộp sạc (Case)',
                            ],
                        ],
                    ];
                }

                if (str_contains($lowerIssue, 'cáp flex') || str_contains($lowerIssue, 'chân tiếp xúc')) {
                    return [
                        'issue_code' => "ISS-{$casePrefix}-CASE-FLEX",
                        'keywords'   => ['cap flex', 'chan tiep xuc', 'chan sac', 'case'],
                        'linked_parts' => [
                            [
                                'part_sku'  => "FLEX-CASE-{$casePrefix}",
                                'part_name' => "Cáp flex chân sạc hộp sạc {$caseLabel}",
                                'quantity'  => 1,
                                'unit'      => 'cái',
                                'position'  => 'Hộp sạc (Case)',
                            ],
                        ],
                    ];
                }

                return [
                    'issue_code' => "ISS-{$casePrefix}-CASE-BAT",
                    'keywords'   => ['hop sac', 'case', 'khong nhan sac', 'cap flex', 'chan sac'],
                    'linked_parts' => [
                        [
                            'part_sku'  => "BAT-CASE-{$casePrefix}",
                            'part_name' => "Pin hộp sạc {$caseLabel}",
                            'quantity'  => 1,
                            'unit'      => 'viên',
                            'position'  => 'Hộp sạc (Case)',
                        ],
                        [
                            'part_sku'  => "FLEX-CASE-{$casePrefix}",
                            'part_name' => "Cáp flex chân sạc hộp sạc {$caseLabel}",
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Hộp sạc (Case)',
                        ],
                    ],
                ];
            }

            // 2. Vệ sinh & Thay lưới chống bụi âm thanh (MESH)
            if (str_contains($lowerIssue, 'lưới') || str_contains($lowerIssue, 'vệ sinh') || str_contains($lowerIssue, 'bám bẩn')) {
                return [
                    'issue_code'   => "ISS-{$prefix}-MESH-{$scopeSuffix}",
                    'keywords'     => ['luoi chong bui', 've sinh', 'mang loa', 'bam ban', 'airpods'],
                    'linked_parts' => $this->buildAirPodsEarLinkedParts(
                        'MESH',
                        $prefix,
                        "Lưới chống bụi âm thanh {$modelLabel}",
                        'cái',
                        $scope
                    ),
                ];
            }

            // 3. Thay Mic đàm thoại / Mic ANC (MIC)
            if (str_contains($lowerIssue, 'mic')) {
                return [
                    'issue_code'   => "ISS-{$prefix}-MIC-{$scopeSuffix}",
                    'keywords'     => ['mic', 'dam thoai', 'mic anc', 'micro', 'airpods'],
                    'linked_parts' => $this->buildAirPodsEarLinkedParts(
                        'MIC',
                        $prefix,
                        "Cụm cáp Mic {$modelLabel}",
                        'cái',
                        $scope
                    ),
                ];
            }

            // 4. Sửa/Thay loa & ANC (SPK)
            if (
                str_contains($lowerIssue, 'loa')
                || str_contains($lowerIssue, 'anc')
                || str_contains($lowerIssue, 'chống ồn')
                || str_contains($lowerIssue, 'rít')
                || str_contains($lowerIssue, 'xuyên âm')
                || str_contains($lowerIssue, 'nhỏ tiếng')
                || str_contains($lowerIssue, 'bass')
                || str_contains($lowerIssue, 'rè')
            ) {
                return [
                    'issue_code'   => "ISS-{$prefix}-SPK-{$scopeSuffix}",
                    'keywords'     => ['loa', 'anc', 'chong on', 're bass', 'driver', 'airpods'],
                    'linked_parts' => $this->buildAirPodsEarLinkedParts(
                        'SPK',
                        $prefix,
                        "Cụm loa Driver {$modelLabel}",
                        'cái',
                        $scope
                    ),
                ];
            }

            // 5. Thay pin tai nghe AirPods (BAT)
            $batBaseName = $prefix === 'APM' ? "Pin củ tai {$modelLabel}" : "Pin tai nghe {$modelLabel}";

            return [
                'issue_code'   => "ISS-{$prefix}-BAT-{$scopeSuffix}",
                'keywords'     => ['pin', 'chai pin', 'tut pin', 'thay pin', 'airpods'],
                'linked_parts' => $this->buildAirPodsEarLinkedParts(
                    'BAT',
                    $prefix,
                    $batBaseName,
                    'viên',
                    $scope
                ),
            ];
        }

        if ($category === 'Apple Watch') {
            $awPrefix = str_starts_with($prefix, 'AW') ? $prefix : 'AWS9-45';
            $awLabel = str_contains($modelLabel, 'Apple Watch') ? $modelLabel : 'Apple Watch Series 9 45mm';

            if (str_contains($lowerName, 'pin') || str_contains($lowerName, 'nguồn')) {
                return [
                    'issue_code' => "ISS-{$awPrefix}-BAT",
                    'keywords'   => ['pin', 'pin phong', 'phu man', 'tut nguon', 'apple watch'],
                    'linked_parts' => [
                        [
                            'part_sku'  => "BAT-{$awPrefix}",
                            'part_name' => "Pin {$awLabel} chuẩn dung lượng",
                            'quantity'  => 1,
                            'unit'      => 'viên',
                            'position'  => 'Thân đồng hồ (Body)',
                        ],
                    ],
                ];
            }

            if (str_contains($lowerName, 'oled') || str_contains($lowerName, 'nguyên bộ') || str_contains($lowerName, 'sọc màn')) {
                return [
                    'issue_code' => "ISS-{$awPrefix}-SCR",
                    'keywords'   => ['man hinh', 'oled', 'soc man', 'chay muc', 'apple watch'],
                    'linked_parts' => [
                        [
                            'part_sku'  => "SCR-{$awPrefix}",
                            'part_name' => "Màn hình OLED nguyên bộ {$awLabel}",
                            'quantity'  => 1,
                            'unit'      => 'bộ',
                            'position'  => 'Màn hình (Screen)',
                        ],
                    ],
                ];
            }

            if (str_contains($lowerName, 'crown') || str_contains($lowerName, 'nút nguồn')) {
                return [
                    'issue_code' => "ISS-{$awPrefix}-CRW",
                    'keywords'   => ['digital crown', 'nut nguon', 'nut xoay', 'apple watch'],
                    'linked_parts' => [
                        [
                            'part_sku'  => "CRW-{$awPrefix}",
                            'part_name' => "Cáp nút xoay Digital Crown {$awLabel}",
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Cụm nút sườn (Crown)',
                        ],
                    ],
                ];
            }

            if (str_contains($lowerName, 'taptic') || str_contains($lowerName, 'rung')) {
                return [
                    'issue_code' => "ISS-{$awPrefix}-TAP",
                    'keywords'   => ['taptic engine', 'mat rung', 'loa ngoai', 'apple watch'],
                    'linked_parts' => [
                        [
                            'part_sku'  => "TAP-{$awPrefix}",
                            'part_name' => "Cụm rung Taptic Engine & Loa {$awLabel}",
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Thân đồng hồ (Body)',
                        ],
                    ],
                ];
            }

            return [
                'issue_code' => "ISS-{$awPrefix}-GLS",
                'keywords'   => ['vo kinh', 'ep kinh', 'liet cam ung', 'oca', 'apple watch'],
                'linked_parts' => [
                    [
                        'part_sku'  => "GLS-{$awPrefix}",
                        'part_name' => "Mặt kính cảm ứng {$awLabel}",
                        'quantity'  => 1,
                        'unit'      => 'cái',
                        'position'  => 'Màn hình (Screen)',
                    ],
                ],
            ];
        }

        if ($category === 'Apple Pencil') {
            $penPrefix = str_starts_with($prefix, 'PEN') ? $prefix : 'PEN2';
            $penLabel = str_contains($modelLabel, 'Apple Pencil') ? $modelLabel : 'Apple Pencil 2';

            if (str_contains($lowerName, 'pin') || str_contains($lowerName, 'mất nguồn') || str_contains($lowerName, 'sập nguồn')) {
                return [
                    'issue_code' => "ISS-{$penPrefix}-BAT",
                    'keywords'   => ['pin', 'cell pin', 'khong sac', 'mat nguon', 'apple pencil'],
                    'linked_parts' => [
                        [
                            'part_sku'  => "BAT-{$penPrefix}",
                            'part_name' => "Cell pin {$penLabel} chuyên dụng",
                            'quantity'  => 1,
                            'unit'      => 'viên',
                            'position'  => 'Thân bút (Body)',
                        ],
                    ],
                ];
            }

            if (str_contains($lowerName, 'bluetooth') || str_contains($lowerName, 'cuộn sạc') || str_contains($lowerName, 'mạch')) {
                return [
                    'issue_code' => "ISS-{$penPrefix}-PCB",
                    'keywords'   => ['bluetooth', 'cuon sac', 'mach', 'apple pencil'],
                    'linked_parts' => [
                        [
                            'part_sku'  => "PCB-{$penPrefix}",
                            'part_name' => "IC mạch Bluetooth & cuộn sạc {$penLabel}",
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Thân bút (Body)',
                        ],
                    ],
                ];
            }

            return [
                'issue_code' => "ISS-{$penPrefix}-TIP",
                'keywords'   => ['dau ngoi', 'cam ung luc', 've dut doan', 'apple pencil'],
                'linked_parts' => [
                    [
                        'part_sku'  => "TIP-{$penPrefix}",
                        'part_name' => "Cụm đầu cảm ứng lực & ngòi {$penLabel}",
                        'quantity'  => 1,
                        'unit'      => 'bộ',
                        'position'  => 'Đầu ngòi (Tip)',
                    ],
                ],
            ];
        }

        // Danh mục khác (MacBook, iPad, ...)
        $words = array_values(array_filter(
            preg_split('/[\s,\/\-]+/u', mb_strtolower($issueName)),
            fn ($w) => mb_strlen($w) >= 2
        ));

        return [
            'issue_code' => sprintf('ISS-%s-%02d', $catPrefix, $index),
            'keywords'   => array_values(array_unique(array_merge([mb_strtolower($category)], array_slice($words, 0, 5)))),
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
