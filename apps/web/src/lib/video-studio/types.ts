/**
 * Shared TypeScript Contracts for Web Video Studio Workspace (`/video-studio`)
 * Connects all 4 Spokes (Backend Bridge + Left/Center/Right Panes + P9 Curator)
 * with the 10-Phase Python AI Video Editing Pipeline (`tools/video-pipeline/cli.py`).
 */

export type UpperPhaseId =
  | 'P0'
  | 'P1'
  | 'P2'
  | 'P3'
  | 'P4'
  | 'P5'
  | 'P6'
  | 'P7'
  | 'P8'
  | 'P9';

export type LowerPhaseId =
  | 'p0'
  | 'p1'
  | 'p2'
  | 'p3'
  | 'p4'
  | 'p5'
  | 'p6'
  | 'p7'
  | 'p8'
  | 'p9';

export type PhaseId = UpperPhaseId | LowerPhaseId | string;

export const ALL_PHASE_IDS: readonly UpperPhaseId[] = [
  'P0',
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
  'P6',
  'P7',
  'P8',
  'P9',
] as const;

export type PhaseStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cached'
  | 'paused_gate'
  | 'PAUSED_FOR_HOOK_SELECTION'
  | 'PAUSED_FOR_QA_REVIEW';

export type PipelineRunStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED_FOR_HOOK_SELECTION'
  | 'PAUSED_FOR_QA_REVIEW'
  | 'COMPLETED'
  | 'COMPLETED_WITH_QA_WARNINGS'
  | 'FAILED'
  | string;

export type PipelineStatus =
  | 'idle'
  | 'running'
  | 'paused_at_p5_hook_gate'
  | 'completed'
  | 'failed';

export type HookStyle =
  | 'question'
  | 'statement'
  | 'teaser'
  | 'question_curiosity'
  | 'direct_problem'
  | 'teaser_highlight'
  | string;

export type HookStyleType = HookStyle;

export interface PhaseMetaItem {
  phase: UpperPhaseId;
  id: LowerPhaseId;
  code: UpperPhaseId;
  index: number;
  name: string;
  title: string;
  viTitle: string;
  shortDesc: string;
  description: string;
  artifact: string;
  artifactName: string;
  tier: 'fast' | 'strong' | 'qa_alt' | 'stt' | 'deterministic';
  requiresLlm: boolean;
}

export const PHASE_META: readonly PhaseMetaItem[] = [
  {
    phase: 'P0',
    id: 'p0',
    code: 'P0',
    index: 0,
    name: 'Kiểm tra môi trường & Tách âm 16kHz',
    title: 'Preflight & Audio 16kHz',
    viTitle: 'Kiểm tra môi trường & Tách âm 16kHz',
    shortDesc: 'Preflight & 16kHz Mono Audio Extraction (state.json, audio_16k.wav)',
    description: 'Preflight & 16kHz Mono Audio Extraction (state.json, audio_16k.wav)',
    artifact: 'state.json',
    artifactName: 'state.json',
    tier: 'deterministic',
    requiresLlm: false,
  },
  {
    phase: 'P1',
    id: 'p1',
    code: 'P1',
    index: 1,
    name: 'Phân rã kịch bản & Từ khóa neo',
    title: 'Script & Beat Parser',
    viTitle: 'Phân rã kịch bản & Từ khóa neo',
    shortDesc: 'Script Parser & Beat Decomposition (beats.json)',
    description: 'Script Parser & Beat Decomposition (beats.json)',
    artifact: 'beats.json',
    artifactName: 'beats.json',
    tier: 'fast',
    requiresLlm: true,
  },
  {
    phase: 'P2',
    id: 'p2',
    code: 'P2',
    index: 2,
    name: 'Nhận dạng giọng nói & Căn chỉnh từng từ',
    title: 'Vocab-Guided STT',
    viTitle: 'Nhận dạng giọng nói & Căn chỉnh từng từ',
    shortDesc: 'Vocabulary-Guided STT & Word Alignment (words.json)',
    description: 'Vocabulary-Guided STT & Word Alignment (words.json)',
    artifact: 'words.json',
    artifactName: 'words.json',
    tier: 'stt',
    requiresLlm: false,
  },
  {
    phase: 'P3',
    id: 'p3',
    code: 'P3',
    index: 3,
    name: 'Phát hiện khoảng lặng & Từ đệm tiếng Việt',
    title: 'Acoustic & Filler Detector',
    viTitle: 'Phát hiện khoảng lặng & Từ đệm tiếng Việt',
    shortDesc: 'Pure-Python Acoustic & Filler Detector (packed.txt, flags.json)',
    description: 'Pure-Python Acoustic & Filler Detector (packed.txt, flags.json)',
    artifact: 'flags.json',
    artifactName: 'flags.json',
    tier: 'deterministic',
    requiresLlm: false,
  },
  {
    phase: 'P4',
    id: 'p4',
    code: 'P4',
    index: 4,
    name: 'Chấm điểm 5 tiêu chí & Chọn Take tốt nhất',
    title: 'Semantic Take Selector',
    viTitle: 'Chấm điểm 5 tiêu chí & Chọn Take tốt nhất',
    shortDesc: 'Semantic Take Selector with 3-Tier Memory (takes.json)',
    description: 'Semantic Take Selector with 3-Tier Memory (takes.json)',
    artifact: 'takes.json',
    artifactName: 'takes.json',
    tier: 'strong',
    requiresLlm: true,
  },
  {
    phase: 'P5',
    id: 'p5',
    code: 'P5',
    index: 5,
    name: 'Đề xuất 3 phương án Hook (Cổng duyệt người dùng)',
    title: 'Hook Scoring & Gate',
    viTitle: 'Đề xuất 3 phương án Hook (Cổng duyệt người dùng)',
    shortDesc: '3-Second Hook Scoring & Ranking Agent (hooks.json)',
    description: '3-Second Hook Scoring & Ranking Agent (hooks.json)',
    artifact: 'hooks.json',
    artifactName: 'hooks.json',
    tier: 'fast',
    requiresLlm: true,
  },
  {
    phase: 'P6',
    id: 'p6',
    code: 'P6',
    index: 6,
    name: 'Dựng danh sách cắt, bù đệm âm & căn khung hình',
    title: 'Cutlist & Frame Builder',
    viTitle: 'Dựng danh sách cắt, bù đệm âm & căn khung hình',
    shortDesc: 'Cutlist Builder with Speech Padding & Frame Alignment (cutlist.json)',
    description: 'Cutlist Builder with Speech Padding & Frame Alignment (cutlist.json)',
    artifact: 'cutlist.json',
    artifactName: 'cutlist.json',
    tier: 'deterministic',
    requiresLlm: false,
  },
  {
    phase: 'P7',
    id: 'p7',
    code: 'P7',
    index: 7,
    name: 'Xuất Video Roughcut, Phụ đề .srt & Nháp CapCut',
    title: 'Triple Exporter & CapCut',
    viTitle: 'Xuất Video Roughcut, Phụ đề .srt & Nháp CapCut',
    shortDesc: 'CapCut Desktop (< v5) Triple Exporter (roughcut.mp4/.srt, clips/, capcut_draft/)',
    description: 'CapCut Desktop (< v5) Triple Exporter (roughcut.mp4/.srt, clips/, capcut_draft/)',
    artifact: 'exports/capcut_draft/draft_content.json',
    artifactName: 'exports/capcut_draft/draft_content.json',
    tier: 'deterministic',
    requiresLlm: false,
  },
  {
    phase: 'P8',
    id: 'p8',
    code: 'P8',
    index: 8,
    name: 'Kiểm định chéo độc lập & Tự sửa lỗi (Self-Healing)',
    title: 'Cross-Model QA Verifier',
    viTitle: 'Kiểm định chéo độc lập & Tự sửa lỗi (Self-Healing)',
    shortDesc: 'Cross-Model (qa_alt) & Technical QA Verifier (qa.md)',
    description: 'Cross-Model (qa_alt) & Technical QA Verifier (qa.md)',
    artifact: 'qa.md',
    artifactName: 'qa.md',
    tier: 'qa_alt',
    requiresLlm: true,
  },
  {
    phase: 'P9',
    id: 'p9',
    code: 'P9',
    index: 9,
    name: 'Đối chiếu bản sửa CapCut & Học quy tắc mới',
    title: 'Memory Curator Loop',
    viTitle: 'Đối chiếu bản sửa CapCut & Học quy tắc mới',
    shortDesc: 'Self-Learning Memory Curator Loop (proposals.md -> lessons/p4.md & golden/p4.jsonl)',
    description: 'Self-Learning Memory Curator Loop (proposals.md -> lessons/p4.md & golden/p4.jsonl)',
    artifact: 'proposals.md',
    artifactName: 'proposals.md',
    tier: 'strong',
    requiresLlm: true,
  },
] as const;

