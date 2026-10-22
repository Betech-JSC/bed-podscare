<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;

class PhoneHelper
{
    /**
     * Loại bỏ toàn bộ ký tự điều hướng và khoảng trắng vô hình Unicode
     * (Zalo, iOS/macOS Contacts: \u200B-\u200F, \u202A-\u202E bao gồm \u202D và \u202C,
     * \u2060-\u206F, \uFEFF, \u00AD) và chuẩn hóa khoảng trắng hai đầu.
     */
    public static function sanitizeText(?string $value): string
    {
        if ($value === null || $value === '') {
            return '';
        }

        // Xóa các ký tự điều hướng / zero-width Unicode
        $cleaned = preg_replace(
            '/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{206F}\x{FEFF}\x{00AD}]/u',
            '',
            $value
        );

        if ($cleaned === null) {
            $cleaned = $value;
        }

        // Đổi non-breaking space (\u00A0) thành khoảng trắng thường
        $cleaned = preg_replace('/\x{00A0}/u', ' ', $cleaned) ?? $cleaned;

        return trim($cleaned);
    }

    /**
     * Chuẩn hóa số điện thoại khách hàng khi lưu vào cơ sở dữ liệu:
     * - Loại bỏ ký tự ẩn Unicode, khoảng trắng, dấu chấm, dấu gạch ngang, dấu ngoặc.
     * - Chuyển tiền tố quốc gia +84 / 84 (khi chuỗi số dài >= 11 chữ số) về số 0.
     * - Tự động thêm số 0 ở đầu nếu chuỗi gồm 9-10 chữ số bắt đầu bằng đầu số di động VN [35789]
     *   (ví dụ: "987783914" -> "0987783914", "9877839144" -> "09877839144").
     */
    public static function normalizeForStorage(?string $phone): string
    {
        $sanitized = self::sanitizeText($phone);
        if ($sanitized === '') {
            return '';
        }

        $hasPlus84 = str_starts_with($sanitized, '+84');
        $digits = preg_replace('/[^0-9]/', '', $sanitized) ?? '';

        if ($digits === '') {
            return $sanitized;
        }

        if (str_starts_with($digits, '84') && ($hasPlus84 || strlen($digits) >= 11)) {
            $digits = '0' . substr($digits, 2);
        } elseif (! str_starts_with($digits, '0') && preg_match('/^[35789]\d{8,9}$/', $digits)) {
            $digits = '0' . $digits;
        }

        return $digits;
    }

    /**
     * Tách các token phục vụ tìm kiếm linh hoạt theo số điện thoại hoặc từ khóa.
     *
     * @return array{
     *   cleanQuery: string,
     *   clean_text: string,
     *   isPhoneLike: bool,
     *   is_phone_like: bool,
     *   cleanDigits: string,
     *   clean_digits: string,
     *   coreDigits: string,
     *   core_digits: string,
     *   normalizedWithZero: string,
     *   normalized_with_zero: string
     * }
     */
    public static function extractSearchTokens(?string $query): array
    {
        $cleanText = self::sanitizeText($query);
        $stripped = preg_replace('/[\s.\-()+]+/', '', $cleanText) ?? '';

        $isPhoneLike = $stripped !== '' && (bool) preg_match('/^\d{3,15}$/', $stripped);

        $cleanDigits = '';
        $coreDigits = '';
        $normalizedWithZero = '';

        if ($isPhoneLike) {
            $cleanDigits = $stripped;
            $hasPlus84 = str_starts_with($cleanText, '+84');

            if (str_starts_with($cleanDigits, '84') && ($hasPlus84 || strlen($cleanDigits) >= 9)) {
                $coreDigits = substr($cleanDigits, 2);
            } elseif (str_starts_with($cleanDigits, '0') && strlen($cleanDigits) >= 4) {
                $coreDigits = substr($cleanDigits, 1);
            } else {
                $coreDigits = $cleanDigits;
            }

            if ($coreDigits !== '') {
                $normalizedWithZero = str_starts_with($coreDigits, '0')
                    ? $coreDigits
                    : '0' . $coreDigits;
            }
        }

        return [
            'cleanQuery'           => $cleanText,
            'clean_text'           => $cleanText,
            'isPhoneLike'          => $isPhoneLike,
            'is_phone_like'        => $isPhoneLike,
            'cleanDigits'          => $cleanDigits,
            'clean_digits'         => $cleanDigits,
            'coreDigits'           => $coreDigits,
            'core_digits'          => $coreDigits,
            'normalizedWithZero'   => $normalizedWithZero,
            'normalized_with_zero' => $normalizedWithZero,
        ];
    }

    /**
     * Áp dụng điều kiện tìm kiếm số điện thoại linh hoạt lên cột chỉ định (tương thích SQLite & MySQL/MariaDB).
     * Hỗ trợ tìm khớp bất chấp dữ liệu lưu trong DB có khoảng trắng, dấu chấm, gạch ngang hoặc thiếu số 0 đầu.
     *
     * @param  Builder|QueryBuilder  $query
     */
    public static function applyPhoneColumnSearch($query, string $column, ?string $rawKeyword, string $boolean = 'or')
    {
        $tokens = self::extractSearchTokens($rawKeyword);
        $cleanText = $tokens['cleanQuery'];

        if ($cleanText === '') {
            return $query;
        }

        $method = strtolower($boolean) === 'and' ? 'where' : 'orWhere';

        return $query->{$method}(function ($sub) use ($column, $cleanText, $tokens) {
            $sub->where($column, 'like', "%{$cleanText}%");

            if ($tokens['isPhoneLike']) {
                $variants = array_values(array_unique(array_filter([
                    $tokens['cleanDigits'],
                    $tokens['coreDigits'],
                    $tokens['normalizedWithZero'],
                ], fn ($val) => $val !== '')));

                if (strlen($tokens['normalizedWithZero']) === 10) {
                    $norm = $tokens['normalizedWithZero'];
                    $variants[] = substr($norm, 0, 4) . ' ' . substr($norm, 4, 3) . ' ' . substr($norm, 7);
                    $variants[] = substr($norm, 0, 3) . ' ' . substr($norm, 3, 3) . ' ' . substr($norm, 6);
                }

                $variants = array_values(array_unique($variants));

                foreach ($variants as $variant) {
                    if ($variant !== $cleanText) {
                        $sub->orWhere($column, 'like', "%{$variant}%");
                    }
                }

                if (strlen($tokens['coreDigits']) >= 6) {
                    $interleavedPattern = '%' . implode('%', str_split($tokens['coreDigits'])) . '%';
                    $sub->orWhere($column, 'like', $interleavedPattern);
                }
            }
        });
    }
}
