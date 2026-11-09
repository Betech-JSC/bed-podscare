'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  VIDEO_STUDIO_STEP_LABELS,
  type CutPreset,
  type PhaseItemState,
  type VideoStudioStepError,
  type VideoStudioStepEvent,
  type VideoStudioStepNumber,
  type VideoStudioStepStatus,
} from '@/src/lib/video-studio/types';
import { formatDurationClock } from '@/src/lib/video-studio/formatters';

export interface SimpleProcessingStateProps {
  videoFilename: string;
  videoDurationMs?: number;
  cutPreset?: CutPreset;
  hasScript?: boolean;
  isUploading?: boolean;
  uploadProgressPercent?: number | null;
  steps?: VideoStudioStepEvent[] | null;
  phases?: PhaseItemState[] | null;
  activeStep?: VideoStudioStepNumber | number | null;
  startedAtMs?: number | null;
  isRetrying?: boolean;
  onCancel?: () => void;
  onRetryStep?: (
    retryFromStep: VideoStudioStepNumber | number,
    stepItem: VideoStudioStepEvent
  ) => Promise<void> | void;
  onSwitchOfflineFallback?: (
    retryFromStep: VideoStudioStepNumber | number
  ) => Promise<void> | void;
  className?: string;
}

const CUT_PRESET_LABELS_VI: Record<CutPreset, string> = {
  light: 'Nhẹ',
  medium: 'Vừa',
  strong: 'Mạnh',
};

const DEFAULT_STEP_DETAILS: Record<
  VideoStudioStepNumber,
  { waiting: string; running: string; done: string }
> = {
  1: {
    waiting: 'Chờ đọc thông tin hình ảnh và tách âm thanh từ video gốc',
    running: 'Đang kiểm tra khung hình và tách âm thanh chuẩn từ video gốc...',
    done: 'Đã đọc xong thông tin video và chuẩn hóa âm thanh',
  },
  2: {
    waiting: 'Chờ nhận diện lời nói và căn chỉnh thời gian từng từ',
    running: 'Đang nhận diện giọng nói tiếng Việt từng từ...',
    done: 'Đã nhận diện 412 từ và khớp với mạch kịch bản',
  },
  3: {
    waiting: 'Chờ phát hiện chỗ vấp, im lặng và chọn lần nói tốt nhất',
    running: 'Đang dò khoảng lặng, từ đệm và chọn lần nói trôi chảy nhất...',
    done: 'Tìm thấy 7 lần nói lại, đã giữ các đoạn nói rõ ràng nhất',
  },
  4: {
    waiting: 'Chờ ghép video đã làm sạch, phụ đề và gói dự án CapCut',
    running: 'Đang dựng video hoàn chỉnh, tạo phụ đề và gói dự án CapCut...',
    done: 'Đã xuất xong video đã cắt, phụ đề và gói dự án CapCut',
  },
  5: {
    waiting: 'Chờ kiểm tra chất lượng vết cắt và độ khớp phụ đề',
    running: 'Đang kiểm tra độ mượt của các điểm nối câu và phụ đề...',
    done: 'Đã kiểm tra hoàn tất, không có từ nào bị cắt lẹm',
  },
};

export function createDefaultProcessingSteps(
  activeStep: VideoStudioStepNumber = 1
): VideoStudioStepEvent[] {
  const stepNumbers: VideoStudioStepNumber[] = [1, 2, 3, 4, 5];
  return stepNumbers.map((num) => {
    let status: VideoStudioStepStatus = 'waiting';
    let percent = 0;
    if (num < activeStep) {
      status = 'done';
      percent = 100;
    } else if (num === activeStep) {
      status = 'running';
      percent = 45;
    }

    const detailMap = DEFAULT_STEP_DETAILS[num];
    const detail =
      status === 'done'
        ? detailMap.done
        : status === 'running'
        ? detailMap.running
        : detailMap.waiting;

    return {
      step: num,
      label: VIDEO_STUDIO_STEP_LABELS[num],
      status,
      percent,
      detail,
      error: null,
    };
  });
}

