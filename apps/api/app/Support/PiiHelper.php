<?php

namespace App\Support;

class PiiHelper
{
    /**
     * Che mờ tên khách hàng (ví dụ: "Nguyễn Minh Anh" -> "Nguyễn M*** A***").
     */
    public static function maskName(?string $name): string
    {
        if (empty($name)) {
            return '';
        }

        $trimmed = trim($name);
        $words = preg_split('/\s+/', $trimmed);

        if (count($words) <= 1) {
            $first = mb_substr($words[0], 0, 1);
            return $first . '***';
        }

        $firstWord = array_shift($words);
        $maskedOthers = array_map(function ($word) {
            if ($word === '') {
                return '';
            }
            return mb_substr($word, 0, 1) . '***';
        }, $words);

        return $firstWord . ' ' . implode(' ', $maskedOthers);
    }

    /**
     * Che mờ số điện thoại (ví dụ: "0903482716" -> "0903****16").
     */
    public static function maskPhone(?string $phone): string
    {
        if (empty($phone)) {
            return '';
        }

        $clean = preg_replace('/[^0-9]/', '', $phone);
        $len = strlen($clean);

        if ($len <= 4) {
            return str_repeat('*', $len);
        }

        if ($len < 8) {
            return substr($clean, 0, 2) . '****' . substr($clean, -2);
        }

        // Với số điện thoại tiêu chuẩn (10-11 số): giữ 4 số đầu, 4 sao, 2 số cuối
        return substr($clean, 0, 4) . '****' . substr($clean, -2);
    }

    /**
     * Che mờ địa chỉ giao hàng, chỉ giữ lại quận/huyện/tỉnh thành.
     */
    public static function maskAddress(?string $address): string
    {
        if (empty($address)) {
            return '';
        }

        $parts = array_values(array_filter(array_map('trim', explode(',', $address))));
        if (count($parts) >= 3) {
            $kept = array_slice($parts, -2);
            return '***, ' . implode(', ', $kept);
        }

        if (count($parts) === 2) {
            return '***, ' . $parts[1];
        }

        return '***';
    }

    /**
     * Kiểm tra số điện thoại nhập vào có khớp với số điện thoại của đơn/khách hàng không.
     * Chấp nhận khớp hoàn toàn, khớp chuỗi đuôi hoặc khớp 4 số cuối.
     */
    public static function isPhoneMatching(?string $inputPhone, ?string $targetPhone): bool
    {
        if (empty($inputPhone) || empty($targetPhone)) {
            return false;
        }

        $cleanInput = preg_replace('/[^0-9]/', '', (string) $inputPhone);
        $cleanTarget = preg_replace('/[^0-9]/', '', (string) $targetPhone);

        if ($cleanInput === '' || $cleanTarget === '') {
            return false;
        }

        // 1. Khớp chính xác
        if ($cleanInput === $cleanTarget) {
            return true;
        }

        // 2. Khớp chuỗi đuôi (ví dụ nhập 903482716 khi target là 0903482716 hoặc ngược lại)
        if (str_ends_with($cleanTarget, $cleanInput) || str_ends_with($cleanInput, $cleanTarget)) {
            return true;
        }

        // 3. Khớp 4 số cuối (yêu cầu cả hai chuỗi có ít nhất 4 số)
        if (strlen($cleanInput) >= 4 && strlen($cleanTarget) >= 4) {
            return substr($cleanTarget, -4) === substr($cleanInput, -4);
        }

        return false;
    }
}