export const PIPELINE_PHASES_META = PHASE_META;

export interface PhaseItemState {
  id: PhaseId;
  phase?: PhaseId;
  code?: string;
  name?: string;
  title?: string;
  viTitle?: string;
  shortDesc?: string;
  description?: string;
  status: PhaseStatus | string;
  durationMs?: number;
  artifactName?: string;
  artifact?: string;
  artifact_exists?: boolean;
  artifactExists?: boolean;
  summary?: string;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  error?: string | null;
  metrics?: Record<string, unknown> | null;
  [key: string]: any;
}

export interface PhaseStatusRow extends PhaseItemState {
  phase: PhaseId;
  description: string;
  artifact: string;
  artifact_exists: boolean;
}

export interface RouterTierDetail {
  model: string;
  family?: string;
  provider?: string;
  temperature?: number;
  max_tokens?: number;
  description?: string;
}

export interface RouterModelsConfig {
  fast: string;
  strong: string;
  qa_alt: string;
  stt?: string;
  base_url?: string;
  baseUrl?: string;
  offline_mode?: boolean;
  offlineMode?: boolean;
  offline?: boolean;
  family_separated?: boolean;
  tiers?: {
    fast?: RouterTierDetail;
    strong?: RouterTierDetail;
    qa_alt?: RouterTierDetail;
    stt?: RouterTierDetail;
  };
  router?: {
    base_url?: string;
    timeout_seconds?: number;
    max_retries?: number;
    [key: string]: any;
  };
  models?: Record<string, string>;
  [key: string]: any;
}

export interface ModelsYamlConfig {
  router?: {
    base_url?: string;
    timeout_seconds?: number;
    max_retries?: number;
    [key: string]: any;
  };
  models?: {
    transcribe?: string;
    script_parser?: string;
    take_selector?: string;
    hook_generator?: string;
    qa_primary?: string;
    qa_alt?: string;
    curator?: string;
    fast?: string;
    strong?: string;
    stt?: string;
    [key: string]: any;
  };
  fast?: string;
  strong?: string;
  qa_alt?: string;
  stt?: string;
  base_url?: string;
  offline_mode?: boolean;
  [key: string]: any;
}

export interface AgentProfileConfig {
  version?: string;
  profile_id?: string;
  language?: string;
  pad_start_ms: number;
  pad_end_ms: number;
  merge_gap_ms: number;
  silence_threshold_ms: number;
  min_silence_ms?: number;
  silence_db?: number;
  repeat_window_words?: number;
  min_word_confidence?: number;
  filler_words: string[];
  protected_words: string[];
  models?: RouterModelsConfig;
  router_models?: RouterModelsConfig;
  fast_model?: string;
  strong_model?: string;
  qa_alt_model?: string;
  stt_model?: string;
  offline_mode?: boolean;
  offline?: boolean;
  target_fps?: number;
  fade_ms?: number;
  take_selection?: {
    strategy?: string;
    prefer_last_complete_take?: boolean;
    max_lessons_injected?: number;
    max_golden_examples_injected?: number;
  };
  hook_selection?: {
    target_hook_window_sec?: number;
    max_hook_duration_ms?: number;
    min_hook_duration_ms?: number;
    top_k_candidates?: number;
  };
  cutlist?: {
    pad_start_ms?: number;
    pad_end_ms?: number;
    merge_gap_ms?: number;
    clamp_to_source_bounds?: boolean;
    resolve_overlaps?: string;
  };
  [key: string]: any;
}

export interface CodexModelOption {
  id: string;
  label: string;
  group: string;
  family: string;
  recommendedTier: 'fast' | 'strong' | 'qa_alt';
  isCombo?: boolean;
}

export const NINEROUTER_COMBOS: CodexModelOption[] = [
  {
    id: 'video-fast',
    label: 'Combo: video-fast (cx/gpt-6-luna -> 5.6-luna -> 5.6-terra)',
    group: '9Router Combos (Tự động Fallback)',
    family: 'codex-luna',
    recommendedTier: 'fast',
    isCombo: true,
  },
  {
    id: 'video-strong',
    label: 'Combo: video-strong (cx/gpt-6.1-sol -> 6-astra -> 6-sol)',
    group: '9Router Combos (Tự động Fallback)',
    family: 'codex-sol',
    recommendedTier: 'strong',
    isCombo: true,
  },
  {
    id: 'video-qa-alt',
    label: 'Combo: video-qa-alt (cx/codex-auto-review -> 5.6-sol-review -> daybreak-blue)',
    group: '9Router Combos (Tự động Fallback)',
    family: 'codex-review',
    recommendedTier: 'qa_alt',
    isCombo: true,
  },
];

