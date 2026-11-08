'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CutMapTimeline,
  buildCutMapTimelineBlocks,
  normalizeCutCategory,
  type NormalizedCutEntry,
} from '@/src/components/video-studio/CutMapTimeline';
import {
  formatDurationClock,
  formatDurationClockTenths,
  formatDurationSecondsLabel,
} from '@/src/lib/video-studio/formatters';
import type {
  SimpleCapCutDraftAvailability,
  SimpleCutItem,
  SimpleHookItem,
  SimpleResultFiles,
  SimpleResultWarning,
  SimpleStudioResult,
  VideoStudioCapCutDraftStatus,
  VideoStudioCutItem,
  VideoStudioJobResult,
  VideoStudioResultHookItem,
  VideoStudioStyleMatchItem,
  VideoStudioWarningItem,
} from '@/src/lib/video-studio/types';

export const DEFAULT_CAPCUT_UNAVAILABLE_REASON =
  'Chưa tạo được dự án CapCut (bản CapCut mới mã hóa dự án). Dùng video đã cắt và file .srt để nhập vào CapCut.';

export const DEFAULT_PROMPT_MISMATCH_WARNING: SimpleResultWarning = {
  code: 'prompt_warning',
  message:
    'Mô tả phần mở đầu không khớp nội dung video nên đang dùng gợi ý tự động.',
  action: 'Thử mô tả bằng từ có trong video.',
};

export type HookActionStatus = 'idle' | 'applying' | 'applied';

export interface SimpleRehookPayload {
  selectedHookId: string;
  hookPrompt: string;
  customHookClipFile?: File | null;
  customHookClipName?: string | null;
  customHookClipPath?: string | null;
}

export interface SimpleResultStateProps {
  /** Dữ liệu kết quả đầy đủ từ pipeline hoặc bộ dữ liệu mẫu */
  result: SimpleStudioResult | VideoStudioJobResult;
  /** Mã dự án hiện tại (dùng khi gọi API đổi phần mở đầu hoặc tải file) */
  projectId?: string;
  /** Callback khi người dùng chọn radio phần mở đầu khác */
  onSelectHook?: (hookId: string) => void;
  /** Callback khi người dùng bấm "Dùng phần mở đầu này" để dựng lại phần mở đầu */
  onApplyHook?: (
    payload: SimpleRehookPayload
  ) => Promise<Partial<SimpleStudioResult | VideoStudioJobResult> | void> | void;
  /** Callback khi người dùng tải/mở dự án CapCut */
  onOpenOrDownloadCapCutDraft?: () => Promise<void> | void;
  /** Callback khi khôi phục / giữ lại một đoạn đã cắt (tùy chọn) */
  onRestoreCut?: (cutId: string, restore?: boolean) => Promise<void> | void;
  /** Callback khi bấm "Cắt video khác" để quay về Trạng thái 1 (Chuẩn bị) */
  onResetToPrepare?: () => void;
  /** Cho phép điều khiển chỉ số đoạn cắt đang chọn từ bên ngoài nếu cần */
  selectedCutIndex?: number;
  onSelectCutIndex?: (index: number, cut: NormalizedCutEntry) => void;
  /** Hiển thị mặc định danh sách chi tiết các chỗ đã cắt (mặc định: false = thu gọn) */
  defaultExpandDetails?: boolean;
  /** Hiển thị mặc định mục đối chiếu "So với video mẫu" khi có dữ liệu (mặc định: true) */
  defaultExpandStyleMatch?: boolean;
  className?: string;
}

interface NormalizedHookRadioItem {
  id: string;
  style: string;
  label: string;
  text: string;
  durationMs: number;
  durationSecLabel: string;
  selected: boolean;
}

interface NormalizedWarningRow {
  id: string;
  code: string;
  message: string;
  action?: string;
  timestampMs?: number;
}

function toInlineStreamUrl(rawUrl?: string | null): string {
  if (!rawUrl) return '';
  return rawUrl
    .replace(/([?&])download=(?:1|true)(&|$)/i, (_match, prefix, suffix) => {
      if (prefix === '?' && suffix === '&') return '?';
      if (prefix === '&' && suffix === '&') return '&';
      return '';
    })
    .replace(/[?&]$/, '');
}

function toDownloadUrl(rawUrl?: string | null): string {
  if (!rawUrl) return '#';
  if (/([?&])download=(?:1|true)/i.test(rawUrl)) {
    return rawUrl;
  }
  const sep = rawUrl.includes('?') ? '&' : '?';
  return `${rawUrl}${sep}download=1`;
}

function getHookStyleLabelVi(style?: string, fallbackLabel?: string, index = 0): string {
  if (fallbackLabel && fallbackLabel.trim()) {
    return fallbackLabel.trim();
  }
  const s = String(style || '')
    .trim()
    .toLowerCase();
  if (s.includes('question') || s.includes('curiosity')) return 'Đặt câu hỏi';
  if (s.includes('teaser') || s.includes('highlight')) return 'Nhá hàng kết quả';
  if (s.includes('statement') || s.includes('direct')) return 'Khẳng định trực diện';
  if (s.includes('custom')) return 'Clip mở đầu riêng';
  const defaults = ['Phương án 1', 'Phương án 2', 'Phương án 3'];
  return defaults[index % defaults.length];
}

function formatHookSecondsVi(durationMs: number): string {
  const safeMs = Math.max(0, Math.round(Number(durationMs) || 0));
  const sec = safeMs / 1000;
  if (Math.abs(sec - Math.round(sec)) < 0.05) {
    return `${Math.round(sec)} giây`;
  }
  return `${sec.toFixed(1)} giây`;
}

