<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CommonIssue;
use App\Models\DeviceModel;
use App\Models\RepairService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceController extends Controller
{
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

        $issues = $query->orderBy('order_index', 'asc')->get()
            ->map(fn (CommonIssue $issue) => $this->enrichCommonIssueMetadata($issue))
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
                            'part_name' => 'Pin tai nghe AirPods dung lượng cao',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Tai trái / Tai phải',
                        ],
                    ],
                ];
            }
            if (str_contains($lowerName, 'anc') || str_contains($lowerName, 'chống ồn') || str_contains($lowerName, 'rít')) {
                return [
                    'keywords' => ['anc', 'chong on', 're', 'rit gio', 'micro', 'mang am'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'MIC-APP-ANC',
                            'part_name' => 'Cụm micro chống ồn ANC AirPods',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Tai trái / Tai phải',
                        ],
                        [
                            'part_sku'  => 'MESH-APP-02',
                            'part_name' => 'Lưới chống bụi AirPods Pro',
                            'quantity'  => 1,
                            'unit'      => 'bộ',
                            'position'  => 'Màng âm ngoài',
                        ],
                    ],
                ];
            }
            if (str_contains($lowerName, 'loa') || str_contains($lowerName, 'nhỏ tiếng') || str_contains($lowerName, 'bass')) {
                return [
                    'keywords' => ['loa', 'nho tieng', 're bass', 'driver', 'mang loa'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'DRV-APP-TITAN',
                            'part_name' => 'Driver màng loa Titan AirPods',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Buồng âm tai nghe',
                        ],
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
                            'part_name' => 'Cáp flex hộp sạc AirPods',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Hộp sạc (Dock)',
                        ],
                        [
                            'part_sku'  => 'BAT-CASE-APP',
                            'part_name' => 'Pin hộp sạc AirPods',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Hộp sạc (Dock)',
                        ],
                    ],
                ];
            }

            return [
                'keywords' => ['ve sinh', 'bam ban', 'tac mang am', 'uv', 'airpods'],
                'linked_parts' => [
                    [
                        'part_sku'  => 'MESH-APP-02',
                        'part_name' => 'Lưới chống bụi & Bộ dung dịch vệ sinh UV',
                        'quantity'  => 1,
                        'unit'      => 'bộ',
                        'position'  => 'Toàn bộ tai nghe & Hộp sạc',
                    ],
                ],
            ];
        }

        if ($category === 'Apple Watch') {
            if (str_contains($lowerName, 'pin')) {
                return [
                    'keywords' => ['pin', 'pin phong', 'phu man', 'tut nguon', 'apple watch'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'BAT-AW-STD',
                            'part_name' => 'Pin Apple Watch tiêu chuẩn chính hãng',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Thân đồng hồ',
                        ],
                        [
                            'part_sku'  => 'SEAL-AW-WP',
                            'part_name' => 'Ron keo chống nước Apple Watch',
                            'quantity'  => 1,
                            'unit'      => 'bộ',
                            'position'  => 'Viền màn hình',
                        ],
                    ],
                ];
            }
            if (str_contains($lowerName, 'vỡ mặt kính') || str_contains($lowerName, 'ép kính')) {
                return [
                    'keywords' => ['vo kinh', 'ep kinh', 'tray xuoc', 'mat kinh', 'apple watch'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'GLS-AW-OCA',
                            'part_name' => 'Mặt kính Apple Watch liền keo OCA',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Màn hình trên',
                        ],
                        [
                            'part_sku'  => 'SEAL-AW-WP',
                            'part_name' => 'Ron keo chống nước Apple Watch',
                            'quantity'  => 1,
                            'unit'      => 'bộ',
                            'position'  => 'Viền màn hình',
                        ],
                    ],
                ];
            }
            if (str_contains($lowerName, 'cảm ứng') || str_contains($lowerName, 'liệt')) {
                return [
                    'keywords' => ['liet cam ung', 'loan vuot', 'do man hinh', 'kinh cam ung', 'apple watch'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'TP-AW-ZIN',
                            'part_name' => 'Cụm kính cảm ứng zin Apple Watch',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Màn hình cảm ứng',
                        ],
                        [
                            'part_sku'  => 'SEAL-AW-WP',
                            'part_name' => 'Ron keo chống nước Apple Watch',
                            'quantity'  => 1,
                            'unit'      => 'bộ',
                            'position'  => 'Viền màn hình',
                        ],
                    ],
                ];
            }
            if (str_contains($lowerName, 'crown') || str_contains($lowerName, 'nút nguồn')) {
                return [
                    'keywords' => ['digital crown', 'nut nguon', 'ket nut', 'cap crown', 'apple watch'],
                    'linked_parts' => [
                        [
                            'part_sku'  => 'FLEX-AW-CROWN',
                            'part_name' => 'Cụm cáp Digital Crown & Nút nguồn Apple Watch',
                            'quantity'  => 1,
                            'unit'      => 'cái',
                            'position'  => 'Cạnh bên phải',
                        ],
                    ],
                ];
            }

            return [
                'keywords' => ['mat rung', 'taptic engine', 'loa re', 'apple watch'],
                'linked_parts' => [
                    [
                        'part_sku'  => 'TAP-AW-ENG',
                        'part_name' => 'Cục rung Taptic Engine / Loa trong Apple Watch',
                        'quantity'  => 1,
                        'unit'      => 'cái',
                        'position'  => 'Thân đồng hồ',
                    ],
                ],
            ];
        }

        // Apple Pencil, MacBook, iPad hoặc danh mục khác
        $words = array_values(array_filter(
            preg_split('/[\s,\/\-]+/u', mb_strtolower($issueName)),
            fn ($w) => mb_strlen($w) >= 2
        ));

        return [
            'keywords' => array_values(array_unique(array_merge([mb_strtolower($category)], array_slice($words, 0, 5)))),
            'linked_parts' => [
                [
                    'part_sku'  => sprintf('PRT-%s-%02d', $catPrefix, $index),
                    'part_name' => $solution !== '' ? $solution : "Linh kiện {$issueName}",
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