export const NINEROUTER_CODEX_MODELS: CodexModelOption[] = [
  {
    id: 'cx/gpt-6.1-sol',
    label: 'cx/gpt-6.1-sol — GPT 6.1 Sol',
    group: 'GPT 6.x Series (providers/codex)',
    family: 'codex-sol',
    recommendedTier: 'strong',
  },
  {
    id: 'cx/gpt-6-astra',
    label: 'cx/gpt-6-astra — GPT 6.0 Astra',
    group: 'GPT 6.x Series (providers/codex)',
    family: 'codex-sol',
    recommendedTier: 'strong',
  },
  {
    id: 'cx/gpt-6-astra[1m]',
    label: 'cx/gpt-6-astra[1m] — GPT 6.0 Astra (1M)',
    group: 'GPT 6.x Series (providers/codex)',
    family: 'codex-sol',
    recommendedTier: 'strong',
  },
  {
    id: 'cx/gpt-6-sol',
    label: 'cx/gpt-6-sol — GPT 6.0 Sol',
    group: 'GPT 6.x Series (providers/codex)',
    family: 'codex-sol',
    recommendedTier: 'strong',
  },
  {
    id: 'cx/gpt-6-sol[1m]',
    label: 'cx/gpt-6-sol[1m] — GPT 6.0 Sol (1M)',
    group: 'GPT 6.x Series (providers/codex)',
    family: 'codex-sol',
    recommendedTier: 'strong',
  },
  {
    id: 'cx/gpt-6-luna',
    label: 'cx/gpt-6-luna — GPT 6.0 Luna',
    group: 'GPT 6.x Series (providers/codex)',
    family: 'codex-luna',
    recommendedTier: 'fast',
  },
  {
    id: 'cx/gpt-6-luna[1m]',
    label: 'cx/gpt-6-luna[1m] — GPT 6.0 Luna (1M)',
    group: 'GPT 6.x Series (providers/codex)',
    family: 'codex-luna',
    recommendedTier: 'fast',
  },
  {
    id: 'cx/gpt-5.6-sol',
    label: 'cx/gpt-5.6-sol — GPT 5.6 Sol',
    group: 'GPT 5.6 Series (providers/codex)',
    family: 'codex-sol',
    recommendedTier: 'strong',
  },
  {
    id: 'cx/gpt-5.6-sol[1m]',
    label: 'cx/gpt-5.6-sol[1m] — GPT 5.6 Sol (1M)',
    group: 'GPT 5.6 Series (providers/codex)',
    family: 'codex-sol',
    recommendedTier: 'strong',
  },
  {
    id: 'cx/gpt-5.6-sol-review',
    label: 'cx/gpt-5.6-sol-review — GPT 5.6 Sol Review',
    group: 'Review & QA Models (providers/codex)',
    family: 'codex-review',
    recommendedTier: 'qa_alt',
  },
  {
    id: 'cx/gpt-5.6-terra',
    label: 'cx/gpt-5.6-terra — GPT 5.6 Terra',
    group: 'GPT 5.6 Series (providers/codex)',
    family: 'codex-luna',
    recommendedTier: 'fast',
  },
  {
    id: 'cx/gpt-5.6-terra[1m]',
    label: 'cx/gpt-5.6-terra[1m] — GPT 5.6 Terra (1M)',
    group: 'GPT 5.6 Series (providers/codex)',
    family: 'codex-luna',
    recommendedTier: 'fast',
  },
  {
    id: 'cx/gpt-5.6-terra-review',
    label: 'cx/gpt-5.6-terra-review — GPT 5.6 Terra Review',
    group: 'Review & QA Models (providers/codex)',
    family: 'codex-review',
    recommendedTier: 'qa_alt',
  },
  {
    id: 'cx/gpt-5.6-luna',
    label: 'cx/gpt-5.6-luna — GPT 5.6 Luna',
    group: 'GPT 5.6 Series (providers/codex)',
    family: 'codex-luna',
    recommendedTier: 'fast',
  },
  {
    id: 'cx/gpt-5.6-luna[1m]',
    label: 'cx/gpt-5.6-luna[1m] — GPT 5.6 Luna (1M)',
    group: 'GPT 5.6 Series (providers/codex)',
    family: 'codex-luna',
    recommendedTier: 'fast',
  },
  {
    id: 'cx/gpt-5.6-luna-review',
    label: 'cx/gpt-5.6-luna-review — GPT 5.6 Luna Review',
    group: 'Review & QA Models (providers/codex)',
    family: 'codex-review',
    recommendedTier: 'qa_alt',
  },
  {
    id: 'cx/gpt-daybreak-blue-latest',
    label: 'cx/gpt-daybreak-blue-latest — GPT Daybreak Blue Latest',
    group: 'Review & QA Models (providers/codex)',
    family: 'codex-review',
    recommendedTier: 'qa_alt',
  },
  {
    id: 'cx/gpt-reserve',
    label: 'cx/gpt-reserve — GPT Reserve',
    group: 'GPT 5.6 Series (providers/codex)',
    family: 'codex-reserve',
    recommendedTier: 'fast',
  },
  {
    id: 'cx/codex-auto-review',
    label: 'cx/codex-auto-review — Codex Auto Review',
    group: 'Review & QA Models (providers/codex)',
    family: 'codex-review',
    recommendedTier: 'qa_alt',
  },
];

export const DEFAULT_AGENT_PROFILE: AgentProfileConfig = {
  version: '1.1',
  profile_id: 'podscare_default_vi',
  language: 'vi',
  pad_start_ms: 80,
  pad_end_ms: 120,
  merge_gap_ms: 150,
  silence_threshold_ms: 800,
  min_silence_ms: 500,
  repeat_window_words: 8,
  min_word_confidence: 0.65,
  filler_words: [
    'à',
    'ừm',
    'ờ',
    'ơ',
    'ư',
    'kiểu',
    'kiểu như',
    'kiểu như là',
    'thì là',
    'nghĩa là',
    'đại loại',
    'đại khái',
    'nói chung là',
    'như là',
  ],
  protected_words: [
    'PodsCare',
    'AirPods',
    'AirPods Pro',
    'AirPods Max',
    'ANC',
    'Transparency',
    'Spatial Audio',
    'MagSafe',
    'Lightning',
    'Type-C',
    'USB-C',
    'Apple',
    'SePay',
    'VietQR',
    'CapCut',
    'M1 Pro',
  ],
  fast_model: 'cx/gpt-6-luna',
  strong_model: 'cx/gpt-6.1-sol',
  qa_alt_model: 'cx/codex-auto-review',
  stt_model: 'whisper-large-v3',
  offline_mode: true,
  offline: true,
  target_fps: 30,
};

