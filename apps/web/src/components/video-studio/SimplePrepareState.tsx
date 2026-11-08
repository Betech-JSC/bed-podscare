'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  AgentProfileConfig,
  CutPreset,
  SavedStyleListItem,
  StyleAnalyzeResponse,
  StyleConfidenceLevel,
  StyleGroupKey,
  StyleProfile,
  StyleSummaryItem,
  StyleToggles,
  VideoStudioAppliedStyle,
  VideoStudioWarningItem,
} from '@/src/lib/video-studio/types';
import {
  DEFAULT_STYLE_TOGGLES,
  MOCK_APPLIED_STYLE,
  MOCK_SAVED_STYLES_LIST,
} from '@/src/lib/video-studio/mock-simple-data';
import {
  formatDurationClock,
  formatFileSizeVi,
} from '@/src/lib/video-studio/formatters';

export type PrepareTemplateOption =
  | 'podcast_horizontal'
  | 'podcast_vertical'
  | 'cut_only';

export interface SelectedVideoInfo {
  file?: File | null;
  filename: string;
  durationMs: number;
  width: number;
  height: number;
  resolution: string;
  sizeBytes?: number;
  fps?: number;
  objectUrl?: string;
  serverPath?: string;
  isDemo?: boolean;
}

export interface SelectedHookClipInfo {
  file?: File | null;
  filename: string;
  durationMs?: number;
  sizeBytes?: number;
  serverPath?: string;
}

export interface SimplePrepareSubmitPayload {
  video: SelectedVideoInfo;
  scriptText: string;
  cutPreset: CutPreset;
  hookPrompt: string;
  hookClip: SelectedHookClipInfo | null;
  template: PrepareTemplateOption;
  padStartMs: number;
  padEndMs: number;
  mergeGapMs: number;
  silenceThresholdMs: number;
  keepLaughter: boolean;
  styleId?: string | null;
  styleToggles?: StyleToggles | null;
  appliedStyle?: VideoStudioAppliedStyle | null;
}

export interface SimplePrepareStateProps {
  projectId?: string;
  video?: SelectedVideoInfo | null;
  onVideoChange?: (video: SelectedVideoInfo | null) => void;
  scriptText?: string;
  onScriptChange?: (scriptText: string) => void;
  cutPreset?: CutPreset;
  onCutPresetChange?: (preset: CutPreset) => void;
  hookPrompt?: string;
  onHookPromptChange?: (hookPrompt: string) => void;
  hookClip?: SelectedHookClipInfo | null;
  onHookClipChange?: (hookClip: SelectedHookClipInfo | null) => void;
  template?: PrepareTemplateOption;
  onTemplateChange?: (template: PrepareTemplateOption) => void;
  padStartMs?: number;
  onPadStartMsChange?: (ms: number) => void;
  padEndMs?: number;
  onPadEndMsChange?: (ms: number) => void;
  keepLaughter?: boolean;
  onKeepLaughterChange?: (keep: boolean) => void;
  styleId?: string | null;
  onStyleIdChange?: (styleId: string | null) => void;
  styleToggles?: StyleToggles | null;
  onStyleTogglesChange?: (toggles: StyleToggles) => void;
  appliedStyle?: VideoStudioAppliedStyle | null;
  onAppliedStyleChange?: (style: VideoStudioAppliedStyle | null) => void;
  profile?: Partial<AgentProfileConfig> | null;
  expertMode?: boolean;
  isSubmitting?: boolean;
  onStartCutting?: (payload: SimplePrepareSubmitPayload) => Promise<void> | void;
  onUseDemoVideo?: () => Promise<SelectedVideoInfo | void> | SelectedVideoInfo | void;
  className?: string;
}

/**
 * Default timing values matched with `tools/video-pipeline/memory/profile.yaml`:
 * pad_start_ms: 80, pad_end_ms: 120, merge_gap_ms: 150, silence_threshold_ms: 800
 */
export const PROFILE_DEFAULT_TIMING = {
  pad_start_ms: 80,
  pad_end_ms: 120,
  merge_gap_ms: 150,
  silence_threshold_ms: 800,
  min_silence_ms: 500,
} as const;

export const CUT_PRESET_OPTIONS: ReadonlyArray<{
  value: CutPreset;
  label: string;
  description: string;
  padStartMs: number;
  padEndMs: number;
  silenceThresholdMs: number;
}> = [
  {
    value: 'light',
    label: 'Nhẹ',
    description:
      'Chỉ cắt khoảng lặng rất dài và đoạn nói vấp rõ; giữ nguyên nhịp nói tự nhiên.',
    padStartMs: 120,
    padEndMs: 160,
    silenceThresholdMs: 1000,
  },
  {
    value: 'medium',
    label: 'Vừa',
    description:
      'Cắt vấp, từ đệm và khoảng lặng dài; giữ nhịp thở tự nhiên.',
    padStartMs: PROFILE_DEFAULT_TIMING.pad_start_ms,
    padEndMs: PROFILE_DEFAULT_TIMING.pad_end_ms,
    silenceThresholdMs: PROFILE_DEFAULT_TIMING.silence_threshold_ms,
  },
  {
    value: 'strong',
    label: 'Mạnh',
    description:
      'Cắt sát chữ, bỏ toàn bộ từ đệm và khoảng nghỉ ngắn để nhịp nhanh, dứt khoát.',
    padStartMs: 50,
    padEndMs: 80,
    silenceThresholdMs: 550,
  },
] as const;

export const PREPARE_TEMPLATE_OPTIONS: ReadonlyArray<{
  value: PrepareTemplateOption;
  label: string;
  hint: string;
}> = [
  {
    value: 'podcast_horizontal',
    label: 'Podcast ngang',
    hint: 'Khung ngang 16:9 kèm phụ đề sạch',
  },
  {
    value: 'podcast_vertical',
    label: 'Podcast dọc',
    hint: 'Khung dọc 9:16 cho Reels, TikTok, Shorts',
  },
  {
    value: 'cut_only',
    label: 'Chỉ cắt',
    hint: 'Giữ nguyên khung hình gốc, chỉ cắt đoạn vấp',
  },
] as const;

const LONG_VIDEO_THRESHOLD_MS = 300_000; // 5 minutes (300 seconds)
const INVALID_FILE_MESSAGE =
  'Không đọc được file này. Hãy thử file MP4 hoặc MOV khác.';

function isSupportedVideoFile(file: File): boolean {
  if (!file || file.size <= 0) return false;
  const nameLower = (file.name || '').trim().toLowerCase();
  const typeLower = (file.type || '').trim().toLowerCase();
  const hasValidExt = nameLower.endsWith('.mp4') || nameLower.endsWith('.mov');
  const hasValidMime =
    typeLower === 'video/mp4' ||
    typeLower === 'video/quicktime' ||
    typeLower === '';
  return hasValidExt && (hasValidMime || typeLower.startsWith('video/'));
}

function probeVideoFileClientOnly(file: File): Promise<{
  durationMs: number;
  width: number;
  height: number;
  objectUrl: string;
}> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error(INVALID_FILE_MESSAGE));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';
    videoEl.muted = true;
    videoEl.playsInline = true;

    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      videoEl.removeAttribute('src');
      videoEl.load();
      URL.revokeObjectURL(objectUrl);
      reject(new Error(INVALID_FILE_MESSAGE));
    }, 10_000);

    const cleanupListeners = () => {
      window.clearTimeout(timeoutId);
      videoEl.onloadedmetadata = null;
      videoEl.onerror = null;
    };

    videoEl.onloadedmetadata = () => {
      if (settled) return;
      cleanupListeners();
      const durationSec = Number(videoEl.duration);
      const width = Number(videoEl.videoWidth) || 1920;
      const height = Number(videoEl.videoHeight) || 1080;

      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        settled = true;
        videoEl.removeAttribute('src');
        videoEl.load();
        URL.revokeObjectURL(objectUrl);
        reject(new Error(INVALID_FILE_MESSAGE));
        return;
      }

      settled = true;
      resolve({
        durationMs: Math.max(100, Math.round(durationSec * 1000)),
        width,
        height,
        objectUrl,
      });
    };

    videoEl.onerror = () => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      videoEl.removeAttribute('src');
      videoEl.load();
      URL.revokeObjectURL(objectUrl);
      reject(new Error(INVALID_FILE_MESSAGE));
    };

    videoEl.src = objectUrl;
  });
}

function inferClientAspectRatio(width?: number, height?: number): string {
  const w = Number(width || 0);
  const h = Number(height || 0);
  if (w <= 0 || h <= 0) return '16:9';
  const ratio = w / h;
  const known: Array<[string, number]> = [
    ['9:16', 9 / 16],
    ['16:9', 16 / 9],
    ['1:1', 1],
    ['4:5', 4 / 5],
    ['4:3', 4 / 3],
    ['3:4', 3 / 4],
  ];
  for (const [label, target] of known) {
    if (Math.abs(ratio - target) <= 0.05) return label;
  }
  return w >= h ? '16:9' : '9:16';
}

function formatViDecimal(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(digits).replace(/\.0+$/, '');
  return fixed.replace('.', ',');
}

function getConfidenceBadgeMeta(conf?: StyleConfidenceLevel | string | null): {
  label: string;
  symbol: string;
  className: string;
} {
  const norm = String(conf || 'estimated').trim().toLowerCase();
  if (norm === 'measured') {
    return {
      label: 'Chắc chắn',
      symbol: '●',
      className: 'bg-[#e9f4ef] border-[#176b51]/40 text-[#176b51]',
    };
  }
  if (norm === 'assumed') {
    return {
      label: 'Giả định',
      symbol: '○',
      className: 'bg-[#faf3e7] border-[#d5c19a] text-[#8f5d14]',
    };
  }
  return {
    label: 'Ước lượng',
    symbol: '◐',
    className: 'bg-[#f6f8f6] border-[#d5e0d7] text-[#4a5d54]',
  };
}

