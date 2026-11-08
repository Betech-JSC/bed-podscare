'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { SimpleStudioHeader } from '@/src/components/video-studio/SimpleStudioHeader';
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
import type {
  CutPreset,
  SimpleCutPacingMode,
  SimpleLearningProposalItem,
  SimplePrepareData,
  SimpleStudioResult,
  SimpleStudioScreenState,
  VideoStudioStepEvent,
  VideoStudioStepNumber,
} from '@/src/lib/video-studio/types';

const AdvancedStudioWorkspace = dynamic(
  () => import('@/src/components/video-studio/AdvancedStudioWorkspace'),
  {
    ssr: false,
    loading: () => (
      <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-8">
        <div className="bg-[#ffffff] border border-[#e9eeeb] rounded-[6px] p-6 text-[15px] leading-[24px] text-[#4a5d54]">
          Đang mở giao diện Chế độ chuyên sâu (P0–P9)...
        </div>
      </div>
    ),
  }
);

export default function VideoStudioPage() {
  // Hydration-safe state: defaults are 100% deterministic on SSR & initial client render
  const [hasMounted, setHasMounted] = useState<boolean>(false);
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
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
  const [selectedCutIndex, setSelectedCutIndex] = useState<number>(3); // Mặc định trỏ vào chỗ cắt #4 (hoặc #1 nếu ít hơn)
  const [cutScenario, setCutScenario] = useState<MockCutScenarioKey>('default_11_cuts');

  // Ngăn "Học & cải thiện" & Ngăn "Cài đặt"
  const [isLearningOpen, setIsLearningOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [showAllAppliedRules, setShowAllAppliedRules] = useState<boolean>(false);
  const [learningProposals, setLearningProposals] = useState<SimpleLearningProposalItem[]>(
    MOCK_SIMPLE_LEARNING_PROPOSALS
  );
  const [appliedRules, setAppliedRules] = useState<string[]>(MOCK_APPLIED_LEARNING_RULES);
  const [capcutDraftDir, setCapcutDraftDir] = useState<string>(DEFAULT_MAC_CAPCUT_DRAFT_DIR);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  const closeActiveEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      closeActiveEventSource();
    };
  }, [closeActiveEventSource]);

  // Đọc localStorage & kiểm tra trạng thái dịch vụ AI sau khi mount (không gây lệch SSR/Client)
  useEffect(() => {
    setHasMounted(true);
    try {
      const savedAdvanced = window.localStorage.getItem(SIMPLE_STUDIO_STORAGE_KEYS.advancedMode);
      if (savedAdvanced === 'true') {
        setAdvancedMode(true);
      }
      const savedCapcutDir = window.localStorage.getItem(SIMPLE_STUDIO_STORAGE_KEYS.capcutDraftDir);
      if (savedCapcutDir && savedCapcutDir.trim()) {
        setCapcutDraftDir(savedCapcutDir.trim());
      }
    } catch {
      // Ignore storage access errors in private mode
    }

    // Kiểm tra nhẹ nhàng trạng thái cấu hình/9Router sau khi mount
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
  }, []);

  const handleToggleAdvancedMode = useCallback((nextVal: boolean) => {
    setAdvancedMode(nextVal);
    try {
      window.localStorage.setItem(SIMPLE_STUDIO_STORAGE_KEYS.advancedMode, String(nextVal));
    } catch {
      // Ignore storage error
    }
  }, []);

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

  const fetchAndApplyJobResult = useCallback(
    async (jobId: string, fallbackFilename?: string, fallbackDurationMs?: number) => {
      try {
        const res = await fetch(
          `/api/video-studio/jobs/${encodeURIComponent(jobId)}/result?fresh=1`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.source_duration_ms === 'number' && Array.isArray(data.cuts)) {
            setResultData((prev) => ({
              ...prev,
              source_duration_ms: data.source_duration_ms || fallbackDurationMs || prev.source_duration_ms,
              out_duration_ms:
                typeof data.out_duration_ms === 'number' ? data.out_duration_ms : prev.out_duration_ms,
              source_filename:
                data.source_filename || fallbackFilename || prev.source_filename,
              cuts: data.cuts.map((c: any, idx: number) => ({
                id: c.id || `cut_${idx + 1}`,
                src_start_ms: Number(c.src_start_ms) || 0,
                src_end_ms: Number(c.src_end_ms) || 0,
                type: c.type || 'silence',
                reason: c.reason || 'Đoạn cần làm sạch',
                removed_text: c.removed_text,
                restored: Boolean(c.restored),
              })),
              hooks: Array.isArray(data.hooks) && data.hooks.length > 0 ? data.hooks : prev.hooks,
              selected_hook_id: data.selected_hook_id || prev.selected_hook_id,
              files: data.files ? { ...prev.files, ...data.files } : prev.files,
              warnings: Array.isArray(data.warnings) ? data.warnings : prev.warnings,
            }));
          }
        }
      } catch {
        // Giữ dữ liệu kết quả mẫu nếu môi trường kiểm thử ngoại tuyến
      }
    },
    []
  );

  const connectJobEventsStream = useCallback(
    (jobId: string, fallbackFilename?: string, fallbackDurationMs?: number) => {
      closeActiveEventSource();
      if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
        return;
      }

      const es = new window.EventSource(
        `/api/video-studio/jobs/${encodeURIComponent(jobId)}/events`
      );
      eventSourceRef.current = es;

      es.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data);
          if (!parsed || typeof parsed.step !== 'number') return;

          setSseSteps((prev) => {
            const next = prev.map((item) =>
              item.step === parsed.step
                ? {
                    ...item,
                    step: parsed.step,
                    label: parsed.label || item.label,
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

            if (allDone || anyError) {
              es.close();
              if (eventSourceRef.current === es) {
                eventSourceRef.current = null;
              }
            }

            if (allDone) {
              void fetchAndApplyJobResult(jobId, fallbackFilename, fallbackDurationMs).then(
                () => {
                  setIsRetryingStep(false);
                  setScreenState('result');
                }
              );
            } else if (anyError) {
              setIsRetryingStep(false);
            }

            return next;
          });
        } catch {
          // Ignore malformed SSE message
        }
      };

      es.onerror = () => {
        es.close();
        if (eventSourceRef.current === es) {
          eventSourceRef.current = null;
        }
        setIsRetryingStep(false);
      };
    },
    [closeActiveEventSource, fetchAndApplyJobResult]
  );

  const handleStartCutting = useCallback(
    async (payload: SimplePrepareSubmitPayload) => {
      closeActiveEventSource();
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
      let uploadedHookClipPath = payload.hookClip?.serverPath;

      try {
        if (payload.video.file && !payload.video.isDemo) {
          setIsUploadingVideo(true);
          setUploadProgressPercent(25);
          const formData = new FormData();
          formData.append('projectId', prepareData.project_id);
          formData.append('role', 'source_video');
          formData.append('file', payload.video.file);

          const uploadRes = await fetch('/api/video-studio/upload', {
            method: 'POST',
            body: formData,
          });
          setUploadProgressPercent(100);
          setIsUploadingVideo(false);

          if (uploadRes.ok) {
            const uploadData = await uploadRes.json().catch(() => null);
            if (uploadData?.savedPath) {
              uploadedVideoPath = uploadData.savedPath;
            }
          }
        } else {
          setIsUploadingVideo(false);
          setUploadProgressPercent(null);
        }

        if (payload.hookClip?.file) {
          const hookForm = new FormData();
          hookForm.append('projectId', prepareData.project_id);
          hookForm.append('role', 'hook_clip');
          hookForm.append('file', payload.hookClip.file);
          const hookRes = await fetch('/api/video-studio/upload', {
            method: 'POST',
            body: hookForm,
          });
          if (hookRes.ok) {
            const hookData = await hookRes.json().catch(() => null);
            if (hookData?.savedPath) {
              uploadedHookClipPath = hookData.savedPath;
            }
          }
        }

        const runRes = await fetch('/api/video-studio/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: prepareData.project_id,
            video: uploadedVideoPath,
            script: payload.scriptText,
            cutPreset: payload.cutPreset,
            hookPrompt: payload.hookPrompt,
            hookClipPath: uploadedHookClipPath,
            template: payload.template === 'cut_only' ? 'clean_cut' : 'auto_polish',
            padding: payload.padStartMs,
            keepLaughter: payload.keepLaughter,
          }),
        });

        const runJson = runRes.ok ? await runRes.json().catch(() => null) : null;
        const jobId = runJson?.job_id || runJson?.jobId || prepareData.project_id;
        setActiveJobId(jobId);

        if (Array.isArray(runJson?.steps) && runJson.steps.length > 0) {
          setSseSteps(runJson.steps);
        }

        connectJobEventsStream(jobId, payload.video.filename, payload.video.durationMs);
      } catch {
        setIsUploadingVideo(false);
        setUploadProgressPercent(null);
        setSseSteps(MOCK_SIMPLE_SSE_STEPS_RUNNING);
      }
    },
    [closeActiveEventSource, connectJobEventsStream, prepareData.project_id, prepareData.source_path]
  );

  const handleCancelProcessing = useCallback(() => {
    closeActiveEventSource();
    setIsUploadingVideo(false);
    setUploadProgressPercent(null);
    setIsRetryingStep(false);
    setScreenState('prepare');
  }, [closeActiveEventSource]);

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
            video: selectedVideo?.serverPath || prepareData.source_path,
            script: prepareData.script_text,
            cutPreset,
            hookPrompt,
            template: prepareTemplate === 'cut_only' ? 'clean_cut' : 'auto_polish',
            padding: padStartMs,
            keepLaughter,
            retry_from: safeRetryStep,
          }),
        });
        const runJson = runRes.ok ? await runRes.json().catch(() => null) : null;
        const jobId = runJson?.job_id || runJson?.jobId || activeJobId || prepareData.project_id;
        setActiveJobId(jobId);

        if (Array.isArray(runJson?.steps) && runJson.steps.length > 0) {
          setSseSteps(runJson.steps);
        }
        setIsRetryingStep(false);
        connectJobEventsStream(
          jobId,
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
      hookPrompt,
      keepLaughter,
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
    setScreenState('result');
  }, [closeActiveEventSource]);

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

  const handleApproveLearningProposal = useCallback((proposalId: string) => {
    setLearningProposals((prev) => {
      const target = prev.find((p) => p.id === proposalId);
      if (target) {
        setAppliedRules((rules) =>
          rules.includes(target.rule_text) ? rules : [target.rule_text, ...rules].slice(0, 30)
        );
      }
      return prev.map((p) => (p.id === proposalId ? { ...p, status: 'approved' } : p));
    });
  }, []);

  const handleDismissLearningProposal = useCallback((proposalId: string) => {
    setLearningProposals((prev) =>
      prev.map((p) => (p.id === proposalId ? { ...p, status: 'dismissed' } : p))
    );
  }, []);

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
      {/* Thanh trên cùng tối giản 56px (luôn hiển thị để bật/tắt Chế độ chuyên sâu bất cứ lúc nào) */}
      <SimpleStudioHeader
        aiServiceHealthy={aiServiceHealthy}
        pendingLearningCount={pendingLearningProposals.length}
        isLearningOpen={isLearningOpen}
        onToggleLearning={() => {
          setIsLearningOpen((prev) => !prev);
          setIsSettingsOpen(false);
        }}
        advancedMode={advancedMode}
        onToggleAdvancedMode={handleToggleAdvancedMode}
        isSettingsOpen={isSettingsOpen}
        onToggleSettings={() => {
          setIsSettingsOpen((prev) => !prev);
          setIsLearningOpen(false);
        }}
      />

      {/* Ngăn "Học & cải thiện" (Mục 3.5 thiết kế) */}
      {isLearningOpen && (
        <section
          aria-label="Học từ bản sửa CapCut của bạn"
          className="bg-[#FFFFFF] border-b border-[#E5E0D8]"
        >
          <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#e9eeeb]">
              <div>
                <h2 className="font-heading font-bold text-[18px] leading-[26px] text-[#17231f]">
                  Học từ bản sửa CapCut của bạn
                </h2>
                <p className="mt-0.5 text-[15px] leading-[24px] text-[#4a5d54] max-w-[68ch]">
                  AI đã so sánh bản cắt tự động với bản bạn chỉnh lại trong CapCut để rút ra quy tắc
                  mới cho các video tiếp theo.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[13px] leading-[20px] font-medium text-[#176b51] bg-[#e9f4ef] px-2.5 py-1 rounded-[6px]">
                  Bộ nhớ quy tắc: {appliedRules.length}/30
                </span>
                <button
                  type="button"
                  onClick={() => setIsLearningOpen(false)}
                  className="px-3 min-h-[40px] rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] text-[13px] leading-[20px] font-medium text-[#17231f] hover:bg-[#f6f8f6]"
                >
                  Đóng ngăn ×
                </button>
              </div>
            </div>

            {pendingLearningProposals.length > 0 ? (
              <div className="mt-4 divide-y divide-[#e9eeeb] border border-[#d5e0d7] rounded-[6px] bg-[#ffffff]">
                {pendingLearningProposals.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 max-w-[68ch]">
                      <p className="text-[15px] leading-[24px] font-medium text-[#17231f]">
                        {idx + 1}. {item.rule_text}
                      </p>
                      <p className="text-[13px] leading-[20px] text-[#4a5d54]">
                        {item.detected_at_label}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-none">
                      <button
                        type="button"
                        onClick={() => handleApproveLearningProposal(item.id)}
                        className="px-3.5 min-h-[40px] rounded-[6px] bg-[#176b51] hover:bg-[#10583f] text-[#ffffff] text-[13px] leading-[20px] font-medium"
                      >
                        Duyệt
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissLearningProposal(item.id)}
                        className="px-3.5 min-h-[40px] rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] hover:bg-[#f6f8f6] text-[#4a5d54] text-[13px] leading-[20px] font-medium"
                      >
                        Bỏ qua
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 p-4 rounded-[6px] border border-[#e9eeeb] bg-[#f6f8f6] text-[15px] leading-[24px] text-[#4a5d54]">
                Bạn đã xử lý hết các đề xuất quy tắc mới.
              </div>
            )}

            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowAllAppliedRules((prev) => !prev)}
                className="text-[13px] leading-[20px] font-medium text-[#176b51] hover:underline py-1"
              >
                {showAllAppliedRules
                  ? `▾ Thu gọn ${appliedRules.length}/30 quy tắc đang áp dụng`
                  : `▸ Xem ${appliedRules.length}/30 quy tắc đang áp dụng (Bấm để mở rộng danh sách)`}
              </button>
              {showAllAppliedRules && (
                <ol className="mt-2 p-4 rounded-[6px] border border-[#e9eeeb] bg-[#f6f8f6] space-y-1.5 list-decimal list-inside text-[13px] leading-[20px] text-[#17231f]">
                  {appliedRules.map((rule, idx) => (
                    <li key={idx} className="max-w-[68ch]">
                      {rule}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>
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
                className="px-3 min-h-[40px] rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] text-[13px] leading-[20px] font-medium text-[#17231f] hover:bg-[#f6f8f6]"
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
                    className="flex-1 min-h-[40px] px-3 rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] font-mono text-[13px] leading-[20px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveCapcutDir(capcutDraftDir)}
                    className="px-3.5 min-h-[40px] rounded-[6px] bg-[#176b51] hover:bg-[#10583f] text-[#ffffff] text-[13px] leading-[20px] font-medium"
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
                  className="w-full min-h-[40px] px-3 rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] text-[13px] leading-[20px] text-[#17231f] focus:outline-none focus:border-[#176b51]"
                >
                  {(Object.keys(MOCK_CUT_SCENARIOS) as MockCutScenarioKey[]).map((key) => (
                    <option key={key} value={key}>
                      {MOCK_CUT_SCENARIOS[key].label}
                    </option>
                  ))}
                </select>
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

      {/* NỘI DUNG CHÍNH: Chế độ chuyên sâu (Lazy-load) HOẶC Chế độ đơn giản (Mặc định) */}
      {hasMounted && advancedMode ? (
        <main className="flex-1 w-full">
          <AdvancedStudioWorkspace
            onRouterStatusChange={(connected) => setAiServiceHealthy(connected)}
          />
        </main>
      ) : (
        <main className="flex-1 w-full max-w-[1160px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Thanh chuyển nhanh 3 trạng thái phục vụ kiểm thử mượt mà */}
          <div className="mb-6 pb-3 border-b border-[#e9eeeb] flex flex-wrap items-center justify-between gap-2">
            <div
              role="tablist"
              aria-label="Trạng thái quy trình cắt vấp"
              className="inline-flex items-center gap-1.5"
            >
              {(
                [
                  { id: 'prepare', label: '1. Chuẩn bị video' },
                  { id: 'processing', label: '2. Đang xử lý (5 bước)' },
                  { id: 'result', label: '3. Kết quả & Bản đồ đoạn cắt' },
                ] as { id: SimpleStudioScreenState; label: string }[]
              ).map((stepTab) => (
                <button
                  key={stepTab.id}
                  type="button"
                  role="tab"
                  aria-selected={screenState === stepTab.id}
                  onClick={() => setScreenState(stepTab.id)}
                  className={`px-3 min-h-[40px] rounded-[6px] border text-[13px] leading-[20px] font-medium transition-colors ${
                    screenState === stepTab.id
                      ? 'bg-[#176b51] border-[#176b51] text-[#ffffff]'
                      : 'bg-[#ffffff] border-[#d5e0d7] text-[#4a5d54] hover:text-[#17231f]'
                  }`}
                >
                  {stepTab.label}
                </button>
              ))}
            </div>

            {screenState === 'result' && (
              <div className="flex flex-wrap items-center gap-1.5 text-[13px] leading-[20px]">
                <span className="text-[#4a5d54]">Mẫu kiểm thử:</span>
                {(
                  [
                    { key: 'default_11_cuts', label: '11 chỗ cắt' },
                    { key: 'start_cut', label: 'Đầu video' },
                    { key: 'middle_cut', label: 'Giữa video' },
                    { key: 'end_cut', label: 'Cuối video' },
                    { key: 'short_cut_250ms', label: 'Đoạn ngắn < 400ms' },
                    { key: 'zero_cuts', label: '0 chỗ cắt' },
                  ] as { key: MockCutScenarioKey; label: string }[]
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelectCutScenario(item.key)}
                    className={`px-2.5 min-h-[36px] rounded-[6px] border text-[12px] leading-[18px] font-medium ${
                      cutScenario === item.key
                        ? 'bg-[#e9f4ef] border-[#176b51] text-[#176b51]'
                        : 'bg-[#ffffff] border-[#d5e0d7] text-[#4a5d54] hover:text-[#17231f]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
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
                  className={`px-2.5 min-h-[36px] rounded-[6px] border text-[12px] leading-[18px] font-medium ${
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
            )}
          </div>

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
            <div className="max-w-[760px] mx-auto space-y-3">
              {/* Thanh công cụ kiểm thử nhanh cho trạng thái Đang xử lý */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSimulateStep3Error}
                  className="px-3 min-h-[38px] rounded-[6px] border border-[#d5e0d7] bg-[#ffffff] text-[12px] leading-[18px] font-medium text-[#4a5d54] hover:text-[#17231f]"
                >
                  Mô phỏng lỗi bước 3
                </button>
                <button
                  type="button"
                  onClick={handleFinishProcessingToResult}
                  className="px-3.5 min-h-[38px] rounded-[6px] bg-[#176b51] text-[#ffffff] text-[12px] leading-[18px] font-medium"
                >
                  Xem ngay kết quả
                </button>
              </div>

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
              onApplyHook={async ({
                selectedHookId: nextHookId,
                hookPrompt: nextHookPrompt,
                customHookClipFile,
              }) => {
                handleSelectHookOption(nextHookId);
                let uploadedClipPath: string | undefined;

                try {
                  if (customHookClipFile) {
                    const formData = new FormData();
                    formData.append('projectId', prepareData.project_id);
                    formData.append('role', 'hook_clip');
                    formData.append('file', customHookClipFile);
                    const uploadRes = await fetch('/api/video-studio/upload', {
                      method: 'POST',
                      body: formData,
                    });
                    if (uploadRes.ok) {
                      const uploadJson = await uploadRes.json().catch(() => null);
                      if (uploadJson?.savedPath) {
                        uploadedClipPath = String(uploadJson.savedPath);
                      }
                    }
                  }

                  const targetId = activeJobId || prepareData.project_id;
                  const rehookRes = await fetch(
                    `/api/video-studio/jobs/${encodeURIComponent(targetId)}/rehook`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        selected_hook_id: nextHookId,
                        hook_prompt: nextHookPrompt || undefined,
                        hook_clip_path: uploadedClipPath,
                      }),
                    }
                  );

                  if (rehookRes.ok) {
                    const updated = await rehookRes.json().catch(() => null);
                    if (updated && typeof updated === 'object') {
                      setResultData((prev) => ({
                        ...prev,
                        selected_hook_id: updated.selected_hook_id || nextHookId,
                        out_duration_ms:
                          typeof updated.out_duration_ms === 'number'
                            ? updated.out_duration_ms
                            : prev.out_duration_ms,
                        hooks:
                          Array.isArray(updated.hooks) && updated.hooks.length > 0
                            ? updated.hooks
                            : prev.hooks.map((h) => ({
                                ...h,
                                selected: h.id === nextHookId,
                              })),
                        files: updated.files
                          ? { ...prev.files, ...updated.files }
                          : prev.files,
                        warnings: Array.isArray(updated.warnings)
                          ? updated.warnings
                          : prev.warnings,
                      }));
                    }
                  }
                } catch {
                  // Giữ cập nhật tại chỗ nếu môi trường kiểm thử ngoại tuyến
                }
              }}
              onOpenOrDownloadCapCutDraft={async () => {
                try {
                  await fetch('/api/video-studio/capcut-sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'push_to_capcut',
                      projectId: prepareData.project_id,
                    }),
                  });
                } catch {
                  // Ignore network error in offline preview
                }
                setStatusFeedback(
                  `Đã đồng bộ gói dự án sang thư mục CapCut (${capcutDraftDir}).`
                );
              }}
              onResetToPrepare={() => setScreenState('prepare')}
            />
          )}
        </main>
      )}
    </div>
  );
}