export interface StudioPromptMeta {
  project_id?: string;
  cutting_prompt: string;
  cuttingPrompt?: string;
  hook_prompt?: string;
  hookPrompt?: string;
  custom_hook_clip_path?: string | null;
  customHookClipPath?: string | null;
  prompt_notes?: string;
  problem_description?: string;
  preferred_hook_style: HookStyle;
  preferredHookStyle?: HookStyle;
  hook_style?: HookStyle;
  offline_mode?: boolean;
  updated_at?: string;
}

export interface VideoMetadata {
  video_codec?: string;
  audio_codec?: string;
  fps?: number;
  width?: number;
  height?: number;
  duration_sec?: number;
  duration_ms?: number;
  audio_channels?: number;
  channels?: number;
  sample_rate?: number;
  file_size_bytes?: number;
  probe_mode?: string;
}

export interface BeatItem {
  beat_id: string;
  id?: string;
  expected_text: string;
  text?: string;
  section_type: 'hook' | 'intro' | 'body' | 'cta' | string;
  type?: string;
  anchor_keywords: string[];
  keywords?: string[];
  proper_nouns?: string[];
  hook_candidate?: boolean;
  order?: number;
  target_duration_ms?: number;
  notes?: string | null;
}

export interface WordTimestamp {
  word_id?: string | number;
  id?: string | number;
  word: string;
  text?: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
}

export interface AcousticFlag {
  flag_id?: string;
  type: string;
  start_ms: number;
  end_ms: number;
  duration_ms?: number;
  word_ids?: Array<string | number>;
  text?: string | null;
  reason?: string | null;
  severity?: string | null;
}

export interface TakeScoreBreakdown {
  completeness?: number;
  script_fidelity?: number;
  script_match?: number;
  fluency?: number;
  low_filler?: number;
  complete_ending?: number;
  pacing?: number;
  audio_clarity?: number;
  [key: string]: number | undefined;
}

export interface TakeCandidate {
  take_id: string;
  beat_id: string;
  take_index?: number;
  start_ms: number;
  end_ms: number;
  duration_ms?: number;
  text: string;
  score: number;
  scores?: TakeScoreBreakdown;
  confidence?: number;
  filler_count?: number;
  fillers_detected?: string[];
  no_mid_word_cut?: boolean;
  flags?: string[];
  selected: boolean;
  reasoning?: string;
}

export interface TakeEvaluation {
  take_id: string;
  selected_take_id?: string;
  beat_id: string;
  section_type?: string;
  expected_text?: string;
  anchor_keywords?: string[];
  status?: string;
  start_ms: number;
  end_ms: number;
  duration_ms?: number;
  text?: string;
  transcript?: string;
  score?: number;
  total_score?: number;
  scores?: TakeScoreBreakdown | Record<string, number>;
  confidence?: number;
  no_mid_word_cut?: boolean;
  tie_breaker_applied?: boolean;
  selected?: boolean;
  reasoning: string;
  reason?: string;
  rationale?: string;
  selected_take?: TakeCandidate;
  candidates?: TakeCandidate[];
  [key: string]: any;
}

export interface TakeItem extends TakeEvaluation {
  text: string;
  score: number;
}

export interface HookSegment {
  segment_id?: string;
  beat_id: string;
  take_id?: string;
  section_type?: string;
  start_ms: number;
  end_ms: number;
  duration_ms?: number;
  text: string;
}

export interface HookCandidate {
  hook_id: string;
  option_id?: string;
  option_index?: number;
  rank?: number;
  style: HookStyle;
  title?: string;
  summary?: string;
  beat_id?: string;
  start_ms?: number;
  end_ms?: number;
  duration_ms: number;
  score: number;
  score_5?: number;
  recommended?: boolean;
  text?: string;
  hook_text?: string;
  full_hook_text?: string;
  script_preview?: string;
  reasoning: string;
  rationale?: string;
  reason?: string;
  explanation?: string;
  segment_ids?: string[];
  segments?: HookSegment[];
  is_teaser?: boolean;
  selected?: boolean;
  [key: string]: any;
}

export interface CutlistSegment {
  segment_id: string;
  clip_id?: string;
  order?: number;
  beat_id?: string;
  take_id?: string;
  role?: string;
  section_type?: string;
  label?: string;
  start_ms?: any;
  end_ms?: any;
  source_start_ms?: number;
  source_end_ms?: number;
  raw_start_ms?: number;
  raw_end_ms?: number;
  pad_start_ms?: number;
  pad_end_ms?: number;
  duration_ms: number;
  timeline_start_ms?: any;
  timeline_end_ms?: any;
  TimelineStartMs?: number;
  TimelineEndMs?: number;
  target_start_ms?: number;
  target_end_ms?: number;
  audio_fade_in_ms?: number;
  audio_fade_out_ms?: number;
  fade_in_ms?: number;
  fade_out_ms?: number;
  text: string;
  is_hook?: boolean;
  [key: string]: any;
}

export interface CutlistData {
  version?: string;
  project_id?: string;
  selected_hook_id?: string | null;
  fps?: number;
  segments: CutlistSegment[];
  cuts?: CutlistSegment[];
  clips?: CutlistSegment[];
  total_duration_ms: number;
  source_duration_ms: number;
  saved_duration_ms?: number;
  pad_start_ms?: number;
  pad_end_ms?: number;
  merge_gap_ms?: number;
  [key: string]: any;
}

export interface SrtCue {
  index: number;
  id?: string;
  start_time?: any;
  end_time?: any;
  startTime?: string;
  endTime?: string;
  start_ms?: any;
  end_ms?: any;
  startMs?: number;
  endMs?: number;
  text: string;
}

export interface ClipExportItem {
  filename: string;
  name?: string;
  rel_path?: any;
  section_type?: string;
  url: string;
  size_bytes: number;
  duration_ms?: number;
  beat_id?: string;
  label?: string;
  [key: string]: any;
}

export type ExportedClipItem = ClipExportItem;

