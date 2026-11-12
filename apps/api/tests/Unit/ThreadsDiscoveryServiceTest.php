<?php

namespace Tests\Unit;

use App\Services\ThreadsDiscoveryService;
use Tests\TestCase;

class ThreadsDiscoveryServiceTest extends TestCase
{
    protected ThreadsDiscoveryService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new ThreadsDiscoveryService();
    }

    public function test_velocity_score_calculation_formula(): void
    {
        // Score = (replies * 3) + (likes * 1) + (reposts * 2)
        // 10 * 3 + 50 * 1 + 5 * 2 = 30 + 50 + 10 = 90
        $score = $this->service->calculateVelocityScore(10, 50, 5);
        $this->assertEquals(90, $score);

        // 0 interaction
        $this->assertEquals(0, $this->service->calculateVelocityScore(0, 0, 0));

        // High interaction: 100 replies, 1000 likes, 50 reposts = 300 + 1000 + 100 = 1400
        $this->assertEquals(1400, $this->service->calculateVelocityScore(100, 1000, 50));
    }

    public function test_discover_returns_top_10_posts_sorted_by_velocity_score(): void
    {
        $result = $this->service->discover('airpods pro 2', 10);

        $this->assertIsArray($result);
        $this->assertEquals('airpods pro 2', $result['keyword']);
        $this->assertLessThanOrEqual(10, $result['total']);
        $this->assertCount($result['total'], $result['data']);

        // Kiểm tra thứ tự sắp xếp giảm dần theo Velocity Score
        $prevScore = PHP_INT_MAX;
        foreach ($result['data'] as $post) {
            $this->assertArrayHasKey('post_id', $post);
            $this->assertArrayHasKey('author_username', $post);
            $this->assertArrayHasKey('caption', $post);
            $this->assertArrayHasKey('published_at', $post);
            $this->assertArrayHasKey('permalink', $post);
            $this->assertArrayHasKey('metrics', $post);
            $this->assertArrayHasKey('velocity_score', $post);

            $this->assertLessThanOrEqual($prevScore, $post['velocity_score']);
            $prevScore = $post['velocity_score'];

            // Kiểm tra tính chính xác của score
            $expectedScore = $this->service->calculateVelocityScore(
                $post['metrics']['replies'],
                $post['metrics']['likes'],
                $post['metrics']['reposts']
            );
            $this->assertEquals($expectedScore, $post['velocity_score']);
        }
    }

    public function test_discover_with_custom_adapter_driver(): void
    {
        $customPosts = [
            [
                'post_id' => 'post_a',
                'author_username' => 'user_a',
                'caption' => 'Post A',
                'published_at' => now()->subHours(2)->toIso8601String(),
                'metrics' => ['replies' => 2, 'likes' => 10, 'reposts' => 1], // score = 6 + 10 + 2 = 18
            ],
            [
                'post_id' => 'post_b',
                'author_username' => 'user_b',
                'caption' => 'Post B',
                'published_at' => now()->subHours(5)->toIso8601String(),
                'metrics' => ['replies' => 20, 'likes' => 50, 'reposts' => 5], // score = 60 + 50 + 10 = 120
            ],
            [
                'post_id' => 'post_old',
                'author_username' => 'user_old',
                'caption' => 'Post Old (qua 24h)',
                'published_at' => now()->subHours(30)->toIso8601String(), // Qua 24h -> bị loại
                'metrics' => ['replies' => 100, 'likes' => 1000, 'reposts' => 50],
            ],
        ];

        $this->service->setDriver(function ($keyword, $limit) use ($customPosts) {
            return $customPosts;
        });

        $result = $this->service->discover('custom_kw', 10);

        // post_old phải bị loại vì quá 24h
        $this->assertEquals(2, $result['total']);
        $this->assertCount(2, $result['data']);

        // post_b có điểm cao hơn nên đứng đầu
        $this->assertEquals('post_b', $result['data'][0]['post_id']);
        $this->assertEquals(120, $result['data'][0]['velocity_score']);

        $this->assertEquals('post_a', $result['data'][1]['post_id']);
        $this->assertEquals(18, $result['data'][1]['velocity_score']);
    }

    public function test_discover_returns_empty_when_no_recent_posts(): void
    {
        $result = $this->service->discover('khong_co_bai_viet_24h');

        $this->assertEquals(0, $result['total']);
        $this->assertEmpty($result['data']);
    }

    public function test_parse_direct_post_urls(): void
    {
        $urls = [
            'https://www.threads.net/@reviewer_vn/post/DF_abc123',
            'https://threads.net/@apple_fan/post/XYZ789?xmt=AQG',
            'https://www.threads.net/t/SHORT_CODE_456',
            'https://facebook.com/post/999', // Sai domain
            'https://www.threads.net/@invalid_without_post', // Thiếu post
            'invalid-url-string',
        ];

        $result = $this->service->parseDirectPostUrls($urls);

        $this->assertCount(3, $result['valid']);
        $this->assertCount(3, $result['invalid']);
        $this->assertFalse($result['all_valid']);

        $this->assertEquals('DF_abc123', $result['valid'][0]['post_id']);
        $this->assertEquals('reviewer_vn', $result['valid'][0]['author_username']);
        $this->assertEquals('XYZ789', $result['valid'][1]['post_id']);
        $this->assertEquals('apple_fan', $result['valid'][1]['author_username']);
        $this->assertEquals('SHORT_CODE_456', $result['valid'][2]['post_id']);
    }
}
