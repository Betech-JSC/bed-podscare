<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Support\Str;

class ThreadsDiscoveryService
{
    /**
     * @var callable|null
     */
    protected $driver = null;

    /**
     * Thiết lập driver / scraper tùy biến (phục vụ testing hoặc tích hợp scraper bên thứ 3).
     */
    public function setDriver(?callable $driver): self
    {
        $this->driver = $driver;

        return $this;
    }

    /**
     * Tính điểm Velocity Score theo công thức chuẩn:
     * Score = (replies * 3) + (likes * 1) + (reposts * 2)
     */
    public function calculateVelocityScore(int $replies, int $likes, int $reposts): int
    {
        return ($replies * 3) + ($likes * 1) + ($reposts * 2);
    }

    /**
     * Khám phá và xếp hạng tối đa 10 bài viết thịnh hành trong 24h qua theo từ khóa.
     *
     * @return array{
     *     keyword: string,
     *     total: int,
     *     data: list<array{
     *         post_id: string,
     *         author_username: string,
     *         caption: string,
     *         published_at: string,
     *         permalink: string,
     *         metrics: array{replies: int, likes: int, reposts: int},
     *         velocity_score: int
     *     }>
     * }
     */
    public function discover(string $keyword, int $limit = 10): array
    {
        $keyword = trim($keyword);
        $maxLimit = max(1, min(20, $limit));

        if ($keyword === '') {
            return [
                'keyword' => $keyword,
                'total' => 0,
                'data' => [],
            ];
        }

        // Nếu có custom driver được thiết lập (hoặc trong unit tests)
        if ($this->driver !== null) {
            $rawPosts = ($this->driver)($keyword, $maxLimit);
        } else {
            $rawPosts = $this->fetchMockCandidatePosts($keyword);
        }

        if (empty($rawPosts)) {
            return [
                'keyword' => $keyword,
                'total' => 0,
                'data' => [],
            ];
        }

        $now = now();
        $twentyFourHoursAgo = $now->copy()->subHours(24);
        $processedPosts = [];

        foreach ($rawPosts as $post) {
            $publishedAt = isset($post['published_at'])
                ? Carbon::parse($post['published_at'])
                : $now->copy()->subHours(random_int(1, 12));

            // Chỉ lấy bài viết trong vòng 24 giờ qua
            if ($publishedAt->lt($twentyFourHoursAgo) || $publishedAt->gt($now)) {
                continue;
            }

            $metrics = $post['metrics'] ?? [];
            $replies = max(0, (int) ($metrics['replies'] ?? ($post['replies'] ?? 0)));
            $likes = max(0, (int) ($metrics['likes'] ?? ($post['likes'] ?? 0)));
            $reposts = max(0, (int) ($metrics['reposts'] ?? ($post['reposts'] ?? 0)));

            $score = $this->calculateVelocityScore($replies, $likes, $reposts);

            $processedPosts[] = [
                'post_id' => (string) ($post['post_id'] ?? $post['id'] ?? Str::random(12)),
                'author_username' => (string) ($post['author_username'] ?? $post['username'] ?? 'threads_user'),
                'caption' => (string) ($post['caption'] ?? $post['text'] ?? ''),
                'published_at' => $publishedAt->toIso8601String(),
                'permalink' => (string) ($post['permalink'] ?? $post['url'] ?? "https://www.threads.net/@threads_user/post/{$post['post_id']}"),
                'metrics' => [
                    'replies' => $replies,
                    'likes' => $likes,
                    'reposts' => $reposts,
                ],
                'velocity_score' => $score,
            ];
        }

        // Sắp xếp giảm dần theo Velocity Score
        usort($processedPosts, fn ($a, $b) => $b['velocity_score'] <=> $a['velocity_score']);

        $topPosts = array_slice($processedPosts, 0, $maxLimit);

        return [
            'keyword' => $keyword,
            'total' => count($topPosts),
            'data' => $topPosts,
        ];
    }

    /**
     * Bóc tách và kiểm tra tính hợp lệ của danh sách liên kết bài viết Threads công khai.
     *
     * @param  array<int, string>  $urls
     * @return array{
     *     valid: list<array{
     *         url: string,
     *         post_id: string,
     *         author_username: string,
     *         permalink: string,
     *         caption: string,
     *         velocity_score: int,
     *         metrics: array{replies: int, likes: int, reposts: int}
     *     }>,
     *     invalid: list<array{url: string, reason: string}>,
     *     all_valid: bool
     * }
     */
    public function parseDirectPostUrls(array $urls): array
    {
        $valid = [];
        $invalid = [];

        foreach ($urls as $rawUrl) {
            $trimmed = trim((string) $rawUrl);
            if ($trimmed === '') {
                continue;
            }

            $parsed = $this->parseSinglePostUrl($trimmed);
            if ($parsed !== null) {
                $valid[] = $parsed;
            } else {
                $invalid[] = [
                    'url' => $trimmed,
                    'reason' => 'Định dạng liên kết không hợp lệ. Vui lòng cung cấp URL bài viết Threads hợp lệ (ví dụ: https://www.threads.net/@user/post/xyz).',
                ];
            }
        }

        return [
            'valid' => $valid,
            'invalid' => $invalid,
            'all_valid' => empty($invalid),
        ];
    }

    /**
     * Bóc tách 1 liên kết Threads post đơn lẻ.
     * Hỗ trợ các định dạng:
     * - https://www.threads.net/@username/post/POST_CODE
     * - https://threads.net/@username/post/POST_CODE?xmt=...
     * - https://www.threads.net/t/POST_CODE
     */
    public function parseSinglePostUrl(string $url): ?array
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (! $host || ! preg_match('/(?:^|\.)threads\.(?:net|com)$/i', $host)) {
            return null;
        }