export interface QaReportData {
  verdict: 'PASS' | 'FIX_REQUIRED' | 'PENDING' | string;
  status?: 'PASS' | 'FIX_REQUIRED' | 'PENDING' | string;
  issue_count?: number;
  coverage_percent?: number;
  beat_coverage?: string;
  clipped_words_count?: number;
  srt_DriftMs?: number;
  capcut_microsecond_valid?: boolean;
  issues?: any[];
  markdown: string;
  qa_model?: string;
  strong_model?: string;
  family_separated?: boolean;
  notes?: string[];
  [key: string]: any;
}

export interface QaReportSummary extends QaReportData {
  issue_count: number;
}

export interface CuratorProposalRule {
  id: string;
  rule_text: string;
  source_diff_type?: 'FALSE_POSITIVE_CUT' | 'MISSED_CUT' | string;
  confidence?: number;
  approved?: boolean;
  [key: string]: any;
}

export interface CuratorDiffItem {
  id?: string;
  kind?: 'FALSE_POSITIVE_CUT' | 'MISSED_CUT' | string;
  type?: 'FALSE_POSITIVE_CUT' | 'MISSED_CUT' | string;
  subtype?: string;
  segment_id?: string;
  beat_id: string;
  ai_range_ms?: [number, number] | null;
  human_range_ms?: [number, number] | null;
  ai_start_ms?: number;
  ai_end_ms?: number;
  editor_start_ms?: number;
  editor_end_ms?: number;
  delta_ms: number;
  context_text?: string;
  transcript_snippet?: string;
  description?: string;
  explanation?: string;
  proposed_rule?: string;
  [key: string]: any;
}

export interface GoldenExampleItem {
  id?: string;
  beat_id: string;
  section_type?: string;
  expected_text?: string;
  context?: string;
  input_transcript?: string;
  rejected_take?: string;
  ai_choice?: Record<string, unknown>;
  human_correction?: Record<string, unknown>;
  selected_take?: Record<string, unknown> | string | null;
  diff_type?: string;
  rule_learned?: string;
  reason?: string;
  [key: string]: any;
}

export interface CuratorDiffResult {
  project_id: string;
  status?: 'PROPOSALS_READY' | 'APPROVED' | 'PENDING_APPROVAL' | 'IDLE' | string;
  compared_at?: string;
  ai_segments_count?: number;
  editor_segments_count?: number;
  total_diffs?: number;
  false_positive_count?: number;
  missed_cut_count?: number;
  diffs: CuratorDiffItem[];
  false_positive_cuts: CuratorDiffItem[];
  missed_cuts: CuratorDiffItem[];
  proposed_rules: Array<string | CuratorProposalRule>;
  proposals_markdown: string;
  proposals_md?: string;
  lessons_markdown?: string;
  lessons_md?: string;
  lessonsMd?: string;
  lessons_line_count?: number;
  lessonsLineCount?: number;
  lessons_max_lines?: number;
  lessonsMaxLines?: number;
  golden_examples?: GoldenExampleItem[];
  goldenExamples?: GoldenExampleItem[];
  golden_jsonl_raw?: string;
  goldenJsonlRaw?: string;
  golden_total?: number;
  approved_at?: string | null;
  diffResult?: CuratorDiffResult;
  [key: string]: any;
}

export interface CapCutSyncResult {
  success?: boolean;
  action?: 'push_to_capcut' | 'simulate_capcut_edit' | 'diff_capcut' | 'approve_proposals' | string;
  project_id?: string;
  synced?: boolean;
  sourceDraftDir?: string;
  targetCapCutDir?: string;
  target_dir?: string;
  target_path?: string;
  capcut_root_dir?: string;
  draft_content_path?: string;
  draft_meta_path?: string;
  filesCopied?: string[];
  files_copied?: string[];
  duration_us?: number;
  syncedAt?: string;
  synced_at?: string;
  message: string;
  diff_result?: CuratorDiffResult;
  snapshot?: ProjectSnapshot;
  [key: string]: any;
}

export type CapCutSyncResponse = CapCutSyncResult;

export interface VideoProjectSummary {
  projectId: string;
  project_id?: any;
  name: string;
  workspace_dir?: any;
  current_phase?: PhaseId | string;
  activePhase?: PhaseId;
  pipelineStatus?: PipelineStatus;
  status?: any;
  source_video?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  hasSourceVideo?: boolean;
  hasRoughcut?: boolean;
  has_roughcut?: any;
  hasCapcutDraft?: boolean;
  has_capcut_draft?: any;
  selectedHookId?: string | null;
  [key: string]: any;
}

export type ProjectSummary = VideoProjectSummary;

export interface VideoStudioSnapshot {
  projectId: string;
  project_id?: any;
  projectName: string;
  updatedAt: string;
  updated_at?: any;
  pipelineStatus: PipelineStatus;
  pipeline_status?: any;
  activePhase: PhaseId;
  current_phase?: PhaseId | string;
  offlineMode: boolean;
  routerConnected: boolean;
  routerEndpoint: string;
  sourceVideo: {
    path: string;
    filename: string;
    durationMs: number;
    fps: number;
    width?: number;
    height?: number;
    resolution: string;
    audioSampleRate?: number;
    audioChannels: number;
    streamUrl: string;
  };
  scriptText: string;
  script_text?: any;
  customPrompt: string;
  cutting_prompt?: any;
  preferredHookStyle: HookStyleType;
  preferred_hook_style?: any;
  profile: AgentProfileConfig;
  modelsConfig: ModelsYamlConfig;
  phases: PhaseItemState[];
  tokenSavingsPercent: number;
  packedTxtPreview: string;
  beats: BeatItem[];
  takes: TakeEvaluation[];
  hooks: HookCandidate[];
  selectedHookId: string | null;
  humanApprovedHook: boolean;
  cutlist?: CutlistData | null;
  srtContent: string;
  srtCues: SrtCue[];
  clips: ClipExportItem[];
  roughcutVideoUrl: string;
  qaReport?: QaReportData;
  capcutDraft: {
    ready: boolean;
    draftDir: string;
    macOsTargetDir: string;
    syncedAt?: string;
    totalDurationUs: number;
    tracksCount: number;
    segmentsCount: number;
  };
  curator: {
    diffResult?: CuratorDiffResult;
    lessonsMd: string;
    lessonsLineCount: number;
    lessonsMaxLines: number;
    goldenExamples: GoldenExampleItem[];
    goldenJsonlRaw: string;
    [key: string]: any;
  };
  artifacts: Record<string, any>;
  [key: string]: any;
}

