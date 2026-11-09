<?php

namespace App\Services\Threads;

use App\Models\ThreadsAccount;
use App\Models\ThreadsPost;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class ThreadsCsvImportService
{
    public const CSV_HEADERS = [
        'account_username',
        'account_id',
        'content_text',
        'media_type',
        'media_urls',
        'link_attachment',
        'topic_tag',
        'reply_control',
        'thread_group_key',
        'reply_order',
        'scheduled_at',
        'is_sponsored',
        'sponsored_suffix',
        'client_ref',
    ];

    protected ThreadsPostValidator $validator;

    public function __construct(?ThreadsPostValidator $validator = null)
    {
        $this->validator = $validator ?? app(ThreadsPostValidator::class);
    }

    /**
     * Danh sách tiêu đề cột chuẩn của file CSV mẫu.
     *
     * @return array<int, string>
     */
    public function getCsvHeaders(): array
    {
        return self::CSV_HEADERS;
    }

    /**
     * Sinh nội dung CSV mẫu chuẩn UTF-8 (có chuỗi bài nối tiếp Multi-post Thread và bài hợp tác trả phí Cách C).
     */
    public function getSampleCsvContent(int $rowCount = 12): string
    {
        $headers = implode(',', self::CSV_HEADERS);
        $lines = [$headers];

        // Chuỗi bài nối tiếp mẫu (Multi-post Thread: bài gốc reply_order=0, bài con reply_order=1 để trống scheduled_at chạy Auto-chain)
        $lines[] = implode(',', [
            'podscare.vn',
            '',
            '"Chuỗi bài kỹ thuật 1/2: Vì sao tai nghe chống ồn chủ động (ANC) bị giảm hiệu suất sau 18 tháng sử dụng?"',
            'TEXT',
            '',
            '',
            'PodsCareLab',
            'everyone',
            'thread_anc_sample_01',
            '0',
            '',
            '0',
            '',
            '',
        ]);

        $lines[] = implode(',', [
            'podscare.vn',
            '',
            '"Chuỗi bài kỹ thuật 2/2 (Auto-chain 30-60s): Làm sạch lưới micro thu âm bằng sóng siêu âm khô giúp khôi phục 95% hiệu suất ANC."',
            'IMAGE',
            'https://cdn.podscare.vn/threads/anc-mesh-01.jpg',
            'https://podscare.vn/kiem-tra-chong-on-anc',
            'PodsCareLab',
            'everyone',
            'thread_anc_sample_01',
            '1',
            '',
            '0',
            '',
            '',
        ]);

        // Bài hợp tác trả phí Cách C mẫu #1: có sponsored_suffix tường minh
        $lines[] = implode(',', [
            'podscare.partner',
            '',
            '"Trải nghiệm bộ đệm tai foam hoạt tính thế hệ mới giúp cách âm thụ động tốt hơn 3dB khi bay đường dài."',
            'IMAGE',
            'https://cdn.podscare.vn/threads/comply-foam-collab.jpg',
            'https://podscare.vn/phu-kien/dem-tai-foam',
            'AudioGear',
            'everyone',
            '',
            '0',
            '',
            '1',
            '#Sponsored',
            'BRAND_AUDIOFOAM_Q4',
        ]);

        // Bài hợp tác trả phí Cách C mẫu #2: giữ nguyên 100% nội dung gốc (sponsored_suffix để trống)
        $lines[] = implode(',', [
            'podscare.lab',
            '',
            '"Bảng thông số nội trở chuẩn của cell pin tai nghe sau 400 chu kỳ sạc xả tại phòng đo PodsCare Lab."',
            'TEXT',
            '',
            '',
            'ThayPinAirPods',
            'everyone',
            '',
            '0',
            '',
            '1',
            '',
            'PARTNER_CELLTECH_11',
        ]);

        $topics = ['PodsCareLab', 'ThayPinAirPods', 'ChongOnANC', 'VeSinhTaiNghe', 'AudioGear', 'MeoDungBen'];
        for ($i = 5; $i <= max(4, $rowCount); $i++) {
            $acctIndex = (($i - 1) % 20) + 1;
            $username = $acctIndex === 1 ? 'podscare.vn' : sprintf('podscare.acct%02d', $acctIndex);
            $topic = $topics[($i - 1) % count($topics)];
            $isSponsored = ($i % 5 === 0) ? '1' : '0';
            $suffix = ($i % 10 === 0) ? '#Sponsored' : '';
            $clientRef = $isSponsored === '1' ? sprintf('CAMPAIGN_Q4_%02d', $i) : '';
            $text = sprintf(
                '"Bản tin kỹ thuật #%d (%s): Quy trình kiểm định 12 bước âm học và đo dòng sạc chuẩn xác cho thiết bị âm thanh cá nhân."',
                $i,
                $username
            );

            $lines[] = implode(',', [
                $username,
                '',
                $text,
                'TEXT',
                '',
                '',
                $topic,
                'everyone',
                '',
                '0',
                '',
                $isSponsored,
                $suffix,
                $clientRef,
            ]);
        }

        return implode("\n", $lines) . "\n";
    }

    /**
     * Alias sinh CSV mẫu.
     */
    public function generateSampleCsv(int $rowCount = 12): string
    {
        return $this->getSampleCsvContent($rowCount);
    }

    /**
     * Đọc và phân tích nội dung CSV (hỗ trợ UTF-8 BOM, dấu ngoặc kép nhiều dòng chuẩn RFC 4180).
     *
     * @return array<int, array<string, mixed>>
     */
    public function parseCsvContent(string $csvContent): array
    {
        $clean = preg_replace('/^\xEF\xBB\xBF/', '', $csvContent) ?? $csvContent;
        $clean = str_replace(["\r\n", "\r"], "\n", trim($clean));

        if ($clean === '') {
            return [];
        }

        $stream = fopen('php://temp', 'r+');
        if ($stream === false) {
            return [];
        }

        fwrite($stream, $clean);
        rewind($stream);

        // Tự động nhận diện dấu phân cách ',' hoặc ';' trên dòng tiêu đề
        $firstLine = fgets($stream);
        rewind($stream);

        $delimiter = ',';
        if (is_string($firstLine) && substr_count($firstLine, ';') > substr_count($firstLine, ',')) {
            $delimiter = ';';
        }

        $rawHeaders = fgetcsv($stream, 0, $delimiter, '"', '');
        if (! is_array($rawHeaders) || empty($rawHeaders)) {
            fclose($stream);

            return [];
        }

        $headers = array_map(static function ($header): string {
            $h = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header) ?? (string) $header;
            $h = strtolower(trim($h));
            $h = str_replace([' ', '-'], '_', $h);

            return $h;
        }, $rawHeaders);

        // Nếu dòng đầu tiên không chứa bất kỳ tên cột chuẩn nào mà chỉ là dữ liệu
        $knownColumns = [
            'account_username', 'username', 'account_id', 'threads_account_id',
            'content_text', 'text', 'content', 'media_type', 'media_urls',
            'thread_group_key', 'reply_order', 'is_sponsored', 'sponsored_suffix', 'client_ref',
        ];

        $hasHeaderMatch = count(array_intersect($headers, $knownColumns)) > 0;
        if (! $hasHeaderMatch) {
            rewind($stream);
            $headers = self::CSV_HEADERS;
        }

        $rows = [];
        $rowIndex = $hasHeaderMatch ? 1 : 0;

        while (($cols = fgetcsv($stream, 0, $delimiter, '"', '')) !== false) {
            $rowIndex++;

            // Bỏ qua dòng trống hoàn toàn
            $nonEmpty = array_filter($cols, static fn ($val) => $val !== null && trim((string) $val) !== '');
            if (empty($nonEmpty)) {
                continue;
            }

            $assoc = ['_row_number' => $rowIndex];
            foreach ($headers as $idx => $headerName) {
                if ($headerName === '') {
                    continue;
                }
                $assoc[$headerName] = isset($cols[$idx]) ? trim((string) $cols[$idx]) : '';
            }

            $rows[] = $assoc;
        }

        fclose($stream);

        return $rows;
    }

    /**
     * Đọc file CSV từ UploadedFile hoặc đường dẫn file.
     *
     * @return array<int, array<string, mixed>>
     */
    public function parseUploadedFile(UploadedFile|string $file): array
    {
        if ($file instanceof UploadedFile) {
            $content = (string) file_get_contents($file->getRealPath());

            return $this->parseCsvContent($content);
        }

        if (is_file($file) && is_readable($file)) {
            $content = (string) file_get_contents($file);

            return $this->parseCsvContent($content);
        }

        return $this->parseCsvContent($file);
    }

    /**
     * Nhập hàng loạt bài đăng từ CSV (file, chuỗi CSV, hoặc mảng dòng dữ liệu 100+ bài)
     * kèm kiểm định ThreadsPostValidator, xử lý is_sponsored Cách C, chuỗi bài nối tiếp
     * và thuật toán Random Jitter Scheduler.
     *
     * @param  UploadedFile|string|array<int|string, mixed>  $source
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function import(UploadedFile|string|array $source, array $options = []): array
    {
        if ($source instanceof UploadedFile) {
            $rawRows = $this->parseUploadedFile($source);
        } elseif (is_string($source)) {
            $rawRows = $this->parseUploadedFile($source);
        } elseif (is_array($source)) {
            if (isset($source['rows']) && is_array($source['rows'])) {
                $rawRows = array_values($source['rows']);
            } elseif (isset($source['csv_text']) && is_string($source['csv_text'])) {
                $rawRows = $this->parseCsvContent($source['csv_text']);
            } elseif (isset($source['csv_content']) && is_string($source['csv_content'])) {
                $rawRows = $this->parseCsvContent($source['csv_content']);
            } else {
                $rawRows = array_values($source);
            }
        } else {
            $rawRows = [];
        }

        $batchId = isset($options['import_batch_id']) && trim((string) $options['import_batch_id']) !== ''
            ? trim((string) $options['import_batch_id'])
            : 'batch_' . now()->format('Ymd_His') . '_' . strtolower(Str::random(6));

        $jitterMinMinutes = isset($options['jitter_min_minutes']) && is_numeric($options['jitter_min_minutes'])
            ? max(1, (int) $options['jitter_min_minutes'])
            : (int) config('threads.jitter_min_minutes', 3);

        $jitterMaxMinutes = isset($options['jitter_max_minutes']) && is_numeric($options['jitter_max_minutes'])
            ? max($jitterMinMinutes, (int) $options['jitter_max_minutes'])
            : (int) config('threads.jitter_max_minutes', 12);

        $configuredJitterMinutes = isset($options['jitter_minutes']) && is_numeric($options['jitter_minutes'])
            ? max(3, min(15, (int) $options['jitter_minutes']))
            : (int) config('threads.default_jitter_minutes', 8);

        if (isset($options['jitter_minutes']) && ! isset($options['jitter_max_minutes'])) {
            $jitterMaxMinutes = max($jitterMinMinutes, $configuredJitterMinutes);
        }

        $dryRun = filter_var($options['dry_run'] ?? $options['preview_only'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $allowDuplicate = filter_var($options['allow_duplicate'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $defaultAccountId = isset($options['default_account_id']) && is_numeric($options['default_account_id'])
            ? (int) $options['default_account_id']
            : (isset($options['account_id']) && is_numeric($options['account_id']) ? (int) $options['account_id'] : null);

        $defaultStatus = isset($options['status']) && in_array($options['status'], ['draft', 'scheduled'], true)
            ? (string) $options['status']
            : 'scheduled';

        if (empty($rawRows)) {
            return [
                'import_batch_id'     => $batchId,
                'batch_id'            => $batchId,
                'total_rows'          => 0,
                'imported_count'      => 0,
                'created_count'       => 0,
                'valid_count'         => 0,
                'failed_count'        => 0,
                'error_count'         => 0,
                'sponsored_count'     => 0,
                'thread_chains_count' => 0,
                'jitter_minutes'      => $configuredJitterMinutes,
                'dry_run'             => $dryRun,
                'posts'               => [],
                'imported_posts'      => [],
                'errors'              => [],
                'failed_rows'         => [],
            ];
        }

        $accountsById = [];
        $accountsByUsername = [];
        $allAccounts = ThreadsAccount::query()->orderBy('id')->get();
        foreach ($allAccounts as $acc) {
            $accountsById[(int) $acc->id] = $acc;
            if ($acc->username !== null && trim($acc->username) !== '') {
                $cleanUser = strtolower(ltrim(trim($acc->username), '@'));
                $accountsByUsername[$cleanUser] = $acc;
            }
            if ($acc->display_name !== null && trim($acc->display_name) !== '') {
                $accountsByUsername[strtolower(trim($acc->display_name))] = $acc;
            }
        }

        // Bước 1: Chuẩn hóa từng dòng, ánh xạ tài khoản và xác định thứ tự chuỗi bài (thread_group_key + reply_order)
        $normalizedItems = [];
        $errors = [];

        foreach ($rawRows as $idx => $rawRow) {
            if (! is_array($rawRow)) {
                continue;
            }

            $rowNumber = isset($rawRow['_row_number']) && is_numeric($rawRow['_row_number'])
                ? (int) $rawRow['_row_number']
                : ($idx + 2);

            $account = $this->resolveAccountForRow(
                $rawRow,
                $accountsById,
                $accountsByUsername,
                $defaultAccountId
            );

            $rawUsername = trim((string) (
                $rawRow['account_username']
                ?? $rawRow['username']
                ?? $rawRow['handle']
                ?? $rawRow['account_id']
                ?? $rawRow['threads_account_id']
                ?? ''
            ));

            if (! $account) {
                $errors[] = [
                    'row'              => $rowNumber,
                    'row_number'       => $rowNumber,
                    'account_username' => $rawUsername !== '' ? $rawUsername : null,
                    'error_code'       => 'THREADS_IMPORT__ACCOUNT_NOT_FOUND',
                    'message'          => "Dòng #{$rowNumber}: Không tìm thấy tài khoản Threads tương ứng ('{$rawUsername}').",
                    'errors'           => ['account_id' => ["Không tìm thấy tài khoản Threads '{$rawUsername}'."]],
                ];
                continue;
            }

            $contentText = (string) ($rawRow['content_text'] ?? $rawRow['text'] ?? $rawRow['content'] ?? $rawRow['body'] ?? '');
            $mediaType = strtoupper(trim((string) ($rawRow['media_type'] ?? $rawRow['type'] ?? 'TEXT')));
            if ($mediaType === '') {
                $mediaType = 'TEXT';
            }

            $rawMediaUrls = $rawRow['media_urls'] ?? $rawRow['media_url'] ?? $rawRow['image_url'] ?? $rawRow['video_url'] ?? [];
            $mediaUrls = ThreadsPostValidator::normalizeMediaUrls($rawMediaUrls);

            $linkAttachment = trim((string) ($rawRow['link_attachment'] ?? $rawRow['link'] ?? $rawRow['url'] ?? ''));
            $linkAttachment = $linkAttachment !== '' ? $linkAttachment : null;

            $topicTag = trim((string) ($rawRow['topic_tag'] ?? $rawRow['topic'] ?? ''));
            $topicTag = $topicTag !== '' ? ltrim($topicTag, '#') : null;

            $replyControl = strtolower(trim((string) ($rawRow['reply_control'] ?? 'everyone')));
            if (! in_array($replyControl, ThreadsPostValidator::ALLOWED_REPLY_CONTROLS, true)) {
                $replyControl = 'everyone';
            }

            $isSponsored = $this->parseBoolean(
                $rawRow['is_sponsored'] ?? $rawRow['sponsored'] ?? ($options['default_is_sponsored'] ?? false)
            );

            $rawSuffix = $rawRow['sponsored_suffix'] ?? $rawRow['suffix'] ?? ($options['default_sponsored_suffix'] ?? null);
            $sponsoredSuffix = $rawSuffix !== null && trim((string) $rawSuffix) !== ''
                ? trim((string) $rawSuffix)
                : null;

            $rawClientRef = $rawRow['client_ref'] ?? $rawRow['campaign'] ?? $rawRow['brand_ref'] ?? ($options['default_client_ref'] ?? null);
            $clientRef = $rawClientRef !== null && trim((string) $rawClientRef) !== ''
                ? trim((string) $rawClientRef)
                : null;

            $threadGroupKey = trim((string) ($rawRow['thread_group_key'] ?? $rawRow['group_key'] ?? $rawRow['thread_key'] ?? ''));
            $threadGroupKey = $threadGroupKey !== '' ? $threadGroupKey : null;

            $replyOrder = isset($rawRow['reply_order']) && is_numeric($rawRow['reply_order'])
                ? max(0, (int) $rawRow['reply_order'])
                : (isset($rawRow['order']) && is_numeric($rawRow['order']) ? max(0, (int) $rawRow['order']) : 0);

            $explicitReplyToPostId = isset($rawRow['reply_to_post_id']) && is_numeric($rawRow['reply_to_post_id'])
                ? (int) $rawRow['reply_to_post_id']
                : (isset($rawRow['parent_post_id']) && is_numeric($rawRow['parent_post_id'])
                    ? (int) $rawRow['parent_post_id']
                    : null);

            $rawScheduledAt = isset($rawRow['scheduled_at']) ? trim((string) $rawRow['scheduled_at']) : '';
            $parsedScheduledAt = null;
            if ($rawScheduledAt !== '') {
                try {
                    $parsedScheduledAt = Carbon::parse($rawScheduledAt);
                } catch (\Throwable) {
                    $errors[] = [
                        'row'              => $rowNumber,
                        'row_number'       => $rowNumber,
                        'account_username' => $account->username ?? (string) $account->id,
                        'error_code'       => 'THREADS_IMPORT__INVALID_SCHEDULED_AT',
                        'message'          => "Dòng #{$rowNumber}: Định dạng thời gian scheduled_at ('{$rawScheduledAt}') không hợp lệ.",
                        'errors'           => ['scheduled_at' => ["Thời gian scheduled_at '{$rawScheduledAt}' không hợp lệ."]],
                    ];
                    continue;
                }
            }

            $rowStatus = isset($rawRow['status']) && in_array($rawRow['status'], ['draft', 'scheduled'], true)
                ? (string) $rawRow['status']
                : $defaultStatus;

            $normalizedItems[] = [
                'row_number'               => $rowNumber,
                'original_index'           => $idx,
                'account'                  => $account,
                'account_id'               => (int) $account->id,
                'content_text'             => $contentText,
                'media_type'               => $mediaType,
                'media_urls'               => $mediaUrls,
                'link_attachment'          => $linkAttachment,
                'topic_tag'                => $topicTag,
                'reply_control'            => $replyControl,
                'is_sponsored'             => $isSponsored,
                'sponsored_suffix'         => $sponsoredSuffix,
                'client_ref'               => $clientRef,
                'thread_group_key'         => $threadGroupKey,
                'reply_order'              => $replyOrder,
                'explicit_reply_to_post_id'=> $explicitReplyToPostId,
                'scheduled_at'             => $parsedScheduledAt,
                'has_explicit_schedule'    => $parsedScheduledAt !== null,
                'status'                   => $rowStatus,
                'allow_duplicate'          => $allowDuplicate || $this->parseBoolean($rawRow['allow_duplicate'] ?? false),
            ];
        }

        // Bước 2: Xác định quan hệ cha - con trong cùng thread_group_key (hỗ trợ cả reply_order bắt đầu từ 0 hoặc 1)
        $groupMinReplyOrder = [];
        foreach ($normalizedItems as $item) {
            if ($item['thread_group_key'] !== null) {
                $gKey = $item['account_id'] . '::' . $item['thread_group_key'];
                if (! isset($groupMinReplyOrder[$gKey]) || $item['reply_order'] < $groupMinReplyOrder[$gKey]) {
                    $groupMinReplyOrder[$gKey] = $item['reply_order'];
                }
            }
        }

        // Sắp xếp để trong mỗi thread_group_key, bài có reply_order nhỏ hơn luôn được xử lý trước bài con
        usort($normalizedItems, static function (array $a, array $b) use ($groupMinReplyOrder): int {
            if ($a['thread_group_key'] !== null && $a['thread_group_key'] === $b['thread_group_key'] && $a['account_id'] === $b['account_id']) {
                if ($a['reply_order'] !== $b['reply_order']) {
                    return $a['reply_order'] <=> $b['reply_order'];
                }
            }

            return $a['original_index'] <=> $b['original_index'];
        });

        // Bước 3: Kiểm định từng dòng qua ThreadsPostValidator & kiểm tra trùng content_hash trong cùng lô CSV
        $validItems = [];
        $seenHashesInBatch = [];
        $failedGroups = [];

        foreach ($normalizedItems as $item) {
            $rowNumber = $item['row_number'];
            $account = $item['account'];
            $groupCompositeKey = $item['thread_group_key'] !== null
                ? ($item['account_id'] . '::' . $item['thread_group_key'])
                : null;

            $isRootInGroup = true;
            if ($item['explicit_reply_to_post_id'] !== null) {
                $isRootInGroup = false;
            } elseif ($groupCompositeKey !== null) {
                $minOrder = $groupMinReplyOrder[$groupCompositeKey] ?? 0;
                $isRootInGroup = ($item['reply_order'] === $minOrder);
                // Đánh dấu đã gặp phần tử đầu tiên của nhóm nếu có 2 dòng cùng reply_order
                $groupMinReplyOrder[$groupCompositeKey] = -1;
            }

            if (! $isRootInGroup && $groupCompositeKey !== null && isset($failedGroups[$groupCompositeKey])) {
                $errors[] = [
                    'row'              => $rowNumber,
                    'row_number'       => $rowNumber,
                    'account_username' => $account->username ?? (string) $account->id,
                    'error_code'       => 'THREADS_IMPORT__PARENT_POST_INVALID',
                    'message'          => "Dòng #{$rowNumber}: Bài gốc trong chuỗi '{$item['thread_group_key']}' không hợp lệ nên bài nối tiếp bị bỏ qua.",
                    'errors'           => ['thread_group_key' => ['Bài gốc trong chuỗi bị lỗi kiểm định.']],
                ];
                continue;
            }

            $validation = $this->validator->validate([
                'account_id'       => $item['account_id'],
                'content_text'     => $item['content_text'],
                'media_type'       => $item['media_type'],
                'media_urls'       => $item['media_urls'],
                'link_attachment'  => $item['link_attachment'],
                'topic_tag'        => $item['topic_tag'],
                'is_sponsored'     => $item['is_sponsored'],
                'sponsored_suffix' => $item['sponsored_suffix'],
                'allow_duplicate'  => $item['allow_duplicate'],
            ], null, true, false);

            if (! $validation['valid']) {
                if ($groupCompositeKey !== null && $isRootInGroup) {
                    $failedGroups[$groupCompositeKey] = true;
                }

                $errors[] = [
                    'row'              => $rowNumber,
                    'row_number'       => $rowNumber,
                    'account_username' => $account->username ?? (string) $account->id,
                    'error_code'       => $validation['first_error_code'] ?? 'VALIDATION_FAILED',
                    'message'          => "Dòng #{$rowNumber}: " . ($validation['first_error_message'] ?? 'Dữ liệu bài đăng không hợp lệ.'),
                    'errors'           => $validation['errors'],
                ];
                continue;
            }

            $contentHash = $validation['content_hash'];
            if (! $item['allow_duplicate'] && $contentHash !== '' && isset($seenHashesInBatch[$contentHash])) {
                $firstRow = $seenHashesInBatch[$contentHash];
                if ($groupCompositeKey !== null && $isRootInGroup) {
                    $failedGroups[$groupCompositeKey] = true;
                }

                $errors[] = [
                    'row'              => $rowNumber,
                    'row_number'       => $rowNumber,
                    'account_username' => $account->username ?? (string) $account->id,
                    'error_code'       => ThreadsPostValidator::ERROR_DUPLICATE_CONTENT,
                    'message'          => "Dòng #{$rowNumber}: Nội dung bài đăng bị trùng lặp (content_hash) với dòng #{$firstRow} trong cùng file CSV.",
                    'errors'           => [
                        'content_hash' => ["Nội dung trùng lặp với dòng #{$firstRow} trong cùng lô CSV."],
                    ],
                ];
                continue;
            }

            if ($contentHash !== '') {
                $seenHashesInBatch[$contentHash] = $rowNumber;
            }

            $item['is_root_post'] = $isRootInGroup;
            $item['content_hash'] = $contentHash;
            $item['effective_text'] = $validation['effective_text'];
            $item['group_composite_key'] = $groupCompositeKey;

            $validItems[] = $item;
        }

        // Bước 4: Áp dụng thuật toán Random Jitter Scheduler cho các bài gốc chưa có scheduled_at
        $usedTimestamps = $this->loadExistingScheduledTimestamps();
        $slotCountersByAccount = $this->loadTodaySlotCountsByAccount();

        $baseDate = isset($options['base_date']) && $options['base_date'] !== null
            ? Carbon::parse((string) $options['base_date'])
            : (isset($options['start_date']) && $options['start_date'] !== null
                ? Carbon::parse((string) $options['start_date'])
                : now());

        foreach ($validItems as $idx => &$item) {
            if (! $item['is_root_post']) {
                // Bài con nối tiếp:
                // - Nếu để trống scheduled_at trong CSV -> Giữ nguyên null để chạy chế độ Auto-chain (30-60s sau bài cha).
                // - Nếu có điền scheduled_at cụ thể -> Giữ nguyên giá trị đã điền.
                if ($item['scheduled_at'] instanceof Carbon) {
                    $usedTimestamps[$item['scheduled_at']->format('Y-m-d H:i:s')] = true;
                }
                continue;
            }

            if ($item['scheduled_at'] instanceof Carbon) {
                $usedTimestamps[$item['scheduled_at']->format('Y-m-d H:i:s')] = true;
                continue;
            }

            /** @var ThreadsAccount $account */
            $account = $item['account'];
            $accountId = (int) $account->id;

            $slotIndex = $slotCountersByAccount[$accountId] ?? 0;
            $slotCountersByAccount[$accountId] = $slotIndex + 1;

            $activeStart = (string) ($options['active_hours_start'] ?? $account->active_hours_start ?? config('threads.default_active_hours_start', '08:00'));
            $activeEnd = (string) ($options['active_hours_end'] ?? $account->active_hours_end ?? config('threads.default_active_hours_end', '22:00'));
            $dailyCap = isset($options['daily_post_cap']) && is_numeric($options['daily_post_cap'])
                ? max(1, (int) $options['daily_post_cap'])
                : max(1, (int) ($account->daily_post_cap ?: config('threads.default_daily_post_cap', 8)));

            $scheduledCarbon = $this->calculateJitterSchedule(
                $accountId,
                $slotIndex,
                $dailyCap,
                $activeStart,
                $activeEnd,
                $jitterMinMinutes,
                $jitterMaxMinutes,
                $baseDate,
                $usedTimestamps
            );

            $item['scheduled_at'] = $scheduledCarbon;
        }
        unset($item);

        // Bước 5: Lưu vào cơ sở dữ liệu (trừ khi ở chế độ dry_run) và liên kết reply_to_post_id cho chuỗi bài
        $createdPosts = [];
        $threadChainsCount = 0;
        $sponsoredCount = 0;

        if ($dryRun) {
            foreach ($validItems as $idx => $item) {
                if ($item['is_sponsored']) {
                    $sponsoredCount++;
                }
                if ($item['thread_group_key'] !== null && $item['is_root_post']) {
                    $threadChainsCount++;
                }

                $createdPosts[] = [
                    'id'               => $idx + 1,
                    'account_id'       => $item['account_id'],
                    'reply_to_post_id' => $item['explicit_reply_to_post_id'],
                    'thread_group_key' => $item['thread_group_key'],
                    'reply_order'      => $item['reply_order'],
                    'content_text'     => $item['content_text'],
                    'effective_text'   => $item['effective_text'],
                    'media_type'       => $item['media_type'],
                    'media_urls'       => $item['media_urls'],
                    'link_attachment'  => $item['link_attachment'],
                    'topic_tag'        => $item['topic_tag'],
                    'reply_control'    => $item['reply_control'],
                    'is_sponsored'     => $item['is_sponsored'],
                    'sponsored_suffix' => $item['sponsored_suffix'],
                    'client_ref'       => $item['client_ref'],
                    'content_hash'     => $item['content_hash'],
                    'import_batch_id'  => $batchId,
                    'scheduled_at'     => $item['scheduled_at'] instanceof Carbon
                        ? $item['scheduled_at']->toIso8601String()
                        : null,
                    'status'           => $item['status'],
                ];
            }
        } else {
            DB::transaction(function () use (
                $validItems,
                $batchId,
                &$createdPosts,
                &$threadChainsCount,
                &$sponsoredCount
            ) {
                $lastPostIdByGroup = [];

                foreach ($validItems as $item) {
                    $replyToPostId = $item['explicit_reply_to_post_id'];
                    $groupCompositeKey = $item['group_composite_key'];

                    if (! $item['is_root_post'] && $replyToPostId === null && $groupCompositeKey !== null) {
                        $replyToPostId = $lastPostIdByGroup[$groupCompositeKey] ?? null;
                    }

                    $post = ThreadsPost::create([
                        'account_id'       => $item['account_id'],
                        'reply_to_post_id' => $replyToPostId,
                        'thread_group_key' => $item['thread_group_key'],
                        'reply_order'      => $item['reply_order'],
                        'content_text'     => $item['content_text'],
                        'media_type'       => $item['media_type'],
                        'media_urls'       => $item['media_urls'],
                        'link_attachment'  => $item['link_attachment'],
                        'topic_tag'        => $item['topic_tag'],
                        'reply_control'    => $item['reply_control'],
                        'is_sponsored'     => $item['is_sponsored'],
                        'sponsored_suffix' => $item['sponsored_suffix'],
                        'client_ref'       => $item['client_ref'],
                        'content_hash'     => $item['content_hash'],
                        'import_batch_id'  => $batchId,
                        'scheduled_at'     => $item['scheduled_at'],
                        'status'           => $item['status'],
                        'retry_count'      => 0,
                    ]);

                    $post->setAttribute('effective_text', $item['effective_text']);

                    if ($groupCompositeKey !== null) {
                        if ($item['is_root_post']) {
                            $threadChainsCount++;
                        }
                        $lastPostIdByGroup[$groupCompositeKey] = (int) $post->id;
                    }

                    if ($item['is_sponsored']) {
                        $sponsoredCount++;
                    }

                    $createdPosts[] = $post;
                }
            });
        }

        return [
            'import_batch_id'     => $batchId,
            'batch_id'            => $batchId,
            'total_rows'          => count($rawRows),
            'imported_count'      => count($createdPosts),
            'created_count'       => count($createdPosts),
            'valid_count'         => count($validItems),
            'failed_count'        => count($errors),
            'error_count'         => count($errors),
            'sponsored_count'     => $sponsoredCount,
            'thread_chains_count' => $threadChainsCount,
            'jitter_minutes'      => $configuredJitterMinutes,
            'dry_run'             => $dryRun,
            'posts'               => $createdPosts,
            'imported_posts'      => $createdPosts,
            'errors'              => $errors,
            'failed_rows'         => $errors,
        ];
    }

    /**
     * Alias cho import().
     *
     * @param  UploadedFile|string|array<int|string, mixed>  $source
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function importCsv(UploadedFile|string|array $source, array $options = []): array
    {
        return $this->import($source, $options);
    }

    /**
     * Alias nhập trực tiếp từ mảng các dòng dữ liệu.
     *
     * @param  array<int, array<string, mixed>>  $rows
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function importRows(array $rows, array $options = []): array
    {
        return $this->import($rows, $options);
    }

    /**
     * Thuật toán Random Jitter Scheduler:
     * - Chia đều các bài gốc của từng tài khoản vào khung giờ hoạt động (active_hours_start .. active_hours_end).
     * - Tự động tràn sang ngày kế tiếp khi số bài vượt daily_post_cap.
     * - Cộng độ lệch ngẫu nhiên ±3..12 phút (random jitter) + độ lệch pha theo account_id * 37 giây.
     * - Đảm bảo tuyệt đối không có 2 bài đăng nào trùng khít mốc giây.
     *
     * @param  array<string, bool>  $usedTimestamps
     */
    public function calculateJitterSchedule(
        int $accountId,
        int $slotIndex,
        int $dailyPostCap,
        string $activeHoursStart = '08:00',
        string $activeHoursEnd = '22:00',
        int $jitterMinMinutes = 3,
        int $jitterMaxMinutes = 12,
        ?Carbon $baseDate = null,
        array &$usedTimestamps = []
    ): Carbon {
        $cap = max(1, $dailyPostCap);
        $dayOffset = intdiv($slotIndex, $cap);
        $slotInDay = $slotIndex % $cap;

        $startMinutes = $this->parseHourMinuteToMinutes($activeHoursStart, 8 * 60);
        $endMinutes = $this->parseHourMinuteToMinutes($activeHoursEnd, 22 * 60);
        if ($endMinutes <= $startMinutes + 60) {
            $startMinutes = 8 * 60;
            $endMinutes = 22 * 60;
        }

        $windowSeconds = ($endMinutes - $startMinutes) * 60;
        $slotDurationSeconds = intdiv($windowSeconds, $cap);

        $reference = ($baseDate ? $baseDate->copy() : now())->startOfDay();

        // Nếu tính trên ngày hôm nay nhưng khung giờ đã qua, bắt đầu rải từ ngày mai
        $targetDay = $reference->copy()->addDays($dayOffset);
        $windowStartCarbon = $targetDay->copy()->addMinutes($startMinutes);
        $windowEndCarbon = $targetDay->copy()->addMinutes($endMinutes);

        if ($dayOffset === 0 && $windowEndCarbon->lte(now()->addMinutes(15))) {
            $targetDay->addDay();
            $windowStartCarbon = $targetDay->copy()->addMinutes($startMinutes);
            $windowEndCarbon = $targetDay->copy()->addMinutes($endMinutes);
        }

        // Tâm của khe thời gian (slot center)
        $baseSlotSeconds = ($slotInDay * $slotDurationSeconds) + intdiv($slotDurationSeconds, 2);

        // Độ lệch ngẫu nhiên ±(jitterMin..jitterMax) phút
        $minSec = max(60, $jitterMinMinutes * 60);
        $maxSec = max($minSec, $jitterMaxMinutes * 60);
        $jitterMagnitude = random_int($minSec, $maxSec);
        $jitterSign = random_int(0, 1) === 1 ? 1 : -1;
        $jitterSeconds = $jitterSign * $jitterMagnitude;

        // Độ lệch pha theo account_id * 37 giây + giây lẻ ngẫu nhiên (1..58) để không bao giờ tròn phút :00
        $phaseSeconds = (($accountId * 37) + ($slotIndex * 19) + random_int(1, 58)) % 180;
        if ($phaseSeconds % 60 === 0) {
            $phaseSeconds += ($accountId % 29) + 1;
        }

        $candidate = $windowStartCarbon->copy()->addSeconds($baseSlotSeconds + $jitterSeconds + $phaseSeconds);

        // Giữ thời điểm nằm gọn trong khung giờ hoạt động của ngày đó
        $minAllowed = $windowStartCarbon->copy()->addSeconds(60 + ($accountId % 45));
        $maxAllowed = $windowEndCarbon->copy()->subSeconds(60 + ($accountId % 45));

        if ($candidate->lt($minAllowed)) {
            $candidate = $minAllowed->copy()->addSeconds(random_int(15, 300));
        } elseif ($candidate->gt($maxAllowed)) {
            $candidate = $maxAllowed->copy()->subSeconds(random_int(15, 300));
        }

        // Nếu thời điểm rơi vào quá khứ (khi xếp lịch trong ngày hôm nay), đẩy lên tương lai gần
        $earliestFuture = now()->addMinutes(5)->addSeconds(($accountId * 17 + $slotIndex * 11) % 59);
        if ($candidate->lt($earliestFuture)) {
            if ($earliestFuture->lt($maxAllowed)) {
                $candidate = $earliestFuture;
            } else {
                // Tràn sang khung giờ sáng hôm sau
                $nextDayStart = $windowStartCarbon->copy()->addDay();
                $candidate = $nextDayStart->addSeconds($baseSlotSeconds + abs($jitterSeconds) + $phaseSeconds);
            }
        }

        // Đảm bảo không tròn giây :00 để hành vi tự nhiên
        if ((int) $candidate->second === 0) {
            $candidate->addSeconds((($accountId * 7 + $slotIndex * 3) % 53) + 1);
        }

        // Đảm bảo không trùng khít mốc giây với bất kỳ bài đăng nào khác
        $guard = 0;
        while (isset($usedTimestamps[$candidate->format('Y-m-d H:i:s')]) && $guard < 500) {
            $candidate->addSeconds((($accountId + $guard) % 7) + 1);
            if ((int) $candidate->second === 0) {
                $candidate->addSecond();
            }
            $guard++;
        }

        $usedTimestamps[$candidate->format('Y-m-d H:i:s')] = true;

        return $candidate;
    }

    /**
     * Ánh xạ dòng CSV sang bản ghi ThreadsAccount theo account_id hoặc account_username.
     *
     * @param  array<string, mixed>  $row
     * @param  array<int, ThreadsAccount>  $accountsById
     * @param  array<string, ThreadsAccount>  $accountsByUsername
     */
    protected function resolveAccountForRow(
        array $row,
        array $accountsById,
        array $accountsByUsername,
        ?int $defaultAccountId = null
    ): ?ThreadsAccount {
        $rawAccountId = $row['account_id'] ?? $row['threads_account_id'] ?? null;
        if ($rawAccountId !== null && is_numeric($rawAccountId)) {
            $id = (int) $rawAccountId;
            if (isset($accountsById[$id])) {
                return $accountsById[$id];
            }
        }

        $rawUsername = $row['account_username'] ?? $row['username'] ?? $row['handle'] ?? $row['account'] ?? null;
        if ($rawUsername !== null && trim((string) $rawUsername) !== '') {
            $clean = strtolower(ltrim(trim((string) $rawUsername), '@'));
            if (isset($accountsByUsername[$clean])) {
                return $accountsByUsername[$clean];
            }
            if (is_numeric($clean) && isset($accountsById[(int) $clean])) {
                return $accountsById[(int) $clean];
            }
        }

        if ($defaultAccountId !== null && isset($accountsById[$defaultAccountId])) {
            return $accountsById[$defaultAccountId];
        }

        return null;
    }

    /**
     * Chuyển chuỗi "HH:MM" sang tổng số phút tính từ 00:00.
     */
    protected function parseHourMinuteToMinutes(string $hhmm, int $fallbackMinutes): int
    {
        if (! preg_match('/^(\d{1,2}):(\d{2})$/', trim($hhmm), $matches)) {
            return $fallbackMinutes;
        }

        $hours = (int) $matches[1];
        $minutes = (int) $matches[2];
        if ($hours < 0 || $hours > 23 || $minutes < 0 || $minutes > 59) {
            return $fallbackMinutes;
        }

        return ($hours * 60) + $minutes;
    }

    /**
     * Chuyển giá trị chuỗi/số trong CSV sang boolean chuẩn.
     */
    protected function parseBoolean(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_int($value) || is_float($value)) {
            return (int) $value === 1;
        }

        $normalized = strtolower(trim((string) $value));

        return in_array($normalized, ['1', 'true', 'yes', 'y', 'sponsored', 'ad'], true);
    }

    /**
     * Tải danh sách các mốc scheduled_at đã có trong DB để tránh xếp trùng giây.
     *
     * @return array<string, bool>
     */
    protected function loadExistingScheduledTimestamps(): array
    {
        if (! class_exists(ThreadsPost::class)) {
            return [];
        }

        try {
            if (! Schema::hasTable('threads_posts')) {
                return [];
            }

            $existing = ThreadsPost::query()
                ->whereNotNull('scheduled_at')
                ->where('scheduled_at', '>=', now()->subDay())
                ->pluck('scheduled_at');

            $map = [];
            foreach ($existing as $dt) {
                if ($dt instanceof Carbon) {
                    $map[$dt->format('Y-m-d H:i:s')] = true;
                } elseif (is_string($dt) && $dt !== '') {
                    $map[Carbon::parse($dt)->format('Y-m-d H:i:s')] = true;
                }
            }

            return $map;
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * Đếm số lượng bài gốc đã lên lịch/đăng trong ngày hôm nay của từng tài khoản.
     *
     * @return array<int, int>
     */
    protected function loadTodaySlotCountsByAccount(): array
    {
        if (! class_exists(ThreadsPost::class)) {
            return [];
        }

        try {
            if (! Schema::hasTable('threads_posts')) {
                return [];
            }

            $startOfToday = now()->startOfDay();
            $endOfToday = now()->endOfDay();

            $rows = ThreadsPost::query()
                ->selectRaw('account_id, COUNT(*) as aggregate_count')
                ->whereNull('reply_to_post_id')
                ->whereNotIn('status', ['cancelled', 'failed'])
                ->whereBetween('scheduled_at', [$startOfToday, $endOfToday])
                ->groupBy('account_id')
                ->get();

            $counts = [];
            foreach ($rows as $row) {
                $counts[(int) $row->account_id] = (int) $row->aggregate_count;
            }

            return $counts;
        } catch (\Throwable) {
            return [];
        }
    }
}