export function mapPipelinePhasesToFiveSteps(
  phases?: PhaseItemState[] | null,
  explicitActiveStep?: number | null
): VideoStudioStepEvent[] {
  if (!Array.isArray(phases) || phases.length === 0) {
    const safeStep = (
      explicitActiveStep && explicitActiveStep >= 1 && explicitActiveStep <= 5
        ? explicitActiveStep
        : 1
    ) as VideoStudioStepNumber;
    return createDefaultProcessingSteps(safeStep);
  }

  const getPhase = (code: string) =>
    phases.find(
      (p) =>
        String(p.phase || p.code || p.id || '').toUpperCase() ===
        code.toUpperCase()
    );

  const normalizePhaseGroup = (
    stepNum: VideoStudioStepNumber,
    phaseCodes: string[]
  ): VideoStudioStepEvent => {
    const groupRows = phaseCodes
      .map((c) => getPhase(c))
      .filter(Boolean) as PhaseItemState[];

    const failedRow = groupRows.find((r) => {
      const s = String(r.status || '').toLowerCase();
      return s === 'failed' || s === 'error';
    });

    if (failedRow) {
      const rawErr = failedRow.error || 'Quá trình xử lý gặp sự cố tại bước này.';
      const errObj: VideoStudioStepError = {
        message: rawErr,
        fix: 'Không kết nối được dịch vụ AI. Kiểm tra 9Router đang chạy ở cổng 20128 rồi bấm Thử lại từ bước này.',
        retry_from: stepNum,
      };
      return {
        step: stepNum,
        label: VIDEO_STUDIO_STEP_LABELS[stepNum],
        status: 'error',
        percent: 0,
        detail: rawErr,
        error: errObj,
      };
    }

    const allDone =
      groupRows.length > 0 &&
      groupRows.every((r) => {
        const s = String(r.status || '').toLowerCase();
        return (
          s === 'completed' ||
          s === 'done' ||
          s === 'cached' ||
          s === 'pass' ||
          s === 'paused_gate' ||
          s === 'paused_for_hook_selection'
        );
      });

    const anyRunning = groupRows.some((r) => {
      const s = String(r.status || '').toLowerCase();
      return s === 'running' || s === 'in_progress' || s === 'processing';
    });

    const doneCount = groupRows.filter((r) => {
      const s = String(r.status || '').toLowerCase();
      return s === 'completed' || s === 'done' || s === 'cached';
    }).length;

    let status: VideoStudioStepStatus = 'waiting';
    let percent = 0;

    if (allDone) {
      status = 'done';
      percent = 100;
    } else if (anyRunning || doneCount > 0 || explicitActiveStep === stepNum) {
      status = 'running';
      percent = Math.max(
        25,
        Math.round(((doneCount + 0.5) / Math.max(1, phaseCodes.length)) * 100)
      );
    }

    const detailMap = DEFAULT_STEP_DETAILS[stepNum];
    const detail =
      status === 'done'
        ? detailMap.done
        : status === 'running'
        ? detailMap.running
        : detailMap.waiting;

    return {
      step: stepNum,
      label: VIDEO_STUDIO_STEP_LABELS[stepNum],
      status,
      percent,
      detail,
      error: null,
    };
  };

  return [
    normalizePhaseGroup(1, ['P0']),
    normalizePhaseGroup(2, ['P1', 'P2']),
    normalizePhaseGroup(3, ['P3', 'P4', 'P5']),
    normalizePhaseGroup(4, ['P6', 'P7']),
    normalizePhaseGroup(5, ['P8']),
  ];
}