export interface ProjectSnapshot {
  project_id?: any;
  projectId?: any;
  projectName?: string;
  workspace_dir?: any;
  exists?: any;
  pipeline_status?: any;
  pipelineStatus?: PipelineStatus;
  status?: string;
  current_phase?: PhaseId | string;
  activePhase?: PhaseId;
  offlineMode?: boolean;
  routerConnected?: boolean;
  routerEndpoint?: string;
  sourceVideo?: {
    path: string;
    filename: string;
    durationMs: number;
    fps: number;
    width?: number;
    height?: number;
    resolution: string;
    audioSampleRate?: number;
    audioChannels: number;
    streamUrl: string;
  };
  source_video?: any;
  source_video_path?: string | null;
  sourceVideoPath?: string | null;
  videoPath?: string | null;
  source_video_exists?: any;
  source_video_mode?: 'demo' | 'mac_path' | 'upload' | 'none' | string;
  video_metadata?: any;
  source_duration_sec?: number;
  durationMs?: number;
  fps?: number;
  width?: number;
  height?: number;
  resolution?: string;
  audioSampleRate?: number;
  script_text?: any;
  scriptText?: string;
  script_path?: any;
  studio_meta?: any;
  cutting_prompt?: any;
  customPrompt?: string;
  preferred_hook_style?: any;
  preferredHookStyle?: HookStyle;
  phases?: any;
  artifacts?: any;
  beats?: any;
  words?: any;
  packed_txt?: any;
  packedTxtPreview?: string;
  flags?: any;
  token_savings_pct?: number;
  tokenSavingsPercent?: number;
  takes?: any;
  hooks?: any;
  selected_hook_id?: any;
  selectedHookId?: string | null;
  human_approved_hook?: any;
  humanApprovedHook?: boolean;
  cutlist?: any;
  cutlist_segments?: any;
  roughcut_url?: any;
  roughcutVideoUrl?: string;
  roughcut_exists?: any;
  source_video_url?: any;
  audio_url?: any;
  srt_raw?: any;
  srtContent?: string;
  srt_cues?: any;
  srtCues?: SrtCue[];
  clips?: any;
  capcut_draft_exists?: any;
  capcut_draft_ready?: boolean;
  capcut_draft_duration_us?: any;
  capcut_sync_target?: any;
  capcut_synced?: any;
  capcutDraft?: {
    ready: boolean;
    draftDir: string;
    macOsTargetDir: string;
    syncedAt?: string;
    totalDurationUs: number;
    tracksCount: number;
    segmentsCount: number;
  };
  qa_report?: any;
  qaReport?: QaReportData;
  qa_md?: any;
  qa_verdict?: any;
  proposals_md?: any;
  curator?: any;
  curator_diff?: CuratorDiffResult;
  profile?: any;
  models_config?: any;
  modelsConfig?: ModelsYamlConfig;
  router_models?: RouterModelsConfig;
  lessons_md?: any;
  lessons_line_count?: any;
  golden_examples?: any;
  golden_jsonl?: any;
  projects?: any;
  updated_at?: any;
  updatedAt?: string;
  logs?: string[];
  [key: string]: any;
}

export type ProjectActionType =
  | 'seed_demo'
  | 'create_project'
  | 'save_script'
  | 'link_mac_video'
  | 'run_all'
  | 'run_phase'
  | 'select_hook';

export interface ProjectActionPayload {
  action: ProjectActionType | string;
  projectId?: string;
  project_id?: string;
  script?: string;
  script_text?: string;
  cuttingPrompt?: string;
  cutting_prompt?: string;
  prompt_notes?: string;
  preferredHookStyle?: HookStyle;
  preferred_hook_style?: HookStyle;
  hook_style?: HookStyle;
  videoPath?: string;
  video_path?: string;
  macPath?: string;
  mac_path?: string;
  phase?: PhaseId | string;
  hookOption?: string | number;
  hook_option?: string | number;
  hookChoice?: string | number;
  hook_id?: string;
  autoApprove?: boolean;
  auto_approve?: boolean;
  pauseAtQa?: boolean;
  pause_at_qa?: boolean;
  approveProposals?: boolean;
  approve_proposals?: boolean;
  offline?: boolean;
  force?: boolean;
}

export interface ConfigResponseData {
  profile: AgentProfileConfig;
  models: RouterModelsConfig;
  lessons_md: string;
  lessons_line_count: number;
  golden_examples: GoldenExampleItem[];
  profile_path: string;
  models_path: string;
}

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data: T;
  message: string;
  error?: string;
  logs?: string[];
}

/**
 * Shared Default Project ID across Client & Server Bridge
 */
export const DEFAULT_PROJECT_ID = 'demo_podscare_studio';
export const DEFAULT_DEMO_PROJECT_ID = DEFAULT_PROJECT_ID;

/**
 * ============================================================================
 * SIMPLE VIDEO STUDIO CONTRACTS (Gate R1 Redesign - Section 5 Data Contracts)
 * ============================================================================
 */

export type SimpleStudioScreenState = 'prepare' | 'processing' | 'result';

export type SimpleCutPacingMode = 'natural' | 'tight';

export type SimpleSseStepNumber = 1 | 2 | 3 | 4 | 5;

export type SimpleSseStepStatus = 'waiting' | 'running' | 'done' | 'error';

export interface SimpleSseErrorDetail {
  message: string;
  fix: string;
  retry_from: SimpleSseStepNumber;
}

export interface SimpleSseStepEvent {
  step: SimpleSseStepNumber;
  label: string;
  status: SimpleSseStepStatus;
  percent: number;
  detail: string;
  error?: SimpleSseErrorDetail;
}

export type SimpleCutType = 'stumble' | 'silence' | 'retake' | 'filler';

export interface SimpleCutItem {
  id?: string;
  src_start_ms: number;
  src_end_ms: number;
  type: SimpleCutType;
  reason: string;
  removed_text?: string;
  restored?: boolean;
}

export interface SimpleHookItem {
  id: string;
  style: 'question' | 'teaser' | 'statement' | string;
  label?: string;
  text: string;
  duration_ms: number;
  selected: boolean;
}

export interface SimpleCapCutDraftAvailability {
  available: boolean;
  reason?: string;
  target_dir?: string;
}

export interface SimpleResultFiles {
  polished: string;
  cut_master: string;
  srt: string;
  clips_zip: string;
  capcut_draft: SimpleCapCutDraftAvailability;
}

export interface SimpleResultWarning {
  code: string;
  message: string;
  action?: string;
  timestamp_ms?: number;
}

export interface SimpleStudioResult {
  source_duration_ms: number;
  out_duration_ms: number;
  kept_segments_count?: number;
  source_filename?: string;
  cuts: SimpleCutItem[];
  hooks: SimpleHookItem[];
  selected_hook_id: string;
  files: SimpleResultFiles;
  warnings: SimpleResultWarning[];
  style?: VideoStudioAppliedStyle | null;
  style_match?: VideoStudioStyleMatchItem[];
  style_match_report?: StyleMatchReport | null;
  profile_trace?: ProfileTrace | null;
}