export function SimpleResultState({
  result,
  projectId,
  onSelectHook,
  onApplyHook,
  onOpenOrDownloadCapCutDraft,
  onResetToPrepare,
  selectedCutIndex: controlledCutIndex,
  onSelectCutIndex,
  defaultExpandDetails = false,
  defaultExpandStyleMatch = true,
  className = '',
}: SimpleResultStateProps) {
  const hookPromptInputId = useId();
  const hookClipInputId = useId();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hookClipFileInputRef = useRef<HTMLInputElement | null>(null);

  // Chuẩn hóa danh sách 3 phương án mở đầu (`result.hooks`)
  const normalizedHooks: NormalizedHookRadioItem[] = useMemo(() => {
    const rawHooks: ReadonlyArray<SimpleHookItem | VideoStudioResultHookItem> = Array.isArray(
      result?.hooks
    )
      ? result.hooks
      : [];

    return rawHooks.slice(0, 4).map((h, idx) => {
      const id = String(
        h.id ||
          (h as VideoStudioResultHookItem).hook_id ||
          (h as VideoStudioResultHookItem).option_id ||
          `hook_opt_${idx + 1}`
      );
      const durationMs = Math.max(
        1000,
        Math.round(Number(h.duration_ms ?? 6500))
      );
      const text = String(
        h.text ||
          (h as VideoStudioResultHookItem).hook_text ||
          (h as VideoStudioResultHookItem).full_hook_text ||
          ''
      ).trim();
      const label = getHookStyleLabelVi(
        h.style,
        (h as SimpleHookItem).label ||
          (h as VideoStudioResultHookItem).title ||
          (h as Record<string, any>).style_label_vi,
        idx
      );
      const isSelected = Boolean(
        result?.selected_hook_id ? result.selected_hook_id === id : h.selected
      );

      return {
        id,
        style: String(h.style || 'question'),
        label,
        text: text || 'Mở đầu video tự động trích xuất từ câu nhấn mạnh nhất.',
        durationMs,
        durationSecLabel: formatHookSecondsVi(durationMs),
        selected: isSelected,
      };
    });
  }, [result?.hooks, result?.selected_hook_id]);

  const initialSelectedHookId = useMemo(() => {
    if (result?.selected_hook_id) return result.selected_hook_id;
    const found = normalizedHooks.find((h) => h.selected);
    return found?.id || normalizedHooks[0]?.id || 'hook_opt_1';
  }, [normalizedHooks, result?.selected_hook_id]);

  const [selectedHookId, setSelectedHookId] = useState<string>(initialSelectedHookId);
  const [hookPromptText, setHookPromptText] = useState<string>('');
  const [customHookClipFile, setCustomHookClipFile] = useState<File | null>(null);
  const [customHookClipName, setCustomHookClipName] = useState<string>('');
  const [hookActionStatus, setHookActionStatus] = useState<HookActionStatus>('idle');
  const [previewRevision, setPreviewRevision] = useState<number>(0);
  const [localPromptWarning, setLocalPromptWarning] = useState<SimpleResultWarning | null>(null);
  const [seekFeedbackLabel, setSeekFeedbackLabel] = useState<string | null>(null);
  const [capcutActionFeedback, setCapcutActionFeedback] = useState<string | null>(null);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState<boolean>(defaultExpandDetails);
  const [isStyleMatchExpanded, setIsStyleMatchExpanded] =
    useState<boolean>(defaultExpandStyleMatch);
  const [internalCutIndex, setInternalCutIndex] = useState<number>(0);

  useEffect(() => {
    setSelectedHookId(initialSelectedHookId);
  }, [initialSelectedHookId]);

  const activeCutIndex =
    typeof controlledCutIndex === 'number' ? controlledCutIndex : internalCutIndex;

  // Chuẩn hóa danh sách đoạn cắt để hiển thị trong bảng chi tiết chỉ đọc
  const { normalizedCuts } = useMemo(
    () =>
      buildCutMapTimelineBlocks(
        result?.source_duration_ms ?? 134000,
        (result?.cuts ?? []) as ReadonlyArray<SimpleCutItem | VideoStudioCutItem>
      ),
    [result?.cuts, result?.source_duration_ms]
  );

  // Chuẩn hóa thông tin tệp kết quả (`result.files`)
  const resolvedFiles: SimpleResultFiles & {
    capcut_draft: SimpleCapCutDraftAvailability & Partial<VideoStudioCapCutDraftStatus>;
  } = useMemo(() => {
    const rawFiles = result?.files;
    const fallbackProjectId =
      projectId ||
      (result as VideoStudioJobResult)?.project_id ||
      'demo_podscare_studio';

    const polished =
      rawFiles?.polished ||
      `/api/video-studio/media?projectId=${encodeURIComponent(
        fallbackProjectId
      )}&file=exports/video_final.mp4&download=1`;
    const cutMaster =
      rawFiles?.cut_master ||
      `/api/video-studio/media?projectId=${encodeURIComponent(
        fallbackProjectId
      )}&file=exports/output_roughcut.mp4&download=1`;
    const srt =
      rawFiles?.srt ||
      `/api/video-studio/media?projectId=${encodeURIComponent(
        fallbackProjectId
      )}&file=exports/output_roughcut.srt&download=1`;
    const clipsZip =
      rawFiles?.clips_zip ||
      `/api/video-studio/media?projectId=${encodeURIComponent(
        fallbackProjectId
      )}&file=exports/clips/001_hook.mp4&download=1`;

    const rawCapcut = rawFiles?.capcut_draft;
    const capcutAvailable =
      typeof rawCapcut?.available === 'boolean' ? rawCapcut.available : true;
    const capcutReason =
      !capcutAvailable
        ? rawCapcut?.reason?.trim() || DEFAULT_CAPCUT_UNAVAILABLE_REASON
        : rawCapcut?.reason;

    return {
      polished,
      cut_master: cutMaster,
      srt,
      clips_zip: clipsZip,
      capcut_draft: {
        ...rawCapcut,
        available: capcutAvailable,
        reason: capcutReason,
      },
    };
  }, [projectId, result]);

  // URL phát video xem trước (`files.polished`, fallback sang `files.cut_master`)
  const [useFallbackCutMaster, setUseFallbackCutMaster] = useState<boolean>(false);

  useEffect(() => {
    setUseFallbackCutMaster(false);
  }, [resolvedFiles.polished, resolvedFiles.cut_master]);

  const previewStreamUrl = useMemo(() => {
    const primaryUrl = useFallbackCutMaster
      ? toInlineStreamUrl(resolvedFiles.cut_master)
      : toInlineStreamUrl(resolvedFiles.polished) ||
        toInlineStreamUrl(resolvedFiles.cut_master);
    if (!primaryUrl) return '';
    if (previewRevision <= 0) return primaryUrl;
    const sep = primaryUrl.includes('?') ? '&' : '?';
    return `${primaryUrl}${sep}rev=${previewRevision}`;
  }, [
    previewRevision,
    resolvedFiles.cut_master,
    resolvedFiles.polished,
    useFallbackCutMaster,
  ]);

  // Chuẩn hóa danh sách đối chiếu "So với video mẫu" (`result.style_match` / `result.style_match_report.items`)
  const styleMatchItems: VideoStudioStyleMatchItem[] = useMemo(() => {
    const directList = Array.isArray(result?.style_match) ? result.style_match : [];
    if (directList.length > 0) {
      return directList;
    }
    const reportItems = Array.isArray(result?.style_match_report?.items)
      ? result.style_match_report!.items
      : [];
    return reportItems;
  }, [result?.style_match, result?.style_match_report]);

  const hasSampleStyleSection = useMemo(
    () => Boolean(result?.style || styleMatchItems.length > 0),
    [result?.style, styleMatchItems.length]
  );

  const styleMatchSummaryBadge = useMemo(() => {
    const scoredItems = styleMatchItems.filter(
      (it) => it.status !== 'skipped' && it.severity !== 'informational'
    );
    const pool = scoredItems.length > 0 ? scoredItems : styleMatchItems;
    if (pool.length === 0) return null;
    const matchedCount = pool.filter((it) => it.within_tolerance).length;
    return `Đạt ${matchedCount}/${pool.length} chỉ số`;
  }, [styleMatchItems]);

  // Gom mọi cảnh báo vào một khối "Lưu ý" duy nhất (bao gồm cả cảnh báo từ video mẫu:
  // lệch tỉ lệ khung hình, video mẫu > 5 phút, không có lời nói, thiếu OCR/mô hình thị giác)
  const mergedWarnings: NormalizedWarningRow[] = useMemo(() => {
    const baseWarnings: ReadonlyArray<SimpleResultWarning | VideoStudioWarningItem> = Array.isArray(
      result?.warnings
    )
      ? result.warnings
      : [];
    const styleWarnings: ReadonlyArray<SimpleResultWarning | VideoStudioWarningItem> = Array.isArray(
      result?.style?.warnings
    )
      ? result.style.warnings
      : [];

    const combinedRaw = [...baseWarnings, ...styleWarnings];
    const rows: NormalizedWarningRow[] = [];
    const seenKeys = new Set<string>();

    combinedRaw.forEach((w, idx) => {
      if (!w || typeof w.message !== 'string' || !w.message.trim()) return;
      const code = String(w.code || 'notice').trim();
      const message = w.message.trim();
      const dedupeKey = `${code}::${message}`;
      if (seenKeys.has(dedupeKey)) return;
      seenKeys.add(dedupeKey);

      rows.push({
        id: `${code || 'warn'}_${idx}`,
        code,
        message,
        action: w.action ? String(w.action).trim() : undefined,
        timestampMs:
          typeof w.timestamp_ms === 'number' && Number.isFinite(w.timestamp_ms)
            ? w.timestamp_ms
            : undefined,
      });
    });

    if (
      localPromptWarning &&
      !rows.some(
        (r) =>
          r.code === localPromptWarning.code ||
          r.message === localPromptWarning.message
      )
    ) {
      rows.unshift({
        id: 'local_prompt_warning',
        code: localPromptWarning.code,
        message: localPromptWarning.message,
        action: localPromptWarning.action,
      });
    }

    return rows;
  }, [localPromptWarning, result?.style, result?.warnings]);

  // Tua trình phát video xem trước đến vị trí tương ứng
  const handleSeekPreview = useCallback(
    (
      targetTimeMs: number,
      meta?: {
        sourceStartMs: number;
        sourceEndMs: number;
        outputTimeMs: number;
        kind: 'kept' | 'cut';
        cut?: NormalizedCutEntry;
      }
    ) => {
      const safeMs = Math.max(0, Math.round(Number(targetTimeMs) || 0));
      const targetSeconds = safeMs / 1000;

      if (videoRef.current) {
        try {
          videoRef.current.currentTime = targetSeconds;
          videoRef.current.play().catch(() => {
            // Trình duyệt có thể chặn autoplay nếu chưa tương tác trực tiếp trên video
          });
        } catch {
          // Ignore seek error when media metadata is not yet loaded
        }
      }

      if (meta?.kind === 'cut' && meta.cut) {
        setSeekFeedbackLabel(
          `Đã tua trình xem trước đến điểm nối ${formatDurationClock(
            safeMs
          )} (chỗ cắt #${meta.cut.cutIndex}: ${formatDurationClock(
            meta.sourceStartMs
          )} – ${formatDurationClock(meta.sourceEndMs)}).`
        );
      } else {
        setSeekFeedbackLabel(
          `Đã tua trình xem trước đến mốc ${formatDurationClock(safeMs)}.`
        );
      }
    },
    []
  );

  // Chọn phương án mở đầu trong nhóm radio
  const handleRadioSelectHook = useCallback(
    (nextHookId: string) => {
      setSelectedHookId(nextHookId);
      setHookActionStatus('idle');
      onSelectHook?.(nextHookId);
    },
    [onSelectHook]
  );

  // Chọn tệp clip mở đầu riêng
  const handleCustomHookClipChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (!file) return;
      setCustomHookClipFile(file);
      setCustomHookClipName(file.name);
      setHookActionStatus('idle');
    },
    []
  );

  // Thực thi đổi phần mở đầu: "Dùng phần mở đầu này" -> "Đang đổi phần mở đầu..." -> "Đã đổi phần mở đầu"
  const handleApplyHookChange = useCallback(async () => {
    if (hookActionStatus === 'applying') return;

    setHookActionStatus('applying');
    setLocalPromptWarning(null);

    try {
      const trimmedPrompt = hookPromptText.trim();

      if (onApplyHook) {
        await onApplyHook({
          selectedHookId,
          hookPrompt: trimmedPrompt,
          customHookClipFile,
          customHookClipName: customHookClipName || null,
        });
      } else {
        // Đảm bảo trạng thái "Đang đổi phần mở đầu..." hiển thị rõ ràng trước khi hoàn tất
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      // Kiểm tra nếu người dùng nhập mô tả mở đầu hoàn toàn lệch từ khóa trong hooks hiện có
      if (trimmedPrompt.length > 0 && normalizedHooks.length > 0) {
        const corpus = normalizedHooks
          .map((h) => `${h.label} ${h.text}`.toLowerCase())
          .join(' ');
        const words = trimmedPrompt
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length >= 3);
        const hasAnyMatch =
          words.length === 0 || words.some((w) => corpus.includes(w));
        if (!hasAnyMatch) {
          setLocalPromptWarning(DEFAULT_PROMPT_MISMATCH_WARNING);
        }
      }

      // Cập nhật bản xem trước tại chỗ
      setPreviewRevision((prev) => prev + 1);
      if (videoRef.current) {
        try {
          videoRef.current.currentTime = 0;
        } catch {
          // Ignore if video is not ready
        }
      }
      setHookActionStatus('applied');
    } catch {
      setHookActionStatus('idle');
    }
  }, [
    customHookClipFile,
    customHookClipName,
    hookActionStatus,
    hookPromptText,
    normalizedHooks,
    onApplyHook,
    selectedHookId,
  ]);

  const hookButtonLabel =
    hookActionStatus === 'applying'
      ? 'Đang đổi phần mở đầu...'
      : hookActionStatus === 'applied'
      ? 'Đã đổi phần mở đầu'
      : 'Dùng phần mở đầu này';

  const handleCapcutDraftAction = useCallback(async () => {
    if (!resolvedFiles.capcut_draft.available) return;
    if (onOpenOrDownloadCapCutDraft) {
      await onOpenOrDownloadCapCutDraft();
    }
    setCapcutActionFeedback(
      resolvedFiles.capcut_draft.target_dir
        ? `Đã đồng bộ dự án vào thư mục CapCut (${resolvedFiles.capcut_draft.target_dir}).`
        : 'Đã sẵn sàng mở dự án trong CapCut trên máy.'
    );
  }, [onOpenOrDownloadCapCutDraft, resolvedFiles.capcut_draft]);

  return (
    <div data-testid="simple-result-state" className={`space-y-6 ${className}`}>
      {/* =======================================================================
          PHÍA TRÊN: Dòng tóm tắt + BẢN ĐỒ ĐOẠN CẮT (Yếu tố đáng nhớ duy nhất)
          ======================================================================= */}
      <CutMapTimeline
        result={result}
        selectedCutIndex={activeCutIndex}
        onSelectCutIndex={(idx, cut) => {
          setInternalCutIndex(idx);
          onSelectCutIndex?.(idx, cut);
        }}
        onSeekVideo={handleSeekPreview}
        showSummaryHeader={true}
        headerAction={
          onResetToPrepare ? (
            <button
              type="button"
              onClick={onResetToPrepare}
              className="px-4 min-h-[44px] rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[13px] leading-[20px] font-medium text-[#17231f] transition-colors"
            >
              Cắt video khác
            </button>
          ) : undefined
        }
      />

      {/* =======================================================================
          GIỮA: 2 CỘT TRÊN DESKTOP (7/12 Trình xem trước & Mở đầu | 5/12 Tải về)
          ======================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* CỘT TRÁI (7/12): Trình xem trước & Đổi phần mở đầu */}
        <section
          aria-label="Trình xem trước và đổi phần mở đầu"
          className="lg:col-span-7 bg-[#ffffff] border border-[#e9eeeb] rounded-[6px] p-4 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading font-bold text-[18px] leading-[26px] text-[#17231f]">
              Trình xem trước
            </h2>
            <span className="font-mono text-[12px] leading-[18px] tabular-nums text-[#4a5d54]">
              Thời lượng sau cắt: {formatDurationClock(result.out_duration_ms)}
            </span>
          </div>

          {/* Khung phát video xem trước (`files.polished`, fallback sang `files.cut_master`) */}
          <div className="rounded-[6px] overflow-hidden border border-[#d5e0d7] bg-[#17231f]">
            <video
              ref={videoRef}
              key={previewStreamUrl}
              src={previewStreamUrl}
              controls
              playsInline
              preload="metadata"
              onError={() => {
                if (!useFallbackCutMaster && resolvedFiles.cut_master) {
                  setUseFallbackCutMaster(true);
                }
              }}
              data-testid="result-preview-video"
              className="w-full aspect-video object-contain bg-[#17231f]"
            >
              Trình duyệt của bạn không hỗ trợ phát video.
            </video>
          </div>

          {seekFeedbackLabel && (
            <p
              role="status"
              aria-live="polite"
              className="text-[13px] leading-[20px] text-[#176b51] font-medium"
            >
              {seekFeedbackLabel}
            </p>
          )}

          <hr className="border-[#e9eeeb]" />

          {/* Khối Phần mở đầu (3 phương án radio có đoạn chữ + thời lượng) */}
          <div className="space-y-4">
            <div>
              <h3 className="font-heading font-semibold text-[15px] leading-[22px] text-[#17231f]">
                Phần mở đầu
              </h3>
              <p className="mt-0.5 text-[13px] leading-[20px] text-[#4a5d54]">
                Chọn 1 trong 3 gợi ý mở đầu dưới đây hoặc nhập mô tả / tải clip mở đầu riêng:
              </p>
            </div>

            {normalizedHooks.length > 0 && (
              <div
                role="radiogroup"
                aria-label="Chọn phương án mở đầu video"
                className="space-y-2.5"
              >
                {normalizedHooks.map((hook, idx) => {
                  const isChecked = selectedHookId === hook.id;
                  return (
                    <label
                      key={hook.id}
                      data-testid={`hook-radio-option-${idx + 1}`}
                      className={`block min-h-[44px] p-3.5 rounded-[6px] border cursor-pointer transition-colors select-none focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#176b51] ${
                        isChecked
                          ? 'border-[#176b51] bg-[#e9f4ef]/60'
                          : 'border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2.5 min-h-[28px]">
                          <input
                            type="radio"
                            name="result_hook_choice"
                            value={hook.id}
                            checked={isChecked}
                            onChange={() => handleRadioSelectHook(hook.id)}
                            className="sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className={`w-5 h-5 rounded-full border inline-flex items-center justify-center flex-none transition-colors ${
                              isChecked
                                ? 'border-[#176b51] bg-[#176b51]'
                                : 'border-[#4a5d54] bg-[#ffffff]'
                            }`}
                          >
                            {isChecked && (
                              <span className="w-2 h-2 rounded-full bg-[#ffffff]" />
                            )}
                          </span>
                          <span className="text-[15px] leading-[22px] font-semibold text-[#17231f]">
                            {idx + 1}. {hook.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-[4px] bg-[#f6f8f6] border border-[#d5e0d7] font-mono text-[12px] leading-[18px] tabular-nums text-[#4a5d54]">
                            {hook.durationSecLabel}
                          </span>
                        </div>

                        {isChecked && (
                          <span className="text-[12px] leading-[18px] font-medium text-[#176b51]">
                            Đang chọn
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 pl-7 text-[15px] leading-[24px] text-[#17231f] max-w-[68ch]">
                        “{hook.text}”
                      </p>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Ô nhập mô tả phần mở đầu mới & Nút tải clip mở đầu riêng ngay bên dưới */}
            <div className="pt-1 space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor={hookPromptInputId}
                  className="block text-[13px] leading-[20px] font-medium text-[#17231f]"
                >
                  Mô tả phần mở đầu mới (tùy chọn)
                </label>
                <input
                  id={hookPromptInputId}
                  type="text"
                  value={hookPromptText}
                  onChange={(e) => {
                    setHookPromptText(e.target.value);
                    if (hookActionStatus === 'applied') {
                      setHookActionStatus('idle');
                    }
                  }}
                  placeholder="Ví dụ: Mở đầu bằng câu hỏi về lỗi rè một bên hoặc thông số 68 độ C..."
                  className="w-full max-w-[68ch] min-h-[44px] px-3.5 rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] text-[15px] leading-[24px] text-[#17231f] placeholder:text-[#4a5d54]/70 focus:outline-none focus:border-[#176b51]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  id={hookClipInputId}
                  ref={hookClipFileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                  onChange={handleCustomHookClipChange}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => hookClipFileInputRef.current?.click()}
                  className="px-3.5 min-h-[44px] rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[13px] leading-[20px] font-medium text-[#17231f] transition-colors"
                >
                  Tải clip mở đầu riêng
                </button>

                {customHookClipName && (
                  <span className="inline-flex items-center gap-2 pl-3 pr-1 min-h-[44px] rounded-[6px] bg-[#f6f8f6] border border-[#d5e0d7] text-[13px] leading-[20px] text-[#17231f]">
                    <span className="font-mono text-[12px] leading-[18px] truncate max-w-[220px]">
                      {customHookClipName}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomHookClipFile(null);
                        setCustomHookClipName('');
                        setHookActionStatus('idle');
                        if (hookClipFileInputRef.current) {
                          hookClipFileInputRef.current.value = '';
                        }
                      }}
                      className="min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center rounded-[4px] text-[12px] leading-[18px] font-medium text-[#4a5d54] hover:text-[#17231f] hover:bg-[#e9eeeb]"
                      aria-label="Bỏ clip mở đầu riêng đã chọn"
                    >
                      Bỏ ×
                    </button>
                  </span>
                )}
              </div>
            </div>

            {/* Nút hành động giữ nguyên tên theo trạng thái:
                "Dùng phần mở đầu này" -> "Đang đổi phần mở đầu..." -> "Đã đổi phần mở đầu" */}
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="apply-hook-button"
                disabled={hookActionStatus === 'applying'}
                onClick={handleApplyHookChange}
                className={`px-4 min-h-[44px] rounded-[6px] border text-[13px] leading-[20px] font-medium transition-colors disabled:opacity-60 ${
                  hookActionStatus === 'applied'
                    ? 'border-[#176b51] bg-[#e9f4ef] text-[#176b51]'
                    : 'border-[#176b51] bg-[#176b51] hover:bg-[#10583f] text-[#ffffff]'
                }`}
              >
                {hookButtonLabel}
              </button>

              {hookActionStatus === 'applied' && (
                <span
                  role="status"
                  aria-live="polite"
                  className="text-[13px] leading-[20px] text-[#176b51]"
                >
                  Bản xem trước phía trên đã được cập nhật.
                </span>
              )}
            </div>
          </div>
        </section>

        {/* CỘT PHẢI (5/12): Tải về (Đúng 5 mục kèm 1 dòng giải thích bằng lời thường) */}
        <section
          aria-label="Tải về các tệp kết quả"
          className="lg:col-span-5 bg-[#ffffff] border border-[#e9eeeb] rounded-[6px] p-4 sm:p-6 space-y-4"
        >
          <div>
            <h2 className="font-heading font-bold text-[18px] leading-[26px] text-[#17231f]">
              Tải về
            </h2>
            <p className="mt-0.5 text-[13px] leading-[20px] text-[#4a5d54]">
              Chọn định dạng phù hợp để đăng ngay hoặc đưa vào CapCut chỉnh tiếp:
            </p>
          </div>

          <ul
            data-testid="download-items-list"
            className="divide-y divide-[#e9eeeb] border border-[#d5e0d7] rounded-[6px] bg-[#ffffff]"
          >
            {/* 1. Video hoàn thiện */}
            <li
              data-testid="download-item-polished"
              className="p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-[15px] leading-[22px] font-semibold text-[#17231f]">
                  Video hoàn thiện
                </p>
                <p className="text-[13px] leading-[20px] text-[#4a5d54]">
                  Đã có phụ đề, âm thanh chuẩn hóa
                </p>
              </div>
              <a
                href={toDownloadUrl(resolvedFiles.polished)}
                download
                className="px-3.5 min-h-[44px] inline-flex items-center justify-center rounded-[6px] bg-[#176b51] hover:bg-[#10583f] text-[#ffffff] text-[13px] leading-[20px] font-medium flex-none transition-colors"
              >
                Tải về
              </a>
            </li>

            {/* 2. Video đã cắt (chất lượng gốc) */}
            <li
              data-testid="download-item-cut-master"
              className="p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-[15px] leading-[22px] font-semibold text-[#17231f]">
                  Video đã cắt (chất lượng gốc)
                </p>
                <p className="text-[13px] leading-[20px] text-[#4a5d54]">
                  Dùng để dựng lại trong CapCut
                </p>
              </div>
              <a
                href={toDownloadUrl(resolvedFiles.cut_master)}
                download
                className="px-3.5 min-h-[44px] inline-flex items-center justify-center rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[#17231f] text-[13px] leading-[20px] font-medium flex-none transition-colors"
              >
                Tải về
              </a>
            </li>

            {/* 3. Phụ đề .srt */}
            <li
              data-testid="download-item-srt"
              className="p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-[15px] leading-[22px] font-semibold text-[#17231f]">
                  Phụ đề .srt
                </p>
                <p className="text-[13px] leading-[20px] text-[#4a5d54]">
                  File chữ chạy khớp thời gian đã cắt
                </p>
              </div>
              <a
                href={toDownloadUrl(resolvedFiles.srt)}
                download
                className="px-3.5 min-h-[44px] inline-flex items-center justify-center rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[#17231f] text-[13px] leading-[20px] font-medium flex-none transition-colors"
              >
                Tải về
              </a>
            </li>

            {/* 4. Các đoạn rời */}
            <li
              data-testid="download-item-clips-zip"
              className="p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-[15px] leading-[22px] font-semibold text-[#17231f]">
                  Các đoạn rời
                </p>
                <p className="text-[13px] leading-[20px] text-[#4a5d54]">
                  Gói các câu đã tách riêng (.zip)
                </p>
              </div>
              <a
                href={toDownloadUrl(resolvedFiles.clips_zip)}
                download
                className="px-3.5 min-h-[44px] inline-flex items-center justify-center rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[#17231f] text-[13px] leading-[20px] font-medium flex-none transition-colors"
              >
                Tải về
              </a>
            </li>

            {/* 5. Dự án CapCut (Tuyệt đối không ẩn đi khi available === false) */}
            <li
              data-testid="download-item-capcut-draft"
              className="p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[15px] leading-[22px] font-semibold text-[#17231f]">
                    Dự án CapCut
                  </p>
                  <p className="text-[13px] leading-[20px] text-[#4a5d54]">
                    Mở trực tiếp các đoạn cắt và phụ đề trong CapCut
                  </p>
                </div>

                {resolvedFiles.capcut_draft.available ? (
                  resolvedFiles.capcut_draft.url ? (
                    <a
                      href={toDownloadUrl(resolvedFiles.capcut_draft.url)}
                      download
                      onClick={() => void handleCapcutDraftAction()}
                      className="px-3.5 min-h-[44px] inline-flex items-center justify-center rounded-[6px] border border-[#176b51] bg-[#ffffff] hover:bg-[#e9f4ef] text-[#176b51] text-[13px] leading-[20px] font-medium flex-none transition-colors"
                    >
                      Tải dự án
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleCapcutDraftAction()}
                      className="px-3.5 min-h-[44px] inline-flex items-center justify-center rounded-[6px] border border-[#176b51] bg-[#ffffff] hover:bg-[#e9f4ef] text-[#176b51] text-[13px] leading-[20px] font-medium flex-none transition-colors"
                    >
                      Mở trong CapCut
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    data-testid="capcut-draft-disabled-button"
                    className="px-3.5 min-h-[44px] inline-flex items-center justify-center rounded-[6px] border border-[#d5e0d7] bg-[#f6f8f6] text-[#4a5d54] text-[13px] leading-[20px] font-medium flex-none opacity-65 cursor-not-allowed"
                  >
                    Không khả dụng
                  </button>
                )}
              </div>

              {!resolvedFiles.capcut_draft.available && (
                <p
                  data-testid="capcut-draft-disabled-reason"
                  className="p-3 rounded-[6px] bg-[#faf3e7] border border-[#e5d5b5] text-[13px] leading-[20px] text-[#8f5d14]"
                >
                  {resolvedFiles.capcut_draft.reason || DEFAULT_CAPCUT_UNAVAILABLE_REASON}
                </p>
              )}

              {resolvedFiles.capcut_draft.available && capcutActionFeedback && (
                <p
                  role="status"
                  className="text-[13px] leading-[20px] text-[#176b51] font-medium"
                >
                  {capcutActionFeedback}
                </p>
              )}
            </li>
          </ul>
        </section>
      </div>

      {/* =======================================================================
          PHÍA DƯỚI: Khối Lưu ý (chỉ hiện khi warnings.length > 0) + Danh sách chi tiết
          ======================================================================= */}

      {/* Khối Lưu ý duy nhất */}
      {mergedWarnings.length > 0 && (
        <section
          aria-label="Lưu ý"
          data-testid="result-warnings-box"
          className="bg-[#faf3e7] border border-[#e5d5b5] rounded-[6px] p-4 sm:p-5 space-y-3"
        >
          <h2 className="font-heading font-bold text-[15px] leading-[22px] text-[#8f5d14]">
            Lưu ý ({mergedWarnings.length})
          </h2>

          <ul className="space-y-2.5 divide-y divide-[#e5d5b5]/60">
            {mergedWarnings.map((warn, idx) => (
              <li
                key={warn.id}
                className={idx > 0 ? 'pt-2.5' : ''}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <p className="text-[15px] leading-[24px] text-[#17231f] max-w-[68ch]">
                    <span className="font-semibold text-[#8f5d14] mr-1.5" aria-hidden="true">
                      !
                    </span>
                    <span>{warn.message}</span>
                    {warn.action && warn.timestampMs === undefined && (
                      <span className="ml-1 font-medium text-[#8f5d14]">
                        {warn.action}
                      </span>
                    )}
                  </p>

                  {warn.action && warn.timestampMs !== undefined && (
                    <button
                      type="button"
                      onClick={() => handleSeekPreview(warn.timestampMs!)}
                      className="px-3.5 min-h-[44px] rounded-[6px] border border-[#d5c19a] bg-[#ffffff] hover:bg-[#f6f8f6] text-[13px] leading-[20px] font-medium text-[#8f5d14] flex-none self-start sm:self-center"
                    >
                      ▶ {warn.action}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mục thu gọn "So với video mẫu" (dạng danh sách dòng/thẻ, không dùng bảng nhiều cột) */}
      {hasSampleStyleSection && (
        <section
          aria-label="So với video mẫu"
          data-testid="style-match-section"
          className="bg-[#ffffff] border border-[#e9eeeb] rounded-[6px] p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              data-testid="toggle-style-match-button"
              aria-expanded={isStyleMatchExpanded}
              onClick={() => setIsStyleMatchExpanded((prev) => !prev)}
              className="min-h-[44px] px-3 rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[15px] leading-[22px] font-heading font-semibold text-[#17231f] inline-flex items-center gap-2 transition-colors text-left"
            >
              <span aria-hidden="true">{isStyleMatchExpanded ? '▾' : '▸'}</span>
              <span>
                So với video mẫu
                {result?.style?.name ? `: “${result.style.name}”` : ''}
                {result?.style?.filename ? ` (${result.style.filename})` : ''}
              </span>
            </button>

            {styleMatchSummaryBadge && (
              <span
                data-testid="style-match-summary-badge"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border border-[#176b51]/35 bg-[#e9f4ef] text-[12px] leading-[18px] font-medium text-[#176b51]"
              >
                <span aria-hidden="true">✓</span>
                <span>{styleMatchSummaryBadge}</span>
              </span>
            )}
          </div>

          {isStyleMatchExpanded && (
            <div
              data-testid="style-match-content"
              className="pt-3 border-t border-[#e9eeeb] space-y-3"
            >
              {result?.style_match_report?.summary && (
                <p className="text-[13px] leading-[20px] text-[#4a5d54]">
                  {result.style_match_report.summary}
                </p>
              )}

              {styleMatchItems.length > 0 ? (
                <ul
                  data-testid="style-match-items-list"
                  className="divide-y divide-[#e9eeeb] border border-[#d5e0d7] rounded-[6px] bg-[#ffffff]"
                >
                  {styleMatchItems.map((item, idx) => {
                    const isSkipped = item.status === 'skipped';
                    const isInformational =
                      item.severity === 'informational' || item.status === 'info';
                    const isMatched = Boolean(item.within_tolerance);

                    const statusBadgeLabel = isSkipped
                      ? '— Đã tắt'
                      : isInformational
                      ? isMatched
                        ? '✓ Đạt · Tham khảo'
                        : '! Lệch · Tham khảo'
                      : isMatched
                      ? '✓ Đạt'
                      : '! Lệch';

                    const statusBadgeClass = isSkipped
                      ? 'border-[#d5e0d7] bg-[#f6f8f6] text-[#4a5d54]'
                      : isMatched
                      ? 'border-[#176b51]/40 bg-[#e9f4ef] text-[#176b51]'
                      : 'border-[#d5c19a] bg-[#faf3e7] text-[#8f5d14]';

                    return (
                      <li
                        key={item.key || `style_match_${idx}`}
                        data-testid={`style-match-item-${item.key || idx}`}
                        className="p-3.5 sm:p-4 space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[15px] leading-[22px] font-semibold text-[#17231f]">
                            {item.label}
                          </span>
                          <span
                            data-testid={`style-match-status-${item.key || idx}`}
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-[4px] border text-[12px] leading-[18px] font-medium ${statusBadgeClass}`}
                          >
                            {statusBadgeLabel}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] leading-[20px] text-[#17231f]">
                          <span>
                            <span className="text-[#4a5d54]">Mẫu: </span>
                            <span className="font-mono text-[12px] leading-[18px] font-medium">
                              {String(item.sample_value)}
                            </span>
                          </span>
                          <span aria-hidden="true" className="text-[#4a5d54]">
                            →
                          </span>
                          <span>
                            <span className="text-[#4a5d54]">Video của bạn: </span>
                            <span className="font-mono text-[12px] leading-[18px] font-medium">
                              {String(item.output_value)}
                            </span>
                          </span>
                          {(item.deviation || item.tolerance) && (
                            <span className="text-[12px] leading-[18px] text-[#4a5d54] font-mono">
                              ({[item.deviation, item.tolerance ? `dung sai ${item.tolerance}` : '']
                                .filter(Boolean)
                                .join(' · ')})
                            </span>
                          )}
                        </div>

                        {item.note && (
                          <p className="text-[12px] leading-[18px] text-[#4a5d54] max-w-[68ch]">
                            {item.note}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[13px] leading-[20px] text-[#4a5d54]">
                  Đã áp dụng phong cách “{result?.style?.name || 'Video mẫu'}”.
                </p>
              )}

              <p className="text-[12px] leading-[18px] text-[#4a5d54]">
                {result?.style?.unsupported_notice ||
                  'Chưa áp dụng được: nhạc nền, hiệu ứng, màu phim'}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Danh sách chi tiết (`▸ Xem chi tiết các chỗ đã cắt`) */}
      <section
        aria-label="Chi tiết các chỗ đã cắt"
        className="bg-[#ffffff] border border-[#e9eeeb] rounded-[6px] p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            data-testid="toggle-cut-details-button"
            aria-expanded={isDetailsExpanded}
            onClick={() => setIsDetailsExpanded((prev) => !prev)}
            className="min-h-[44px] px-3 rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[15px] leading-[22px] font-heading font-semibold text-[#17231f] inline-flex items-center gap-2 transition-colors"
          >
            <span aria-hidden="true">{isDetailsExpanded ? '▾' : '▸'}</span>
            <span>
              Xem chi tiết các chỗ đã cắt ({normalizedCuts.length})
            </span>
          </button>
        </div>

        {isDetailsExpanded && (
          <div
            data-testid="cut-details-readonly-list"
            className="pt-2 border-t border-[#e9eeeb]"
          >
            {normalizedCuts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#e9eeeb] text-[13px] leading-[20px] font-medium text-[#4a5d54]">
                      <th className="py-2.5 pr-3">#</th>
                      <th className="py-2.5 px-3">Thời gian</th>
                      <th className="py-2.5 px-3">Thời lượng</th>
                      <th className="py-2.5 px-3">Loại</th>
                      <th className="py-2.5 pl-3">Lý do</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e9eeeb] text-[13px] leading-[20px]">
                    {normalizedCuts.map((cut, idx) => {
                      const isSelected = idx === activeCutIndex;
                      const cat = normalizeCutCategory(cut.type);
                      return (
                        <tr
                          key={cut.id}
                          onClick={() => {
                            setInternalCutIndex(idx);
                            onSelectCutIndex?.(idx, cut);
                            handleSeekPreview(cut.output_splice_ms, {
                              sourceStartMs: cut.src_start_ms,
                              sourceEndMs: cut.src_end_ms,
                              outputTimeMs: cut.output_splice_ms,
                              kind: 'cut',
                              cut,
                            });
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#e9f4ef]/60' : 'hover:bg-[#f6f8f6]'
                          }`}
                        >
                          <td className="py-3 pr-3 font-mono text-[12px] leading-[18px] tabular-nums text-[#4a5d54]">
                            {String(cut.cutIndex).padStart(2, '0')}
                          </td>
                          <td className="py-3 px-3 font-mono text-[12px] leading-[18px] tabular-nums text-[#17231f] whitespace-nowrap">
                            {formatDurationClockTenths(cut.src_start_ms)} –{' '}
                            {formatDurationClockTenths(cut.src_end_ms)}
                          </td>
                          <td className="py-3 px-3 font-mono text-[12px] leading-[18px] tabular-nums text-[#4a5d54] whitespace-nowrap">
                            {formatDurationSecondsLabel(cut.duration_ms, 'giây')}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              style={{
                                backgroundColor: '#efeae2',
                                backgroundImage:
                                  'repeating-linear-gradient(-45deg, #efeae2 0 6px, #cfc6b8 6px 8px)',
                              }}
                              className="px-2 py-0.5 rounded-[4px] border border-[#cfc6b8] font-mono text-[12px] leading-[18px] text-[#524a3e] font-medium"
                            >
                              {cat.badgeLabel}
                            </span>
                          </td>
                          <td className="py-3 pl-3 max-w-[68ch] text-[#17231f]">
                            <span>{cut.reason}</span>
                            {cut.removed_text && (
                              <span className="block text-[12px] leading-[18px] text-[#4a5d54] mt-0.5">
                                Đã bỏ: “{cut.removed_text}”
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-2 text-[15px] leading-[24px] text-[#4a5d54]">
                Không có đoạn cắt nào trong video này.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default SimpleResultState;
