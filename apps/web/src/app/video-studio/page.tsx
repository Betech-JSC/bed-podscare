'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SimpleStudioHeader } from '@/src/components/video-studio/SimpleStudioHeader';
import {
  SimpleLearningPanel,
  type SimpleLearningRuleItem,
} from '@/src/components/video-studio/SimpleLearningPanel';
import {
  SimplePrepareState,
  PROFILE_DEFAULT_TIMING,
  type PrepareTemplateOption,
  type SelectedHookClipInfo,
  type SelectedVideoInfo,
  type SimplePrepareSubmitPayload,
} from '@/src/components/video-studio/SimplePrepareState';
import {
  SimpleProcessingState,
  createDefaultProcessingSteps,
} from '@/src/components/video-studio/SimpleProcessingState';
import {
  SimpleResultState,
  DEFAULT_CAPCUT_UNAVAILABLE_REASON,
  type SimpleRehookPayload,
} from '@/src/components/video-studio/SimpleResultState';
import {
  DEFAULT_MAC_CAPCUT_DRAFT_DIR,
  MOCK_APPLIED_LEARNING_RULES,
  MOCK_CUT_SCENARIOS,
  MOCK_SIMPLE_LEARNING_PROPOSALS,
  MOCK_SIMPLE_PREPARE_DATA,
  MOCK_SIMPLE_RESULT_DATA,
  MOCK_SIMPLE_SSE_STEPS_DONE,
  MOCK_SIMPLE_SSE_STEPS_ERROR_STEP_3,
  MOCK_SIMPLE_SSE_STEPS_RUNNING,
  SIMPLE_STUDIO_STORAGE_KEYS,
  type MockCutScenarioKey,
} from '@/src/lib/video-studio/mock-simple-data';
import {
  VIDEO_STUDIO_STEP_LABELS,
  type CutPreset,
  type SimpleCutPacingMode,
  type SimpleLearningProposalItem,
  type SimplePrepareData,
  type SimpleStudioResult,
  type SimpleStudioScreenState,
  type VideoStudioJobResult,
  type VideoStudioStepEvent,
  type VideoStudioStepNumber,
} from '@/src/lib/video-studio/types';

interface UploadStudioFileOptions {
  file: File;
  projectId: string;
  target?: 'source_video' | 'hook_clip';
  scriptText?: string;
  hookPrompt?: string;
  onProgress?: (percent: number) => void;
  onXhrCreated?: (xhr: XMLHttpRequest) => void;
}

/**
 * Tải file video hoặc clip mở đầu lên `/api/video-studio/upload` bằng `XMLHttpRequest`
 * để lắng nghe tiến trình thực tế (`xhr.upload.onprogress` từ 0% -> 100%).
 */
function uploadStudioFileWithProgress(
  options: UploadStudioFileOptions
): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof window.XMLHttpRequest === 'undefined') {
      reject(new Error('Trình duyệt không hỗ trợ tải file.'));
      return;
    }

    const xhr = new window.XMLHttpRequest();
    options.onXhrCreated?.(xhr);

    const formData = new FormData();
    formData.append('projectId', options.projectId);

    if (options.target === 'hook_clip') {
      formData.append('target', 'hook_clip');
      formData.append('uploadType', 'hook_clip');
      formData.append('role', 'hook_clip');
      formData.append('hookClip', options.file);
      formData.append('file', options.file);
    } else {
      formData.append('target', 'source_video');
      formData.append('role', 'source_video');
      formData.append('file', options.file);
    }

    if (typeof options.scriptText === 'string' && options.scriptText.trim()) {
      formData.append('script', options.scriptText);
    }
    if (typeof options.hookPrompt === 'string' && options.hookPrompt.trim()) {
      formData.append('hookPrompt', options.hookPrompt);
    }

    xhr.open('POST', '/api/video-studio/upload', true);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
        options.onProgress?.(pct);
      }
    };

    xhr.onload = () => {
      options.onProgress?.(100);
      let parsed: Record<string, any> = {};
      try {
        parsed = JSON.parse(xhr.responseText || '{}');
      } catch {
        parsed = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed);
      } else {
        reject(
          new Error(
            parsed?.error || parsed?.message || `Không thể tải file lên (${xhr.status}).`
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error('Lỗi kết nối khi tải file video lên máy chủ.'));
    };

    xhr.onabort = () => {
      reject(new Error('UPLOAD_ABORTED'));
    };

    options.onProgress?.(0);
    xhr.send(formData);
  });
}

