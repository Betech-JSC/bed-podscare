<?php

namespace App\Models;

use Illuminate\Support\Carbon;
use Laravel\Sanctum\PersonalAccessToken as SanctumPersonalAccessToken;

class PersonalAccessToken extends SanctumPersonalAccessToken
{
    /**
     * Luôn eager-load thực thể tokenable (User) khi Sanctum Guard truy vấn token từ DB.
     *
     * @var array<int, string>
     */
    protected $with = ['tokenable'];

    /**
     * Khoảng thời gian tối thiểu (giây) giữa các lần ghi UPDATE last_used_at.
     */
    public const LAST_USED_AT_THROTTLE_SECONDS = 300;

    /**
     * Ghi đè save() để giới hạn tần suất UPDATE last_used_at trên mỗi request.
     * Nếu chỉ thay đổi duy nhất trường last_used_at và lần cập nhật trước cách đây
     * chưa tới 5 phút (300 giây), bỏ qua truy vấn UPDATE xuống MySQL.
     */
    public function save(array $options = []): bool
    {
        if (
            $this->exists
            && $this->isDirty('last_used_at')
            && count($this->getDirty()) === 1
        ) {
            $originalLastUsedAt = $this->getOriginal('last_used_at');

            if ($originalLastUsedAt !== null) {
                $originalCarbon = $originalLastUsedAt instanceof Carbon
                    ? $originalLastUsedAt
                    : Carbon::parse($originalLastUsedAt);

                $currentCarbon = $this->last_used_at instanceof Carbon
                    ? $this->last_used_at
                    : Carbon::now();

                if (abs($currentCarbon->diffInSeconds($originalCarbon)) < self::LAST_USED_AT_THROTTLE_SECONDS) {
                    $this->syncOriginalAttribute('last_used_at');

                    return true;
                }
            }
        }

        return parent::save($options);
    }
}
