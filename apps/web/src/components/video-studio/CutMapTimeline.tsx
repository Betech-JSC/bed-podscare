'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatDurationClock,
  formatDurationClockTenths,
  formatDurationSecondsLabel,
} from '@/src/lib/video-studio/formatters';
import type {
  CutItemType,
  SimpleCutItem,
  SimpleCutType,
  SimpleStudioResult,
  VideoStudioCutItem,
  VideoStudioJobResult,
} from '@/src/lib/video-studio/types';

export type CanonicalCutType = 'stumble' | 'silence' | 'retake' | 'filler';

export interface CutCategoryMeta {
  key: CanonicalCutType;
  symbol: string;
  labelVi: 'Vấp' | 'Im lặng' | 'Nói lại' | 'Từ đệm';
  shortLabelVi: 'vấp' | 'im lặng' | 'nói lại' | 'từ đệm';
  badgeLabel: string;
}

export const CUT_CATEGORY_META: Record<CanonicalCutType, CutCategoryMeta> = {
  stumble: {
    key: 'stumble',
    symbol: '×',
    labelVi: 'Vấp',
    shortLabelVi: 'vấp',
    badgeLabel: '× Vấp',
  },
  silence: {
    key: 'silence',
    symbol: '…',
    labelVi: 'Im lặng',
    shortLabelVi: 'im lặng',
    badgeLabel: '… Im lặng',
  },
  retake: {
    key: 'retake',
    symbol: '↺',
    labelVi: 'Nói lại',
    shortLabelVi: 'nói lại',
    badgeLabel: '↺ Nói lại',
  },
  filler: {
    key: 'filler',
    symbol: '~',
    labelVi: 'Từ đệm',
    shortLabelVi: 'từ đệm',
    badgeLabel: '~ Từ đệm',
  },
};

/**
 * Chuẩn hóa phân loại đoạn cắt về đúng 4 nhóm chuẩn:
 * - `stumble` → `Vấp` (`×`)
 * - `silence` → `Im lặng` (`…`)
 * - `retake`  → `Nói lại` (`↺`)
 * - `filler`  → `Từ đệm` (`~`)
 */
export function normalizeCutCategory(
  rawType?: CutItemType | SimpleCutType | string | null
): CutCategoryMeta {
  const normalized = String(rawType || '')
    .trim()
    .toLowerCase();

  if (
    normalized === 'stumble' ||
    normalized === 'stutter' ||
    normalized === 'hesitation' ||
    normalized === 'false_start' ||
    normalized.includes('vấp') ||
    normalized.includes('vap')
  ) {
    return CUT_CATEGORY_META.stumble;
  }

  if (
    normalized === 'retake' ||
    normalized === 'repeat' ||
    normalized === 'bad_take' ||
    normalized.includes('nói lại') ||
    normalized.includes('noi_lai')
  ) {
    return CUT_CATEGORY_META.retake;
  }

  if (
    normalized === 'filler' ||
    normalized === 'fluff' ||
    normalized.includes('từ đệm') ||
    normalized.includes('tu_dem')
  ) {
    return CUT_CATEGORY_META.filler;
  }

  return CUT_CATEGORY_META.silence;
}

export interface NormalizedCutEntry {
  id: string;
  cutIndex: number; // 1-based index
  src_start_ms: number;
  src_end_ms: number;
  duration_ms: number;
  output_splice_ms: number; // Vị trí tương ứng trên video đã cắt (sau khi trừ các đoạn cắt trước đó)
  type: CanonicalCutType;
  category: CutCategoryMeta;
  reason: string;
  removed_text?: string;
  isUltraShort: boolean; // < 450ms (ví dụ 200ms–400ms)
  raw: SimpleCutItem | VideoStudioCutItem;
}

export interface CutMapTimelineBlock {
  id: string;
  kind: 'kept' | 'cut';
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  output_start_ms: number;
  keptIndex?: number;
  cutEntry?: NormalizedCutEntry;
}

/**
 * Dựng danh sách các khối thời gian (`kept` xen kẽ `cut`) hoàn toàn từ `cuts` và `source_duration_ms`.
 * Xử lý chính xác các trường hợp biên:
 * 1. Đoạn cắt nằm sát đầu video (`0ms`)
 * 2. Đoạn cắt nằm ở giữa video
 * 3. Đoạn cắt nằm sát cuối video (`source_duration_ms`)
 * 4. Đoạn cắt rất ngắn (`200ms–400ms` trên video 2–3 phút)
 * 5. Không có đoạn cắt nào (`cuts.length === 0`)
 */