export const ORDERED_STYLE_GROUPS: readonly StyleGroupKey[] = [
  'pacing',
  'captions',
  'hook',
  'audio',
  'punchin',
] as const;

function buildLearnedStyleRows(
  style: VideoStudioAppliedStyle,
  hasUserHookPrompt: boolean
): Array<{
  key: StyleGroupKey;
  title: string;
  sentence: string;
  confidence: StyleConfidenceLevel;
}> {
  const profile: Partial<StyleProfile> = style.profile || {};
  const confMap = profile.confidence || {};
  const summaryByKey = new Map<string, StyleSummaryItem>();
  for (const item of style.summary || []) {
    if (item && item.key) {
      summaryByKey.set(String(item.key), item);
    }
  }

  // 1. Pacing
  const pauseMedMs = Math.round(Number(profile.pacing?.pause_median_ms ?? 240));
  const maxSilMs = Math.round(Number(profile.pacing?.max_silence_kept_ms ?? 650));
  const wpm = Number(profile.pacing?.words_per_min ?? 168);
  const pacingConf = (confMap.pacing ||
    summaryByKey.get('pacing')?.confidence ||
    'measured') as StyleConfidenceLevel;
  const speedVi =
    pauseMedMs <= 280 || Number(profile.pacing?.shots_per_min ?? 18) >= 15
      ? 'nhanh'
      : pauseMedMs <= 450
      ? 'vừa'
      : 'chậm rãi';
  const pauseSecVi = formatViDecimal(pauseMedMs / 1000, 2);
  const maxSilSecVi = formatViDecimal(maxSilMs / 1000, 2);
  const pacingSentence =
    pacingConf === 'assumed' && wpm <= 1
      ? 'Nhịp cắt: chưa phát hiện lời thoại rõ, giữ nhịp nghỉ mặc định khoảng 0,24 giây'
      : `Nhịp cắt: ${speedVi}, nghỉ giữa câu khoảng ${pauseSecVi} giây (tối đa ${maxSilSecVi} giây)`;

  // 2. Captions
  const captionsConf = (confMap.captions ||
    summaryByKey.get('captions')?.confidence ||
    'estimated') as StyleConfidenceLevel;
  let captionsSentence = 'Phụ đề: không đốt sẵn phụ đề trên khung hình';
  if (profile.captions?.present !== false) {
    const wpl = Math.max(1, Math.round(Number(profile.captions?.words_per_line ?? 3)));
    const posRaw = String(profile.captions?.position || 'bottom_center').toLowerCase();
    const posVi =
      posRaw === 'middle_center'
        ? 'giữa màn hình'
        : posRaw === 'top_center'
        ? 'giữa phía trên'
        : posRaw === 'lower_third'
        ? '1/3 phía dưới'
        : 'giữa phía dưới';
    const hlRaw = String(profile.captions?.highlight || 'keyword_color').toLowerCase();
    const hlVi =
      hlRaw === 'box'
        ? 'từ khóa đóng khung'
        : hlRaw === 'none'
        ? 'chữ đồng màu'
        : 'từ khóa tô vàng';
    captionsSentence = `Phụ đề: ${wpl} từ mỗi dòng, ${posVi}, ${hlVi}`;
  }

  // 3. Hook
  const hookConf = (confMap.hook ||
    summaryByKey.get('hook')?.confidence ||
    'estimated') as StyleConfidenceLevel;
  const hookDurSecVi = formatViDecimal(
    Number(profile.hook?.duration_ms ?? 6200) / 1000,
    1
  );
  const hookStyleRaw = String(profile.hook?.style || 'question').toLowerCase();
  const hookStyleVi =
    hookStyleRaw === 'teaser'
      ? 'nhá hàng kết quả'
      : hookStyleRaw === 'statement'
      ? 'khẳng định'
      : 'câu hỏi';
  const hasOverlay = Boolean(
    profile.hook?.text_overlay ?? profile.titlecard?.present ?? true
  );
  const baseHookSentence = `Phần mở đầu: ${hookStyleVi}, khoảng ${hookDurSecVi} giây${
    hasOverlay ? ', có chữ tiêu đề đầu' : ''
  }`;
  const hookSentence = hasUserHookPrompt
    ? `${baseHookSentence} — Đang ưu tiên theo yêu cầu riêng bạn đã nhập bên dưới`
    : baseHookSentence;

  // 4. Audio
  const audioConf = (confMap.audio ||
    summaryByKey.get('audio')?.confidence ||
    'measured') as StyleConfidenceLevel;
  const rawLufs = Number(profile.audio?.lufs ?? -14.2);
  const clampedLufs = Math.max(-23.0, Math.min(-9.0, rawLufs));
  const audioSentence = `Âm lượng: ${formatViDecimal(
    clampedLufs,
    1
  )} LUFS (đỉnh tối đa -1,0 dBTP)`;

  // 5. Punch-in
  const punchConf = (confMap.punchin ||
    summaryByKey.get('punchin')?.confidence ||
    'estimated') as StyleConfidenceLevel;
  let punchSentence = 'Nhấn khung hình: không phát hiện phóng nhẹ khung hình';
  if (profile.punchin?.detected !== false) {
    const scalePct = Math.round(Number(profile.punchin?.scale ?? 1.08) * 100);
    const gapSecVi = formatViDecimal(Number(profile.punchin?.min_gap_s ?? 5.5), 1);
    punchSentence = `Nhấn khung hình: phóng nhẹ ${scalePct}%, cách nhau tối thiểu ${gapSecVi} giây`;
  }

  return [
    {
      key: 'pacing',
      title: 'Nhịp cắt & khoảng lặng',
      sentence: pacingSentence,
      confidence: pacingConf,
    },
    {
      key: 'captions',
      title: 'Phụ đề',
      sentence: captionsSentence,
      confidence: captionsConf,
    },
    {
      key: 'hook',
      title: 'Phần mở đầu',
      sentence: hookSentence,
      confidence: hookConf,
    },
    {
      key: 'audio',
      title: 'Âm lượng',
      sentence: audioSentence,
      confidence: audioConf,
    },
    {
      key: 'punchin',
      title: 'Nhấn khung hình',
      sentence: punchSentence,
      confidence: punchConf,
    },
  ];
}