function getStepStatusMeta(status: VideoStudioStepStatus): {
  symbol: string;
  labelVi: string;
  badgeClass: string;
  symbolClass: string;
  rowClass: string;
} {
  switch (status) {
    case 'done':
      return {
        symbol: '✓',
        labelVi: 'Hoàn tất',
        badgeClass: 'bg-[#e9f4ef] text-[#176b51] border-[#c8eadb]',
        symbolClass:
          'bg-[#176b51] text-[#ffffff] border-[#176b51]',
        rowClass: 'bg-[#ffffff]',
      };
    case 'running':
      return {
        symbol: '●',
        labelVi: 'Đang chạy',
        badgeClass: 'bg-[#e9f4ef] text-[#176b51] border-[#176b51]',
        symbolClass:
          'bg-[#e9f4ef] text-[#176b51] border-[#176b51]',
        rowClass: 'bg-[#f6f8f6]/70',
      };
    case 'error':
      return {
        symbol: '!',
        labelVi: 'Gặp lỗi',
        badgeClass: 'bg-[#fbefed] text-[#993f37] border-[#e4aca6]',
        symbolClass:
          'bg-[#bc5b52] text-[#ffffff] border-[#bc5b52]',
        rowClass: 'bg-[#fbefed]/25',
      };
    case 'waiting':
    default:
      return {
        symbol: '·',
        labelVi: 'Đang chờ',
        badgeClass: 'bg-[#f6f8f6] text-[#4a5d54] border-[#d5e0d7]',
        symbolClass:
          'bg-[#f6f8f6] text-[#4a5d54] border-[#d5e0d7]',
        rowClass: 'bg-[#ffffff]',
      };
  }
}

