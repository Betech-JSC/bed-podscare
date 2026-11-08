'use client';

import React, { useState } from 'react';

export interface SimpleStudioHeaderProps {
  /** Trạng thái kết nối dịch vụ AI (mặc định true = yên tĩnh; false = có cảnh báo kết nối) */
  aiServiceHealthy?: boolean;
  /** Thông điệp giải thích khi dịch vụ AI mất kết nối (chỉ hiển thị khi aiServiceHealthy = false) */
  aiServiceErrorMessage?: string;
  /** Số lượng đề xuất quy tắc mới chờ duyệt trong mục "Học & cải thiện" */
  pendingLearningCount?: number;
  /** Ngăn "Học & cải thiện" đang mở hay đóng */
  isLearningOpen?: boolean;
  /** Hàm bật/tắt ngăn "Học & cải thiện" */
  onToggleLearning?: () => void;
  /** Ngăn "Cài đặt" đang mở hay đóng */
  isSettingsOpen?: boolean;
  /** Hàm bật/tắt ngăn "Cài đặt" */
  onToggleSettings?: () => void;
}

export function SimpleStudioHeader({
  aiServiceHealthy = true,
  aiServiceErrorMessage = 'Chưa kết nối được dịch vụ AI cục bộ (9Router cổng 20128). Hệ thống đang dùng chế độ cắt tự động dự phòng.',
  pendingLearningCount = 0,
  isLearningOpen = false,
  onToggleLearning,
  isSettingsOpen = false,
  onToggleSettings,
}: SimpleStudioHeaderProps) {
  const [showAiErrorDetail, setShowAiErrorDetail] = useState<boolean>(false);

  return (
    <header
      className="sticky top-0 z-30 h-[56px] w-full bg-[#FFFFFF] border-b border-[#E5E0D8]"
      aria-label="Thanh điều hướng Cắt vấp Video"
    >
      <div className="max-w-[1160px] h-full mx-auto px-2.5 sm:px-6 flex items-center justify-between gap-1.5 sm:gap-4">
        {/* 1. Logo + Tên sản phẩm + 2. Chấm trạng thái dịch vụ AI nhỏ */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink-0">
          <a
            href="/video-studio"
            className="inline-flex min-h-[44px] items-center gap-2 sm:gap-2.5 text-[#17231f] hover:opacity-90 focus:outline-none whitespace-nowrap shrink-0"
          >
            <span
              className="w-7 h-7 rounded-[6px] bg-[#176b51] text-[#ffffff] font-heading font-bold text-[14px] leading-none inline-flex items-center justify-center flex-none"
              aria-hidden="true"
            >
              P
            </span>
            <span className="font-heading font-bold text-[15px] leading-[22px] text-[#17231f] whitespace-nowrap">
              <span className="hidden lg:inline">
                PodsCare <span className="font-normal text-[#4a5d54]">·</span>{' '}
              </span>
              <span>Cắt vấp Video</span>
            </span>
          </a>

          {/* 2. Chấm trạng thái AI nhỏ */}
          <div className="relative flex items-center shrink-0">
            {aiServiceHealthy ? (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-1 text-[13px] leading-[20px] font-medium text-[#4a5d54] whitespace-nowrap shrink-0"
                title="Dịch vụ AI sẵn sàng"
              >
                <span
                  className="w-2 h-2 rounded-full bg-[#176b51] flex-none"
                  aria-hidden="true"
                />
                <span className="hidden lg:inline">AI sẵn sàng</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setShowAiErrorDetail((prev) => !prev)}
                aria-expanded={showAiErrorDetail}
                aria-label="Chế độ dự phòng — bấm để xem chi tiết kết nối AI"
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#faf3e7] border border-[#e5d5b5] text-[13px] leading-[20px] font-medium text-[#8f5d14] min-h-[44px] min-w-[44px] whitespace-nowrap shrink-0"
              >
                <span
                  className="w-2 h-2 rounded-full bg-[#b77a21] flex-none"
                  aria-hidden="true"
                />
                <span className="hidden lg:inline">Chế độ dự phòng</span>
                <span className="hidden sm:inline lg:hidden">Dự phòng</span>
                <span className="sm:hidden" aria-hidden="true">!</span>
              </button>
            )}

            {!aiServiceHealthy && showAiErrorDetail && (
              <div
                role="status"
                className="absolute left-0 top-[48px] z-40 w-[290px] sm:w-[340px] p-3 bg-[#ffffff] border border-[#d5e0d7] rounded-[6px] text-[13px] leading-[20px] text-[#17231f]"
              >
                <p className="font-medium text-[#8f5d14]">{aiServiceErrorMessage}</p>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAiErrorDetail(false)}
                    className="min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center rounded-[6px] text-[13px] leading-[20px] font-medium text-[#176b51] hover:bg-[#e9f4ef] hover:underline"
                  >
                    Đã hiểu
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cụm nút bên phải: 3. Học & cải thiện | 4. Cài đặt */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-none shrink-0">
          {/* 3. Nút mở "Học & cải thiện" */}
          <button
            type="button"
            data-testid="header-learning-button"
            onClick={onToggleLearning}
            aria-pressed={isLearningOpen}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 min-h-[44px] rounded-[6px] border text-[13px] leading-[20px] font-medium transition-colors whitespace-nowrap shrink-0 ${
              isLearningOpen
                ? 'bg-[#e9f4ef] border-[#176b51] text-[#176b51]'
                : 'bg-[#ffffff] border-[#d5e0d7] text-[#17231f] hover:bg-[#f6f8f6]'
            }`}
          >
            <span className="hidden sm:inline">Học &amp; cải thiện</span>
            <span className="sm:hidden">Học</span>
            {pendingLearningCount > 0 && (
              <span
                data-testid="header-learning-badge"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#e9f4ef] text-[#176b51] font-mono text-[12px] leading-[16px] font-medium"
                aria-label={`${pendingLearningCount} đề xuất quy tắc mới chờ duyệt`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#176b51]" aria-hidden="true" />
                {pendingLearningCount}
              </span>
            )}
          </button>

          {/* 4. Nút "Cài đặt" */}
          <button
            type="button"
            onClick={onToggleSettings}
            aria-pressed={isSettingsOpen}
            className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 min-h-[44px] rounded-[6px] border text-[13px] leading-[20px] font-medium transition-colors whitespace-nowrap shrink-0 ${
              isSettingsOpen
                ? 'bg-[#e9f4ef] border-[#176b51] text-[#176b51]'
                : 'bg-[#ffffff] border-[#d5e0d7] text-[#17231f] hover:bg-[#f6f8f6]'
            }`}
          >
            <span>Cài đặt</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export default SimpleStudioHeader;