        $path = parse_url($url, PHP_URL_PATH) ?? '';

        // Định dạng chuẩn: /@username/post/{post_id}
        if (preg_match('#^/@([a-zA-Z0-9._]+)/post/([a-zA-Z0-9_-]+)#i', $path, $matches)) {
            $username = $matches[1];
            $postCode = $matches[2];
            $cleanPermalink = "https://www.threads.net/@{$username}/post/{$postCode}";

            return [
                'url' => $url,
                'post_id' => $postCode,
                'author_username' => $username,
                'permalink' => $cleanPermalink,
                'caption' => "Bài viết Threads của @{$username}",
                'velocity_score' => 0,
                'metrics' => [
                    'replies' => 0,
                    'likes' => 0,
                    'reposts' => 0,
                ],
            ];
        }

        // Định dạng rút gọn: /t/{post_id}
        if (preg_match('#^/t/([a-zA-Z0-9_-]+)#i', $path, $matches)) {
            $postCode = $matches[1];
            $cleanPermalink = "https://www.threads.net/t/{$postCode}";

            return [
                'url' => $url,
                'post_id' => $postCode,
                'author_username' => 'threads_user',
                'permalink' => $cleanPermalink,
                'caption' => "Bài viết Threads #{$postCode}",
                'velocity_score' => 0,
                'metrics' => [
                    'replies' => 0,
                    'likes' => 0,
                    'reposts' => 0,
                ],
            ];
        }

        return null;
    }

    /**
     * Sinh bộ dữ liệu giả lập thực tế gồm 12 bài viết trong 24h để bóc tách và lọc lấy top 10.
     *
     * @return list<array<string, mixed>>
     */
    protected function fetchMockCandidatePosts(string $keyword): array
    {
        $normalizedKw = mb_strtolower($keyword);

        // Kịch bản từ khóa trống hoặc không có bài viết
        if (str_contains($normalizedKw, 'empty') || str_contains($normalizedKw, 'khong_co_bai_viet') || str_contains($normalizedKw, 'not_found')) {
            return [];
        }

        $now = now();
        $sampleAuthors = [
            'audio_repair_guru', 'tech_vn_review', 'apple_daily_vietnam',
            'hoang_ha_tips', 'tinh_te_audio', 'linh_kien_airpods',
            'nghien_am_thanh', 'phu_kien_apple', 'reviewer_cong_nghe',
            'sua_chua_tai_nghe', 'gen_z_setup', 'trai_nghiem_so',
        ];

        $sampleCaptions = [
            "Anh em cho mình hỏi tai nghe {$keyword} bị rè bên phải sau khi rơi có cứu được không? Đang phân vân giữa PodsCare với chỗ khác.",
            "Review chi tiết thời lượng pin của {$keyword} sau 6 tháng sử dụng thực tế. Ai đang phân vân thì đọc ngay nhé!",
            "Cảnh báo: Đừng tự ý lấy tăm nhọn chọc màng loa {$keyword}, rất dễ rách màng âm thanh. Đem ra tiệm uy tín vệ sinh thôi!",
            "Có ai bị hiện tượng {$keyword} sạc không vào pin ở một bên tai không? Xin cách xử lý nhanh với ạ.",
            "So sánh chất âm và khả năng chống ồn của {$keyword} với các dòng đối thủ cùng tầm giá. Đáng tiền từng xu!",
            "Vừa ghé shop thay pin cho chiếc {$keyword} cũ, nghe lại như mới bóc hộp, tiết kiệm tiền triệu.",
            "Tổng hợp 5 lỗi phổ biến nhất trên {$keyword} và chi phí sửa chữa tham khảo anh em cần lưu lại.",
            "Cần tư vấn địa chỉ thay vỏ và fix lỗi micro {$keyword} tại TP.HCM hoặc Hà Nội uy tín!",
            "Bảo quản {$keyword} đúng cách mùa mưa ẩm: kinh nghiệm xương máu sau 2 lần đi bảo hành.",
            "Chia sẻ mẹo reset và ghép nối lại {$keyword} khi bị mất kết nối đột ngột trên iOS 18.",
            "Trải nghiệm dịch vụ vệ sinh chuyên sâu tai nghe {$keyword} tại PodsCare, sạch bong từng góc cạnh!",
            "Bảng giá linh kiện thay thế chính hãng cho {$keyword} cập nhật mới nhất tháng này.",
        ];

        $posts = [];
        foreach ($sampleCaptions as $index => $caption) {
            $author = $sampleAuthors[$index % count($sampleAuthors)];
            $postId = '35' . str_pad((string) (10000000000000000 + $index * 1337 + crc32($keyword . $index)), 17, '0', STR_PAD_RIGHT);

            // Sinh chỉ số tương tác phân tầng
            $replies = random_int(3, 45) + ($index * 3);
            $likes = random_int(20, 350) + ($index * 15);
            $reposts = random_int(1, 25) + ($index * 2);

            // Thời gian xuất bản rải rác trong vòng 1-22 giờ trước
            $hoursAgo = random_int(1, 22);
            $minutesAgo = random_int(5, 55);
            $publishedAt = $now->copy()->subHours($hoursAgo)->subMinutes($minutesAgo);

            $posts[] = [
                'post_id' => $postId,
                'author_username' => $author,
                'caption' => $caption,
                'published_at' => $publishedAt->toIso8601String(),
                'permalink' => "https://www.threads.net/@{$author}/post/{$postId}",
                'metrics' => [
                    'replies' => $replies,
                    'likes' => $likes,
                    'reposts' => $reposts,
                ],
            ];
        }

        return $posts;
    }
}