export function buildCutMapTimelineBlocks(
  sourceDurationMs: number,
  rawCuts: ReadonlyArray<SimpleCutItem | VideoStudioCutItem> = []
): {
  blocks: CutMapTimelineBlock[];
  normalizedCuts: NormalizedCutEntry[];
  totalRemovedMs: number;
  totalKeptMs: number;
  keptSegmentsCount: number;
} {
  const safeSourceMs = Math.max(0, Math.round(Number(sourceDurationMs) || 0));

  const validRawCuts = (rawCuts || [])
    .filter((c) => {
      if (!c || (c as SimpleCutItem).restored) return false;
      const s = Number(c.src_start_ms ?? (c as Record<string, unknown>).start_ms ?? 0);
      const e = Number(c.src_end_ms ?? (c as Record<string, unknown>).end_ms ?? 0);
      return Number.isFinite(s) && Number.isFinite(e) && e > s;
    })
    .slice()
    .sort((a, b) => {
      const aStart = Number(a.src_start_ms ?? (a as Record<string, unknown>).start_ms ?? 0);
      const bStart = Number(b.src_start_ms ?? (b as Record<string, unknown>).start_ms ?? 0);
      if (aStart !== bStart) return aStart - bStart;
      const aEnd = Number(a.src_end_ms ?? (a as Record<string, unknown>).end_ms ?? 0);
      const bEnd = Number(b.src_end_ms ?? (b as Record<string, unknown>).end_ms ?? 0);
      return aEnd - bEnd;
    });

  if (validRawCuts.length === 0 || safeSourceMs === 0) {
    const singleBlock: CutMapTimelineBlock = {
      id: 'kept_full_01',
      kind: 'kept',
      start_ms: 0,
      end_ms: safeSourceMs,
      duration_ms: safeSourceMs,
      output_start_ms: 0,
      keptIndex: 1,
    };
    return {
      blocks: [singleBlock],
      normalizedCuts: [],
      totalRemovedMs: 0,
      totalKeptMs: safeSourceMs,
      keptSegmentsCount: safeSourceMs > 0 ? 1 : 0,
    };
  }

  const blocks: CutMapTimelineBlock[] = [];
  const normalizedCuts: NormalizedCutEntry[] = [];
  let cursorMs = 0;
  let runningOutputMs = 0;
  let totalRemovedMs = 0;
  let keptCounter = 0;
  let cutCounter = 0;

  for (let i = 0; i < validRawCuts.length; i++) {
    const raw = validRawCuts[i];
    const rawStart = Number(raw.src_start_ms ?? (raw as Record<string, unknown>).start_ms ?? 0);
    const rawEnd = Number(raw.src_end_ms ?? (raw as Record<string, unknown>).end_ms ?? 0);

    const startMs = Math.max(cursorMs, Math.min(safeSourceMs, Math.round(rawStart)));
    const endMs = Math.max(startMs, Math.min(safeSourceMs, Math.round(rawEnd)));

    if (startMs > cursorMs) {
      keptCounter += 1;
      const keptDur = startMs - cursorMs;
      blocks.push({
        id: `kept_${keptCounter}`,
        kind: 'kept',
        start_ms: cursorMs,
        end_ms: startMs,
        duration_ms: keptDur,
        output_start_ms: runningOutputMs,
        keptIndex: keptCounter,
      });
      runningOutputMs += keptDur;
    }

    if (endMs > startMs) {
      cutCounter += 1;
      const cutDur = endMs - startMs;
      const category = normalizeCutCategory(raw.type);
      const removedTextRaw =
        (raw as SimpleCutItem).removed_text ??
        (raw as VideoStudioCutItem).text ??
        undefined;

      const entry: NormalizedCutEntry = {
        id: String(raw.id || `cut_${String(cutCounter).padStart(2, '0')}`),
        cutIndex: cutCounter,
        src_start_ms: startMs,
        src_end_ms: endMs,
        duration_ms: cutDur,
        output_splice_ms: runningOutputMs,
        type: category.key,
        category,
        reason: String(raw.reason || 'Đoạn vấp hoặc khoảng lặng đã được cắt tự động.'),
        removed_text: removedTextRaw ? String(removedTextRaw) : undefined,
        isUltraShort: cutDur <= 450,
        raw,
      };

      normalizedCuts.push(entry);
      blocks.push({
        id: entry.id,
        kind: 'cut',
        start_ms: startMs,
        end_ms: endMs,
        duration_ms: cutDur,
        output_start_ms: runningOutputMs,
        cutEntry: entry,
      });

      totalRemovedMs += cutDur;
      cursorMs = endMs;
    }
  }

  if (cursorMs < safeSourceMs) {
    keptCounter += 1;
    const tailDur = safeSourceMs - cursorMs;
    blocks.push({
      id: `kept_${keptCounter}`,
      kind: 'kept',
      start_ms: cursorMs,
      end_ms: safeSourceMs,
      duration_ms: tailDur,
      output_start_ms: runningOutputMs,
      keptIndex: keptCounter,
    });
    runningOutputMs += tailDur;
  }

  const totalKeptMs = Math.max(0, safeSourceMs - totalRemovedMs);

  return {
    blocks,
    normalizedCuts,
    totalRemovedMs,
    totalKeptMs,
    keptSegmentsCount: keptCounter,
  };
}