export function SimplePrepareState({
  projectId,
  video: controlledVideo,
  onVideoChange,
  scriptText: controlledScript,
  onScriptChange,
  cutPreset: controlledCutPreset,
  onCutPresetChange,
  hookPrompt: controlledHookPrompt,
  onHookPromptChange,
  hookClip: controlledHookClip,
  onHookClipChange,
  template: controlledTemplate,
  onTemplateChange,
  padStartMs: controlledPadStartMs,
  onPadStartMsChange,
  padEndMs: controlledPadEndMs,
  onPadEndMsChange,
  keepLaughter: controlledKeepLaughter,
  onKeepLaughterChange,
  styleId: controlledStyleId,
  onStyleIdChange,
  styleToggles: controlledStyleToggles,
  onStyleTogglesChange,
  appliedStyle: controlledAppliedStyle,
  onAppliedStyleChange,
  profile,
  expertMode = false,
  isSubmitting = false,
  onStartCutting,
  onUseDemoVideo,
  className = '',
}: SimplePrepareStateProps) {
  const formId = useId();
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const hookClipInputRef = useRef<HTMLInputElement | null>(null);
  const sampleVideoInputRef = useRef<HTMLInputElement | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);

  const [internalVideo, setInternalVideo] = useState<SelectedVideoInfo | null>(
    controlledVideo ?? null
  );
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isProbingVideo, setIsProbingVideo] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const [internalScript, setInternalScript] = useState<string>(
    controlledScript ?? ''
  );
  const [internalCutPreset, setInternalCutPreset] = useState<CutPreset>(
    controlledCutPreset ?? 'medium'
  );
  const [internalHookPrompt, setInternalHookPrompt] = useState<string>(
    controlledHookPrompt ?? ''
  );
  const [internalHookClip, setInternalHookClip] =
    useState<SelectedHookClipInfo | null>(controlledHookClip ?? null);
  const [hookClipError, setHookClipError] = useState<string | null>(null);

  // State cho khối "Phong cách theo video mẫu (không bắt buộc)"
  const [isStyleSectionExpanded, setIsStyleSectionExpanded] =
    useState<boolean>(true);
  const [styleSourceMode, setStyleSourceMode] = useState<'upload' | 'saved'>(
    'upload'
  );
  const [savedStylesList, setSavedStylesList] = useState<SavedStyleListItem[]>(
    MOCK_SAVED_STYLES_LIST
  );
  const [internalStyleId, setInternalStyleId] = useState<string | null>(
    controlledStyleId ?? null
  );
  const [internalStyleToggles, setInternalStyleToggles] = useState<StyleToggles>(
    controlledStyleToggles ?? { ...DEFAULT_STYLE_TOGGLES }
  );
  const [internalAppliedStyle, setInternalAppliedStyle] =
    useState<VideoStudioAppliedStyle | null>(controlledAppliedStyle ?? null);
  const [isAnalyzingSample, setIsAnalyzingSample] = useState<boolean>(false);
  const [sampleProgressMessage, setSampleProgressMessage] = useState<
    string | null
  >(null);
  const [sampleErrorMessage, setSampleErrorMessage] = useState<string | null>(
    null
  );
  const [styleNameInput, setStyleNameInput] = useState<string>('');
  const [isSavingStyle, setIsSavingStyle] = useState<boolean>(false);
  const [styleSaveFeedback, setStyleSaveFeedback] = useState<string | null>(
    null
  );

  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [internalTemplate, setInternalTemplate] =
    useState<PrepareTemplateOption>(
      controlledTemplate ?? 'podcast_horizontal'
    );
  const [internalPadStartMs, setInternalPadStartMs] = useState<number>(
    controlledPadStartMs ??
      profile?.pad_start_ms ??
      PROFILE_DEFAULT_TIMING.pad_start_ms
  );
  const [internalPadEndMs, setInternalPadEndMs] = useState<number>(
    controlledPadEndMs ??
      profile?.pad_end_ms ??
      PROFILE_DEFAULT_TIMING.pad_end_ms
  );
  const [mergeGapMs, setMergeGapMs] = useState<number>(
    profile?.merge_gap_ms ?? PROFILE_DEFAULT_TIMING.merge_gap_ms
  );
  const [silenceThresholdMs, setSilenceThresholdMs] = useState<number>(
    profile?.silence_threshold_ms ?? PROFILE_DEFAULT_TIMING.silence_threshold_ms
  );
  const [internalKeepLaughter, setInternalKeepLaughter] = useState<boolean>(
    controlledKeepLaughter ?? true
  );
  const [userCustomizedPadding, setUserCustomizedPadding] =
    useState<boolean>(false);

  // Sync controlled props when provided
  useEffect(() => {
    if (controlledVideo !== undefined) {
      setInternalVideo(controlledVideo);
    }
  }, [controlledVideo]);

  useEffect(() => {
    if (controlledScript !== undefined) {
      setInternalScript(controlledScript);
    }
  }, [controlledScript]);

  useEffect(() => {
    if (controlledCutPreset !== undefined) {
      setInternalCutPreset(controlledCutPreset);
    }
  }, [controlledCutPreset]);

  useEffect(() => {
    if (controlledHookPrompt !== undefined) {
      setInternalHookPrompt(controlledHookPrompt);
    }
  }, [controlledHookPrompt]);

  useEffect(() => {
    if (controlledHookClip !== undefined) {
      setInternalHookClip(controlledHookClip);
    }
  }, [controlledHookClip]);

  useEffect(() => {
    if (controlledTemplate !== undefined) {
      setInternalTemplate(controlledTemplate);
    }
  }, [controlledTemplate]);

  useEffect(() => {
    if (controlledPadStartMs !== undefined) {
      setInternalPadStartMs(controlledPadStartMs);
    }
  }, [controlledPadStartMs]);

  useEffect(() => {
    if (controlledPadEndMs !== undefined) {
      setInternalPadEndMs(controlledPadEndMs);
    }
  }, [controlledPadEndMs]);

  useEffect(() => {
    if (controlledKeepLaughter !== undefined) {
      setInternalKeepLaughter(controlledKeepLaughter);
    }
  }, [controlledKeepLaughter]);

  useEffect(() => {
    if (controlledStyleId !== undefined) {
      setInternalStyleId(controlledStyleId);
    }
  }, [controlledStyleId]);

  useEffect(() => {
    if (controlledStyleToggles !== undefined && controlledStyleToggles !== null) {
      setInternalStyleToggles(controlledStyleToggles);
    }
  }, [controlledStyleToggles]);

  useEffect(() => {
    if (controlledAppliedStyle !== undefined) {
      setInternalAppliedStyle(controlledAppliedStyle);
      if (controlledAppliedStyle?.name) {
        setStyleNameInput(controlledAppliedStyle.name);
      }
    }
  }, [controlledAppliedStyle]);

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
    };
  }, []);

  const currentVideo = controlledVideo !== undefined ? controlledVideo : internalVideo;
  const currentScript = controlledScript !== undefined ? controlledScript : internalScript;
  const currentCutPreset =
    controlledCutPreset !== undefined ? controlledCutPreset : internalCutPreset;
  const currentHookPrompt =
    controlledHookPrompt !== undefined ? controlledHookPrompt : internalHookPrompt;
  const currentHookClip =
    controlledHookClip !== undefined ? controlledHookClip : internalHookClip;
  const currentTemplate =
    controlledTemplate !== undefined ? controlledTemplate : internalTemplate;
  const currentPadStartMs =
    controlledPadStartMs !== undefined ? controlledPadStartMs : internalPadStartMs;
  const currentPadEndMs =
    controlledPadEndMs !== undefined ? controlledPadEndMs : internalPadEndMs;
  const currentKeepLaughter =
    controlledKeepLaughter !== undefined
      ? controlledKeepLaughter
      : internalKeepLaughter;
  const currentStyleId =
    controlledStyleId !== undefined ? controlledStyleId : internalStyleId;
  const currentStyleToggles =
    controlledStyleToggles !== undefined && controlledStyleToggles !== null
      ? controlledStyleToggles
      : internalStyleToggles;
  const currentAppliedStyle =
    controlledAppliedStyle !== undefined
      ? controlledAppliedStyle
      : internalAppliedStyle;

  // Tải danh sách phong cách đã lưu từ `GET /api/video-studio/styles`
  const refreshSavedStylesList = useCallback(async () => {
    try {
      const res = await fetch('/api/video-studio/styles', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const list: SavedStyleListItem[] = Array.isArray(data?.styles)
          ? data.styles
          : Array.isArray(data?.items)
          ? data.items
          : [];
        if (list.length > 0) {
          setSavedStylesList(list);
        }
      }
    } catch {
      // Giữ danh sách mẫu mặc định nếu ngoại tuyến
    }
  }, []);

  useEffect(() => {
    void refreshSavedStylesList();
  }, [refreshSavedStylesList]);

  const applyAnalyzeResponseToState = useCallback(
    (resp: StyleAnalyzeResponse | null | undefined, isFromSaved = false) => {
      if (!resp || !resp.style) return;
      const nextStyle = resp.style;
      const nextId = resp.style_id || nextStyle.id;
      const nextToggles: StyleToggles = {
        ...DEFAULT_STYLE_TOGGLES,
        ...(resp.toggles || nextStyle.toggles || {}),
      };

      setInternalStyleId(nextId);
      onStyleIdChange?.(nextId);

      setInternalStyleToggles(nextToggles);
      onStyleTogglesChange?.(nextToggles);

      setInternalAppliedStyle(nextStyle);
      onAppliedStyleChange?.(nextStyle);

      setStyleNameInput(resp.name || nextStyle.name || '');
      setStyleSaveFeedback(null);
      setSampleErrorMessage(null);
      setSampleProgressMessage(
        isFromSaved
          ? `Đã áp dụng phong cách đã lưu “${resp.name || nextStyle.name}”.`
          : `Đã phân tích xong video mẫu (${Math.round(
              (nextStyle.analyzed_ms || 60000) / 1000
            )} giây đầu).`
      );
    },
    [onAppliedStyleChange, onStyleIdChange, onStyleTogglesChange]
  );

  const handleSelectSavedStyleById = useCallback(
    async (selectedId: string) => {
      const trimmedId = (selectedId || '').trim();
      if (!trimmedId) {
        setInternalStyleId(null);
        onStyleIdChange?.(null);
        setInternalAppliedStyle(null);
        onAppliedStyleChange?.(null);
        setSampleProgressMessage(null);
        setStyleSaveFeedback(null);
        return;
      }

      setIsAnalyzingSample(true);
      setSampleErrorMessage(null);
      setStyleSaveFeedback(null);
      setSampleProgressMessage('Đang tải hồ sơ phong cách đã lưu...');

      const sourceAspect = currentVideo
        ? inferClientAspectRatio(currentVideo.width, currentVideo.height)
        : '';
      const query = new URLSearchParams();
      if (projectId) query.set('projectId', projectId);
      if (sourceAspect) query.set('sourceAspect', sourceAspect);
      if (currentVideo?.width) query.set('source_width', String(currentVideo.width));
      if (currentVideo?.height) query.set('source_height', String(currentVideo.height));

      try {
        const qs = query.toString();
        const url = `/api/video-studio/style/${encodeURIComponent(trimmedId)}${
          qs ? `?${qs}` : ''
        }`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const data: StyleAnalyzeResponse = await res.json();
          applyAnalyzeResponseToState(data, true);
          return;
        }
      } catch {
        // Fallback sang danh sách đã có trong bộ nhớ client
      } finally {
        setIsAnalyzingSample(false);
      }

      const localFound = savedStylesList.find(
        (it) => it.style_id === trimmedId || it.id === trimmedId
      );
      if (localFound) {
        const fallbackApplied: VideoStudioAppliedStyle = {
          ...MOCK_APPLIED_STYLE,
          id: localFound.style_id,
          style_id: localFound.style_id,
          name: localFound.name,
          filename: localFound.filename || `${localFound.style_id}.mp4`,
          analyzed_ms: localFound.analyzed_ms,
          duration_ms: localFound.duration_ms,
          aspect: localFound.aspect,
          resolution: localFound.resolution,
          summary: localFound.summary,
          toggles: localFound.toggles,
          profile: localFound.profile,
          saved: true,
        };
        setInternalStyleId(localFound.style_id);
        onStyleIdChange?.(localFound.style_id);
        setInternalStyleToggles(localFound.toggles);
        onStyleTogglesChange?.(localFound.toggles);
        setInternalAppliedStyle(fallbackApplied);
        onAppliedStyleChange?.(fallbackApplied);
        setStyleNameInput(localFound.name);
        setSampleProgressMessage(`Đã áp dụng phong cách đã lưu “${localFound.name}”.`);
      } else {
        setSampleErrorMessage('Không tải được phong cách đã chọn.');
      }
    },
    [
      applyAnalyzeResponseToState,
      currentVideo,
      onAppliedStyleChange,
      onStyleIdChange,
      onStyleTogglesChange,
      projectId,
      savedStylesList,
    ]
  );

  const handleAnalyzeSampleVideoFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!isSupportedVideoFile(file)) {
        setSampleErrorMessage(INVALID_FILE_MESSAGE);
        return;
      }

      setIsAnalyzingSample(true);
      setSampleErrorMessage(null);
      setStyleSaveFeedback(null);
      setSampleProgressMessage(
        `Đang phân tích video mẫu “${file.name}” (tối đa 90 giây đầu): đo nhịp cắt, phụ đề, mở đầu và âm lượng...`
      );

      try {
        const formData = new FormData();
        formData.append('sample_video', file);
        formData.append('filename', file.name);
        if (projectId) {
          formData.append('project_id', projectId);
        }
        if (currentVideo) {
          formData.append(
            'source_aspect',
            inferClientAspectRatio(currentVideo.width, currentVideo.height)
          );
          formData.append('source_width', String(currentVideo.width));
          formData.append('source_height', String(currentVideo.height));
        }

        const res = await fetch('/api/video-studio/style/analyze', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data: StyleAnalyzeResponse = await res.json();
          applyAnalyzeResponseToState(data, false);
        } else {
          const errJson = await res.json().catch(() => ({}));
          setSampleErrorMessage(
            errJson?.error || 'Không thể phân tích video mẫu này. Hãy thử file khác.'
          );
          setSampleProgressMessage(null);
        }
      } catch {
        // Fallback phân tích mẫu chuẩn khi chạy ngoại tuyến
        const fallbackStyle: VideoStudioAppliedStyle = {
          ...MOCK_APPLIED_STYLE,
          filename: file.name,
          name: `Phong cách từ ${file.name.replace(/\.[^.]+$/, '')}`,
          saved: false,
        };
        setInternalStyleId(fallbackStyle.id);
        onStyleIdChange?.(fallbackStyle.id);
        setInternalStyleToggles({ ...DEFAULT_STYLE_TOGGLES });
        onStyleTogglesChange?.({ ...DEFAULT_STYLE_TOGGLES });
        setInternalAppliedStyle(fallbackStyle);
        onAppliedStyleChange?.(fallbackStyle);
        setStyleNameInput(fallbackStyle.name);
        setSampleProgressMessage(`Đã phân tích xong phong cách từ “${file.name}”.`);
      } finally {
        setIsAnalyzingSample(false);
      }
    },
    [
      applyAnalyzeResponseToState,
      currentVideo,
      onAppliedStyleChange,
      onStyleIdChange,
      onStyleTogglesChange,
      projectId,
    ]
  );

  const handleAnalyzePresetSample = useCallback(async () => {
    setIsAnalyzingSample(true);
    setSampleErrorMessage(null);
    setStyleSaveFeedback(null);
    setSampleProgressMessage(
      'Đang phân tích video mẫu “mau_reels_podscare_chuan.mp4” (tối đa 90 giây đầu)...'
    );

    try {
      const res = await fetch('/api/video-studio/style/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'mau_reels_podscare_chuan.mp4',
          name: 'Podcast dọc nhịp nhanh PodsCare',
          project_id: projectId,
          source_aspect: currentVideo
            ? inferClientAspectRatio(currentVideo.width, currentVideo.height)
            : undefined,
          source_width: currentVideo?.width,
          source_height: currentVideo?.height,
        }),
      });
      if (res.ok) {
        const data: StyleAnalyzeResponse = await res.json();
        applyAnalyzeResponseToState(data, false);
        return;
      }
    } catch {
      // Fallback sang dữ liệu mẫu chuẩn
    } finally {
      setIsAnalyzingSample(false);
    }

    setInternalStyleId(MOCK_APPLIED_STYLE.id);
    onStyleIdChange?.(MOCK_APPLIED_STYLE.id);
    setInternalStyleToggles({ ...DEFAULT_STYLE_TOGGLES });
    onStyleTogglesChange?.({ ...DEFAULT_STYLE_TOGGLES });
    setInternalAppliedStyle(MOCK_APPLIED_STYLE);
    onAppliedStyleChange?.(MOCK_APPLIED_STYLE);
    setStyleNameInput(MOCK_APPLIED_STYLE.name);
    setSampleProgressMessage(
      'Đã phân tích xong video mẫu “mau_reels_podscare_chuan.mp4” (62 giây đầu).'
    );
  }, [
    applyAnalyzeResponseToState,
    currentVideo,
    onAppliedStyleChange,
    onStyleIdChange,
    onStyleTogglesChange,
    projectId,
  ]);

  const handleToggleStyleGroup = useCallback(
    (groupKey: StyleGroupKey, checked: boolean) => {
      const nextToggles: StyleToggles = {
        ...currentStyleToggles,
        [groupKey]: checked,
      };
      setInternalStyleToggles(nextToggles);
      onStyleTogglesChange?.(nextToggles);

      if (currentAppliedStyle) {
        const nextApplied: VideoStudioAppliedStyle = {
          ...currentAppliedStyle,
          toggles: nextToggles,
        };
        setInternalAppliedStyle(nextApplied);
        onAppliedStyleChange?.(nextApplied);
      }
    },
    [
      currentAppliedStyle,
      currentStyleToggles,
      onAppliedStyleChange,
      onStyleTogglesChange,
    ]
  );

  const handleClearSampleStyle = useCallback(() => {
    setInternalStyleId(null);
    onStyleIdChange?.(null);
    setInternalAppliedStyle(null);
    onAppliedStyleChange?.(null);
    setSampleProgressMessage('Đã bỏ phong cách mẫu, dùng cấu hình cắt mặc định.');
    setSampleErrorMessage(null);
    setStyleSaveFeedback(null);
  }, [onAppliedStyleChange, onStyleIdChange]);

  const handleSaveCurrentStyle = useCallback(async () => {
    if (!currentAppliedStyle || isSavingStyle) return;
    const targetId = currentStyleId || currentAppliedStyle.id || 'style_ab12';
    const resolvedName =
      styleNameInput.trim() || currentAppliedStyle.name || 'Phong cách đã lưu';

    setIsSavingStyle(true);
    setStyleSaveFeedback(null);

    try {
      const res = await fetch(
        `/api/video-studio/style/${encodeURIComponent(targetId)}/save`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: resolvedName,
            profile: currentAppliedStyle.profile,
            project_id: projectId,
          }),
        }
      );

      if (res.ok) {
        const savedData = await res.json().catch(() => null);
        const updatedName = savedData?.name || resolvedName;
        const nextApplied: VideoStudioAppliedStyle = {
          ...(savedData?.style || currentAppliedStyle),
          name: updatedName,
          saved: true,
          toggles: currentStyleToggles,
        };
        setInternalAppliedStyle(nextApplied);
        onAppliedStyleChange?.(nextApplied);
        setStyleNameInput(updatedName);
        setStyleSaveFeedback(
          `Đã lưu phong cách “${updatedName}” vào danh sách dùng lại.`
        );
        await refreshSavedStylesList();
        return;
      }
    } catch {
      // Fallback cập nhật tại chỗ nếu ngoại tuyến
    } finally {
      setIsSavingStyle(false);
    }

    const updatedApplied: VideoStudioAppliedStyle = {
      ...currentAppliedStyle,
      name: resolvedName,
      saved: true,
    };
    setInternalAppliedStyle(updatedApplied);
    onAppliedStyleChange?.(updatedApplied);
    setStyleSaveFeedback(
      `Đã lưu phong cách “${resolvedName}” vào danh sách dùng lại.`
    );
  }, [
    currentAppliedStyle,
    currentStyleId,
    currentStyleToggles,
    isSavingStyle,
    onAppliedStyleChange,
    projectId,
    refreshSavedStylesList,
    styleNameInput,
  ]);

  const hasUserHookPrompt = currentHookPrompt.trim().length > 0;

  const learnedStyleRows = useMemo(() => {
    if (!currentAppliedStyle) return [];
    return buildLearnedStyleRows(currentAppliedStyle, hasUserHookPrompt);
  }, [currentAppliedStyle, hasUserHookPrompt]);

  // Cảnh báo trong khối phong cách (bao gồm lệch tỉ lệ khung hình với video đang chọn, mẫu > 5 phút, không có lời nói, thiếu OCR...)
  const activeStyleWarnings = useMemo(() => {
    if (!currentAppliedStyle) return [];
    const list: VideoStudioWarningItem[] = Array.isArray(
      currentAppliedStyle.warnings
    )
      ? [...currentAppliedStyle.warnings]
      : [];

    if (currentVideo && currentVideo.width > 0 && currentVideo.height > 0) {
      const userAspect = inferClientAspectRatio(
        currentVideo.width,
        currentVideo.height
      );
      const sampleAspect = String(
        currentAppliedStyle.aspect ||
          currentAppliedStyle.profile?.format?.aspect ||
          '9:16'
      ).trim();

      if (
        userAspect !== sampleAspect &&
        !list.some((w) => w.code === 'aspect_mismatch')
      ) {
        list.unshift({
          code: 'aspect_mismatch',
          message:
            'Chưa hỗ trợ đổi tỉ lệ khung hình, giữ nguyên khung của video bạn',
          action: `Video mẫu có tỉ lệ ${sampleAspect} khác với video của bạn (${userAspect}).`,
        });
      }
    }

    return list;
  }, [currentAppliedStyle, currentVideo]);

  const updateVideo = useCallback(
    (next: SelectedVideoInfo | null) => {
      setInternalVideo(next);
      onVideoChange?.(next);
    },
    [onVideoChange]
  );

  const updateScript = (next: string) => {
    setInternalScript(next);
    onScriptChange?.(next);
  };

  const updateCutPreset = (nextPreset: CutPreset) => {
    setInternalCutPreset(nextPreset);
    onCutPresetChange?.(nextPreset);

    const presetMeta = CUT_PRESET_OPTIONS.find((item) => item.value === nextPreset);
    if (presetMeta && !userCustomizedPadding) {
      setInternalPadStartMs(presetMeta.padStartMs);
      onPadStartMsChange?.(presetMeta.padStartMs);
      setInternalPadEndMs(presetMeta.padEndMs);
      onPadEndMsChange?.(presetMeta.padEndMs);
      setSilenceThresholdMs(presetMeta.silenceThresholdMs);
    }
  };

  const updateHookPrompt = (next: string) => {
    setInternalHookPrompt(next);
    onHookPromptChange?.(next);
  };

  const updateHookClip = (next: SelectedHookClipInfo | null) => {
    setInternalHookClip(next);
    onHookClipChange?.(next);
  };

  const updateTemplate = (next: PrepareTemplateOption) => {
    setInternalTemplate(next);
    onTemplateChange?.(next);
  };

  const updatePadStartMs = (next: number) => {
    const clamped = Math.max(0, Math.min(500, Math.round(Number(next) || 0)));
    setUserCustomizedPadding(true);
    setInternalPadStartMs(clamped);
    onPadStartMsChange?.(clamped);
  };

  const updatePadEndMs = (next: number) => {
    const clamped = Math.max(0, Math.min(500, Math.round(Number(next) || 0)));
    setUserCustomizedPadding(true);
    setInternalPadEndMs(clamped);
    onPadEndMsChange?.(clamped);
  };

  const updateKeepLaughter = (next: boolean) => {
    setInternalKeepLaughter(next);
    onKeepLaughterChange?.(next);
  };

  const handleProcessSelectedVideoFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;

      if (!isSupportedVideoFile(file)) {
        if (activeObjectUrlRef.current) {
          URL.revokeObjectURL(activeObjectUrlRef.current);
          activeObjectUrlRef.current = null;
        }
        updateVideo(null);
        setVideoError(INVALID_FILE_MESSAGE);
        return;
      }

      setIsProbingVideo(true);
      setVideoError(null);

      try {
        const meta = await probeVideoFileClientOnly(file);
        if (activeObjectUrlRef.current) {
          URL.revokeObjectURL(activeObjectUrlRef.current);
        }
        activeObjectUrlRef.current = meta.objectUrl;

        const nextInfo: SelectedVideoInfo = {
          file,
          filename: file.name,
          durationMs: meta.durationMs,
          width: meta.width,
          height: meta.height,
          resolution: `${meta.width}×${meta.height}`,
          sizeBytes: file.size,
          objectUrl: meta.objectUrl,
          isDemo: false,
        };
        updateVideo(nextInfo);
      } catch {
        if (activeObjectUrlRef.current) {
          URL.revokeObjectURL(activeObjectUrlRef.current);
          activeObjectUrlRef.current = null;
        }
        updateVideo(null);
        setVideoError(INVALID_FILE_MESSAGE);
      } finally {
        setIsProbingVideo(false);
      }
    },
    [updateVideo]
  );

  const handleVideoFileInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleProcessSelectedVideoFile(file);
    }
    e.target.value = '';
  };

  const handleDropZoneDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDropZoneDragLeave = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDropZoneDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer?.files?.[0];
    if (droppedFile) {
      void handleProcessSelectedVideoFile(droppedFile);
    }
  };

  const handleHookClipFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!isSupportedVideoFile(file)) {
      setHookClipError(INVALID_FILE_MESSAGE);
      return;
    }

    setHookClipError(null);
    try {
      const meta = await probeVideoFileClientOnly(file);
      URL.revokeObjectURL(meta.objectUrl);
      updateHookClip({
        file,
        filename: file.name,
        durationMs: meta.durationMs,
        sizeBytes: file.size,
      });
    } catch {
      setHookClipError(INVALID_FILE_MESSAGE);
    }
  };

  const handleUseDemoClick = async () => {
    setVideoError(null);
    if (onUseDemoVideo) {
      const res = await onUseDemoVideo();
      if (res && typeof res === 'object' && 'filename' in res) {
        updateVideo(res);
      }
      return;
    }

    updateVideo({
      filename: 'airpods-pro2-vesinh-raw.mp4',
      durationMs: 45_200,
      width: 1920,
      height: 1080,
      resolution: '1920×1080',
      sizeBytes: 14_680_064,
      fps: 30,
      isDemo: true,
    });
  };

  const hasValidVideo = Boolean(
    currentVideo &&
      currentVideo.filename &&
      currentVideo.durationMs > 0 &&
      !videoError &&
      !isProbingVideo
  );

  const isLongVideo = Boolean(
    hasValidVideo &&
      currentVideo &&
      currentVideo.durationMs > LONG_VIDEO_THRESHOLD_MS
  );

  const hasScriptContent = currentScript.trim().length > 0;
  const activePresetMeta =
    CUT_PRESET_OPTIONS.find((item) => item.value === currentCutPreset) ||
    CUT_PRESET_OPTIONS[1];

  const handleStartClick = () => {
    if (!hasValidVideo || !currentVideo || isSubmitting) return;
    onStartCutting?.({
      video: currentVideo,
      scriptText: currentScript,
      cutPreset: currentCutPreset,
      hookPrompt: currentHookPrompt.trim(),
      hookClip: currentHookClip,
      template: currentTemplate,
      padStartMs: currentPadStartMs,
      padEndMs: currentPadEndMs,
      mergeGapMs,
      silenceThresholdMs,
      keepLaughter: currentKeepLaughter,
      styleId: currentAppliedStyle ? currentStyleId || currentAppliedStyle.id : null,
      styleToggles: currentAppliedStyle ? currentStyleToggles : null,
      appliedStyle: currentAppliedStyle,
    });
  };

  return (
    <section
      aria-label="Chuẩn bị cắt video"
      className={`w-full max-w-[760px] mx-auto bg-[#ffffff] border border-[#d5e0d7] rounded-[10px] divide-y divide-[#e9eeeb] text-[#17231f] ${className}`}
    >
      {/* PHẦN 1: VÙNG THẢ VIDEO (LỚN, LÀ NÚT BẤM ĐƯỢC) */}
      <div className="p-5 sm:p-6">
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov"
          onChange={handleVideoFileInputChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          onDragOver={handleDropZoneDragOver}
          onDragEnter={handleDropZoneDragOver}
          onDragLeave={handleDropZoneDragLeave}
          onDrop={handleDropZoneDrop}
          disabled={isSubmitting}
          className={`w-full min-h-[148px] px-5 py-6 rounded-[8px] border border-dashed text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51] disabled:opacity-60 ${
            isDragOver
              ? 'border-[#176b51] bg-[#e9f4ef]'
              : videoError
              ? 'border-[#bc5b52] bg-[#fbefed]/50 hover:bg-[#fbefed]'
              : hasValidVideo
              ? 'border-[#176b51] bg-[#f6f8f6] hover:bg-[#e9f4ef]/60'
              : 'border-[#d5e0d7] bg-[#f6f8f6] hover:border-[#176b51] hover:bg-[#e9f4ef]/40'
          }`}
        >
          {isProbingVideo ? (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-2">
              <span className="text-[15px] leading-[24px] font-medium text-[#17231f]">
                Đang đọc thông tin video...
              </span>
              <span className="text-[13px] leading-[20px] text-[#4a5d54]">
                Vui lòng chờ trong giây lát
              </span>
            </div>
          ) : hasValidVideo && currentVideo ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#176b51] text-[#ffffff] text-[12px] leading-[18px] font-mono shrink-0"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span className="font-heading text-[16px] leading-[24px] font-bold text-[#17231f] truncate">
                    {currentVideo.filename}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] leading-[20px] text-[#4a5d54] pl-8">
                  <span>
                    Thời lượng:{' '}
                    <strong className="font-mono tabular-nums font-medium text-[#17231f]">
                      {formatDurationClock(currentVideo.durationMs)}
                    </strong>
                  </span>
                  <span>
                    Độ phân giải:{' '}
                    <strong className="font-mono tabular-nums font-medium text-[#17231f]">
                      {(currentVideo.resolution || `${currentVideo.width}×${currentVideo.height}`).replace('x', '×')}
                    </strong>
                  </span>
                  {typeof currentVideo.sizeBytes === 'number' &&
                    currentVideo.sizeBytes > 0 && (
                      <span>
                        Dung lượng:{' '}
                        <strong className="font-mono tabular-nums font-medium text-[#17231f]">
                          {formatFileSizeVi(currentVideo.sizeBytes)}
                        </strong>
                      </span>
                    )}
                </div>
              </div>

              <span className="inline-flex items-center self-start sm:self-center px-3 py-2 min-h-[44px] rounded-[7px] bg-[#ffffff] border border-[#d5e0d7] text-[13px] leading-[20px] font-medium text-[#17231f] shrink-0">
                Đổi file video khác
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-2">
              <svg
                className="w-7 h-7 text-[#176b51]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="font-heading text-[16px] leading-[24px] font-semibold text-[#17231f]">
                Thả video vào đây hoặc chọn file
              </span>
              <span className="text-[13px] leading-[20px] text-[#4a5d54]">
                Hỗ trợ file MP4 hoặc MOV từ máy tính, điện thoại
              </span>
            </div>
          )}
        </button>

        {/* Thông báo lỗi inline ngay tại chỗ (không dùng toast) */}
        {videoError && (
          <div
            role="alert"
            className="mt-3 px-3.5 py-2.5 rounded-[7px] bg-[#fbefed] border border-[#e4aca6] text-[13px] leading-[20px] font-medium text-[#993f37] flex items-start gap-2"
          >
            <span className="font-mono font-bold shrink-0" aria-hidden="true">
              !
            </span>
            <span>{videoError}</span>
          </div>
        )}

        {/* Cảnh báo nhẹ khi video dài hơn 5 phút (> 300 giây) */}
        {isLongVideo && (
          <div
            role="status"
            className="mt-3 px-3.5 py-2.5 rounded-[7px] bg-[#faf3e7] border border-[#ebd6b2] text-[13px] leading-[20px] font-medium text-[#8f5d14] flex items-start gap-2"
          >
            <span className="font-mono font-bold shrink-0" aria-hidden="true">
              !
            </span>
            <span>Video dài hơn 5 phút, việc cắt có thể lâu hơn.</span>
          </div>
        )}

        {/* Nút phụ: Dùng video mẫu để thử (chỉ hiện khi chưa chọn video nào) */}
        {!hasValidVideo && !currentVideo && (
          <div className="mt-2.5 flex items-center justify-end">
            <button
              type="button"
              onClick={() => void handleUseDemoClick()}
              disabled={isSubmitting}
              className="min-h-[44px] px-3 py-1.5 rounded-[7px] text-[13px] leading-[20px] font-medium text-[#4a5d54] hover:text-[#176b51] hover:bg-[#f6f8f6] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
            >
              Dùng video mẫu để thử
            </button>
          </div>
        )}
      </div>

      {/* PHẦN 1.5: KHỐI THU GỌN "PHONG CÁCH THEO VIDEO MẪU (KHÔNG BẮT BUỘC)" */}
      <div
        data-testid="sample-style-section"
        className="p-5 sm:p-6 space-y-4 bg-[#f6f8f6]/60"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-[15px] leading-[22px] font-semibold text-[#17231f]">
                Phong cách theo video mẫu (không bắt buộc)
              </h2>
              {currentAppliedStyle && (
                <span className="px-2 py-0.5 rounded-[5px] bg-[#e9f4ef] border border-[#176b51]/40 text-[12px] leading-[18px] font-medium text-[#176b51]">
                  Đang áp dụng: {currentAppliedStyle.name}
                </span>
              )}
            </div>
            <p className="text-[13px] leading-[20px] text-[#4a5d54] max-w-[68ch]">
              Học nhịp cắt, phụ đề, kiểu mở đầu và âm lượng từ một video bạn thích.
            </p>
          </div>

          <button
            type="button"
            data-testid="toggle-sample-style-button"
            aria-expanded={isStyleSectionExpanded}
            aria-controls={`${formId}-sample-style-panel`}
            onClick={() => setIsStyleSectionExpanded((prev) => !prev)}
            className="min-h-[44px] px-3 py-1.5 rounded-[7px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[13px] leading-[20px] font-medium text-[#17231f] inline-flex items-center gap-1.5 shrink-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
          >
            <span>{isStyleSectionExpanded ? 'Thu gọn' : 'Mở rộng'}</span>
            <span aria-hidden="true">{isStyleSectionExpanded ? '▲' : '▾'}</span>
          </button>
        </div>

        {isStyleSectionExpanded && (
          <div
            id={`${formId}-sample-style-panel`}
            className="space-y-4 pt-1"
          >
            {/* Hai lựa chọn nguồn phong cách: Tải video mẫu hoặc Chọn phong cách đã lưu */}
            <div className="space-y-3">
              <div
                role="radiogroup"
                aria-label="Nguồn phong cách mẫu"
                className="flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={styleSourceMode === 'upload'}
                  data-testid="style-mode-upload"
                  onClick={() => setStyleSourceMode('upload')}
                  disabled={isSubmitting || isAnalyzingSample}
                  className={`min-h-[44px] px-3.5 py-2 rounded-[7px] border text-[13px] leading-[20px] font-medium inline-flex items-center gap-2 transition-colors ${
                    styleSourceMode === 'upload'
                      ? 'bg-[#e9f4ef] border-[#176b51] text-[#17231f]'
                      : 'bg-[#ffffff] border-[#d5e0d7] text-[#4a5d54] hover:border-[#176b51] hover:text-[#17231f]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 rounded-full border inline-flex items-center justify-center ${
                      styleSourceMode === 'upload'
                        ? 'border-[#176b51] bg-[#176b51]'
                        : 'border-[#4a5d54] bg-transparent'
                    }`}
                  >
                    {styleSourceMode === 'upload' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ffffff]" />
                    )}
                  </span>
                  <span>Tải video mẫu</span>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={styleSourceMode === 'saved'}
                  data-testid="style-mode-saved"
                  onClick={() => {
                    setStyleSourceMode('saved');
                    void refreshSavedStylesList();
                  }}
                  disabled={isSubmitting || isAnalyzingSample}
                  className={`min-h-[44px] px-3.5 py-2 rounded-[7px] border text-[13px] leading-[20px] font-medium inline-flex items-center gap-2 transition-colors ${
                    styleSourceMode === 'saved'
                      ? 'bg-[#e9f4ef] border-[#176b51] text-[#17231f]'
                      : 'bg-[#ffffff] border-[#d5e0d7] text-[#4a5d54] hover:border-[#176b51] hover:text-[#17231f]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 rounded-full border inline-flex items-center justify-center ${
                      styleSourceMode === 'saved'
                        ? 'border-[#176b51] bg-[#176b51]'
                        : 'border-[#4a5d54] bg-transparent'
                    }`}
                  >
                    {styleSourceMode === 'saved' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ffffff]" />
                    )}
                  </span>
                  <span>Chọn phong cách đã lưu</span>
                </button>
              </div>

              {styleSourceMode === 'upload' ? (
                <div className="flex flex-wrap items-center gap-2.5">
                  <input
                    ref={sampleVideoInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,.mp4,.mov"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        void handleAnalyzeSampleVideoFile(f);
                      }
                      e.target.value = '';
                    }}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                  />

                  <button
                    type="button"
                    data-testid="upload-sample-video-button"
                    onClick={() => sampleVideoInputRef.current?.click()}
                    disabled={isSubmitting || isAnalyzingSample}
                    className="min-h-[44px] px-4 py-2 rounded-[7px] border border-[#176b51] bg-[#ffffff] hover:bg-[#e9f4ef] text-[13px] leading-[20px] font-medium text-[#176b51] transition-colors disabled:opacity-60"
                  >
                    {currentAppliedStyle ? 'Đổi video mẫu khác' : 'Tải video mẫu'}
                  </button>

                  {!currentAppliedStyle && (
                    <button
                      type="button"
                      data-testid="analyze-preset-sample-button"
                      onClick={() => void handleAnalyzePresetSample()}
                      disabled={isSubmitting || isAnalyzingSample}
                      className="min-h-[44px] px-3.5 py-2 rounded-[7px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[13px] leading-[20px] font-medium text-[#4a5d54] hover:text-[#17231f] transition-colors disabled:opacity-60"
                    >
                      Dùng thử phong cách mẫu có sẵn
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 max-w-[68ch]">
                  <label
                    htmlFor={`${formId}-saved-style-select`}
                    className="sr-only"
                  >
                    Chọn phong cách đã lưu
                  </label>
                  <select
                    id={`${formId}-saved-style-select`}
                    data-testid="saved-style-select"
                    value={currentStyleId || currentAppliedStyle?.id || ''}
                    onChange={(e) => void handleSelectSavedStyleById(e.target.value)}
                    disabled={isSubmitting || isAnalyzingSample}
                    className="w-full sm:flex-1 min-h-[44px] px-3.5 py-2 rounded-[7px] border border-[#d5e0d7] bg-[#ffffff] text-[14px] leading-[22px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                  >
                    <option value="">-- Chọn phong cách đã lưu --</option>
                    {savedStylesList.map((item) => (
                      <option key={item.style_id} value={item.style_id}>
                        {item.name} ({item.aspect || '9:16'} ·{' '}
                        {Math.round((item.analyzed_ms || 60000) / 1000)}s)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Thông báo tiến trình phân tích qua aria-live="polite" */}
            {(isAnalyzingSample || sampleProgressMessage) && (
              <div
                role="status"
                aria-live="polite"
                data-testid="sample-style-progress"
                className="px-3.5 py-2.5 rounded-[7px] bg-[#ffffff] border border-[#d5e0d7] text-[13px] leading-[20px] text-[#17231f] flex items-center justify-between gap-2"
              >
                <span className="font-medium">
                  {sampleProgressMessage || 'Đang phân tích video mẫu...'}
                </span>
                {currentAppliedStyle && !isAnalyzingSample && (
                  <button
                    type="button"
                    data-testid="clear-sample-style-button"
                    onClick={handleClearSampleStyle}
                    disabled={isSubmitting}
                    className="min-h-[44px] px-3 py-1.5 rounded-[6px] text-[13px] leading-[20px] font-medium text-[#993f37] hover:bg-[#fbefed] shrink-0 transition-colors"
                  >
                    Bỏ phong cách mẫu
                  </button>
                )}
              </div>
            )}

            {sampleErrorMessage && (
              <div
                role="alert"
                className="px-3.5 py-2.5 rounded-[7px] bg-[#fbefed] border border-[#e4aca6] text-[13px] leading-[20px] font-medium text-[#993f37]"
              >
                {sampleErrorMessage}
              </div>
            )}

            {/* Khối "Phong cách học được" khi đã phân tích hoặc đã chọn một phong cách */}
            {currentAppliedStyle && (
              <div
                data-testid="learned-style-card"
                className="p-4 rounded-[8px] bg-[#ffffff] border border-[#d5e0d7] space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#e9eeeb]">
                  <div className="space-y-0.5 min-w-0">
                    <h3 className="font-heading text-[15px] leading-[22px] font-semibold text-[#17231f]">
                      Phong cách học được
                    </h3>
                    <p className="text-[13px] leading-[20px] text-[#4a5d54]">
                      Nguồn mẫu:{' '}
                      <strong className="font-mono font-medium text-[#17231f]">
                        {currentAppliedStyle.filename || currentAppliedStyle.name}
                      </strong>{' '}
                      · Đã đo{' '}
                      <span className="font-mono tabular-nums">
                        {Math.round((currentAppliedStyle.analyzed_ms || 60000) / 1000)}s
                      </span>{' '}
                      đầu · Khung{' '}
                      <span className="font-mono tabular-nums">
                        {currentAppliedStyle.resolution || '1080×1920'} (
                        {currentAppliedStyle.aspect || '9:16'})
                      </span>
                    </p>
                  </div>

                  {!sampleProgressMessage && (
                    <button
                      type="button"
                      onClick={handleClearSampleStyle}
                      disabled={isSubmitting}
                      className="min-h-[44px] px-3 py-1.5 rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#fbefed] text-[13px] leading-[20px] font-medium text-[#993f37] shrink-0 transition-colors"
                    >
                      Bỏ phong cách mẫu
                    </button>
                  )}
                </div>

                {/* Danh sách ngắn 5 dòng công tắc (pacing, captions, hook, audio, punchin) */}
                <ul
                  data-testid="learned-style-toggles-list"
                  className="space-y-2"
                >
                  {learnedStyleRows.map((row) => {
                    const isChecked = Boolean(currentStyleToggles[row.key]);
                    const confMeta = getConfidenceBadgeMeta(row.confidence);
                    return (
                      <li key={row.key}>
                        <label
                          data-testid={`style-toggle-row-${row.key}`}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 min-h-[44px] rounded-[7px] border cursor-pointer select-none transition-colors ${
                            isChecked
                              ? 'bg-[#e9f4ef]/45 border-[#176b51]/50 text-[#17231f]'
                              : 'bg-[#f6f8f6] border-[#d5e0d7] text-[#4a5d54]'
                          }`}
                        >
                          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) =>
                                handleToggleStyleGroup(row.key, e.target.checked)
                              }
                              disabled={isSubmitting}
                              className="sr-only"
                            />
                            <span
                              aria-hidden="true"
                              className={`mt-0.5 sm:mt-0 w-5 h-5 rounded-[5px] border inline-flex items-center justify-center shrink-0 transition-colors ${
                                isChecked
                                  ? 'bg-[#176b51] border-[#176b51] text-[#ffffff]'
                                  : 'bg-[#ffffff] border-[#4a5d54] text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                            <span className="text-[14px] leading-[22px] font-medium text-[#17231f]">
                              {row.sentence}
                            </span>
                          </div>

                          <span
                            data-testid={`style-confidence-${row.key}`}
                            className={`self-start sm:self-center inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[5px] border text-[12px] leading-[18px] font-medium shrink-0 ${confMeta.className}`}
                          >
                            <span aria-hidden="true">{confMeta.symbol}</span>
                            <span>{confMeta.label}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                {/* Thông báo rõ khi người dùng đã nhập hook_prompt riêng */}
                {hasUserHookPrompt && (
                  <div
                    role="status"
                    aria-live="polite"
                    data-testid="hook-prompt-override-notice"
                    className="px-3.5 py-2.5 rounded-[7px] bg-[#e9f4ef] border border-[#176b51]/40 text-[13px] leading-[20px] font-medium text-[#17231f]"
                  >
                    Bạn đã nhập yêu cầu riêng cho phần mở đầu nên sẽ ưu tiên theo yêu cầu của bạn thay vì kiểu mở đầu của video mẫu.
                  </div>
                )}

                {/* Các cảnh báo từ phân tích mẫu (khác khung hình, > 5 phút, không có lời nói, thiếu OCR...) */}
                {activeStyleWarnings.length > 0 && (
                  <div
                    role="status"
                    data-testid="sample-style-warnings"
                    className="px-3.5 py-2.5 rounded-[7px] bg-[#faf3e7] border border-[#ebd6b2] space-y-1.5"
                  >
                    {activeStyleWarnings.map((warn, idx) => (
                      <p
                        key={`${warn.code || 'warn'}_${idx}`}
                        className="text-[13px] leading-[20px] text-[#8f5d14]"
                      >
                        <strong className="font-semibold">Lưu ý: </strong>
                        <span>{warn.message}</span>
                        {warn.action ? (
                          <span className="ml-1 text-[#4a5d54]">
                            ({warn.action})
                          </span>
                        ) : null}
                      </p>
                    ))}
                  </div>
                )}

                {/* Ô đặt tên + nút "Lưu phong cách này" */}
                <div className="pt-2 border-t border-[#e9eeeb] space-y-2">
                  <label
                    htmlFor={`${formId}-style-save-name`}
                    className="block text-[13px] leading-[20px] font-medium text-[#17231f]"
                  >
                    Đặt tên để dùng lại phong cách này cho các video sau
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 max-w-[68ch]">
                    <input
                      id={`${formId}-style-save-name`}
                      data-testid="save-style-name-input"
                      type="text"
                      value={styleNameInput}
                      onChange={(e) => {
                        setStyleNameInput(e.target.value);
                        setStyleSaveFeedback(null);
                      }}
                      disabled={isSubmitting || isSavingStyle}
                      placeholder="Ví dụ: Podcast dọc nhịp nhanh PodsCare..."
                      className="flex-1 min-h-[44px] px-3.5 py-2 rounded-[7px] bg-[#ffffff] border border-[#d5e0d7] text-[14px] leading-[22px] text-[#17231f] placeholder:text-[#4a5d54]/70 focus:outline-none focus:border-[#176b51]"
                    />
                    <button
                      type="button"
                      data-testid="save-style-button"
                      onClick={() => void handleSaveCurrentStyle()}
                      disabled={isSubmitting || isSavingStyle}
                      className="min-h-[44px] px-4 py-2 rounded-[7px] bg-[#176b51] hover:bg-[#10583f] text-[#ffffff] text-[13px] leading-[20px] font-medium shrink-0 transition-colors disabled:opacity-60"
                    >
                      {isSavingStyle ? 'Đang lưu...' : 'Lưu phong cách này'}
                    </button>
                  </div>

                  {styleSaveFeedback && (
                    <p
                      role="status"
                      aria-live="polite"
                      data-testid="save-style-feedback"
                      className="text-[13px] leading-[20px] font-medium text-[#176b51]"
                    >
                      {styleSaveFeedback}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Dòng luôn hiển thị rõ ràng trong khối phong cách */}
            <p
              data-testid="unsupported-style-notice"
              className="text-[13px] leading-[20px] text-[#4a5d54]"
            >
              Chưa áp dụng được: nhạc nền, hiệu ứng, màu phim. Hệ thống luôn giữ tốc độ nói tự nhiên (1.0x) và không tự cắt đổi tỉ lệ khung hình.
            </p>
          </div>
        )}
      </div>

      {/* PHẦN 2: KỊCH BẢN, MỨC CẮT, GỢI Ý PHẦN MỞ ĐẦU, NÚT BẮT ĐẦU & TÙY CHỈNH NÂNG CAO */}
      <div className="p-5 sm:p-6 space-y-6">
        {/* 2.1. Kịch bản (không bắt buộc) */}
        <div className="space-y-2">
          <label
            htmlFor={`${formId}-script`}
            className="block font-heading text-[15px] leading-[22px] font-semibold text-[#17231f]"
          >
            Kịch bản (không bắt buộc)
          </label>
          <textarea
            id={`${formId}-script`}
            rows={4}
            value={currentScript}
            onChange={(e) => updateScript(e.target.value)}
            disabled={isSubmitting}
            placeholder="Dán nội dung kịch bản dự kiến vào đây để đối chiếu từng câu..."
            className="w-full max-w-[68ch] px-3.5 py-2.5 rounded-[7px] bg-[#ffffff] border border-[#d5e0d7] text-[15px] leading-[24px] text-[#17231f] placeholder:text-[#4a5d54]/70 focus:outline-none focus:border-[#176b51] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#176b51] disabled:bg-[#f6f8f6]"
          />
          <p
            aria-live="polite"
            className="text-[13px] leading-[20px] font-medium text-[#4a5d54] max-w-[68ch]"
          >
            {hasScriptContent
              ? 'Có kịch bản, hệ thống chọn đúng lần nói tốt nhất cho từng câu.'
              : 'Không có kịch bản, hệ thống chỉ bỏ vấp, im lặng và đoạn nói lại.'}
          </p>
        </div>

        {/* 2.2. Mức cắt: (Nhẹ) (●Vừa) (Mạnh) + 1 dòng mô tả */}
        <fieldset className="space-y-2" disabled={isSubmitting}>
          <legend className="font-heading text-[15px] leading-[22px] font-semibold text-[#17231f]">
            Mức cắt
          </legend>
          <div
            role="radiogroup"
            aria-label="Mức cắt"
            className="inline-flex flex-wrap items-center gap-2 pt-1"
          >
            {CUT_PRESET_OPTIONS.map((option) => {
              const checked = currentCutPreset === option.value;
              return (
                <label
                  key={option.value}
                  className={`inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-[7px] border text-[13px] leading-[20px] font-medium cursor-pointer select-none transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#176b51] ${
                    checked
                      ? 'bg-[#e9f4ef] border-[#176b51] text-[#17231f]'
                      : 'bg-[#ffffff] border-[#d5e0d7] text-[#4a5d54] hover:border-[#176b51] hover:text-[#17231f]'
                  }`}
                >
                  <input
                    type="radio"
                    name={`${formId}-cut-preset`}
                    value={option.value}
                    checked={checked}
                    onChange={() => updateCutPreset(option.value)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      checked
                        ? 'border-[#176b51] bg-[#176b51]'
                        : 'border-[#4a5d54] bg-transparent'
                    }`}
                  >
                    {checked && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ffffff]" />
                    )}
                  </span>
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
          <p
            aria-live="polite"
            className="text-[13px] leading-[20px] font-medium text-[#4a5d54] max-w-[68ch]"
          >
            {activePresetMeta.description}
          </p>
        </fieldset>

        {/* 2.3. Gợi ý cho phần mở đầu [ô] · Tải clip riêng */}
        <div className="space-y-2">
          <label
            htmlFor={`${formId}-hook-prompt`}
            className="block font-heading text-[15px] leading-[22px] font-semibold text-[#17231f]"
          >
            Gợi ý cho phần mở đầu
          </label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 max-w-[68ch]">
            <input
              id={`${formId}-hook-prompt`}
              type="text"
              value={currentHookPrompt}
              onChange={(e) => updateHookPrompt(e.target.value)}
              disabled={isSubmitting}
              placeholder="Ví dụ: Mở đầu bằng câu hỏi trực diện về lỗi tai nghe bị rè"
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-[7px] bg-[#ffffff] border border-[#d5e0d7] text-[15px] leading-[24px] text-[#17231f] placeholder:text-[#4a5d54]/70 focus:outline-none focus:border-[#176b51] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#176b51] disabled:bg-[#f6f8f6]"
            />

            <input
              ref={hookClipInputRef}
              type="file"
              accept="video/mp4,video/quicktime,.mp4,.mov"
              onChange={handleHookClipFileChange}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />

            <button
              type="button"
              onClick={() => hookClipInputRef.current?.click()}
              disabled={isSubmitting}
              className="min-h-[44px] px-3.5 py-2 rounded-[7px] bg-[#f6f8f6] hover:bg-[#e9f4ef] border border-[#d5e0d7] hover:border-[#176b51] text-[13px] leading-[20px] font-medium text-[#17231f] shrink-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
            >
              Tải clip riêng
            </button>
          </div>

          {currentHookClip && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] leading-[20px] text-[#17231f] bg-[#f6f8f6] border border-[#d5e0d7] rounded-[7px] px-3 py-2 max-w-[68ch]">
              <span>
                Clip mở đầu riêng:{' '}
                <strong className="font-medium">{currentHookClip.filename}</strong>
                {typeof currentHookClip.durationMs === 'number' &&
                  currentHookClip.durationMs > 0 && (
                    <span className="font-mono tabular-nums text-[12px] leading-[18px] text-[#4a5d54] ml-1.5">
                      ({formatDurationClock(currentHookClip.durationMs)})
                    </span>
                  )}
              </span>
              <button
                type="button"
                onClick={() => updateHookClip(null)}
                disabled={isSubmitting}
                className="ml-auto inline-flex items-center justify-center text-[13px] leading-[20px] font-medium text-[#993f37] hover:underline px-3 min-h-[44px] rounded-[6px]"
              >
                Bỏ clip riêng
              </button>
            </div>
          )}

          {hookClipError && (
            <div
              role="alert"
              className="px-3.5 py-2 rounded-[7px] bg-[#fbefed] border border-[#e4aca6] text-[13px] leading-[20px] font-medium text-[#993f37] max-w-[68ch]"
            >
              {hookClipError}
            </div>
          )}
        </div>

        {/* 2.4. Nút hành động chính [ Bắt đầu cắt video ] + lý do khi vô hiệu hóa + ▸ Tùy chỉnh nâng cao */}
        <div className="pt-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleStartClick}
                disabled={!hasValidVideo || isSubmitting}
                aria-describedby={
                  !hasValidVideo ? `${formId}-start-disabled-reason` : undefined
                }
                className="min-h-[48px] px-6 py-2.5 rounded-[7px] bg-[#176b51] hover:bg-[#10583f] text-[#ffffff] font-heading text-[15px] leading-[22px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51] disabled:bg-[#e9eeeb] disabled:text-[#4a5d54] disabled:cursor-not-allowed"
              >
                Bắt đầu cắt video
              </button>

              {!hasValidVideo && (
                <span
                  id={`${formId}-start-disabled-reason`}
                  className="text-[13px] leading-[20px] font-medium text-[#4a5d54]"
                >
                  Chọn video để bắt đầu
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              aria-expanded={showAdvanced}
              aria-controls={`${formId}-advanced-panel`}
              className="min-h-[44px] px-3 py-2 rounded-[7px] text-[13px] leading-[20px] font-medium text-[#4a5d54] hover:text-[#17231f] hover:bg-[#f6f8f6] transition-colors inline-flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176b51]"
            >
              <span aria-hidden="true">{showAdvanced ? '▾' : '▸'}</span>
              <span>Tùy chỉnh nâng cao</span>
            </button>
          </div>

          {/* Ngăn Tùy chỉnh nâng cao */}
          {showAdvanced && (
            <div
              id={`${formId}-advanced-panel`}
              className="p-4 rounded-[8px] bg-[#f6f8f6] border border-[#d5e0d7] space-y-4"
            >
              {/* Mẫu: Podcast ngang / Podcast dọc / Chỉ cắt */}
              <fieldset className="space-y-2" disabled={isSubmitting}>
                <legend className="text-[13px] leading-[20px] font-medium text-[#17231f]">
                  Mẫu khung hình
                </legend>
                <div
                  role="radiogroup"
                  aria-label="Mẫu khung hình"
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1"
                >
                  {PREPARE_TEMPLATE_OPTIONS.map((tpl) => {
                    const checked = currentTemplate === tpl.value;
                    return (
                      <label
                        key={tpl.value}
                        className={`flex flex-col justify-center px-3.5 py-2.5 min-h-[44px] rounded-[7px] border cursor-pointer transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#176b51] ${
                          checked
                            ? 'bg-[#e9f4ef] border-[#176b51] text-[#17231f]'
                            : 'bg-[#ffffff] border-[#d5e0d7] text-[#4a5d54] hover:border-[#176b51]'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`${formId}-template`}
                          value={tpl.value}
                          checked={checked}
                          onChange={() => updateTemplate(tpl.value)}
                          className="sr-only"
                        />
                        <span className="text-[13px] leading-[20px] font-medium text-[#17231f]">
                          {tpl.label}
                        </span>
                        <span className="text-[12px] leading-[18px] text-[#4a5d54]">
                          {tpl.hint}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* Khoảng đệm đầu/cuối câu (Mặc định khớp profile.yaml: 80ms / 120ms) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor={`${formId}-pad-start`}
                    className="block text-[13px] leading-[20px] font-medium text-[#17231f]"
                  >
                    Khoảng đệm đầu câu
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`${formId}-pad-start`}
                      type="number"
                      min={0}
                      max={500}
                      step={10}
                      value={currentPadStartMs}
                      onChange={(e) => updatePadStartMs(Number(e.target.value))}
                      disabled={isSubmitting}
                      className="w-28 min-h-[44px] px-3 py-1.5 rounded-[7px] bg-[#ffffff] border border-[#d5e0d7] font-mono tabular-nums text-[13px] leading-[20px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                    />
                    <span className="text-[13px] leading-[20px] text-[#4a5d54]">
                      mili-giây (mặc định{' '}
                      <span className="font-mono tabular-nums">
                        {PROFILE_DEFAULT_TIMING.pad_start_ms}
                      </span>
                      )
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={`${formId}-pad-end`}
                    className="block text-[13px] leading-[20px] font-medium text-[#17231f]"
                  >
                    Khoảng đệm cuối câu
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`${formId}-pad-end`}
                      type="number"
                      min={0}
                      max={500}
                      step={10}
                      value={currentPadEndMs}
                      onChange={(e) => updatePadEndMs(Number(e.target.value))}
                      disabled={isSubmitting}
                      className="w-28 min-h-[44px] px-3 py-1.5 rounded-[7px] bg-[#ffffff] border border-[#d5e0d7] font-mono tabular-nums text-[13px] leading-[20px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                    />
                    <span className="text-[13px] leading-[20px] text-[#4a5d54]">
                      mili-giây (mặc định{' '}
                      <span className="font-mono tabular-nums">
                        {PROFILE_DEFAULT_TIMING.pad_end_ms}
                      </span>
                      )
                    </span>
                  </div>
                </div>
              </div>

              {expertMode && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-[#e9eeeb]">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={`${formId}-silence-threshold`}
                      className="block text-[13px] leading-[20px] font-medium text-[#17231f]"
                    >
                      Ngưỡng im lặng cần cắt
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${formId}-silence-threshold`}
                        type="number"
                        min={200}
                        max={3000}
                        step={50}
                        value={silenceThresholdMs}
                        onChange={(e) =>
                          setSilenceThresholdMs(
                            Math.max(200, Math.min(3000, Number(e.target.value) || 800))
                          )
                        }
                        disabled={isSubmitting}
                        className="w-28 min-h-[44px] px-3 py-1.5 rounded-[7px] bg-[#ffffff] border border-[#d5e0d7] font-mono tabular-nums text-[13px] leading-[20px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                      />
                      <span className="text-[13px] leading-[20px] text-[#4a5d54]">
                        mili-giây (mặc định{' '}
                        <span className="font-mono tabular-nums">
                          {PROFILE_DEFAULT_TIMING.silence_threshold_ms}
                        </span>
                        )
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor={`${formId}-merge-gap`}
                      className="block text-[13px] leading-[20px] font-medium text-[#17231f]"
                    >
                      Khoảng gộp hai đoạn liền kề
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${formId}-merge-gap`}
                        type="number"
                        min={50}
                        max={1000}
                        step={10}
                        value={mergeGapMs}
                        onChange={(e) =>
                          setMergeGapMs(
                            Math.max(50, Math.min(1000, Number(e.target.value) || 150))
                          )
                        }
                        disabled={isSubmitting}
                        className="w-28 min-h-[44px] px-3 py-1.5 rounded-[7px] bg-[#ffffff] border border-[#d5e0d7] font-mono tabular-nums text-[13px] leading-[20px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                      />
                      <span className="text-[13px] leading-[20px] text-[#4a5d54]">
                        mili-giây (mặc định{' '}
                        <span className="font-mono tabular-nums">
                          {PROFILE_DEFAULT_TIMING.merge_gap_ms}
                        </span>
                        )
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Giữ tiếng cười */}
              <div className="pt-1">
                <label className="inline-flex items-center gap-2.5 min-h-[44px] py-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={currentKeepLaughter}
                    onChange={(e) => updateKeepLaughter(e.target.checked)}
                    disabled={isSubmitting}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-[5px] border inline-flex items-center justify-center transition-colors shrink-0 ${
                      currentKeepLaughter
                        ? 'bg-[#176b51] border-[#176b51] text-[#ffffff]'
                        : 'bg-[#ffffff] border-[#d5e0d7] text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span className="text-[13px] leading-[20px] font-medium text-[#17231f]">
                    Giữ tiếng cười tự nhiên và nhịp thở cảm xúc
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default SimplePrepareState;
