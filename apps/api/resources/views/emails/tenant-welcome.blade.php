<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chào mừng gian hàng mới gia nhập FIXO Repair OS</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f8f6; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #191c1b; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f6f8f6; padding: 32px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #d9e2ec; border-radius: 12px; overflow: hidden;">
                    <!-- Header: Solid Calm Jade (#176b51) -->
                    <tr>
                        <td style="background-color: #176b51; padding: 28px 32px; text-align: left;">
                            <div style="font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #b7e4c7; margin-bottom: 8px;">
                                FIXO REPAIR OS — HỆ ĐIỀU HÀNH XƯỞNG SỬA CHỮA
                            </div>
                            <h1 style="margin: 0; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 22px; font-weight: 700; line-height: 1.35; color: #ffffff;">
                                Chúc mừng gian hàng đã kích hoạt thành công!
                            </h1>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 32px;">
                            <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #191c1b;">
                                Xin chào <strong>{{ $ownerName }}</strong>,
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #404944;">
                                Chào mừng gian hàng <strong>{{ $storeName }}</strong> chính thức gia nhập nền tảng quản trị sửa chữa đa chi nhánh <strong>FIXO Repair OS</strong>. Gian hàng của bạn đã được phê duyệt tự động và kích hoạt ngay <strong>03 tháng dùng thử miễn phí</strong> toàn bộ tính năng.
                            </p>

                            <!-- Store Identity Box -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f6f8f6; border: 1px solid #d9e2ec; border-radius: 8px; margin-bottom: 28px;">
                                <tr>
                                    <td style="padding: 20px 24px;">
                                        <div style="font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #176b51; margin-bottom: 14px;">
                                            Thông tin định danh gian hàng
                                        </div>

                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 14px; line-height: 1.5; color: #191c1b;">
                                            <tr>
                                                <td style="padding: 8px 0; color: #5c6660; width: 42%; border-bottom: 1px solid #e2e8f0;">
                                                    Chủ cửa hàng:
                                                </td>
                                                <td style="padding: 8px 0; font-weight: 600; color: #191c1b; border-bottom: 1px solid #e2e8f0;">
                                                    {{ $ownerName }}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; color: #5c6660; border-bottom: 1px solid #e2e8f0;">
                                                    Tên gian hàng:
                                                </td>
                                                <td style="padding: 8px 0; font-weight: 600; color: #191c1b; border-bottom: 1px solid #e2e8f0;">
                                                    {{ $storeName }}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; color: #5c6660; border-bottom: 1px solid #e2e8f0;">
                                                    Mã gian hàng (Store Code):
                                                </td>
                                                <td style="padding: 8px 0; font-weight: 700; color: #176b51; font-family: 'JetBrains Mono', monospace; border-bottom: 1px solid #e2e8f0;">
                                                    {{ $storeCode }}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; color: #5c6660; border-bottom: 1px solid #e2e8f0;">
                                                    Email đăng nhập:
                                                </td>
                                                <td style="padding: 8px 0; font-weight: 600; color: #191c1b; border-bottom: 1px solid #e2e8f0;">
                                                    {{ $ownerEmail }}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; color: #5c6660; border-bottom: 1px solid #e2e8f0;">
                                                    Gói cước đã kích hoạt:
                                                </td>
                                                <td style="padding: 8px 0; font-weight: 600; color: #176b51; border-bottom: 1px solid #e2e8f0;">
                                                    {{ $planLabel }}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px 0; color: #5c6660;">
                                                    Hạn dùng thử miễn phí (3 tháng):
                                                </td>
                                                <td style="padding: 8px 0; font-weight: 700; color: #191c1b;">
                                                    Đến hết ngày {{ $trialEndsAtFormatted }}
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA Button: Solid Calm Jade (#176b51) -->
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                                <tr>
                                    <td align="center">
                                        <a href="{{ $dashboardUrl }}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #176b51; color: #ffffff; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 8px; border: 1px solid #176b51;">
                                            Truy cập Trang Quản Trị FIXO
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 1.6; color: #5c6660;">
                                Bạn có thể lưu lại email này để tra cứu nhanh <strong>Mã gian hàng ({{ $storeCode }})</strong> và đường dẫn đăng nhập khi làm việc trên máy tính hoặc thiết bị di động mới:
                            </p>
                            <p style="margin: 0; font-size: 13px; line-height: 1.6; word-break: break-all;">
                                <a href="{{ $dashboardUrl }}" style="color: #176b51; text-decoration: underline;">{{ $dashboardUrl }}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f6f8f6; border-top: 1px solid #d9e2ec; padding: 20px 32px; text-align: center; font-size: 12px; line-height: 1.5; color: #5c6660;">
                            © {{ date('Y') }} FIXO Repair OS. Hệ thống điều hành xưởng sửa chữa thiết bị chuyên nghiệp.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