/**
 * Tạo chuỗi tóm tắt phía trên Bản đồ đoạn cắt đúng mẫu thiết kế:
 * - Khi có đoạn cắt: `"Đã cắt xong video · 2:14 → 1:48, đã cắt 26 giây ở 11 chỗ."`
 * - Khi 0 đoạn cắt: `"Đã kiểm tra xong video · Giữ nguyên 2:14, không có đoạn cần cắt."`
 */
export function buildCutMapSummaryText(params: {
  sourceDurationMs: number;
  cutsCount: number;
  keptDurationMs?: number;
  removedDurationMs?: number;
}): string {
  const { sourceDurationMs, cutsCount, keptDurationMs, removedDurationMs } = params;
  const srcClock = formatDurationClock(sourceDurationMs);

  if (cutsCount <= 0) {
    return `Đã kiểm tra xong video · Giữ nguyên ${srcClock}, không có đoạn cần cắt.`;
  }

  const resolvedRemovedMs =
    typeof removedDurationMs === 'number' && removedDurationMs >= 0
      ? removedDurationMs
      : Math.max(0, sourceDurationMs - (keptDurationMs ?? sourceDurationMs));
  const resolvedKeptMs =
    typeof keptDurationMs === 'number' && keptDurationMs >= 0
      ? keptDurationMs
      : Math.max(0, sourceDurationMs - resolvedRemovedMs);

  const keptClock = formatDurationClock(resolvedKeptMs);
  const removedLabel = formatDurationSecondsLabel(resolvedRemovedMs, 'giây');

  return `Đã cắt xong video · ${srcClock} → ${keptClock}, đã cắt ${removedLabel} ở ${cutsCount} chỗ.`;
}

export interface CutMapTimelineProps {
  /** Có thể truyền nguyên đối tượng `result` hoặc truyền từng trường rời bên dưới */
  result?:
    | SimpleStudioResult
    | VideoStudioJobResult
    | {
        source_duration_ms: number;
        kept_duration_ms?: number;
        out_duration_ms?: number;
        removed_duration_ms?: number;
        saved_duration_ms?: number;
        cuts: Array<SimpleCutItem | VideoStudioCutItem>;
        source_filename?: string;
        kept_segments_count?: number;
      }
    | null;
  cuts?: ReadonlyArray<SimpleCutItem | VideoStudioCutItem>;
  sourceDurationMs?: number;
  source_duration_ms?: number;
  keptDurationMs?: number;
  kept_duration_ms?: number;
  out_duration_ms?: number;
  removedDurationMs?: number;
  removed_duration_ms?: number;
  sourceFilename?: string;
  keptSegmentsCount?: number;
  /** Chỉ số đoạn cắt đang chọn (0-based) nếu muốn điều khiển từ bên ngoài */
  selectedCutIndex?: number;
  onSelectCutIndex?: (index: number, cut: NormalizedCutEntry) => void;
  /** Callback khi người dùng bấm vào một đoạn trên bản đồ để tua trình xem trước */
  onSeekVideo?: (
    targetTimeMs: number,
    meta?: {
      sourceStartMs: number;
      sourceEndMs: number;
      outputTimeMs: number;
      kind: 'kept' | 'cut';
      cut?: NormalizedCutEntry;
    }
  ) => void;
  /** Hiển thị dòng tóm tắt phía trên bản đồ (mặc định: true) */
  showSummaryHeader?: boolean;
  /** Nút hành động phụ đặt ngang hàng với dòng tóm tắt (ví dụ nút "Cắt video khác") */
  headerAction?: React.ReactNode;
  className?: string;
}

const CUT_HATCH_STYLE: React.CSSProperties = {
  backgroundColor: '#efeae2',
  backgroundImage:
    'repeating-linear-gradient(-45deg, #efeae2 0 6px, #cfc6b8 6px 8px)',
};