export interface SimplePrepareData {
  project_id: string;
  filename: string;
  source_path: string;
  duration_ms: number;
  width: number;
  height: number;
  fps: number;
  file_size_bytes: number;
  script_text: string;
  pacing_mode: SimpleCutPacingMode;
}

export interface SimpleLearningProposalItem {
  id: string;
  rule_text: string;
  detected_at_label: string;
  detail: string;
  status: 'pending' | 'approved' | 'dismissed';
}

// ---------------------------------------------------------------------------
// Stage S0 / S3: Style-from-Sample Data Contracts (`style_profile.json`,
// `effective_profile.json`, `profile_trace.json`, `style_match.json`)
// ---------------------------------------------------------------------------

export type StyleConfidenceLevel = 'measured' | 'estimated' | 'assumed';

export type StyleGroupKey = 'pacing' | 'captions' | 'hook' | 'audio' | 'punchin';

export interface StyleToggles {
  pacing: boolean;
  captions: boolean;
  hook: boolean;
  audio: boolean;
  punchin: boolean;
  [key: string]: boolean | undefined;
}

export interface StyleSummaryItem {
  key: StyleGroupKey | string;
  label?: string;
  text: string;
  confidence: StyleConfidenceLevel;
  confidence_label_vi?: string;
  enabled?: boolean;
}

export interface StyleSource {
  sha256: string;
  duration_ms: number;
  analyzed_ms: number;
  filename?: string;
  path?: string;
}

export interface StyleFormat {
  width: number;
  height: number;
  fps: number;
  aspect: string;
  template: 'podcast_horizontal' | 'podcast_vertical' | 'cut_only' | string;
}

export interface StylePacing {
  words_per_min: number;
  pause_median_ms: number;
  pause_p90_ms: number;
  max_silence_kept_ms: number;
  shots_per_min: number;
  jump_cut_ratio: number;
}

export interface StyleHook {
  duration_ms: number;
  style: 'question' | 'teaser' | 'statement' | string;
  text_overlay: boolean;
  repeated_later: boolean;
  time_to_first_word_ms: number;
}

export interface StyleCaptions {
  present: boolean;
  position: 'bottom_center' | 'middle_center' | 'top_center' | 'lower_third' | string;
  words_per_line: number;
  lines: number;
  highlight: 'none' | 'keyword_color' | 'box' | string;
  font_class: 'sans_bold' | 'sans_regular' | 'rounded_bold' | 'serif_bold' | string;
  text_color: string;
  highlight_color: string;
}

export interface StyleAudio {
  lufs: number;
  true_peak_db: number;
  lra: number;
  music_detected: boolean | null;
}

export interface StyleTitlecard {
  present: boolean;
}

export interface StylePunchin {
  detected: boolean;
  min_gap_s: number | null;
  scale: number | null;
}

export interface StyleProfile {
  style_id: string;
  name: string;
  source: StyleSource;
  format: StyleFormat;
  pacing: StylePacing;
  hook: StyleHook;
  captions: StyleCaptions;
  audio: StyleAudio;
  titlecard: StyleTitlecard;
  punchin: StylePunchin;
  confidence: Record<string, StyleConfidenceLevel>;
  evidence: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  saved?: boolean;
  [key: string]: any;
}

export interface EffectiveProfile {
  schema_version: string;
  project_id: string;
  style_id: string | null;
  template: string;
  playback_speed: number;
  enabled_groups: StyleToggles;
  format: {
    width: number;
    height: number;
    fps: number;
    aspect: string;
    keep_source_aspect: boolean;
  };
  pacing: {
    pad_start_ms: number;
    pad_end_ms: number;
    merge_gap_ms: number;
    silence_threshold_ms: number;
    max_silence_ms: number;
    min_silence_ms: number;
    target_pause_median_ms: number;
  };
  hook: {
    min_ms: number;
    max_ms: number;
    target_ms: number;
    preferred_style: string;
    prefer_opening_mode: string;
    text_overlay: boolean;
  };
  captions: {
    enabled: boolean;
    position: string;
    words_per_line: number;
    max_lines: number;
    highlight: string;
    font_class: string;
    font_family: string;
    text_color: string;
    highlight_color: string;
  };
  audio: {
    target_lufs: number;
    true_peak_max_db: number;
    lra_target?: number;
  };
  titlecard: {
    enabled: boolean;
    duration_ms: number;
  };
  punchin: {
    enabled: boolean;
    min_gap_ms: number;
    scale: number;
    min_shot_duration_ms?: number;
  };
  warnings: string[];
  [key: string]: any;
}

export interface ProfileTraceEntry {
  param: string;
  group: string;
  source: 'user_override' | 'sample_style' | 'template' | 'default_profile' | string;
  raw_value: any;
  effective_value: any;
  clamped: boolean;
  skipped_sources: Record<string, any>;
  confidence?: StyleConfidenceLevel | string | null;
  reason: string;
}

export interface ProfileTrace {
  schema_version: string;
  project_id: string;
  style_id: string | null;
  priority_order: string[];
  enabled_groups: StyleToggles;
  entries: ProfileTraceEntry[];
  warnings: string[];
  [key: string]: any;
}

export interface VideoStudioAppliedStyle {
  id: string;
  style_id?: string;
  name: string;
  filename?: string;
  analyzed_ms?: number;
  duration_ms?: number;
  aspect?: string;
  resolution?: string;
  summary: StyleSummaryItem[];
  toggles: StyleToggles;
  profile?: StyleProfile;
  unsupported?: string[];
  unsupported_notice?: string;
  warnings?: VideoStudioWarningItem[];
  saved?: boolean;
}

export interface VideoStudioStyleMatchItem {
  key: string;
  metric?: string;
  label: string;
  sample_value: string | number;
  output_value: string | number;
  target_value?: string | number;
  actual_value?: string | number;
  unit?: string;
  tolerance?: string;
  deviation?: string;
  within_tolerance: boolean;
  severity?: 'scored' | 'informational' | string;
  status?: 'matched' | 'deviated' | 'skipped' | 'info' | string;
  note: string;
}

export interface StyleMatchReport {
  schema_version: string;
  project_id: string;
  style_id: string;
  overall_status: 'pass' | 'partial' | 'fail' | string;
  summary: string;
  items: VideoStudioStyleMatchItem[];
}

