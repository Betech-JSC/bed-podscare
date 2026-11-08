'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { AgentProfileConfig, CutPreset } from '@/src/lib/video-studio/types';
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
}

export interface SimplePrepareStateProps {
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

export function SimplePrepareState({
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

        {/* Nút phụ: Dùng video mẫu để thử */}
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
                className="ml-auto text-[13px] leading-[20px] font-medium text-[#993f37] hover:underline px-2 py-1 min-h-[36px]"
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
                <label className="inline-flex items-center gap-2.5 min-h-[44px] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={currentKeepLaughter}
                    onChange={(e) => updateKeepLaughter(e.target.checked)}
                    disabled={isSubmitting}
                    className="w-4 h-4 rounded border-[#d5e0d7] text-[#176b51] focus:ring-[#176b51]"
                  />
                  <span className="text-[13px] leading-[20px] font-medium text-[#17231f]">
                    Giữ tiếng cười
                  </span>
                  <span className="text-[13px] leading-[20px] text-[#4a5d54]">
                    (Không cắt nhầm tiếng cười tự nhiên giữa cuộc trò chuyện)
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