export default function VideoStudioPage() {
  // Hydration-safe state: defaults are 100% deterministic on SSR & initial client render
  const [aiServiceHealthy, setAiServiceHealthy] = useState<boolean>(true);

  const [screenState, setScreenState] = useState<SimpleStudioScreenState>('prepare');
  const [prepareData, setPrepareData] = useState<SimplePrepareData>(() => ({
    ...MOCK_SIMPLE_PREPARE_DATA,
    script_text: '',
  }));
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideoInfo | null>(null);
  const [cutPreset, setCutPreset] = useState<CutPreset>('medium');
  const [hookPrompt, setHookPrompt] = useState<string>('');
  const [hookClip, setHookClip] = useState<SelectedHookClipInfo | null>(null);
  const [prepareTemplate, setPrepareTemplate] =
    useState<PrepareTemplateOption>('podcast_horizontal');
  const [padStartMs, setPadStartMs] = useState<number>(PROFILE_DEFAULT_TIMING.pad_start_ms);
  const [padEndMs, setPadEndMs] = useState<number>(PROFILE_DEFAULT_TIMING.pad_end_ms);
  const [keepLaughter, setKeepLaughter] = useState<boolean>(true);

  const [isUploadingVideo, setIsUploadingVideo] = useState<boolean>(false);
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number | null>(null);
  const [processingStartedAtMs, setProcessingStartedAtMs] = useState<number | null>(null);
  const [isRetryingStep, setIsRetryingStep] = useState<boolean>(false);
  const [activeJobId, setActiveJobId] = useState<string>(MOCK_SIMPLE_PREPARE_DATA.project_id);

  const [sseSteps, setSseSteps] =
    useState<VideoStudioStepEvent[]>(MOCK_SIMPLE_SSE_STEPS_RUNNING);
  const [resultData, setResultData] = useState<SimpleStudioResult>(MOCK_SIMPLE_RESULT_DATA);
  const [selectedCutIndex, setSelectedCutIndex] = useState<number>(3);
  const [cutScenario, setCutScenario] = useState<MockCutScenarioKey>('default_11_cuts');

  // Ngăn "Học & cải thiện" & Ngăn "Cài đặt"
  const [isLearningOpen, setIsLearningOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [learningProposals, setLearningProposals] = useState<SimpleLearningProposalItem[]>(
    MOCK_SIMPLE_LEARNING_PROPOSALS
  );
  const [appliedRules, setAppliedRules] = useState<string[]>(MOCK_APPLIED_LEARNING_RULES);
  const [learningRuleItems, setLearningRuleItems] = useState<SimpleLearningRuleItem[]>(() =>
    MOCK_APPLIED_LEARNING_RULES.map((text, idx) => ({
      id: `rule_${idx + 1}`,
      index: idx,
      text,
    }))
  );
  const [maxLearningRules, setMaxLearningRules] = useState<number>(30);
  const [isSyncingLearn, setIsSyncingLearn] = useState<boolean>(false);
  const [actingProposalId, setActingProposalId] = useState<string | null>(null);
  const [actingRuleId, setActingRuleId] = useState<string | null>(null);
  const [learningFeedback, setLearningFeedback] = useState<string | null>(null);

  const [capcutDraftDir, setCapcutDraftDir] = useState<string>(DEFAULT_MAC_CAPCUT_DRAFT_DIR);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const activeUploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const isFetchingResultRef = useRef<boolean>(false);

  const closeActiveEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const abortActiveUpload = useCallback(() => {
    if (activeUploadXhrRef.current) {
      try {
        activeUploadXhrRef.current.abort();
      } catch {
        // Ignore XHR abort errors
      }
      activeUploadXhrRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      closeActiveEventSource();
      abortActiveUpload();
    };
  }, [abortActiveUpload, closeActiveEventSource]);

  // Đồng bộ dữ liệu từ `/api/video-studio/learn` vào state của ngăn "Học & cải thiện"
  const applyLearnApiPayload = useCallback((data: Record<string, any> | null | undefined) => {
    if (!data || typeof data !== 'object') return;

    if (typeof data.lessons_max_lines === 'number' && data.lessons_max_lines > 0) {
      setMaxLearningRules(data.lessons_max_lines);
    }

    if (Array.isArray(data.lessons)) {
      const mappedRules: SimpleLearningRuleItem[] = data.lessons
        .map((item: any, idx: number) => ({
          id: String(item?.id || `rule_${idx + 1}`),
          index: typeof item?.index === 'number' ? item.index : idx,
          text: String(item?.text || item || '').trim(),
        }))
        .filter((r: SimpleLearningRuleItem) => r.text.length > 0);

      if (mappedRules.length > 0 || data.ok === true) {
        setLearningRuleItems(mappedRules);
        setAppliedRules(mappedRules.map((r) => r.text));
      }
    }

    if (Array.isArray(data.proposals)) {
      const mappedProposals: SimpleLearningProposalItem[] = data.proposals.map(
        (p: any, idx: number) => ({
          id: String(p?.id || `learn_prop_${idx + 1}`),
          rule_text: String(p?.rule_vi || p?.rule_text || '').trim(),
          detected_at_label: String(
            p?.summary_vi ||
              p?.detected_at_label ||
              (p?.beat_id ? `Phát hiện tại đoạn ${p.beat_id}` : 'Phát hiện từ bản sửa CapCut')
          ).trim(),
          detail: String(p?.badge_vi || p?.detail || '').trim(),
          status: p?.approved ? 'approved' : p?.status === 'dismissed' ? 'dismissed' : 'pending',
        })
      );
      setLearningProposals(mappedProposals);
    }
  }, []);

  const fetchLearningState = useCallback(
    async (projectId?: string) => {
      const targetProjectId = projectId || prepareData.project_id;
      try {
        const res = await fetch(
          `/api/video-studio/learn?projectId=${encodeURIComponent(targetProjectId)}`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && data.ok) {
            applyLearnApiPayload(data);
          }
        }
      } catch {
        // Giữ dữ liệu mẫu nếu ngoại tuyến
      }
    },
    [applyLearnApiPayload, prepareData.project_id]
  );

  // Đọc localStorage, kiểm tra dịch vụ AI & tải trạng thái "Học & cải thiện" sau khi mount
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'PodsCare · Cắt vấp Video';
    }
    try {
      window.localStorage.removeItem('podscare_video_studio_advanced_mode');
      const savedCapcutDir = window.localStorage.getItem(SIMPLE_STUDIO_STORAGE_KEYS.capcutDraftDir);
      if (savedCapcutDir && savedCapcutDir.trim()) {
        setCapcutDraftDir(savedCapcutDir.trim());
      }
    } catch {
      // Ignore storage access errors in private mode
    }

    // Kiểm tra trạng thái cấu hình / 9Router
    fetch('/api/video-studio/config', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.routerConnected === 'boolean') {
          setAiServiceHealthy(data.routerConnected);
        }
      })
      .catch(() => {
        // Giữ trạng thái mặc định yên tĩnh nếu đang ngoại tuyến
      });

    // Đồng bộ danh sách đề xuất chờ duyệt & bộ đếm quy tắc x/30 từ `/api/video-studio/learn`
    void fetchLearningState(MOCK_SIMPLE_PREPARE_DATA.project_id);
  }, [fetchLearningState]);

  const handleSaveCapcutDir = useCallback((nextDir: string) => {
    setCapcutDraftDir(nextDir);
    try {
      window.localStorage.setItem(SIMPLE_STUDIO_STORAGE_KEYS.capcutDraftDir, nextDir);
      setStatusFeedback('Đã lưu đường dẫn thư mục dự án CapCut trên máy Mac.');
    } catch {
      // Ignore storage error
    }
  }, []);

  // Đổi bộ dữ liệu cắt mẫu để kiểm thử các trường hợp biên (0 chỗ cắt, đầu, giữa, cuối, < 400ms)
  const handleSelectCutScenario = useCallback((scenarioKey: MockCutScenarioKey) => {
    setCutScenario(scenarioKey);
    const preset = MOCK_CUT_SCENARIOS[scenarioKey];
    const totalCutMs = preset.cuts.reduce(
      (sum, c) => sum + Math.max(0, c.src_end_ms - c.src_start_ms),
      0
    );
    const outDurationMs = Math.max(0, preset.source_duration_ms - totalCutMs);

    setResultData((prev) => ({
      ...prev,
      source_duration_ms: preset.source_duration_ms,
      out_duration_ms: outDurationMs,
      cuts: preset.cuts.map((c) => ({ ...c, restored: false })),
    }));
    setSelectedCutIndex(0);
  }, []);

  const handleUseDemoVideo = useCallback((): SelectedVideoInfo => {
    const demoVideo: SelectedVideoInfo = {
      filename: MOCK_SIMPLE_PREPARE_DATA.filename,
      durationMs: MOCK_SIMPLE_PREPARE_DATA.duration_ms,
      width: MOCK_SIMPLE_PREPARE_DATA.width,
      height: MOCK_SIMPLE_PREPARE_DATA.height,
      resolution: `${MOCK_SIMPLE_PREPARE_DATA.width}×${MOCK_SIMPLE_PREPARE_DATA.height}`,
      sizeBytes: MOCK_SIMPLE_PREPARE_DATA.file_size_bytes,
      fps: MOCK_SIMPLE_PREPARE_DATA.fps,
      serverPath: MOCK_SIMPLE_PREPARE_DATA.source_path,
      isDemo: true,
    };
    setSelectedVideo(demoVideo);
    setPrepareData((prev) => ({
      ...prev,
      filename: demoVideo.filename,
      duration_ms: demoVideo.durationMs,
      width: demoVideo.width,
      height: demoVideo.height,
      file_size_bytes: demoVideo.sizeBytes || MOCK_SIMPLE_PREPARE_DATA.file_size_bytes,
      script_text: prev.script_text.trim()
        ? prev.script_text
        : MOCK_SIMPLE_PREPARE_DATA.script_text,
    }));
    return demoVideo;
  }, []);

  /**
   * Chuẩn hóa và áp dụng dữ liệu `VideoStudioJobResult` trả về từ:
   * - `GET /api/video-studio/jobs/[id]/result`
   * - `POST /api/video-studio/jobs/[id]/rehook`
   */
  const applyJobResultPayload = useCallback(
    (
      data: Partial<VideoStudioJobResult> | Record<string, any> | null | undefined,
      fallbackFilename?: string,
      fallbackDurationMs?: number
    ) => {
      if (!data || typeof data !== 'object') return;
      if (typeof data.source_duration_ms !== 'number' || !Array.isArray(data.cuts)) return;

      setResultData((prev) => {
        const mappedCuts = data.cuts.map((c: any, idx: number) => ({
          id: String(c.id || `cut_${idx + 1}`),
          src_start_ms: Number(c.src_start_ms) || 0,
          src_end_ms: Number(c.src_end_ms) || 0,
          type: c.type === 'stutter' ? 'stumble' : c.type || 'silence',
          reason: String(c.reason || 'Đoạn cần làm sạch'),
          removed_text: c.removed_text ?? c.text ?? undefined,
          restored: Boolean(c.restored),
        }));

        const mappedHooks =
          Array.isArray(data.hooks) && data.hooks.length > 0
            ? data.hooks.map((h: any, idx: number) => ({
                id: String(h.id || h.hook_id || `hook_${idx + 1}`),
                style: String(h.style || 'question'),
                label: h.label || h.style_label_vi || h.title || undefined,
                text: String(h.text || h.hook_text || h.full_hook_text || '').trim(),
                duration_ms: Math.max(1000, Number(h.duration_ms) || 6000),
                selected: Boolean(h.selected),
              }))
            : prev.hooks;

        const incomingFiles = data.files || {};
        const incomingCapcut = incomingFiles.capcut_draft || {};

        return {
          ...prev,
          source_duration_ms:
            data.source_duration_ms || fallbackDurationMs || prev.source_duration_ms,
          out_duration_ms:
            typeof data.out_duration_ms === 'number'
              ? data.out_duration_ms
              : prev.out_duration_ms,
          kept_segments_count: Array.isArray((data as any).segments)
            ? (data as any).segments.length
            : typeof (data as any).kept_segments_count === 'number'
            ? (data as any).kept_segments_count
            : prev.kept_segments_count,
          source_filename: data.source_filename || fallbackFilename || prev.source_filename,
          cuts: mappedCuts,
          hooks: mappedHooks,
          selected_hook_id:
            data.selected_hook_id ||
            mappedHooks.find((h) => h.selected)?.id ||
            prev.selected_hook_id,
          files: {
            ...prev.files,
            ...incomingFiles,
            capcut_draft: {
              ...prev.files.capcut_draft,
              ...incomingCapcut,
              available:
                typeof incomingCapcut.available === 'boolean'
                  ? incomingCapcut.available
                  : prev.files.capcut_draft.available,
              target_dir:
                incomingCapcut.target_dir ||
                incomingCapcut.target_path ||
                prev.files.capcut_draft.target_dir,
            },
          },
          warnings: Array.isArray(data.warnings) ? data.warnings : prev.warnings,
        };
      });
    },
    []
  );

  const fetchAndApplyJobResult = useCallback(
    async (
      jobId: string,
      projectId?: string,
      fallbackFilename?: string,
      fallbackDurationMs?: number
    ) => {
      const resolvedProj = projectId || prepareData.project_id;
      try {
        const res = await fetch(
          `/api/video-studio/jobs/${encodeURIComponent(
            jobId
          )}/result?projectId=${encodeURIComponent(resolvedProj)}&fresh=1`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const data = await res.json().catch(() => null);
          applyJobResultPayload(data, fallbackFilename, fallbackDurationMs);
        }
      } catch {
        // Giữ dữ liệu kết quả mẫu nếu môi trường kiểm thử ngoại tuyến
      }
    },
    [applyJobResultPayload, prepareData.project_id]
  );

  const connectJobEventsStream = useCallback(
    (
      jobId: string,
      projectId?: string,
      fallbackFilename?: string,
      fallbackDurationMs?: number
    ) => {
      closeActiveEventSource();
      isFetchingResultRef.current = false;

      if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
        return;
      }

      const resolvedProjectId = projectId || prepareData.project_id;
      const es = new window.EventSource(
        `/api/video-studio/jobs/${encodeURIComponent(
          jobId
        )}/events?projectId=${encodeURIComponent(resolvedProjectId)}`
      );
      eventSourceRef.current = es;

      const finishToResultOnce = () => {
        if (isFetchingResultRef.current) return;
        isFetchingResultRef.current = true;
        es.close();
        if (eventSourceRef.current === es) {
          eventSourceRef.current = null;
        }
        void fetchAndApplyJobResult(
          jobId,
          resolvedProjectId,
          fallbackFilename,
          fallbackDurationMs
        ).then(() => {
          setIsRetryingStep(false);
          setScreenState('result');
        });
      };

      const handleStepPayload = (rawData: string, eventType?: string) => {
        if (!rawData) return;
        try {
          const parsed = JSON.parse(rawData);
          if (!parsed || typeof parsed !== 'object') return;

          // Trường hợp sự kiện trả về mảng `steps` đầy đủ
          if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
            setSseSteps(parsed.steps);
            const allDone = parsed.steps.every((s: any) => s.status === 'done');
            const anyErr = parsed.steps.some((s: any) => s.status === 'error');
            if (allDone || eventType === 'done' || parsed.status === 'done') {
              finishToResultOnce();
            } else if (anyErr || eventType === 'error' || parsed.status === 'error') {
              es.close();
              if (eventSourceRef.current === es) {
                eventSourceRef.current = null;
              }
              setIsRetryingStep(false);
            }
            return;
          }

          if (eventType === 'done' && typeof parsed.step !== 'number') {
            finishToResultOnce();
            return;
          }

          if (typeof parsed.step !== 'number') return;

          setSseSteps((prev) => {
            const stepNum = Math.max(1, Math.min(5, Math.round(parsed.step))) as VideoStudioStepNumber;
            const next = prev.map((item) =>
              Number(item.step) === stepNum
                ? {
                    ...item,
                    step: stepNum,
                    label: parsed.label || VIDEO_STUDIO_STEP_LABELS[stepNum] || item.label,
                    status: parsed.status || item.status,
                    percent:
                      typeof parsed.percent === 'number' ? parsed.percent : item.percent,
                    detail: parsed.detail || item.detail,
                    error: parsed.error || null,
                  }
                : item
            );

            const allDone =
              next.length === 5 && next.every((stepItem) => stepItem.status === 'done');
            const anyError = next.some((stepItem) => stepItem.status === 'error');

            if (allDone) {
              finishToResultOnce();
            } else if (anyError) {
              es.close();
              if (eventSourceRef.current === es) {
                eventSourceRef.current = null;
              }
              setIsRetryingStep(false);
            }

            return next;
          });
        } catch {
          // Ignore malformed SSE frame
        }
      };

      // Lắng nghe cả `onmessage` chuẩn và các named events (`step`, `done`, `error`)
      es.onmessage = (evt) => {
        handleStepPayload(evt.data, 'message');
      };

      es.addEventListener('step', (evt: MessageEvent) => {
        handleStepPayload(evt.data, 'step');
      });

      es.addEventListener('done', (evt: MessageEvent) => {
        handleStepPayload(evt.data || '{"status":"done"}', 'done');
      });

      es.addEventListener('error', (evt: Event) => {
        const msgEvt = evt as MessageEvent;
        if (typeof msgEvt?.data === 'string' && msgEvt.data.trim()) {
          handleStepPayload(msgEvt.data, 'error');
          return;
        }
        es.close();
        if (eventSourceRef.current === es) {
          eventSourceRef.current = null;
        }
        setIsRetryingStep(false);
      });
    },
    [closeActiveEventSource, fetchAndApplyJobResult, prepareData.project_id]
  );

  const handleStartCutting = useCallback(
    async (payload: SimplePrepareSubmitPayload) => {
      closeActiveEventSource();
      abortActiveUpload();

      setSelectedVideo(payload.video);
      setCutPreset(payload.cutPreset);
      setHookPrompt(payload.hookPrompt);
      setHookClip(payload.hookClip);
      setPrepareTemplate(payload.template);
      setPadStartMs(payload.padStartMs);
      setPadEndMs(payload.padEndMs);
      setKeepLaughter(payload.keepLaughter);

      const nextPacingMode: SimpleCutPacingMode =
        payload.cutPreset === 'strong' ? 'tight' : 'natural';

      setPrepareData((prev) => ({
        ...prev,
        filename: payload.video.filename,
        duration_ms: payload.video.durationMs,
        width: payload.video.width,
        height: payload.video.height,
        file_size_bytes: payload.video.sizeBytes || prev.file_size_bytes,
        script_text: payload.scriptText,
        pacing_mode: nextPacingMode,
      }));

      setProcessingStartedAtMs(Date.now());
      setIsRetryingStep(false);
      setSseSteps(createDefaultProcessingSteps(1));
      setScreenState('processing');
      setStatusFeedback(null);

      let uploadedVideoPath = payload.video.serverPath || prepareData.source_path;
      let uploadedHookClipPath = payload.hookClip?.serverPath || null;

      try {
        // 1. Tải file video gốc qua XMLHttpRequest kèm thanh tiến trình thực tế (0% -> 100%)
        if (payload.video.file && !payload.video.isDemo) {
          setIsUploadingVideo(true);
          setUploadProgressPercent(0);

          const uploadData = await uploadStudioFileWithProgress({
            file: payload.video.file,
            projectId: prepareData.project_id,
            target: 'source_video',
            scriptText: payload.scriptText,
            hookPrompt: payload.hookPrompt,
            onProgress: (pct) => setUploadProgressPercent(pct),
            onXhrCreated: (xhr) => {
              activeUploadXhrRef.current = xhr;
            },
          });

          activeUploadXhrRef.current = null;
          setUploadProgressPercent(100);
          setIsUploadingVideo(false);

          const resolvedVideoPath =
            uploadData?.videoPath ||
            uploadData?.source_video_path ||
            uploadData?.savedPath ||
            uploadData?.data?.source_video;

          if (resolvedVideoPath) {
            uploadedVideoPath = String(resolvedVideoPath);
            setSelectedVideo((prev) =>
              prev ? { ...prev, serverPath: uploadedVideoPath } : prev
            );
            setPrepareData((prev) => ({
              ...prev,
              source_path: uploadedVideoPath,
            }));
          }
        } else {
          setIsUploadingVideo(false);
          setUploadProgressPercent(null);
        }

        // 2. Nếu có clip mở đầu riêng (`hookClip.file`), tải lên qua `/api/video-studio/upload`
        if (payload.hookClip?.file) {
          const hookData = await uploadStudioFileWithProgress({
            file: payload.hookClip.file,
            projectId: prepareData.project_id,
            target: 'hook_clip',
            hookPrompt: payload.hookPrompt,
            onXhrCreated: (xhr) => {
              activeUploadXhrRef.current = xhr;
            },
          });

          activeUploadXhrRef.current = null;
          const resolvedHookPath =
            hookData?.customHookClipPath ||
            hookData?.hookClipPath ||
            hookData?.savedPath ||
            hookData?.data?.custom_hook_clip_path;

          if (resolvedHookPath) {
            uploadedHookClipPath = String(resolvedHookPath);
            setHookClip((prev) =>
              prev ? { ...prev, serverPath: uploadedHookClipPath || undefined } : prev
            );
          }
        }

        // 3. Khởi chạy phiên cắt 5 bước (`POST /api/video-studio/run`)
        const runRes = await fetch('/api/video-studio/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: prepareData.project_id,
            project_id: prepareData.project_id,
            video: uploadedVideoPath,
            script: payload.scriptText,
            cutPreset: payload.cutPreset,
            hookPrompt: payload.hookPrompt,
            hookClipPath: uploadedHookClipPath,
            template: payload.template === 'cut_only' ? 'clean_cut' : 'auto_polish',
            layout_template: payload.template,
            padding: payload.padStartMs,
            padding_ms: payload.padStartMs,
            pad_start_ms: payload.padStartMs,
            pad_end_ms: payload.padEndMs,
            keepLaughter: payload.keepLaughter,
          }),
        });

        const runJson = runRes.ok ? await runRes.json().catch(() => null) : null;
        const jobId = runJson?.job_id || runJson?.jobId || prepareData.project_id;
        const resolvedProjectId =
          runJson?.project_id || runJson?.projectId || prepareData.project_id;

        setActiveJobId(jobId);

        if (Array.isArray(runJson?.steps) && runJson.steps.length > 0) {
          setSseSteps(runJson.steps);
        }

        // 4. Mở EventSource theo dõi tiến trình 5 bước tiếng Việt
        connectJobEventsStream(
          jobId,
          resolvedProjectId,
          payload.video.filename,
          payload.video.durationMs
        );
      } catch (err: any) {
        activeUploadXhrRef.current = null;
        setIsUploadingVideo(false);
        setUploadProgressPercent(null);

        if (err?.message === 'UPLOAD_ABORTED') {
          return;
        }
        setSseSteps(MOCK_SIMPLE_SSE_STEPS_RUNNING);
      }
    },
    [
      abortActiveUpload,
      closeActiveEventSource,
      connectJobEventsStream,
      prepareData.project_id,
      prepareData.source_path,
    ]
  );

  const handleCancelProcessing = useCallback(() => {
    closeActiveEventSource();
    abortActiveUpload();
    setIsUploadingVideo(false);
    setUploadProgressPercent(null);
    setIsRetryingStep(false);
    setScreenState('prepare');
  }, [abortActiveUpload, closeActiveEventSource]);

  const handleRetryFromStep = useCallback(
    async (retryFromRaw: VideoStudioStepNumber | number) => {
      closeActiveEventSource();
      const safeRetryStep = Math.max(
        1,
        Math.min(5, Math.round(Number(retryFromRaw) || 3))
      ) as VideoStudioStepNumber;

      setIsRetryingStep(true);
      setSseSteps(createDefaultProcessingSteps(safeRetryStep));

      try {
        const runRes = await fetch('/api/video-studio/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: prepareData.project_id,
            project_id: prepareData.project_id,
            video: selectedVideo?.serverPath || prepareData.source_path,
            script: prepareData.script_text,
            cutPreset,
            hookPrompt,
            hookClipPath: hookClip?.serverPath || null,
            template: prepareTemplate === 'cut_only' ? 'clean_cut' : 'auto_polish',
            layout_template: prepareTemplate,
            padding: padStartMs,
            padding_ms: padStartMs,
            pad_start_ms: padStartMs,
            pad_end_ms: padEndMs,
            keepLaughter,
            retry_from: safeRetryStep,
          }),
        });
        const runJson = runRes.ok ? await runRes.json().catch(() => null) : null;
        const jobId = runJson?.job_id || runJson?.jobId || activeJobId || prepareData.project_id;
        const resolvedProjectId =
          runJson?.project_id || runJson?.projectId || prepareData.project_id;

        setActiveJobId(jobId);

        if (Array.isArray(runJson?.steps) && runJson.steps.length > 0) {
          setSseSteps(runJson.steps);
        }
        setIsRetryingStep(false);
        connectJobEventsStream(
          jobId,
          resolvedProjectId,
          selectedVideo?.filename || prepareData.filename,
          selectedVideo?.durationMs || prepareData.duration_ms
        );
      } catch {
        setIsRetryingStep(false);
        setSseSteps(createDefaultProcessingSteps(safeRetryStep));
      }
    },
    [
      activeJobId,
      closeActiveEventSource,
      connectJobEventsStream,
      cutPreset,
      hookClip?.serverPath,
      hookPrompt,
      keepLaughter,
      padEndMs,
      padStartMs,
      prepareData.duration_ms,
      prepareData.filename,
      prepareData.project_id,
      prepareData.script_text,
      prepareData.source_path,
      prepareTemplate,
      selectedVideo,
    ]
  );

  const handleSimulateStep3Error = useCallback(() => {
    closeActiveEventSource();
    setIsRetryingStep(false);
    setSseSteps(MOCK_SIMPLE_SSE_STEPS_ERROR_STEP_3);
    setScreenState('processing');
  }, [closeActiveEventSource]);

  const handleFinishProcessingToResult = useCallback(() => {
    closeActiveEventSource();
    setIsRetryingStep(false);
    setSseSteps(MOCK_SIMPLE_SSE_STEPS_DONE);
    void fetchAndApplyJobResult(
      activeJobId || prepareData.project_id,
      prepareData.project_id,
      selectedVideo?.filename || prepareData.filename,
      selectedVideo?.durationMs || prepareData.duration_ms
    ).finally(() => {
      setScreenState('result');
    });
  }, [
    activeJobId,
    closeActiveEventSource,
    fetchAndApplyJobResult,
    prepareData.duration_ms,
    prepareData.filename,
    prepareData.project_id,
    selectedVideo?.durationMs,
    selectedVideo?.filename,
  ]);

  const handleSelectHookOption = useCallback((hookId: string) => {
    setResultData((prev) => ({
      ...prev,
      selected_hook_id: hookId,
      hooks: prev.hooks.map((h) => ({
        ...h,
        selected: h.id === hookId,
      })),
    }));
  }, []);

  /**
   * Đổi phần mở đầu ở Trạng thái 3 (`POST /api/video-studio/jobs/[id]/rehook`):
   * - Nếu người dùng tải lên clip mở đầu riêng mới, tải lên qua `/api/video-studio/upload` trước.
   * - Gọi `POST /api/video-studio/jobs/[id]/rehook` với `{ selected_hook_id, hook_prompt?, hook_clip_path? }`.
   * - Cập nhật tại chỗ `files.polished`, `hooks`, `selected_hook_id`, `out_duration_ms`, `cuts`, `warnings`.
   */
  const handleApplyRehook = useCallback(
    async (payload: SimpleRehookPayload) => {
      handleSelectHookOption(payload.selectedHookId);

      const targetJobOrProjectId = activeJobId || prepareData.project_id;
      let uploadedHookClipPath: string | null | undefined = payload.customHookClipPath;

      try {
        if (payload.customHookClipFile) {
          const uploadHookRes = await uploadStudioFileWithProgress({
            file: payload.customHookClipFile,
            projectId: prepareData.project_id,
            target: 'hook_clip',
            hookPrompt: payload.hookPrompt,
          });
          const resolvedPath =
            uploadHookRes?.customHookClipPath ||
            uploadHookRes?.hookClipPath ||
            uploadHookRes?.savedPath ||
            uploadHookRes?.data?.custom_hook_clip_path;
          if (resolvedPath) {
            uploadedHookClipPath = String(resolvedPath);
          }
        }

        const rehookBody: Record<string, any> = {
          selected_hook_id: payload.selectedHookId,
        };
        if (payload.hookPrompt && payload.hookPrompt.trim()) {
          rehookBody.hook_prompt = payload.hookPrompt.trim();
        }
        if (uploadedHookClipPath) {
          rehookBody.hook_clip_path = uploadedHookClipPath;
        }

        const res = await fetch(
          `/api/video-studio/jobs/${encodeURIComponent(targetJobOrProjectId)}/rehook`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rehookBody),
          }
        );

        if (res.ok) {
          const updatedResult = await res.json().catch(() => null);
          if (updatedResult) {
            applyJobResultPayload(
              updatedResult,
              selectedVideo?.filename || prepareData.filename,
              selectedVideo?.durationMs || prepareData.duration_ms
            );
            return updatedResult;
          }
        }
      } catch {
        // Fallback giữ trạng thái chọn mở đầu tại chỗ nếu ngoại tuyến
      }
    },
    [
      activeJobId,
      applyJobResultPayload,
      handleSelectHookOption,
      prepareData.duration_ms,
      prepareData.filename,
      prepareData.project_id,
      selectedVideo?.durationMs,
      selectedVideo?.filename,
    ]
  );

  /**
   * Đồng bộ khôi phục / giữ lại đoạn đã cắt với `POST /api/video-studio/jobs/[id]/rehook`
   */
  const handleRestoreCut = useCallback(
    async (cutId: string, restore = true) => {
      if (!cutId) return;

      // Cập nhật lạc quan tại chỗ
      setResultData((prev) => {
        const nextCuts = prev.cuts.map((c) =>
          c.id === cutId ? { ...c, restored: restore } : c
        );
        const removedMs = nextCuts
          .filter((c) => !c.restored)
          .reduce((sum, c) => sum + Math.max(0, c.src_end_ms - c.src_start_ms), 0);
        return {
          ...prev,
          cuts: nextCuts,
          out_duration_ms: Math.max(0, prev.source_duration_ms - removedMs),
        };
      });

      const targetJobOrProjectId = activeJobId || prepareData.project_id;
      try {
        const res = await fetch(
          `/api/video-studio/jobs/${encodeURIComponent(targetJobOrProjectId)}/rehook`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              selected_hook_id: resultData.selected_hook_id,
              ...(restore ? { restore_cut_id: cutId } : { unrestore_cut_id: cutId }),
            }),
          }
        );
        if (res.ok) {
          const updatedResult = await res.json().catch(() => null);
          applyJobResultPayload(
            updatedResult,
            selectedVideo?.filename || prepareData.filename,
            selectedVideo?.durationMs || prepareData.duration_ms
          );
        }
      } catch {
        // Giữ kết quả cập nhật tại chỗ nếu ngoại tuyến
      }
    },
    [
      activeJobId,
      applyJobResultPayload,
      prepareData.duration_ms,
      prepareData.filename,
      prepareData.project_id,
      resultData.selected_hook_id,
      selectedVideo?.durationMs,
      selectedVideo?.filename,
    ]
  );

  /**
   * Phần 3: Nối các thao tác "Duyệt", "Bỏ qua", "Xóa quy tắc" với `POST /api/video-studio/learn`
   */
  const handleApproveLearningProposal = useCallback(
    async (proposalId: string, explicitRuleText?: string) => {
      const target = learningProposals.find((p) => p.id === proposalId);
      const resolvedRuleText = (explicitRuleText || target?.rule_text || '').trim();

      setActingProposalId(proposalId);
      setIsSyncingLearn(true);
      setLearningFeedback(null);

      // Cập nhật ngay trên giao diện và giảm số chấm thông báo trên thanh trên cùng
      setLearningProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: 'approved' } : p))
      );
      if (resolvedRuleText) {
        setAppliedRules((rules) =>
          rules.includes(resolvedRuleText)
            ? rules
            : [resolvedRuleText, ...rules].slice(0, maxLearningRules)
        );
        setLearningRuleItems((items) =>
          items.some((it) => it.text === resolvedRuleText)
            ? items
            : [
                { id: `rule_${Date.now()}`, text: resolvedRuleText },
                ...items,
              ].slice(0, maxLearningRules)
        );
      }

      try {
        const res = await fetch('/api/video-studio/learn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: prepareData.project_id,
            action: 'approve_proposal',
            proposal_id: proposalId,
            id: proposalId,
            rule_vi: resolvedRuleText,
            rule: resolvedRuleText,
          }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && data.ok) {
            applyLearnApiPayload(data);
            if (data.message) {
              setLearningFeedback(data.message);
            }
          }
        }
      } catch {
        // Giữ trạng thái đã duyệt trên client nếu ngoại tuyến
      } finally {
        setActingProposalId(null);
        setIsSyncingLearn(false);
      }
    },
    [applyLearnApiPayload, learningProposals, maxLearningRules, prepareData.project_id]
  );

  const handleDismissLearningProposal = useCallback(
    async (proposalId: string) => {
      setActingProposalId(proposalId);
      setIsSyncingLearn(true);
      setLearningFeedback(null);

      // Ẩn ngay đề xuất bị bỏ qua và đồng bộ lại chấm thông báo trên thanh trên cùng
      setLearningProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: 'dismissed' } : p))
      );

      try {
        const res = await fetch('/api/video-studio/learn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: prepareData.project_id,
            action: 'dismiss_proposal',
            proposal_id: proposalId,
            id: proposalId,
          }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && data.ok) {
            applyLearnApiPayload(data);
            if (data.message) {
              setLearningFeedback(data.message);
            }
          }
        }
      } catch {
        // Giữ trạng thái đã bỏ qua trên client nếu ngoại tuyến
      } finally {
        setActingProposalId(null);
        setIsSyncingLearn(false);
      }
    },
    [applyLearnApiPayload, prepareData.project_id]
  );

  const handleDeleteLearningRule = useCallback(
    async (ruleId: string, ruleText?: string) => {
      setActingRuleId(ruleId);
      setIsSyncingLearn(true);
      setLearningFeedback(null);

      setLearningRuleItems((prev) => prev.filter((r) => r.id !== ruleId && r.text !== ruleText));
      if (ruleText) {
        setAppliedRules((prev) => prev.filter((r) => r !== ruleText));
      }

      try {
        const res = await fetch('/api/video-studio/learn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: prepareData.project_id,
            action: 'delete_lesson',
            lesson_id: ruleId,
            id: ruleId,
            text: ruleText,
          }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && data.ok) {
            applyLearnApiPayload(data);
            if (data.message) {
              setLearningFeedback(data.message);
            }
          }
        }
      } catch {
        // Giữ trạng thái đã xóa trên client nếu ngoại tuyến
      } finally {
        setActingRuleId(null);
        setIsSyncingLearn(false);
      }
    },
    [applyLearnApiPayload, prepareData.project_id]
  );

  const pendingLearningProposals = useMemo(
    () => learningProposals.filter((p) => p.status === 'pending'),
    [learningProposals]
  );

  const safeSelectedCutIndex = useMemo(() => {
    if (resultData.cuts.length === 0) return -1;
    return Math.min(Math.max(0, selectedCutIndex), resultData.cuts.length - 1);
  }, [resultData.cuts.length, selectedCutIndex]);

  return (
    <div
      lang="vi"
      className="min-h-screen bg-[#FAF7F2] text-[#17231f] font-sans flex flex-col"
    >
      {/* Thanh trên cùng tối giản 56px (chấm thông báo trên nút "Học & cải thiện" chỉ hiện khi pendingLearningCount > 0) */}
      <SimpleStudioHeader
        aiServiceHealthy={aiServiceHealthy}
        pendingLearningCount={pendingLearningProposals.length}
        isLearningOpen={isLearningOpen}
        onToggleLearning={() => {
          setIsLearningOpen((prev) => {
            const nextOpen = !prev;
            if (nextOpen) {
              void fetchLearningState(prepareData.project_id);
            }
            return nextOpen;
          });
          setIsSettingsOpen(false);
        }}
        isSettingsOpen={isSettingsOpen}
        onToggleSettings={() => {
          setIsSettingsOpen((prev) => !prev);
          setIsLearningOpen(false);
        }}
      />

      {/* Ngăn "Học & cải thiện" đơn giản (Mục 3.5 thiết kế — không bảng diff nhiều cột hay thẻ số liệu P9) */}
      {isLearningOpen && (
        <SimpleLearningPanel
          projectId={prepareData.project_id}
          proposals={learningProposals}
          appliedRules={appliedRules}
          ruleItems={learningRuleItems}
          maxRules={maxLearningRules}
          isLoading={isSyncingLearn}
          actingProposalId={actingProposalId}
          actingRuleId={actingRuleId}
          feedbackMessage={learningFeedback}
          onApproveProposal={handleApproveLearningProposal}
          onDismissProposal={handleDismissLearningProposal}
          onDeleteRule={handleDeleteLearningRule}
          onClose={() => setIsLearningOpen(false)}
        />
      )}

      {/* Ngăn "Cài đặt" */}
      {isSettingsOpen && (
        <section
          aria-label="Cài đặt thư mục CapCut và chế độ hiển thị"
          className="bg-[#FFFFFF] border-b border-[#E5E0D8]"
        >
          <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#e9eeeb]">
              <div>
                <h2 className="font-heading font-bold text-[18px] leading-[26px] text-[#17231f]">
                  Cài đặt công cụ cắt vấp
                </h2>
                <p className="mt-0.5 text-[13px] leading-[20px] text-[#4a5d54]">
                  Thiết lập đường dẫn thư mục dự án CapCut trên máy Mac và tùy chọn kiểm thử.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="px-3 min-h-[44px] rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] text-[13px] leading-[20px] font-medium text-[#17231f] hover:bg-[#f6f8f6] whitespace-nowrap"
              >
                Đóng cài đặt ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="capcut-dir-input"
                  className="block text-[13px] leading-[20px] font-medium text-[#17231f]"
                >
                  Thư mục dự án CapCut trên máy Mac
                </label>
                <div className="flex gap-2">
                  <input
                    id="capcut-dir-input"
                    type="text"
                    value={capcutDraftDir}
                    onChange={(e) => setCapcutDraftDir(e.target.value)}
                    className="flex-1 min-h-[44px] px-3 rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] font-mono text-[13px] leading-[20px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveCapcutDir(capcutDraftDir)}
                    className="px-4 min-h-[44px] rounded-[6px] bg-[#176b51] hover:bg-[#10583f] text-[#ffffff] text-[13px] leading-[20px] font-medium whitespace-nowrap"
                  >
                    Lưu
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="cut-scenario-select"
                  className="block text-[13px] leading-[20px] font-medium text-[#17231f]"
                >
                  Bộ dữ liệu kiểm thử Bản đồ đoạn cắt
                </label>
                <select
                  id="cut-scenario-select"
                  value={cutScenario}
                  onChange={(e) =>
                    handleSelectCutScenario(e.target.value as MockCutScenarioKey)
                  }
                  className="w-full min-h-[44px] px-3 rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] text-[13px] leading-[20px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                >
                  {(Object.keys(MOCK_CUT_SCENARIOS) as MockCutScenarioKey[]).map((key) => (
                    <option key={key} value={key}>
                      {MOCK_CUT_SCENARIOS[key].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Khu vực chuyển nhanh trạng thái kiểm thử dành cho QA (được gom gọn vào trong ngăn Cài đặt) */}
            <div className="pt-3 border-t border-[#e9eeeb] space-y-2.5">
              <p className="text-[13px] leading-[20px] font-medium text-[#4a5d54]">
                Chuyển nhanh trạng thái kiểm thử (dành cho nghiệm thu giao diện):
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="qa-state-prepare-empty"
                  onClick={() => {
                    setSelectedVideo(null);
                    setScreenState('prepare');
                  }}
                  className={`px-3 min-h-[44px] rounded-[6px] border text-[13px] leading-[20px] font-medium transition-colors ${
                    screenState === 'prepare' && !selectedVideo
                      ? 'bg-[#176b51] border-[#176b51] text-[#ffffff]'
                      : 'bg-[#ffffff] border-[#d5e0d7] text-[#17231f] hover:bg-[#f6f8f6]'
                  }`}
                >
                  1. Chuẩn bị video
                </button>
                <button
                  type="button"
                  data-testid="qa-state-prepare-filled"
                  onClick={() => {
                    handleUseDemoVideo();
                    setScreenState('prepare');
                  }}
                  className={`px-3 min-h-[44px] rounded-[6px] border text-[13px] leading-[20px] font-medium transition-colors ${
                    screenState === 'prepare' && Boolean(selectedVideo)
                      ? 'bg-[#176b51] border-[#176b51] text-[#ffffff]'
                      : 'bg-[#ffffff] border-[#d5e0d7] text-[#17231f] hover:bg-[#f6f8f6]'
                  }`}
                >
                  Đã chọn video mẫu
                </button>
                <button
                  type="button"
                  data-testid="qa-state-processing-running"
                  onClick={() => {
                    setSseSteps(MOCK_SIMPLE_SSE_STEPS_RUNNING);
                    setScreenState('processing');
                  }}
                  className={`px-3 min-h-[44px] rounded-[6px] border text-[13px] leading-[20px] font-medium transition-colors ${
                    screenState === 'processing' &&
                    !sseSteps.some((s) => s.status === 'error')
                      ? 'bg-[#176b51] border-[#176b51] text-[#ffffff]'
                      : 'bg-[#ffffff] border-[#d5e0d7] text-[#17231f] hover:bg-[#f6f8f6]'
                  }`}
                >
                  2. Đang xử lý (5 bước)
                </button>
                <button
                  type="button"
                  data-testid="qa-state-processing-error"
                  onClick={() => {
                    setScreenState('processing');
                    handleSimulateStep3Error();
                  }}
                  className={`px-3 min-h-[44px] rounded-[6px] border text-[13px] leading-[20px] font-medium transition-colors ${
                    screenState === 'processing' &&
                    sseSteps.some((s) => s.status === 'error')
                      ? 'bg-[#993f37] border-[#993f37] text-[#ffffff]'
                      : 'bg-[#ffffff] border-[#d5e0d7] text-[#17231f] hover:bg-[#f6f8f6]'
                  }`}
                >
                  Mô phỏng lỗi bước 3
                </button>
                <button
                  type="button"
                  data-testid="qa-state-result"
                  onClick={handleFinishProcessingToResult}
                  className={`px-3 min-h-[44px] rounded-[6px] border text-[13px] leading-[20px] font-medium transition-colors ${
                    screenState === 'result'
                      ? 'bg-[#176b51] border-[#176b51] text-[#ffffff]'
                      : 'bg-[#ffffff] border-[#d5e0d7] text-[#17231f] hover:bg-[#f6f8f6]'
                  }`}
                >
                  3. Kết quả &amp; Bản đồ đoạn cắt
                </button>
                <button
                  type="button"
                  data-testid="qa-toggle-capcut-avail"
                  onClick={() =>
                    setResultData((prev) => {
                      const nextAvail = !prev.files.capcut_draft.available;
                      return {
                        ...prev,
                        files: {
                          ...prev.files,
                          capcut_draft: {
                            ...prev.files.capcut_draft,
                            available: nextAvail,
                            reason: nextAvail
                              ? undefined
                              : DEFAULT_CAPCUT_UNAVAILABLE_REASON,
                          },
                        },
                      };
                    })
                  }
                  className={`px-3 min-h-[44px] rounded-[6px] border text-[13px] leading-[20px] font-medium ${
                    !resultData.files.capcut_draft.available
                      ? 'bg-[#faf3e7] border-[#d5c19a] text-[#8f5d14]'
                      : 'bg-[#ffffff] border-[#d5e0d7] text-[#4a5d54] hover:text-[#17231f]'
                  }`}
                >
                  {resultData.files.capcut_draft.available
                    ? 'CapCut: Khả dụng'
                    : 'CapCut: Vô hiệu hóa'}
                </button>
              </div>
            </div>

            {statusFeedback && (
              <p className="text-[13px] leading-[20px] text-[#176b51] font-medium">
                {statusFeedback}
              </p>
            )}
          </div>
        </section>
      )}

      {/* NỘI DUNG CHÍNH: 1 luồng làm việc duy nhất (Chuẩn bị -> Đang xử lý -> Kết quả) */}
      <main className="flex-1 w-full max-w-[1160px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* =====================================================================
            TRẠNG THÁI 1: CHUẨN BỊ (`prepare` — Bố cục 1 bề mặt max-w-[760px])
            ===================================================================== */}
        {screenState === 'prepare' && (
          <SimplePrepareState
            video={selectedVideo}
            onVideoChange={(nextVideo) => {
              setSelectedVideo(nextVideo);
              if (nextVideo) {
                setPrepareData((prev) => ({
                  ...prev,
                  filename: nextVideo.filename,
                  duration_ms: nextVideo.durationMs,
                  width: nextVideo.width,
                  height: nextVideo.height,
                  file_size_bytes: nextVideo.sizeBytes || prev.file_size_bytes,
                }));
              }
            }}
            scriptText={prepareData.script_text}
            onScriptChange={(nextScript) =>
              setPrepareData((prev) => ({ ...prev, script_text: nextScript }))
            }
            cutPreset={cutPreset}
            onCutPresetChange={setCutPreset}
            hookPrompt={hookPrompt}
            onHookPromptChange={setHookPrompt}
            hookClip={hookClip}
            onHookClipChange={setHookClip}
            template={prepareTemplate}
            onTemplateChange={setPrepareTemplate}
            padStartMs={padStartMs}
            onPadStartMsChange={setPadStartMs}
            padEndMs={padEndMs}
            onPadEndMsChange={setPadEndMs}
            keepLaughter={keepLaughter}
            onKeepLaughterChange={setKeepLaughter}
            onUseDemoVideo={handleUseDemoVideo}
            onStartCutting={handleStartCutting}
          />
        )}

        {/* =====================================================================
            TRẠNG THÁI 2: ĐANG XỬ LÝ (`processing` — 5 bước tuần tự 1..5)
            ===================================================================== */}
        {screenState === 'processing' && (
          <div className="max-w-[760px] mx-auto">
            <SimpleProcessingState
              videoFilename={selectedVideo?.filename || prepareData.filename}
              videoDurationMs={selectedVideo?.durationMs || prepareData.duration_ms}
              cutPreset={cutPreset}
              hasScript={prepareData.script_text.trim().length > 0}
              isUploading={isUploadingVideo}
              uploadProgressPercent={uploadProgressPercent}
              steps={sseSteps}
              startedAtMs={processingStartedAtMs}
              isRetrying={isRetryingStep}
              onCancel={handleCancelProcessing}
              onRetryStep={(retryFromStep) => handleRetryFromStep(retryFromStep)}
              onSwitchOfflineFallback={handleFinishProcessingToResult}
            />
          </div>
        )}

        {/* =====================================================================
            TRẠNG THÁI 3: KẾT QUẢ (`result` — Bản đồ đoạn cắt + Xem trước + Tải về)
            ===================================================================== */}
        {screenState === 'result' && (
          <SimpleResultState
            result={{
              ...resultData,
              source_filename: resultData.source_filename || prepareData.filename,
            }}
            projectId={prepareData.project_id}
            selectedCutIndex={safeSelectedCutIndex >= 0 ? safeSelectedCutIndex : 0}
            onSelectCutIndex={(idx) => setSelectedCutIndex(idx)}
            onSelectHook={handleSelectHookOption}
            onApplyHook={handleApplyRehook}
            onRestoreCut={handleRestoreCut}
            onOpenOrDownloadCapCutDraft={async () => {
              try {
                await fetch('/api/video-studio/capcut-sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    projectId: prepareData.project_id,
                    action: 'push_to_capcut',
                  }),
                });
              } catch {
                // Ignore if offline
              }
              setStatusFeedback(
                `Đã đồng bộ gói dự án sang thư mục CapCut (${capcutDraftDir}).`
              );
            }}
            onResetToPrepare={() => setScreenState('prepare')}
          />
        )}
      </main>
    </div>
  );
}