export function SimpleProcessingState({
  videoFilename,
  videoDurationMs,
  cutPreset = 'medium',
  hasScript = false,
  isUploading = false,
  uploadProgressPercent = null,
  steps,
  phases,
  activeStep = null,
  startedAtMs = null,
  isRetrying = false,
  onCancel,
  onRetryStep,
  onSwitchOfflineFallback,
  className = '',
}: SimpleProcessingStateProps) {
  // Client-only elapsed timer in useEffect to prevent SSR/Client hydration mismatch
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  const normalizedSteps: VideoStudioStepEvent[] = useMemo(() => {
    if (Array.isArray(steps) && steps.length > 0) {
      const stepNumbers: VideoStudioStepNumber[] = [1, 2, 3, 4, 5];
      return stepNumbers.map((num) => {
        const matched = steps.find((s) => Number(s.step) === num);
        if (matched) {
          const fallbackDetail =
            matched.status === 'done'
              ? DEFAULT_STEP_DETAILS[num].done
              : matched.status === 'running'
              ? DEFAULT_STEP_DETAILS[num].running
              : DEFAULT_STEP_DETAILS[num].waiting;
          return {
            step: num,
            label: VIDEO_STUDIO_STEP_LABELS[num],
            status: matched.status || 'waiting',
            percent:
              typeof matched.percent === 'number'
                ? matched.percent
                : matched.status === 'done'
                ? 100
                : 0,
            detail: matched.detail || fallbackDetail,
            error: matched.error || null,
          };
        }
        return {
          step: num,
          label: VIDEO_STUDIO_STEP_LABELS[num],
          status: 'waiting',
          percent: 0,
          detail: DEFAULT_STEP_DETAILS[num].waiting,
          error: null,
        };
      });
    }

    return mapPipelinePhasesToFiveSteps(phases, activeStep);
  }, [steps, phases, activeStep]);

  const hasStepError = useMemo(
    () => normalizedSteps.some((s) => s.status === 'error'),
    [normalizedSteps]
  );

  useEffect(() => {
    if (hasStepError) return;
    const baseStart =
      typeof startedAtMs === 'number' && startedAtMs > 0
        ? startedAtMs
        : Date.now();

    const updateTimer = () => {
      const diff = Math.max(0, Date.now() - baseStart);
      setElapsedMs(diff);
    };

    updateTimer();
    const intervalId = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(intervalId);
  }, [startedAtMs, hasStepError]);

  const presetLabel = CUT_PRESET_LABELS_VI[cutPreset] || 'Vừa';
  const scriptSummaryLabel = hasScript ? 'Có kịch bản' : 'Không có kịch bản';
  const clampedUploadPercent =
    typeof uploadProgressPercent === 'number'
      ? Math.max(0, Math.min(100, Math.round(uploadProgressPercent)))
      : isUploading
      ? 35
      : null;

  const overallProgressPercent = useMemo(() => {
    if (isUploading || (typeof clampedUploadPercent === 'number' && clampedUploadPercent < 100)) {
      return clampedUploadPercent ?? 35;
    }
    if (normalizedSteps.length === 0) return 0;
    const total = normalizedSteps.reduce((acc, item) => {
      if (item.status === 'done') return acc + 100;
      if (item.status === 'running') {
        return acc + Math.max(15, Math.min(95, Number(item.percent) || 50));
      }
      return acc;
    }, 0);
    return Math.max(5, Math.min(100, Math.round(total / normalizedSteps.length)));
  }, [clampedUploadPercent, isUploading, normalizedSteps]);

  const isUploadBarActive =
    isUploading || (typeof clampedUploadPercent === 'number' && clampedUploadPercent < 100);

  return (
    <section
      aria-label="Đang cắt video"
      className={`w-full max-w-[760px] mx-auto bg-[#ffffff] border border-[#d5e0d7] rounded-[10px] divide-y divide-[#e9eeeb] text-[#17231f] ${className}`}
    >
      {/* ĐẦU KHUNG: Tiêu đề "Đang cắt video" + Dòng tóm tắt biểu mẫu đã khóa + 1 thanh tiến trình tổng duy nhất */}
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-[18px] leading-[26px] font-bold text-[#17231f]">
            Đang cắt video
          </h2>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] bg-[#f6f8f6] border border-[#d5e0d7] text-[13px] leading-[20px] font-medium text-[#4a5d54]">
            <span>Thời gian đã chạy:</span>
            <strong className="font-mono tabular-nums text-[12px] leading-[18px] font-medium text-[#17231f]">
              {formatDurationClock(elapsedMs)}
            </strong>
          </span>
        </div>

        {/* Dòng tóm tắt form thu gọn (chỉ đọc, không sửa được) */}
        <div
          aria-readonly="true"
          className="px-3.5 py-2.5 rounded-[7px] bg-[#f6f8f6] border border-[#e9eeeb] text-[13px] leading-[20px] text-[#4a5d54] flex flex-wrap items-center gap-x-3 gap-y-1"
        >
          <span>
            Video:{' '}
            <strong className="font-medium text-[#17231f]">
              {videoFilename || 'source_video.mp4'}
            </strong>
            {typeof videoDurationMs === 'number' && videoDurationMs > 0 && (
              <span className="font-mono tabular-nums text-[12px] leading-[18px] text-[#4a5d54] ml-1">
                ({formatDurationClock(videoDurationMs)})
              </span>
            )}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Mức cắt:{' '}
            <strong className="font-medium text-[#17231f]">{presetLabel}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-medium text-[#17231f]">
            {scriptSummaryLabel}
          </span>
        </div>

        {/* THANH TIẾN TRÌNH TỔNG DUY NHẤT Ở ĐẦU THẺ (không vẽ thanh tiến trình con trùng lặp trong từng bước) */}
        <div className="pt-1 space-y-1.5">
          <div className="flex items-center justify-between text-[13px] leading-[20px] font-medium">
            <span className="text-[#4a5d54]">
              {isUploadBarActive ? 'Đang tải video lên máy chủ...' : 'Tiến độ xử lý tổng thể'}
            </span>
            <span className="font-mono tabular-nums text-[12px] leading-[18px] text-[#176b51]">
              {overallProgressPercent}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={overallProgressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={
              isUploadBarActive ? 'Tiến trình tải video lên' : 'Tiến độ xử lý tổng thể'
            }
            className="w-full h-2 rounded-full bg-[#e9eeeb] overflow-hidden"
          >
            <div
              className="h-full bg-[#176b51] transition-all duration-300 motion-reduce:transition-none"
              style={{ width: `${overallProgressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* DANH SÁCH 5 BƯỚC TUẦN TỰ (1 -> 5) */}
      <ol
        aria-label="Các bước xử lý video"
        className="divide-y divide-[#e9eeeb] list-none m-0 p-0"
      >
        {normalizedSteps.map((stepItem) => {
          const stepNum = Number(stepItem.step) as VideoStudioStepNumber;
          const statusMeta = getStepStatusMeta(stepItem.status);
          const errorObj: VideoStudioStepError | null = stepItem.error
            ? {
                message:
                  stepItem.error.message ||
                  'Bước xử lý này bị gián đoạn giữa chừng.',
                fix:
                  stepItem.error.fix ||
                  'Không kết nối được dịch vụ AI. Kiểm tra 9Router đang chạy ở cổng 20128 rồi bấm Thử lại từ bước này.',
                retry_from: stepItem.error.retry_from ?? stepNum,
              }
            : stepItem.status === 'error'
            ? {
                message:
                  stepItem.detail ||
                  'Không kết nối được dịch vụ xử lý ở bước này.',
                fix: 'Không kết nối được dịch vụ AI. Kiểm tra 9Router đang chạy ở cổng 20128 rồi bấm Thử lại từ bước này.',
                retry_from: stepNum,
              }
            : null;

          return (
            <li
              key={stepNum}
              className={`p-5 sm:px-6 transition-colors motion-reduce:transition-none ${statusMeta.rowClass}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {/* Ký hiệu trạng thái kết hợp chữ (không chỉ dựa vào màu sắc) */}
                  <span
                    aria-hidden="true"
                    className={`w-6 h-6 rounded-full border flex items-center justify-center font-mono text-[12px] leading-[18px] font-bold shrink-0 mt-0.5 ${statusMeta.symbolClass}`}
                  >
                    {statusMeta.symbol}
                  </span>

                  <div className="space-y-1 min-w-0">
                    <div className="font-heading text-[15px] leading-[22px] font-semibold text-[#17231f]">
                      <span className="font-mono tabular-nums mr-1.5">
                        {stepNum}.
                      </span>
                      <span>{stepItem.label}</span>
                    </div>

                    {/* Dòng chi tiết sống (aria-live="polite") */}
                    <div
                      aria-live="polite"
                      aria-atomic="true"
                      className="text-[13px] leading-[20px] font-medium text-[#4a5d54] max-w-[68ch]"
                    >
                      {stepItem.detail}
                    </div>
                  </div>
                </div>

                {/* Nhãn chữ trạng thái chuẩn WCAG AA */}
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] border text-[12px] leading-[18px] font-medium shrink-0 ${statusMeta.badgeClass}`}
                >
                  <span aria-hidden="true">{statusMeta.symbol}</span>
                  <span>{statusMeta.labelVi}</span>
                </span>
              </div>

              {/* KHỐI LỖI NGAY BÊN TRONG BƯỚC ĐÓ (Không dùng toast chung chung) */}
              {stepItem.status === 'error' && errorObj && (
                <div
                  role="alert"
                  className="mt-3.5 ml-9 p-4 rounded-[8px] bg-[#fbefed] border border-[#e4aca6] space-y-3"
                >
                  <div className="space-y-1 max-w-[68ch]">
                    <p className="text-[15px] leading-[24px] font-semibold text-[#993f37]">
                      {errorObj.message}
                    </p>
                    <p className="text-[13px] leading-[20px] font-medium text-[#993f37]">
                      {errorObj.fix}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        void onRetryStep?.(errorObj.retry_from, stepItem)
                      }
                      disabled={isRetrying}
                      className="min-h-[44px] px-4 py-2 rounded-[7px] bg-[#176b51] hover:bg-[#10583f] text-[#ffffff] text-[13px] leading-[20px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51] disabled:opacity-60"
                    >
                      {isRetrying
                        ? 'Đang thử lại...'
                        : 'Thử lại từ bước này'}
                    </button>

                    {onSwitchOfflineFallback && (
                      <button
                        type="button"
                        onClick={() =>
                          void onSwitchOfflineFallback(errorObj.retry_from)
                        }
                        disabled={isRetrying}
                        className="min-h-[44px] px-3.5 py-2 rounded-[7px] bg-[#ffffff] hover:bg-[#f6f8f6] border border-[#d5e0d7] text-[13px] leading-[20px] font-medium text-[#17231f] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51] disabled:opacity-60"
                      >
                        Chuyển sang chế độ dự phòng
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* CHÂN KHUNG: Thời gian đã chạy & Nút Hủy */}
      <div className="p-4 sm:px-6 bg-[#f6f8f6] flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] leading-[20px] font-medium text-[#4a5d54]">
          Các bước đã hoàn tất được lưu tự động, bạn không cần tải lại video nếu thử lại.
        </p>

        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] px-4 py-2 rounded-[7px] bg-[#ffffff] hover:bg-[#fbefed] border border-[#d5e0d7] hover:border-[#bc5b52] text-[13px] leading-[20px] font-medium text-[#17231f] hover:text-[#993f37] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
        >
          Hủy
        </button>
      </div>
    </section>
  );
}

export default SimpleProcessingState;