export interface StyleAnalyzeResponse {
  ok: boolean;
  success: boolean;
  style_id: string;
  name: string;
  saved: boolean;
  style: VideoStudioAppliedStyle;
  profile: StyleProfile;
  summary: StyleSummaryItem[];
  toggles: StyleToggles;
  warnings: VideoStudioWarningItem[];
  unsupported: string[];
  unsupported_notice: string;
}

export interface SavedStyleListItem {
  id: string;
  style_id: string;
  name: string;
  filename?: string;
  analyzed_ms: number;
  duration_ms: number;
  aspect: string;
  resolution: string;
  summary: StyleSummaryItem[];
  toggles: StyleToggles;
  format: StyleFormat;
  source: StyleSource;
  profile: StyleProfile;
  saved: boolean;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Phase 5 Redesign Contracts (Task 6.2 & Section 5 Data Contract)
// ---------------------------------------------------------------------------

export type CutPreset = 'light' | 'medium' | 'strong';

export type PolishTemplate =
  | 'none'
  | 'clean_sub'
  | 'callout'
  | 'podcast_horizontal'
  | 'podcast_vertical'
  | 'cut_only'
  | string;

export type VideoStudioStepNumber = 1 | 2 | 3 | 4 | 5;

export type VideoStudioStepStatus = 'waiting' | 'running' | 'done' | 'error';

export const VIDEO_STUDIO_STEP_LABELS: Record<VideoStudioStepNumber, string> = {
  1: 'Đọc video',
  2: 'Nhận diện giọng nói',
  3: 'Chọn đoạn tốt nhất',
  4: 'Dựng & xuất',
  5: 'Kiểm tra',
};

export interface VideoStudioStepError {
  message: string;
  fix: string;
  retry_from: VideoStudioStepNumber | number;
}

export interface VideoStudioStepEvent {
  step: VideoStudioStepNumber | number;
  label: string;
  status: VideoStudioStepStatus;
  percent: number;
  detail: string;
  error?: VideoStudioStepError | null;
  job_id?: string;
  project_id?: string;
  steps?: VideoStudioStepEvent[];
}

export interface VideoStudioRunRequest {
  video?: string;
  videoPath?: string;
  video_path?: string;
  projectId?: string;
  project_id?: string;
  script?: string;
  script_text?: string;
  cutPreset?: CutPreset;
  cut_preset?: CutPreset;
  hookPrompt?: string;
  hook_prompt?: string;
  hookClipPath?: string | null;
  hook_clip_path?: string | null;
  customHookClipPath?: string | null;
  template?: PolishTemplate;
  style_id?: string | null;
  styleId?: string | null;
  style_toggles?: Partial<StyleToggles> | null;
  styleToggles?: Partial<StyleToggles> | null;
  enabled_style_groups?: Partial<StyleToggles> | null;
  enabledStyleGroups?: Partial<StyleToggles> | null;
  style_profile?: StyleProfile | null;
  styleProfile?: StyleProfile | null;
  padding?:
    | number
    | {
        start_ms?: number;
        end_ms?: number;
        pad_start_ms?: number;
        pad_end_ms?: number;
      };
  keepLaughter?: boolean;
  keep_laughter?: boolean;
  retry_from?: VideoStudioStepNumber | number;
  retryFrom?: VideoStudioStepNumber | number;
  simulate_error_step?: number;
  offline?: boolean;
  sync?: boolean;
  [key: string]: any;
}

export interface VideoStudioRunResponse {
  success?: boolean;
  ok?: boolean;
  job_id: string;
  project_id: string;
  status: 'queued' | 'running' | 'completed' | 'done' | 'error' | 'failed' | string;
  retry_from?: number | null;
  style_id?: string | null;
  style_toggles?: StyleToggles | null;
  steps?: VideoStudioStepEvent[];
  message?: string;
  [key: string]: any;
}

export type CutItemType = 'retake' | 'silence' | 'filler' | 'stutter' | string;

export interface VideoStudioCutItem {
  id?: string;
  src_start_ms: number;
  src_end_ms: number;
  duration_ms?: number;
  type: CutItemType;
  reason: string;
  text?: string;
  symbol?: string;
  label_vi?: string;
  restored?: boolean;
  [key: string]: any;
}

export interface VideoStudioResultHookItem {
  id: string;
  hook_id?: string;
  option_id?: string;
  style: HookStyle;
  title?: string;
  text: string;
  hook_text?: string;
  full_hook_text?: string;
  duration_ms: number;
  start_ms?: number;
  end_ms?: number;
  selected: boolean;
  score?: number;
  score_5?: number;
  reasoning?: string;
  rationale?: string;
  is_custom_clip?: boolean;
  custom_clip_path?: string | null;
  segments?: HookSegment[];
  [key: string]: any;
}

export interface VideoStudioCapCutDraftStatus {
  available: boolean;
  reason?: string;
  url?: string | null;
  draft_exists?: boolean;
  draft_dir?: string;
  target_dir?: string;
  target_path?: string;
  synced?: boolean;
}

export interface VideoStudioResultFiles {
  polished: string;
  cut_master: string;
  srt: string;
  clips_zip: string;
  capcut_draft: VideoStudioCapCutDraftStatus;
  source_video?: string | null;
  audio_16k?: string | null;
  [key: string]: any;
}

export interface VideoStudioWarningItem {
  code: string;
  message: string;
  action: string;
  timestamp_ms?: number;
}

export interface VideoStudioJobResult {
  job_id?: string;
  project_id?: string;
  status?: string;
  source_duration_ms: number;
  out_duration_ms: number;
  saved_duration_ms?: number;
  cuts: VideoStudioCutItem[];
  kept_segments?: CutlistSegment[];
  hooks: VideoStudioResultHookItem[];
  selected_hook_id: string;
  files: VideoStudioResultFiles;
  warnings: VideoStudioWarningItem[];
  style: VideoStudioAppliedStyle | null;
  style_match: VideoStudioStyleMatchItem[];
  style_match_report?: StyleMatchReport | null;
  profile_trace?: ProfileTrace | null;
  effective_profile?: EffectiveProfile | null;
  snapshot?: ProjectSnapshot;
  [key: string]: any;
}

export interface VideoStudioRehookRequest {
  selected_hook_id?: string;
  selectedHookId?: string;
  hook_id?: string;
  hookOption?: string | number;
  hook_prompt?: string;
  hookPrompt?: string;
  hook_clip_path?: string | null;
  hookClipPath?: string | null;
  custom_hook_clip_path?: string | null;
  restore_cut_id?: string;
  src_start_ms?: number;
  src_end_ms?: number;
  action?: string;
  [key: string]: any;
}

