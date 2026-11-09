<?php

namespace App\Services\Threads;

use App\Models\ThreadsPost;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class ThreadsPostValidator
{
    public const MAX_CHARS = 500;
    public const MAX_UNIQUE_LINKS = 5;
    public const CAROUSEL_MIN_ITEMS = 2;
    public const CAROUSEL_MAX_ITEMS = 20;

    public const ERROR_LINK_LIMIT_EXCEEDED = 'THREADS_API__LINK_LIMIT_EXCEEDED';
    public const ERROR_CHAR_LIMIT_EXCEEDED = 'THREADS_VALIDATOR__CHAR_LIMIT_EXCEEDED';
    public const ERROR_DUPLICATE_CONTENT = 'THREADS_VALIDATOR__DUPLICATE_CONTENT_24H';
    public const ERROR_INVALID_MEDIA_URL = 'THREADS_VALIDATOR__INVALID_MEDIA_URL';
    public const ERROR_INVALID_LINK_ATTACHMENT = 'THREADS_VALIDATOR__INVALID_LINK_ATTACHMENT';
    public const ERROR_INVALID_CAROUSEL_COUNT = 'THREADS_VALIDATOR__INVALID_CAROUSEL_COUNT';
    public const ERROR_INVALID_MEDIA_TYPE = 'THREADS_VALIDATOR__INVALID_MEDIA_TYPE';
    public const ERROR_INVALID_TOPIC_TAG = 'THREADS_VALIDATOR__INVALID_TOPIC_TAG';
    public const ERROR_EMPTY_CONTENT = 'THREADS_VALIDATOR__EMPTY_CONTENT';

    public const ALLOWED_MEDIA_TYPES = ['TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL'];
    public const ALLOWED_REPLY_CONTROLS = ['everyone', 'accounts_you_follow', 'mentioned_only'];

    /**
     * Tính văn bản xuất bản thực tế theo cơ chế nhãn hợp tác trả phí linh hoạt (is_sponsored — Cách C):
     * - Mặc định giữ nguyên 100% nội dung gốc (content_text).
     * - Chỉ khi is_sponsored = true VÀ sponsored_suffix khác rỗng (mà cuối bài chưa có hậu tố đó)
     *   thì mới nối vào cuối bài.
     */
    public static function resolveEffectiveText(
        ?string $contentText,
        bool $isSponsored = false,
        ?string $sponsoredSuffix = null
    ): string {
        $normalized = str_replace(["\r\n", "\r"], "\n", (string) $contentText);
        $normalized = trim($normalized);

        $suffix = trim((string) $sponsoredSuffix);
        if (! $isSponsored || $suffix === '') {
            return $normalized;
        }

        if ($normalized === '') {
            return $suffix;
        }

        $suffixLen = mb_strlen($suffix, 'UTF-8');
        $tail = mb_substr($normalized, -$suffixLen, null, 'UTF-8');

        if (mb_strtolower($tail, 'UTF-8') === mb_strtolower($suffix, 'UTF-8')) {
            return $normalized;
        }

        $separator = str_contains($normalized, "\n") ? "\n" : ' ';

        return $normalized . $separator . $suffix;
    }

    /**
     * Đếm độ dài chuỗi theo chuẩn UTF-8.
     */
    public static function countUtf8Chars(?string $text): int
    {
        return mb_strlen((string) $text, 'UTF-8');
    }

    /**
     * Trích xuất danh sách các URL HTTP/HTTPS duy nhất xuất hiện trong văn bản và link_attachment.
     *
     * @return array<int, string>
     */
    public static function extractUniqueUrls(?string $text, ?string $linkAttachment = null): array
    {
        $urls = [];
        $haystack = (string) $text;

        if ($haystack !== '' && preg_match_all('/https?:\/\/[^\s<>"\'\)\]]+/iu', $haystack, $matches)) {
            foreach ($matches[0] as $rawUrl) {
                $cleaned = rtrim($rawUrl, ".,;:!?)]}'\"");
                if ($cleaned !== '') {
                    $urls[] = $cleaned;
                }
            }
        }

        $attachment = trim((string) $linkAttachment);
        if ($attachment !== '' && preg_match('/^https?:\/\//i', $attachment)) {
            $urls[] = rtrim($attachment, ".,;:!?)]}'\"");
        }

        $uniqueMap = [];
        foreach ($urls as $url) {
            $key = mb_strtolower($url, 'UTF-8');
            if (! isset($uniqueMap[$key])) {
                $uniqueMap[$key] = $url;
            }
        }

        return array_values($uniqueMap);
    }

    /**
     * Alias cho extractUniqueUrls.
     *
     * @return array<int, string>
     */
    public static function extractUniqueLinks(?string $text, ?string $linkAttachment = null): array
    {
        return self::extractUniqueUrls($text, $linkAttachment);
    }

    /**
     * Đếm số lượng URL HTTP/HTTPS duy nhất trong văn bản và link_attachment.
     */
    public static function countUniqueLinks(?string $text, ?string $linkAttachment = null): int
    {
        return count(self::extractUniqueUrls($text, $linkAttachment));
    }

    /**
     * Kiểm tra một chuỗi có phải là URL công khai bắt đầu bằng https:// hợp lệ hay không.
     */
    public static function isValidHttpsUrl(?string $url): bool
    {
        $trimmed = trim((string) $url);
        if ($trimmed === '' || ! str_starts_with(strtolower($trimmed), 'https://')) {
            return false;
        }

        if (filter_var($trimmed, FILTER_VALIDATE_URL) === false) {
            return false;
        }

        $host = (string) parse_url($trimmed, PHP_URL_HOST);

        return $host !== '';
    }

    /**
     * Chuẩn hóa danh sách media_urls từ mảng, JSON string hoặc chuỗi phân tách dấu phẩy/pipe.
     *
     * @return array<int, string>
     */
    public static function normalizeMediaUrls(mixed $mediaUrls): array
    {
        if ($mediaUrls === null || $mediaUrls === '') {
            return [];
        }

        if (is_string($mediaUrls)) {
            $trimmed = trim($mediaUrls);
            if ($trimmed === '') {
                return [];
            }

            if (str_starts_with($trimmed, '[')) {
                $decoded = json_decode($trimmed, true);
                if (is_array($decoded)) {
                    $mediaUrls = $decoded;
                }
            }

            if (is_string($mediaUrls)) {
                $delimiter = str_contains($trimmed, '|') ? '|' : ',';
                $mediaUrls = explode($delimiter, $trimmed);
            }
        }

        if (! is_array($mediaUrls)) {
            return [];
        }

        $result = [];
        foreach ($mediaUrls as $item) {
            if (is_string($item) && trim($item) !== '') {
                $result[] = trim($item);
            } elseif (is_array($item) && isset($item['url']) && is_string($item['url']) && trim($item['url']) !== '') {
                $result[] = trim($item['url']);
            }
        }

        return array_values($result);
    }

    /**
     * Tính mã băm SHA-256 trên văn bản đã chuẩn hóa khoảng trắng + chữ thường
     * để chống đăng trùng nội dung trong vòng 24 giờ.
     */
    public static function computeContentHash(
        ?string $contentText,
        mixed $mediaUrls = null,
        ?string $linkAttachment = null
    ): string {
        $normalizedText = str_replace(["\r\n", "\r"], "\n", (string) $contentText);
        $normalizedText = preg_replace('/\s+/u', ' ', trim($normalizedText)) ?? trim($normalizedText);
        $normalizedText = mb_strtolower($normalizedText, 'UTF-8');

        if ($normalizedText !== '') {
            return hash('sha256', $normalizedText);
        }

        $normalizedMedia = self::normalizeMediaUrls($mediaUrls);
        $normalizedLink = mb_strtolower(trim((string) $linkAttachment), 'UTF-8');

        $fallbackPayload = json_encode([
            'media_urls'      => $normalizedMedia,
            'link_attachment' => $normalizedLink,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return hash('sha256', (string) $fallbackPayload);
    }

    /**
     * Alias cho computeContentHash.
     */
    public static function generateContentHash(
        ?string $contentText,
        mixed $mediaUrls = null,
        ?string $linkAttachment = null
    ): string {
        return self::computeContentHash($contentText, $mediaUrls, $linkAttachment);
    }

    /**
     * Tìm bài đăng trùng content_hash trong vòng 24 giờ gần nhất (trên cùng tài khoản hoặc chéo giữa các tài khoản).
     */
    public function findDuplicatePostInLast24Hours(
        string $contentHash,
        ?int $excludePostId = null,
        ?int $accountId = null,
        int $hours = 24
    ): ?ThreadsPost {
        if ($contentHash === '' || ! class_exists(ThreadsPost::class)) {
            return null;
        }

        try {
            if (! Schema::hasTable('threads_posts')) {
                return null;
            }

            $cutoff = now()->subHours($hours);

            $query = ThreadsPost::query()
                ->where('content_hash', $contentHash)
                ->whereNotIn('status', ['cancelled', 'failed'])
                ->where(function ($q) use ($cutoff) {
                    $q->where('created_at', '>=', $cutoff)
                        ->orWhere('scheduled_at', '>=', $cutoff)
                        ->orWhere('published_at', '>=', $cutoff);
                });

            if ($excludePostId !== null && $excludePostId > 0) {
                $query->where('id', '!=', $excludePostId);
            }

            if ($accountId !== null && $accountId > 0) {
                // Ưu tiên tìm bản ghi trùng trên cùng account hoặc bất kỳ account nào trong mạng lưới
                $query->orderByRaw('CASE WHEN account_id = ? THEN 0 ELSE 1 END', [$accountId]);
            }

            return $query->first();
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Kiểm tra xem content_hash đã xuất hiện trong vòng 24 giờ gần nhất hay chưa.
     */
    public function hasDuplicateInLast24Hours(
        string $contentHash,
        ?int $excludePostId = null,
        ?int $accountId = null,
        int $hours = 24
    ): bool {
        return $this->findDuplicatePostInLast24Hours($contentHash, $excludePostId, $accountId, $hours) !== null;
    }

    /**
     * Kiểm định toàn diện dữ liệu bài đăng Threads và trả về mảng kết quả chi tiết.
     *
     * @param  array<string, mixed>|ThreadsPost  $input
     * @return array{
     *     valid: bool,
     *     is_valid: bool,
     *     errors: array<string, array<int, string>>,
     *     error_messages: array<int, string>,
     *     error_codes: array<int, string>,
     *     first_error_code: ?string,
     *     first_error_message: ?string,
     *     effective_text: string,
     *     char_count: int,
     *     max_chars: int,
     *     unique_links: array<int, string>,
     *     unique_links_count: int,
     *     max_unique_links: int,
     *     content_hash: string,
     *     media_type: string,
     *     media_urls: array<int, string>,
     *     link_attachment: ?string,
     *     topic_tag: ?string,
     *     is_sponsored: bool,
     *     sponsored_suffix: ?string,
     *     duplicate_post_id: ?int
     * }
     */
    public function validate(
        array|ThreadsPost $input,
        ?int $excludePostId = null,
        bool $checkDuplicateInDb = true,
        bool $throwOnFailure = false
    ): array {
        if ($input instanceof ThreadsPost) {
            $excludePostId = $excludePostId ?? ($input->exists ? (int) $input->getKey() : null);
            $data = $input->toArray();
        } else {
            $data = $input;
            if ($excludePostId === null && isset($data['id']) && is_numeric($data['id'])) {
                $excludePostId = (int) $data['id'];
            }
        }

        $maxChars = (int) config('threads.max_chars', self::MAX_CHARS);
        $maxUniqueLinks = (int) config('threads.max_unique_links', self::MAX_UNIQUE_LINKS);

        $contentText = isset($data['content_text']) ? (string) $data['content_text'] : '';
        $isSponsored = filter_var($data['is_sponsored'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $sponsoredSuffix = isset($data['sponsored_suffix']) && trim((string) $data['sponsored_suffix']) !== ''
            ? trim((string) $data['sponsored_suffix'])
            : null;

        $mediaType = strtoupper(trim((string) ($data['media_type'] ?? 'TEXT')));
        if ($mediaType === '') {
            $mediaType = 'TEXT';
        }

        $mediaUrls = self::normalizeMediaUrls($data['media_urls'] ?? []);
        $linkAttachment = isset($data['link_attachment']) && trim((string) $data['link_attachment']) !== ''
            ? trim((string) $data['link_attachment'])
            : null;
        $topicTag = isset($data['topic_tag']) && trim((string) $data['topic_tag']) !== ''
            ? trim((string) $data['topic_tag'])
            : null;
        $accountId = isset($data['account_id']) && is_numeric($data['account_id'])
            ? (int) $data['account_id']
            : null;

        $effectiveText = self::resolveEffectiveText($contentText, $isSponsored, $sponsoredSuffix);
        $charCount = self::countUtf8Chars($effectiveText);
        $uniqueLinks = self::extractUniqueUrls($effectiveText, $linkAttachment);
        $uniqueLinksCount = count($uniqueLinks);
        $contentHash = self::computeContentHash($contentText, $mediaUrls, $linkAttachment);

        $errors = [];
        $errorCodes = [];

        $addError = static function (string $field, string $code, string $message) use (&$errors, &$errorCodes): void {
            $errors[$field][] = $message;
            if (! in_array($code, $errorCodes, true)) {
                $errorCodes[] = $code;
            }
        };

        // 1. Kiểm tra media_type hợp lệ
        if (! in_array($mediaType, self::ALLOWED_MEDIA_TYPES, true)) {
            $addError(
                'media_type',
                self::ERROR_INVALID_MEDIA_TYPE,
                "Loại bài đăng '{$mediaType}' không hợp lệ. Chỉ chấp nhận TEXT, IMAGE, VIDEO, CAROUSEL."
            );
        }

        // 2. Kiểm tra bài TEXT rỗng
        if ($mediaType === 'TEXT' && $effectiveText === '' && $linkAttachment === null) {
            $addError(
                'content_text',
                self::ERROR_EMPTY_CONTENT,
                'Bài đăng dạng TEXT bắt buộc phải có nội dung văn bản hoặc link_attachment.'
            );
        }

        // 3. Kiểm tra giới hạn <= 500 ký tự UTF-8 (tính cả sponsored_suffix nếu kích hoạt)
        if ($charCount > $maxChars) {
            $addError(
                'content_text',
                self::ERROR_CHAR_LIMIT_EXCEEDED,
                "Nội dung bài đăng vượt quá giới hạn {$maxChars} ký tự UTF-8 (hiện tại: {$charCount} ký tự)."
            );
        }

        // 4. Kiểm tra giới hạn <= 5 unique links (THREADS_API__LINK_LIMIT_EXCEEDED)
        if ($uniqueLinksCount > $maxUniqueLinks) {
            $addError(
                'content_text',
                self::ERROR_LINK_LIMIT_EXCEEDED,
                "Bài đăng chứa {$uniqueLinksCount} liên kết duy nhất, vượt quá giới hạn tối đa {$maxUniqueLinks} liên kết của Meta Threads (" . self::ERROR_LINK_LIMIT_EXCEEDED . ').'
            );
        }

        // 5. Kiểm tra link_attachment bắt buộc là https://
        if ($linkAttachment !== null && ! self::isValidHttpsUrl($linkAttachment)) {
            $addError(
                'link_attachment',
                self::ERROR_INVALID_LINK_ATTACHMENT,
                'Đường dẫn link_attachment bắt buộc phải là URL công khai bắt đầu bằng https://.'
            );
        }

        // 6. Kiểm tra media_urls theo từng media_type và bắt buộc https://
        if (in_array($mediaType, ['IMAGE', 'VIDEO'], true) && count($mediaUrls) < 1) {
            $addError(
                'media_urls',
                self::ERROR_INVALID_MEDIA_URL,
                "Bài đăng loại {$mediaType} bắt buộc phải có ít nhất 1 URL media hợp lệ bắt đầu bằng https://."
            );
        }

        if ($mediaType === 'CAROUSEL') {
            $mediaCount = count($mediaUrls);
            if ($mediaCount < self::CAROUSEL_MIN_ITEMS || $mediaCount > self::CAROUSEL_MAX_ITEMS) {
                $addError(
                    'media_urls',
                    self::ERROR_INVALID_CAROUSEL_COUNT,
                    'Bài đăng CAROUSEL bắt buộc phải có từ ' . self::CAROUSEL_MIN_ITEMS . ' đến ' . self::CAROUSEL_MAX_ITEMS . " URL media (hiện tại: {$mediaCount})."
                );
            }
        }

        foreach ($mediaUrls as $idx => $mediaUrl) {
            if (! self::isValidHttpsUrl($mediaUrl)) {
                $position = $idx + 1;
                $addError(
                    'media_urls',
                    self::ERROR_INVALID_MEDIA_URL,
                    "URL media ở vị trí #{$position} ('{$mediaUrl}') không hợp lệ. Mọi media_urls bắt buộc phải bắt đầu bằng https://."
                );
            }
        }

        // 7. Kiểm tra topic_tag (1..50 ký tự, không chứa dấu chấm '.' hoặc '&')
        if ($topicTag !== null) {
            $topicLen = self::countUtf8Chars($topicTag);
            if ($topicLen < 1 || $topicLen > 50 || str_contains($topicTag, '.') || str_contains($topicTag, '&')) {
                $addError(
                    'topic_tag',
                    self::ERROR_INVALID_TOPIC_TAG,
                    'Chủ đề (topic_tag) phải từ 1 đến 50 ký tự và không được chứa ký tự dấu chấm (.) hoặc (&).'
                );
            }
        }

        // 8. Kiểm tra trùng lặp content_hash trong vòng 24 giờ
        $duplicatePostId = null;
        $allowDuplicate = filter_var($data['allow_duplicate'] ?? $data['force_duplicate'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if ($checkDuplicateInDb && ! $allowDuplicate && $contentHash !== '') {
            $duplicatePost = $this->findDuplicatePostInLast24Hours($contentHash, $excludePostId, $accountId, 24);
            if ($duplicatePost !== null) {
                $duplicatePostId = (int) $duplicatePost->getKey();
                $addError(
                    'content_hash',
                    self::ERROR_DUPLICATE_CONTENT,
                    "Nội dung bài đăng bị trùng lặp (content_hash) với bài viết #{$duplicatePostId} đã lên lịch hoặc xuất bản trong vòng 24 giờ qua."
                );
            }
        }

        $flatMessages = [];
        foreach ($errors as $fieldErrors) {
            foreach ($fieldErrors as $msg) {
                $flatMessages[] = $msg;
            }
        }

        $result = [
            'valid'               => empty($errors),
            'is_valid'            => empty($errors),
            'errors'              => $errors,
            'error_messages'      => $flatMessages,
            'error_codes'         => $errorCodes,
            'first_error_code'    => $errorCodes[0] ?? null,
            'first_error_message' => $flatMessages[0] ?? null,
            'effective_text'      => $effectiveText,
            'char_count'          => $charCount,
            'max_chars'           => $maxChars,
            'unique_links'        => $uniqueLinks,
            'unique_links_count'  => $uniqueLinksCount,
            'max_unique_links'    => $maxUniqueLinks,
            'content_hash'        => $contentHash,
            'media_type'          => $mediaType,
            'media_urls'          => $mediaUrls,
            'link_attachment'     => $linkAttachment,
            'topic_tag'           => $topicTag,
            'is_sponsored'        => $isSponsored,
            'sponsored_suffix'    => $sponsoredSuffix,
            'duplicate_post_id'   => $duplicatePostId,
        ];

        if ($throwOnFailure && ! $result['valid']) {
            throw ValidationException::withMessages($errors);
        }

        return $result;
    }

    /**
     * Kiểm định dữ liệu bài đăng và ném ValidationException (HTTP 422) nếu có bất kỳ vi phạm nào.
     *
     * @param  array<string, mixed>|ThreadsPost  $input
     * @return array<string, mixed>
     *
     * @throws ValidationException
     */
    public function validateOrFail(
        array|ThreadsPost $input,
        ?int $excludePostId = null,
        bool $checkDuplicateInDb = true
    ): array {
        return $this->validate($input, $excludePostId, $checkDuplicateInDb, true);
    }

    /**
     * Alias của validate() không ném exception.
     *
     * @param  array<string, mixed>|ThreadsPost  $input
     * @return array<string, mixed>
     */
    public function inspect(
        array|ThreadsPost $input,
        ?int $excludePostId = null,
        bool $checkDuplicateInDb = true
    ): array {
        return $this->validate($input, $excludePostId, $checkDuplicateInDb, false);
    }
}