export function CutMapTimeline({
  result,
  cuts: cutsProp,
  sourceDurationMs: sourceDurationMsProp,
  source_duration_ms: sourceDurationMsSnake,
  keptDurationMs: keptDurationMsProp,
  kept_duration_ms: keptDurationMsSnake,
  out_duration_ms: outDurationMsSnake,
  removedDurationMs: removedDurationMsProp,
  removed_duration_ms: removedDurationMsSnake,
  sourceFilename: sourceFilenameProp,
  keptSegmentsCount: keptSegmentsCountProp,
  selectedCutIndex: controlledCutIndex,
  onSelectCutIndex,
  onSeekVideo,
  showSummaryHeader = true,
  headerAction,
  className = '',
}: CutMapTimelineProps) {
  const resolvedSourceDurationMs = useMemo(() => {
    const raw =
      sourceDurationMsProp ??
      sourceDurationMsSnake ??
      result?.source_duration_ms ??
      134000;
    return Math.max(0, Math.round(Number(raw) || 0));
  }, [result?.source_duration_ms, sourceDurationMsProp, sourceDurationMsSnake]);

  const resolvedRawCuts = useMemo(() => {
    if (Array.isArray(cutsProp)) return cutsProp;
    if (result && Array.isArray(result.cuts)) return result.cuts;
    return [];
  }, [cutsProp, result]);

  const {
    blocks,
    normalizedCuts,
    totalRemovedMs,
    totalKeptMs,
    keptSegmentsCount: computedKeptSegmentsCount,
  } = useMemo(
    () => buildCutMapTimelineBlocks(resolvedSourceDurationMs, resolvedRawCuts),
    [resolvedSourceDurationMs, resolvedRawCuts]
  );

  const resolvedRemovedDurationMs = useMemo(() => {
    const explicit =
      removedDurationMsProp ??
      removedDurationMsSnake ??
      (result as Record<string, unknown> | null | undefined)?.removed_duration_ms ??
      (result as Record<string, unknown> | null | undefined)?.saved_duration_ms;
    if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 0) {
      return Math.round(explicit);
    }
    return totalRemovedMs;
  }, [removedDurationMsProp, removedDurationMsSnake, result, totalRemovedMs]);

  const resolvedKeptDurationMs = useMemo(() => {
    if (normalizedCuts.length === 0) {
      return resolvedSourceDurationMs;
    }
    const explicit =
      keptDurationMsProp ??
      keptDurationMsSnake ??
      outDurationMsSnake ??
      (result as Record<string, unknown> | null | undefined)?.kept_duration_ms ??
      result?.out_duration_ms;
    if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 0) {
      return Math.round(explicit);
    }
    return totalKeptMs;
  }, [
    keptDurationMsProp,
    keptDurationMsSnake,
    normalizedCuts.length,
    outDurationMsSnake,
    resolvedSourceDurationMs,
    result,
    totalKeptMs,
  ]);

  const resolvedFilename =
    sourceFilenameProp ??
    (result as SimpleStudioResult | null | undefined)?.source_filename ??
    undefined;

  const resolvedKeptSegmentsCount =
    keptSegmentsCountProp ??
    (result as SimpleStudioResult | null | undefined)?.kept_segments_count ??
    computedKeptSegmentsCount;

  const [internalCutIndex, setInternalCutIndex] = useState<number>(0);
  const [mobileCompactMode, setMobileCompactMode] = useState<'timeline' | 'list'>('timeline');
  const cutButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Đồng bộ chỉ số đoạn cắt khi dữ liệu `cuts` thay đổi
  useEffect(() => {
    if (normalizedCuts.length === 0) {
      setInternalCutIndex(0);
      return;
    }
    setInternalCutIndex((prev) =>
      prev >= 0 && prev < normalizedCuts.length ? prev : 0
    );
  }, [normalizedCuts.length]);

  const activeCutIdx = useMemo(() => {
    if (normalizedCuts.length === 0) return -1;
    const candidate =
      typeof controlledCutIndex === 'number' ? controlledCutIndex : internalCutIndex;
    return Math.min(Math.max(0, candidate), normalizedCuts.length - 1);
  }, [controlledCutIndex, internalCutIndex, normalizedCuts.length]);

  const activeCut: NormalizedCutEntry | null =
    activeCutIdx >= 0 ? normalizedCuts[activeCutIdx] ?? null : null;

  const handleActivateCut = useCallback(
    (idx: number, shouldSeek: boolean) => {
      if (idx < 0 || idx >= normalizedCuts.length) return;
      const target = normalizedCuts[idx];
      setInternalCutIndex(idx);
      onSelectCutIndex?.(idx, target);
      if (shouldSeek && onSeekVideo) {
        onSeekVideo(target.output_splice_ms, {
          sourceStartMs: target.src_start_ms,
          sourceEndMs: target.src_end_ms,
          outputTimeMs: target.output_splice_ms,
          kind: 'cut',
          cut: target,
        });
      }
    },
    [normalizedCuts, onSeekVideo, onSelectCutIndex]
  );

  // Điều hướng bàn phím (ArrowLeft / ArrowRight / Home / End) trên dải đoạn cắt
  const handleCutKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      if (normalizedCuts.length === 0) return;

      let nextIdx: number | null = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIdx = (idx + 1) % normalizedCuts.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIdx = (idx - 1 + normalizedCuts.length) % normalizedCuts.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIdx = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIdx = normalizedCuts.length - 1;
      }

      if (nextIdx !== null) {
        handleActivateCut(nextIdx, false);
        const btn = cutButtonRefs.current[nextIdx];
        if (btn) {
          btn.focus();
        }
      }
    },
    [handleActivateCut, normalizedCuts.length]
  );

  const summaryText = useMemo(
    () =>
      buildCutMapSummaryText({
        sourceDurationMs: resolvedSourceDurationMs,
        cutsCount: normalizedCuts.length,
        keptDurationMs: resolvedKeptDurationMs,
        removedDurationMs: resolvedRemovedDurationMs,
      }),
    [
      normalizedCuts.length,
      resolvedKeptDurationMs,
      resolvedRemovedDurationMs,
      resolvedSourceDurationMs,
    ]
  );

  const quarterMarkers = useMemo(() => {
    const d = resolvedSourceDurationMs;
    if (d <= 0) return ['0:00', '0:00', '0:00'];
    return [
      '0:00',
      formatDurationClock(Math.round(d * 0.25)),
      formatDurationClock(Math.round(d * 0.5)),
      formatDurationClock(Math.round(d * 0.75)),
      formatDurationClock(d),
    ];
  }, [resolvedSourceDurationMs]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 1. Dòng tóm tắt kết quả phía trên (chỉ giữ duy nhất 1 dấu mũi tên `→` tại đây) */}
      {showSummaryHeader && (
        <div className="bg-[#ffffff] border border-[#e9eeeb] rounded-[6px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1
              data-testid="cut-map-summary-heading"
              className="font-heading font-bold text-[19px] sm:text-[22px] leading-[28px] sm:leading-[32px] text-[#17231f]"
            >
              {normalizedCuts.length > 0 ? (
                <>
                  <span>Đã cắt xong video · </span>
                  <span className="font-mono tabular-nums">
                    {formatDurationClock(resolvedSourceDurationMs)} →{' '}
                    {formatDurationClock(resolvedKeptDurationMs)}
                  </span>
                  <span>, đã cắt </span>
                  <span className="font-mono tabular-nums text-[#176b51]">
                    {formatDurationSecondsLabel(resolvedRemovedDurationMs, 'giây')}
                  </span>
                  <span> ở </span>
                  <span className="font-mono tabular-nums">
                    {normalizedCuts.length} chỗ
                  </span>
                  <span>.</span>
                </>
              ) : (
                <span>{summaryText}</span>
              )}
            </h1>

            {(resolvedFilename || resolvedKeptSegmentsCount > 0) && (
              <p className="text-[13px] leading-[20px] text-[#4a5d54]">
                {resolvedFilename && (
                  <>
                    Video:{' '}
                    <span className="font-mono text-[#17231f]">{resolvedFilename}</span>
                  </>
                )}
                {resolvedFilename && resolvedKeptSegmentsCount > 0 && ' · '}
                {normalizedCuts.length > 0
                  ? `Đã giữ lại ${resolvedKeptSegmentsCount} đoạn nói trôi chảy nhất`
                  : 'Toàn bộ âm thanh rõ chữ, nhịp nói tự nhiên'}
              </p>
            )}
          </div>

          {headerAction && <div className="flex-none">{headerAction}</div>}
        </div>
      )}

      {/* 2. Khung chính: BẢN ĐỒ ĐOẠN CẮT */}
      <section
        aria-label="Bản đồ đoạn cắt"
        className="bg-[#ffffff] border border-[#d5e0d7] rounded-[6px] p-4 sm:p-6 space-y-4"
      >
        {/* Tiêu đề khu vực & Chú giải */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="font-heading font-bold text-[18px] leading-[26px] text-[#17231f]">
              Bản đồ đoạn cắt
            </h2>
            <p className="text-[13px] leading-[20px] text-[#4a5d54]">
              Chạm, rê chuột hoặc dùng phím Tab / phím mũi tên để xem lý do từng chỗ đã cắt và bấm
              để tua trình xem trước.
            </p>
          </div>

          {/* Chú giải 2 trạng thái + 4 ký hiệu cắt (Không phụ thuộc màu sắc đơn thuần) */}
          <div
            aria-label="Chú giải ký hiệu bản đồ đoạn cắt"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] leading-[20px]"
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-4 h-3.5 rounded-[3px] bg-[#176b51] inline-block flex-none"
                aria-hidden="true"
              />
              <span className="text-[#17231f] font-medium">Giữ lại</span>
            </span>

            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span
                className="w-4 h-3.5 rounded-[3px] border border-[#cfc6b8] inline-block flex-none"
                style={CUT_HATCH_STYLE}
                aria-hidden="true"
              />
              <span className="text-[#524a3e] font-medium">Đã cắt:</span>
              <span className="font-mono text-[12px] leading-[18px] text-[#524a3e] bg-[#efeae2] border border-[#cfc6b8] px-1.5 py-0.5 rounded-[4px]">
                × Vấp
              </span>
              <span className="font-mono text-[12px] leading-[18px] text-[#524a3e] bg-[#efeae2] border border-[#cfc6b8] px-1.5 py-0.5 rounded-[4px]">
                … Im lặng
              </span>
              <span className="font-mono text-[12px] leading-[18px] text-[#524a3e] bg-[#efeae2] border border-[#cfc6b8] px-1.5 py-0.5 rounded-[4px]">
                ↺ Nói lại
              </span>
              <span className="font-mono text-[12px] leading-[18px] text-[#524a3e] bg-[#efeae2] border border-[#cfc6b8] px-1.5 py-0.5 rounded-[4px]">
                ~ Từ đệm
              </span>
            </span>
          </div>
        </div>

        {/* Chuyển đổi nhanh trên màn hình nhỏ (360px+) nếu có đoạn cắt */}
        {normalizedCuts.length > 0 && (
          <div className="flex sm:hidden items-center justify-between gap-2 pt-1">
            <span className="text-[12px] leading-[18px] text-[#4a5d54]">
              Vuốt ngang dải bản đồ hoặc đổi chế độ xem:
            </span>
            <div className="inline-flex rounded-[6px] border border-[#d5e0d7] bg-[#f6f8f6] p-0.5">
              <button
                type="button"
                onClick={() => setMobileCompactMode('timeline')}
                className={`px-2.5 min-h-[36px] rounded-[4px] text-[12px] leading-[18px] font-medium ${
                  mobileCompactMode === 'timeline'
                    ? 'bg-[#ffffff] text-[#176b51] border border-[#d5e0d7]'
                    : 'text-[#4a5d54]'
                }`}
              >
                Dải ngang
              </button>
              <button
                type="button"
                onClick={() => setMobileCompactMode('list')}
                className={`px-2.5 min-h-[36px] rounded-[4px] text-[12px] leading-[18px] font-medium ${
                  mobileCompactMode === 'list'
                    ? 'bg-[#ffffff] text-[#176b51] border border-[#d5e0d7]'
                    : 'text-[#4a5d54]'
                }`}
              >
                Danh sách ({normalizedCuts.length})
              </button>
            </div>
          </div>
        )}

        {/* Dải thời gian ngang (Cut Map Strip) */}
        <div
          className={`${
            mobileCompactMode === 'list' ? 'hidden sm:block' : 'block'
          } overflow-x-auto pb-2 scroll-smooth`}
        >
          <div
            style={{
              minWidth:
                blocks.length > 6
                  ? `${Math.max(560, blocks.length * 46)}px`
                  : '100%',
            }}
          >
            {/* Mốc thời gian định hướng đầu – giữa – cuối */}
            <div
              aria-hidden="true"
              className="flex items-center justify-between font-mono text-[12px] leading-[18px] tabular-nums text-[#4a5d54] mb-1.5 select-none"
            >
              {quarterMarkers.map((mark, idx) => (
                <span
                  key={idx}
                  className={
                    idx === 1 || idx === 3 ? 'hidden md:inline-block' : 'inline-block'
                  }
                >
                  {mark}
                </span>
              ))}
            </div>

            {/* Thanh bản đồ đoạn cắt */}
            <div
              role="group"
              aria-label="Dải thời gian video gốc và các đoạn đã cắt"
              data-testid="cut-map-strip"
              className="flex items-stretch w-full rounded-[6px] border border-[#d5e0d7] overflow-hidden bg-[#f6f8f6]"
            >
              {blocks.map((block) => {
                const rawPercent =
                  resolvedSourceDurationMs > 0
                    ? (block.duration_ms / resolvedSourceDurationMs) * 100
                    : 100;

                if (block.kind === 'kept') {
                  return (
                    <button
                      key={block.id}
                      type="button"
                      onClick={() =>
                        onSeekVideo?.(block.output_start_ms, {
                          sourceStartMs: block.start_ms,
                          sourceEndMs: block.end_ms,
                          outputTimeMs: block.output_start_ms,
                          kind: 'kept',
                        })
                      }
                      style={{
                        flexGrow: Math.max(1.5, rawPercent),
                        flexBasis: 0,
                        minWidth: blocks.length === 1 ? '100%' : '44px',
                      }}
                      className="min-h-[52px] px-2 py-1.5 bg-[#176b51] hover:bg-[#10583f] text-[#ffffff] border-r border-[#ffffff]/25 last:border-r-0 flex flex-col justify-center items-center text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffffff]"
                      title={`Giữ đoạn ${block.keptIndex}: ${formatDurationClock(
                        block.start_ms
                      )} – ${formatDurationClock(block.end_ms)} (${formatDurationSecondsLabel(
                        block.duration_ms,
                        'giây'
                      )})`}
                      aria-label={`Đoạn giữ lại ${block.keptIndex}: từ ${formatDurationClock(
                        block.start_ms
                      )} đến ${formatDurationClock(block.end_ms)}, thời lượng ${formatDurationSecondsLabel(
                        block.duration_ms,
                        'giây'
                      )}`}
                    >
                      <span className="text-[12px] leading-[18px] font-medium truncate max-w-full">
                        {blocks.length === 1
                          ? `Giữ nguyên toàn bộ (${formatDurationClock(block.end_ms)})`
                          : `Giữ #${block.keptIndex}`}
                      </span>
                      <span className="font-mono text-[12px] leading-[18px] tabular-nums opacity-95">
                        {formatDurationSecondsLabel(block.duration_ms, 's')}
                      </span>
                    </button>
                  );
                }

                const cut = block.cutEntry!;
                const zeroIdx = cut.cutIndex - 1;
                const isSelected = zeroIdx === activeCutIdx;
                // Đảm bảo đoạn rất ngắn (200ms–400ms) vẫn có trọng số hiển thị và min-width >= 48px
                const effectiveGrow = Math.max(1.25, rawPercent);

                return (
                  <button
                    key={block.id}
                    ref={(el) => {
                      cutButtonRefs.current[zeroIdx] = el;
                    }}
                    type="button"
                    data-testid={`cut-map-segment-${cut.cutIndex}`}
                    data-cut-type={cut.type}
                    data-ultra-short={cut.isUltraShort ? 'true' : 'false'}
                    aria-pressed={isSelected}
                    aria-label={`Chỗ cắt #${cut.cutIndex}: ${formatDurationClock(
                      cut.src_start_ms
                    )} – ${formatDurationClock(cut.src_end_ms)}, loại ${
                      cut.category.labelVi
                    }, lý do: ${cut.reason}`}
                    onClick={() => handleActivateCut(zeroIdx, true)}
                    onMouseEnter={() => handleActivateCut(zeroIdx, false)}
                    onFocus={() => handleActivateCut(zeroIdx, false)}
                    onKeyDown={(e) => handleCutKeyDown(e, zeroIdx)}
                    style={{
                      ...CUT_HATCH_STYLE,
                      flexGrow: effectiveGrow,
                      flexBasis: 0,
                      minWidth: '48px',
                    }}
                    className={`relative min-h-[52px] px-1.5 py-1.5 text-[#524a3e] border-r border-[#cfc6b8] last:border-r-0 flex flex-col justify-center items-center text-center transition-all focus:outline-none ${
                      isSelected
                        ? 'ring-2 ring-inset ring-[#17231f] font-semibold'
                        : 'hover:opacity-95 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#176b51]'
                    }`}
                    title={`${formatDurationClock(cut.src_start_ms)} – ${formatDurationClock(
                      cut.src_end_ms
                    )} · ${cut.category.badgeLabel}: ${cut.reason}`}
                  >
                    <span className="font-mono text-[12px] leading-[18px] tabular-nums font-semibold whitespace-nowrap">
                      {cut.category.symbol} {formatDurationSecondsLabel(cut.duration_ms, 's')}
                    </span>
                    <span className="text-[12px] leading-[18px] font-medium truncate max-w-full">
                      {cut.category.labelVi}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Chế độ danh sách gọn trên màn hình nhỏ (360px) khi người dùng bật "Danh sách" */}
        {normalizedCuts.length > 0 && mobileCompactMode === 'list' && (
          <div className="sm:hidden grid grid-cols-1 gap-2">
            {normalizedCuts.map((cut, idx) => {
              const isSelected = idx === activeCutIdx;
              return (
                <button
                  key={cut.id}
                  type="button"
                  onClick={() => handleActivateCut(idx, true)}
                  className={`w-full min-h-[48px] p-3 rounded-[6px] border text-left flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'border-[#17231f] bg-[#efeae2]'
                      : 'border-[#d5e0d7] bg-[#ffffff]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[12px] leading-[18px] tabular-nums font-semibold text-[#17231f]">
                      #{cut.cutIndex} · {formatDurationClock(cut.src_start_ms)} –{' '}
                      {formatDurationClock(cut.src_end_ms)} (
                      {formatDurationSecondsLabel(cut.duration_ms, 's')})
                    </div>
                    <div className="text-[13px] leading-[20px] text-[#4a5d54] truncate">
                      {cut.reason}
                    </div>
                  </div>
                  <span
                    style={CUT_HATCH_STYLE}
                    className="px-2 py-1 rounded-[4px] border border-[#cfc6b8] font-mono text-[12px] leading-[18px] text-[#524a3e] font-medium flex-none"
                  >
                    {cut.category.badgeLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Khung thông tin cố định ngay dưới bản đồ (Popover / Panel cố định) */}
        {activeCut ? (
          <div
            role="region"
            aria-live="polite"
            aria-label="Thông tin chi tiết đoạn đã cắt đang chọn"
            data-testid="cut-map-detail-panel"
            className="p-4 rounded-[6px] border border-[#d5e0d7] bg-[#f6f8f6] flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1.5 max-w-[68ch]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] leading-[20px] tabular-nums font-semibold text-[#17231f]">
                  Chỗ cắt #{activeCut.cutIndex}/{normalizedCuts.length}:{' '}
                  {formatDurationClock(activeCut.src_start_ms)} –{' '}
                  {formatDurationClock(activeCut.src_end_ms)}
                </span>
                <span className="font-mono text-[12px] leading-[18px] tabular-nums text-[#4a5d54]">
                  ({formatDurationClockTenths(activeCut.src_start_ms)} –{' '}
                  {formatDurationClockTenths(activeCut.src_end_ms)} ·{' '}
                  {formatDurationSecondsLabel(activeCut.duration_ms, 'giây')})
                </span>
                <span
                  style={CUT_HATCH_STYLE}
                  className="px-2 py-0.5 rounded-[4px] border border-[#cfc6b8] font-mono text-[12px] leading-[18px] text-[#524a3e] font-medium"
                >
                  Loại: {activeCut.category.badgeLabel}
                </span>
              </div>

              <p className="text-[13px] leading-[20px] text-[#17231f] font-medium">
                Lý do: “{activeCut.reason}”
              </p>

              {activeCut.removed_text && (
                <p className="text-[13px] leading-[20px] text-[#4a5d54]">
                  Nội dung đã bỏ: “{activeCut.removed_text}”
                </p>
              )}
            </div>

            {/* Cụm nút điều hướng nhanh Trước / Tiếp & Nghe tại vị trí cắt (vùng chạm >= 44px) */}
            <div className="flex flex-wrap items-center gap-2 flex-none">
              {normalizedCuts.length > 1 && (
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleActivateCut(
                        (activeCutIdx - 1 + normalizedCuts.length) % normalizedCuts.length,
                        false
                      )
                    }
                    className="px-3 min-h-[44px] rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[13px] leading-[20px] font-medium text-[#17231f]"
                    aria-label="Xem chỗ cắt trước đó"
                  >
                    ‹ Trước
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleActivateCut((activeCutIdx + 1) % normalizedCuts.length, false)
                    }
                    className="px-3 min-h-[44px] rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[13px] leading-[20px] font-medium text-[#17231f]"
                    aria-label="Xem chỗ cắt tiếp theo"
                  >
                    Tiếp ›
                  </button>
                </div>
              )}

              {onSeekVideo && (
                <button
                  type="button"
                  onClick={() => handleActivateCut(activeCutIdx, true)}
                  className="px-3.5 min-h-[44px] rounded-[6px] border border-[#176b51] bg-[#ffffff] hover:bg-[#e9f4ef] text-[13px] leading-[20px] font-medium text-[#176b51]"
                >
                  ▶ Xem tại điểm nối ({formatDurationClock(activeCut.output_splice_ms)})
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            data-testid="cut-map-zero-cuts-panel"
            className="p-4 rounded-[6px] border border-[#e9eeeb] bg-[#f6f8f6] text-[15px] leading-[24px] text-[#4a5d54]"
          >
            Đã kiểm tra toàn bộ {formatDurationClock(resolvedSourceDurationMs)} video gốc: không có
            chỗ nói vấp, khoảng lặng dài hay từ đệm cần cắt.
          </div>
        )}
      </section>
    </div>
  );
}

export default CutMapTimeline;
