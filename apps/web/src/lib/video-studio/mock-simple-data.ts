import {
  DEFAULT_PROJECT_ID,
  type SavedStyleListItem,
  type SimpleCutItem,
  type SimpleHookItem,
  type SimpleLearningProposalItem,
  type SimplePrepareData,
  type SimpleSseStepEvent,
  type SimpleStudioResult,
  type StyleMatchReport,
  type StyleProfile,
  type StyleToggles,
  type VideoStudioAppliedStyle,
  type VideoStudioStyleMatchItem,
} from './types';

export const SIMPLE_STUDIO_STORAGE_KEYS = {
  capcutDraftDir: 'podscare_video_studio_capcut_dir',
} as const;

export const DEFAULT_MAC_CAPCUT_DRAFT_DIR =
  '~/Movies/CapCut/User Data/Projects/com.lveditor.draft';

/**
 * 1. Trạng thái Chuẩn bị (`prepare`)
 */
export const MOCK_SIMPLE_PREPARE_DATA: SimplePrepareData = {
  project_id: DEFAULT_PROJECT_ID,
  filename: 'airpods-pro2-vesinh-raw.mp4',
  source_path: `/workspace/video-projects/${DEFAULT_PROJECT_ID}/raw_input_video.mp4`,
  duration_ms: 134000, // 2:14
  width: 1080,
  height: 1920,
  fps: 30,
  file_size_bytes: 28_450_000,
  script_text: `Tai nghe AirPods Pro 2 của bạn bị rè một bên hoặc tụt pin chỉ sau 20 phút nghe nhạc? Đừng vội mua tai mới tốn hơn 5 triệu đồng!
Xin chào mọi người, mình là kỹ thuật viên tại phòng Lab PodsCare. Hôm nay mình sẽ cho các bạn xem quy trình 3 bước xử lý dứt điểm lỗi rè màng loa và chai pin AirPods Pro 2 ngay tại bàn kỹ thuật.
Bước 1: Kiểm tra vi âm và đo trở kháng màng loa bằng máy chuyên dụng tại quầy.
Bước 2: Làm sạch siêu âm đa tần kết hợp dung dịch đẳng trương không ăn mòn keo zin, sau đó bóc tách vỏ ở nhiệt độ chuẩn 68 độ C để thay pin.
Bước 3: Đóng áp suất chân không, kiểm tra chống ồn chủ động và xuyên âm trước khi bàn giao kèm mã bảo hành điện tử.
Nếu AirPods của bạn đang gặp tình trạng tương tự, hãy ghé ngay PodsCare để được kiểm tra miễn phí nhé!`,
  pacing_mode: 'natural',
};

/**
 * 2. Trạng thái Đang xử lý (`processing` — 5 bước SSE tuần tự 1..5)
 */
export const MOCK_SIMPLE_SSE_STEPS_RUNNING: SimpleSseStepEvent[] = [
  {
    step: 1,
    label: 'Đọc video',
    status: 'done',
    percent: 100,
    detail: 'Đã đọc xong thông tin video và tách âm thanh từ airpods-pro2-vesinh-raw.mp4 (2:14)',
  },
  {
    step: 2,
    label: 'Nhận diện giọng nói',
    status: 'done',
    percent: 100,
    detail: 'Đã nhận diện 412 từ',
  },
  {
    step: 3,
    label: 'Chọn đoạn tốt nhất',
    status: 'running',
    percent: 68,
    detail: 'Tìm thấy 7 lần nói lại, đang chọn lần nói rõ chữ nhất...',
  },
  {
    step: 4,
    label: 'Dựng & xuất',
    status: 'waiting',
    percent: 0,
    detail: 'Chờ chọn xong các đoạn nói tốt nhất',
  },
  {
    step: 5,
    label: 'Kiểm tra',
    status: 'waiting',
    percent: 0,
    detail: 'Chờ kiểm tra độ mượt của các điểm cắt và phụ đề',
  },
];

export const MOCK_SIMPLE_SSE_STEPS_ERROR_STEP_3: SimpleSseStepEvent[] = [
  {
    step: 1,
    label: 'Đọc video',
    status: 'done',
    percent: 100,
    detail: 'Đã đọc xong thông tin video và tách âm thanh',
  },
  {
    step: 2,
    label: 'Nhận diện giọng nói',
    status: 'done',
    percent: 100,
    detail: 'Đã nhận diện 412 từ',
  },
  {
    step: 3,
    label: 'Chọn đoạn tốt nhất',
    status: 'error',
    percent: 45,
    detail: 'Tạm dừng tại bước chọn đoạn tốt nhất',
    error: {
      message: 'Không kết nối được dịch vụ AI.',
      fix: 'Kiểm tra 9Router đang chạy ở cổng 20128 rồi bấm Thử lại từ bước này.',
      retry_from: 3,
    },
  },
  {
    step: 4,
    label: 'Dựng & xuất',
    status: 'waiting',
    percent: 0,
    detail: 'Đang chờ bước 3',
  },
  {
    step: 5,
    label: 'Kiểm tra',
    status: 'waiting',
    percent: 0,
    detail: 'Đang chờ bước 4',
  },
];

export const MOCK_SIMPLE_SSE_STEPS_DONE: SimpleSseStepEvent[] = [
  {
    step: 1,
    label: 'Đọc video',
    status: 'done',
    percent: 100,
    detail: 'Đã đọc xong thông tin video và chuẩn hóa âm thanh',
  },
  {
    step: 2,
    label: 'Nhận diện giọng nói',
    status: 'done',
    percent: 100,
    detail: 'Đã nhận diện 412 từ',
  },
  {
    step: 3,
    label: 'Chọn đoạn tốt nhất',
    status: 'done',
    percent: 100,
    detail: 'Tìm thấy 7 lần nói lại, đã giữ các đoạn nói tốt nhất',
  },
  {
    step: 4,
    label: 'Dựng & xuất',
    status: 'done',
    percent: 100,
    detail: 'Đã dựng xong video đã cắt, phụ đề và gói dự án CapCut',
  },
  {
    step: 5,
    label: 'Kiểm tra',
    status: 'done',
    percent: 100,
    detail: 'Đã kiểm tra hoàn tất, các điểm cắt mượt và khớp phụ đề',
  },
];

/**
 * 3. Bộ `cuts` mẫu phục vụ kiểm thử đầy đủ các tình huống biên:
 * - Đoạn cắt ở đầu video (`0ms` -> `1800ms`)
 * - Đoạn cắt rất ngắn `< 400ms` (`250ms`: `24200ms` -> `24450ms`)
 * - Đoạn cắt ở giữa video (`retake`, `stumble`, `silence`, `filler`)
 * - Đoạn cắt ở cuối video (`132100ms` -> `134000ms`)
 * Tổng thời lượng cắt: 26.000ms (26 giây) trên tổng 134.000ms (2:14) -> còn 108.000ms (1:48).
 */
export const MOCK_SIMPLE_CUTS_DEFAULT: SimpleCutItem[] = [
  {
    id: 'cut_01',
    src_start_ms: 0,
    src_end_ms: 1800,
    type: 'silence',
    reason: 'Khoảng lặng đầu video trước khi bắt đầu nói.',
    removed_text: '[Im lặng 1.8 giây khi ổn định khung hình]',
  },
  {
    id: 'cut_02',
    src_start_ms: 14200,
    src_end_ms: 15100,
    type: 'filler',
    reason: 'Tiếng đệm "ờm" giữa câu mở đầu.',
    removed_text: 'ờm...',
  },
  {
    id: 'cut_03',
    src_start_ms: 24200,
    src_end_ms: 24450,
    type: 'filler',
    reason: 'Tiếng ngập ngừng rất ngắn (0.25 giây) trước thuật ngữ kỹ thuật.',
    removed_text: 'ờ',
  },
  {
    id: 'cut_04',
    src_start_ms: 38200,
    src_end_ms: 42700,
    type: 'retake',
    reason: 'Nói lại câu 3 do vấp chữ "màng loa", hệ thống giữ lần nói thứ 2 rõ hơn.',
    removed_text: 'Chúng tôi tiến hành mở... ờm mở màng loa AirPods...',
  },
  {
    id: 'cut_05',
    src_start_ms: 52100,
    src_end_ms: 54200,
    type: 'stumble',
    reason: 'Đọc nhịu cụm từ "dung dịch đẳng trương", tự ngắt để nói lại.',
    removed_text: 'kết hợp dung dịch đẳng... đẳng trương',
  },
  {
    id: 'cut_06',
    src_start_ms: 65000,
    src_end_ms: 67800,
    type: 'silence',
    reason: 'Nghỉ lấy hơi dài sau đoạn giới thiệu thiết bị đo.',
    removed_text: '[Khoảng ngừng nghỉ 2.8 giây]',
  },
  {
    id: 'cut_07',
    src_start_ms: 79400,
    src_end_ms: 83000,
    type: 'retake',
    reason: 'Lặp lại câu thông số nhiệt độ 68 độ C, giữ lần nói sau dứt khoát hơn.',
    removed_text: 'bóc tách vỏ ở khoảng... để mình đọc lại chuẩn 68 độ C',
  },
  {
    id: 'cut_08',
    src_start_ms: 96000,
    src_end_ms: 99400,
    type: 'stumble',
    reason: 'Vấp từ "chẩn đoán", nói lại ngay sau đó.',
    removed_text: 'quy trình chẩn... chẩn đoán chống ồn',
  },
  {
    id: 'cut_09',
    src_start_ms: 109200,
    src_end_ms: 110850,
    type: 'filler',
    reason: 'Cụm từ đệm "kiểu như là" trước câu tổng kết.',
    removed_text: 'thì kiểu như là...',
  },
  {
    id: 'cut_10',
    src_start_ms: 118500,
    src_end_ms: 121600,
    type: 'silence',
    reason: 'Khoảng ngừng nhìn phiếu bảo hành trước lời kêu gọi cuối.',
    removed_text: '[Khoảng lặng 3.1 giây]',
  },
  {
    id: 'cut_11',
    src_start_ms: 132100,
    src_end_ms: 134000,
    type: 'silence',
    reason: 'Khoảng lặng cuối video sau khi chào tạm biệt và đưa tay tắt máy quay.',
    removed_text: '[Im lặng cuối video 1.9 giây]',
  },
];

/**
 * Các tập `cuts` chuyên biệt phục vụ kiểm thử từng trường hợp biên
 */
export const MOCK_CUTS_START_EDGE: SimpleCutItem[] = [
  {
    id: 'cut_start_01',
    src_start_ms: 0,
    src_end_ms: 1800,
    type: 'silence',
    reason: 'Khoảng lặng đầu video trước khi nói (0:00.0 – 0:01.8).',
    removed_text: '[Im lặng đầu video 1.8 giây]',
  },
];

export const MOCK_CUTS_MIDDLE_ONLY: SimpleCutItem[] = [
  {
    id: 'cut_mid_01',
    src_start_ms: 38200,
    src_end_ms: 42700,
    type: 'retake',
    reason: 'Nói lại câu 3 do vấp chữ "màng loa", hệ thống giữ lần nói thứ 2 rõ hơn.',
    removed_text: 'Chúng tôi tiến hành mở... ờm mở màng loa AirPods...',
  },
  {
    id: 'cut_mid_02',
    src_start_ms: 65000,
    src_end_ms: 67800,
    type: 'silence',
    reason: 'Nghỉ lấy hơi dài sau đoạn giới thiệu.',
    removed_text: '[Khoảng lặng 2.8 giây]',
  },
  {
    id: 'cut_mid_03',
    src_start_ms: 96000,
    src_end_ms: 99400,
    type: 'stumble',
    reason: 'Vấp từ "chẩn đoán", nói lại ngay sau.',
    removed_text: 'chẩn... chẩn đoán',
  },
];

export const MOCK_CUTS_END_EDGE: SimpleCutItem[] = [
  {
    id: 'cut_end_01',
    src_start_ms: 132100,
    src_end_ms: 134000,
    type: 'silence',
    reason: 'Khoảng lặng cuối video khi hạ tay bấm tắt máy quay (2:12.1 – 2:14.0).',
    removed_text: '[Im lặng cuối video 1.9 giây]',
  },
];

export const MOCK_CUTS_ULTRA_SHORT: SimpleCutItem[] = [
  {
    id: 'cut_short_01',
    src_start_ms: 24200,
    src_end_ms: 24450,
    type: 'filler',
    reason: 'Tiếng đệm ngắn 250ms (< 400ms) giữa hai mệnh đề.',
    removed_text: 'ờ',
  },
  {
    id: 'cut_short_02',
    src_start_ms: 71100,
    src_end_ms: 71420,
    type: 'stumble',
    reason: 'Âm bật bị nhịu nhẹ 320ms (< 400ms) đầu từ "siêu âm".',
    removed_text: 's-',
  },
];

export const MOCK_CUTS_EMPTY: SimpleCutItem[] = [];

export type MockCutScenarioKey =
  | 'default_11_cuts'
  | 'start_cut'
  | 'middle_cut'
  | 'end_cut'
  | 'short_cut_250ms'
  | 'zero_cuts';

export const MOCK_CUT_SCENARIOS: Record<
  MockCutScenarioKey,
  {
    label: string;
    source_duration_ms: number;
    cuts: SimpleCutItem[];
  }
> = {
  default_11_cuts: {
    label: 'Đầy đủ 11 chỗ cắt (Đầu, giữa, cuối & đoạn < 400ms)',
    source_duration_ms: 134000,
    cuts: MOCK_SIMPLE_CUTS_DEFAULT,
  },
  start_cut: {
    label: 'Cắt ở đầu video (0ms -> 1800ms)',
    source_duration_ms: 134000,
    cuts: MOCK_CUTS_START_EDGE,
  },
  middle_cut: {
    label: 'Cắt ở giữa video (3 đoạn giữa)',
    source_duration_ms: 134000,
    cuts: MOCK_CUTS_MIDDLE_ONLY,
  },
  end_cut: {
    label: 'Cắt ở cuối video (132100ms -> 134000ms)',
    source_duration_ms: 134000,
    cuts: MOCK_CUTS_END_EDGE,
  },
  short_cut_250ms: {
    label: 'Đoạn cắt rất ngắn (< 400ms: 250ms & 320ms)',
    source_duration_ms: 134000,
    cuts: MOCK_CUTS_ULTRA_SHORT,
  },
  zero_cuts: {
    label: 'Không có đoạn cắt nào (0 chỗ cắt)',
    source_duration_ms: 134000,
    cuts: MOCK_CUTS_EMPTY,
  },
};

export const MOCK_SIMPLE_HOOKS: SimpleHookItem[] = [
  {
    id: 'hook_opt_1',
    style: 'question',
    label: 'Đặt câu hỏi',
    text: 'Tai nghe AirPods Pro 2 của bạn bị rè một bên hoặc tụt pin chỉ sau 20 phút nghe nhạc?',
    duration_ms: 7200,
    selected: true,
  },
  {
    id: 'hook_opt_2',
    style: 'teaser',
    label: 'Nhá hàng kết quả',
    text: 'Chỉ mất 15 phút tại phòng Lab PodsCare để phục hồi màng loa AirPods Pro 2 ở chuẩn 68 độ C.',
    duration_ms: 6500,
    selected: false,
  },
  {
    id: 'hook_opt_3',
    style: 'statement',
    label: 'Khẳng định trực diện',
    text: 'Đừng vội tốn 5 triệu mua AirPods mới khi 80% trường hợp rè loa chỉ do bít lưới kim loại.',
    duration_ms: 5800,
    selected: false,
  },
];

export const DEFAULT_STYLE_TOGGLES: StyleToggles = {
  pacing: true,
  captions: true,
  hook: true,
  audio: true,
  punchin: true,
};

export const MOCK_DEFAULT_STYLE_PROFILE: StyleProfile = {
  style_id: 'style_ab12',
  name: 'Podcast dọc nhịp nhanh PodsCare',
  source: {
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    duration_ms: 62400,
    analyzed_ms: 62400,
    filename: 'mau_reels_podscare_chuan.mp4',
  },
  format: {
    width: 1080,
    height: 1920,
    fps: 30,
    aspect: '9:16',
    template: 'podcast_vertical',
  },
  pacing: {
    words_per_min: 168.5,
    pause_median_ms: 240,
    pause_p90_ms: 520,
    max_silence_kept_ms: 650,
    shots_per_min: 18.2,
    jump_cut_ratio: 0.65,
  },
  hook: {
    duration_ms: 6200,
    style: 'question',
    text_overlay: true,
    repeated_later: true,
    time_to_first_word_ms: 180,
  },
  captions: {
    present: true,
    position: 'bottom_center',
    words_per_line: 3,
    lines: 1,
    highlight: 'keyword_color',
    font_class: 'sans_bold',
    text_color: '#FFFFFF',
    highlight_color: '#FFD60A',
  },
  audio: {
    lufs: -14.2,
    true_peak_db: -1.2,
    lra: 6.4,
    music_detected: false,
  },
  titlecard: {
    present: true,
  },
  punchin: {
    detected: true,
    min_gap_s: 5.5,
    scale: 1.08,
  },
  confidence: {
    format: 'measured',
    pacing: 'measured',
    hook: 'estimated',
    captions: 'estimated',
    audio: 'measured',
    titlecard: 'estimated',
    punchin: 'estimated',
  },
  evidence: {
    format: {
      stream_index: 0,
      codec_name: 'h264',
      sample_frames: [0],
    },
    pacing: {
      pause_samples_ms: [180, 220, 240, 310, 520],
      cut_timestamps_ms: [3200, 6200, 9800, 14100],
    },
    hook: {
      start_ms: 0,
      end_ms: 6200,
      matched_repeat_ms: [24500, 30700],
      first_sentence: 'Tai nghe AirPods Pro bị rè một bên có sửa được không?',
    },
    captions: {
      sample_timestamps_ms: [1200, 4500, 8900],
      bbox_norm: [0.12, 0.76, 0.88, 0.86],
    },
    audio: {
      window_ms: [0, 62400],
      filter: 'ebur128',
    },
    titlecard: {
      start_ms: 0,
      end_ms: 2800,
      sample_frames: [15, 45],
    },
    punchin: {
      events: [
        { start_ms: 6200, end_ms: 9400, estimated_scale: 1.08, frame_pair: [185, 190] },
        { start_ms: 15800, end_ms: 18900, estimated_scale: 1.07, frame_pair: [473, 478] },
      ],
    },
  },
  saved: true,
};

export const MOCK_APPLIED_STYLE: VideoStudioAppliedStyle = {
  id: 'style_ab12',
  style_id: 'style_ab12',
  name: 'Podcast dọc nhịp nhanh PodsCare',
  filename: 'mau_reels_podscare_chuan.mp4',
  analyzed_ms: 62400,
  duration_ms: 62400,
  aspect: '9:16',
  resolution: '1080×1920',
  summary: [
    {
      key: 'pacing',
      label: 'Nhịp cắt & khoảng lặng',
      text: 'Nhịp cắt: nhanh, nghỉ giữa câu khoảng 0,24 giây (tối đa 0,65 giây)',
      confidence: 'measured',
      confidence_label_vi: 'Chắc chắn',
      enabled: true,
    },
    {
      key: 'captions',
      label: 'Phụ đề',
      text: 'Phụ đề: 3 từ mỗi dòng, giữa phía dưới, từ khóa tô vàng',
      confidence: 'estimated',
      confidence_label_vi: 'Ước lượng',
      enabled: true,
    },
    {
      key: 'hook',
      label: 'Phần mở đầu',
      text: 'Phần mở đầu: câu hỏi, khoảng 6,2 giây, có chữ tiêu đề đầu',
      confidence: 'estimated',
      confidence_label_vi: 'Ước lượng',
      enabled: true,
    },
    {
      key: 'audio',
      label: 'Âm lượng',
      text: 'Âm lượng: -14,2 LUFS (đỉnh tối đa -1,0 dBTP)',
      confidence: 'measured',
      confidence_label_vi: 'Chắc chắn',
      enabled: true,
    },
    {
      key: 'punchin',
      label: 'Nhấn khung hình',
      text: 'Nhấn khung hình: phóng nhẹ 108%, cách nhau tối thiểu 5,5 giây',
      confidence: 'estimated',
      confidence_label_vi: 'Ước lượng',
      enabled: true,
    },
  ],
  toggles: { ...DEFAULT_STYLE_TOGGLES },
  profile: MOCK_DEFAULT_STYLE_PROFILE,
  unsupported: ['nhạc nền', 'hiệu ứng', 'màu phim'],
  unsupported_notice: 'Chưa áp dụng được: nhạc nền, hiệu ứng, màu phim',
  warnings: [],
  saved: true,
};

export const MOCK_SAVED_STYLES_LIST: SavedStyleListItem[] = [
  {
    id: 'style_ab12',
    style_id: 'style_ab12',
    name: 'Podcast dọc nhịp nhanh PodsCare',
    filename: 'mau_reels_podscare_chuan.mp4',
    analyzed_ms: 62400,
    duration_ms: 62400,
    aspect: '9:16',
    resolution: '1080×1920',
    summary: MOCK_APPLIED_STYLE.summary,
    toggles: { ...DEFAULT_STYLE_TOGGLES },
    format: MOCK_DEFAULT_STYLE_PROFILE.format,
    source: MOCK_DEFAULT_STYLE_PROFILE.source,
    profile: MOCK_DEFAULT_STYLE_PROFILE,
    saved: true,
  },
];

export const MOCK_STYLE_MATCH_ITEMS: VideoStudioStyleMatchItem[] = [
  {
    key: 'loudness_lufs',
    metric: 'loudness_lufs',
    label: 'Âm lượng',
    sample_value: '-14,2 LUFS',
    output_value: '-14,0 LUFS',
    target_value: -14.2,
    actual_value: -14.0,
    unit: 'LUFS',
    tolerance: '±1,0 LU',
    deviation: '+0,2 LU',
    within_tolerance: true,
    severity: 'scored',
    status: 'matched',
    note: 'Khớp mục tiêu âm lượng trong dung sai ±1,0 LU.',
  },
  {
    key: 'pause_median_ms',
    metric: 'pause_median_ms',
    label: 'Khoảng lặng giữa câu',
    sample_value: '240 ms',
    output_value: '265 ms',
    target_value: 240,
    actual_value: 265,
    unit: 'ms',
    tolerance: '±30%',
    deviation: '+10,4%',
    within_tolerance: true,
    severity: 'scored',
    status: 'matched',
    note: 'Độ lệch +10,4% nằm trong ngưỡng dung sai ±30%.',
  },
  {
    key: 'hook_duration_ms',
    metric: 'hook_duration_ms',
    label: 'Độ dài mở đầu (Hook)',
    sample_value: '6,2 giây',
    output_value: '5,8 giây',
    target_value: 6200,
    actual_value: 5800,
    unit: 'ms',
    tolerance: '±1,5 giây',
    deviation: '-0,4s',
    within_tolerance: true,
    severity: 'scored',
    status: 'matched',
    note: 'Độ dài mở đầu chênh 0,4 giây, nằm trong ngưỡng ±1,5 giây.',
  },
  {
    key: 'captions_layout',
    metric: 'captions_layout',
    label: 'Phụ đề',
    sample_value: '3 từ/dòng · cuối giữa',
    output_value: '3 từ/dòng · cuối giữa',
    target_value: '3 từ/dòng · bottom_center',
    actual_value: '3 từ/dòng · bottom_center',
    unit: 'layout',
    tolerance: '±1 từ/dòng & cùng vị trí',
    deviation: '0 từ/dòng · cùng vị trí',
    within_tolerance: true,
    severity: 'scored',
    status: 'matched',
    note: 'Cùng vị trí cuối giữa màn hình và số từ mỗi dòng khớp mục tiêu.',
  },
  {
    key: 'shots_per_min',
    metric: 'shots_per_min',
    label: 'Nhịp cắt (tham khảo)',
    sample_value: '18,2 cảnh/phút',
    output_value: '14,5 cảnh/phút',
    target_value: 18.2,
    actual_value: 14.5,
    unit: 'shots/min',
    tolerance: '±30% (chỉ báo thông tin)',
    deviation: '-20,3%',
    within_tolerance: true,
    severity: 'informational',
    status: 'info',
    note: 'Chỉ số tham khảo phụ thuộc vào mật độ nói vấp của video gốc.',
  },
];

export const MOCK_STYLE_MATCH_REPORT: StyleMatchReport = {
  schema_version: '1.0',
  project_id: DEFAULT_PROJECT_ID,
  style_id: 'style_ab12',
  overall_status: 'pass',
  summary:
    'Các chỉ số âm lượng, khoảng nghỉ, độ dài mở đầu và phụ đề đều nằm trong ngưỡng dung sai so với video mẫu.',
  items: MOCK_STYLE_MATCH_ITEMS,
};

/**
 * 3. Trạng thái Kết quả (`result`) chuẩn theo Hợp đồng dữ liệu mục 5
 */
export const MOCK_SIMPLE_RESULT_DATA: SimpleStudioResult = {
  source_duration_ms: 134000,
  out_duration_ms: 108000,
  kept_segments_count: 6,
  source_filename: 'airpods-pro2-vesinh-raw.mp4',
  cuts: MOCK_SIMPLE_CUTS_DEFAULT,
  hooks: MOCK_SIMPLE_HOOKS,
  selected_hook_id: 'hook_opt_1',
  files: {
    polished: `/api/video-studio/media?projectId=${DEFAULT_PROJECT_ID}&file=exports/video_final.mp4&download=1`,
    cut_master: `/api/video-studio/media?projectId=${DEFAULT_PROJECT_ID}&file=exports/output_roughcut.mp4&download=1`,
    srt: `/api/video-studio/media?projectId=${DEFAULT_PROJECT_ID}&file=exports/output_roughcut.srt&download=1`,
    clips_zip: `/api/video-studio/media?projectId=${DEFAULT_PROJECT_ID}&file=exports/clips/001_hook.mp4&download=1`,
    capcut_draft: {
      available: true,
      target_dir: `${DEFAULT_MAC_CAPCUT_DRAFT_DIR}/${DEFAULT_PROJECT_ID}`,
    },
  },
  warnings: [
    {
      code: 'CUT_NEAR_BREATH',
      message:
        'Chỗ cắt ở 1:05.0 nằm sát chữ "chống ồn". Nên nghe thử 3 giây quanh mốc này.',
      action: 'Nghe mốc 1:05',
      timestamp_ms: 65000,
    },
  ],
  style: MOCK_APPLIED_STYLE,
  style_match: MOCK_STYLE_MATCH_ITEMS,
  style_match_report: MOCK_STYLE_MATCH_REPORT,
};

/**
 * Danh sách đề xuất trong ngăn "Học & cải thiện" (mục 3.5)
 */
export const MOCK_SIMPLE_LEARNING_PROPOSALS: SimpleLearningProposalItem[] = [
  {
    id: 'learn_prop_01',
    rule_text: 'Giữ lại nhịp nghỉ 0.6 giây trước câu kết luận để giọng đọc tự nhiên hơn',
    detected_at_label:
      'Phát hiện tại mốc 1:42.0 (Bạn đã kéo dài thêm 0.4 giây so với bản AI cắt)',
    detail: 'Áp dụng cho câu chuyển sang phần tổng kết cuối video.',
    status: 'pending',
  },
  {
    id: 'learn_prop_02',
    rule_text: 'Không cắt cụm từ "vệ sinh chuyên sâu" khi người nói nhấn giọng chậm',
    detected_at_label:
      'Phát hiện tại mốc 0:54.2 (Bạn đã khôi phục đoạn AI tưởng nhầm là nói vấp)',
    detail: 'Bảo vệ nhịp nhấn giọng chậm ở các thuật ngữ kỹ thuật.',
    status: 'pending',
  },
];

export const MOCK_APPLIED_LEARNING_RULES: string[] = [
  'Ưu tiên giữ lần nói sau cùng khi người nói lặp lại cùng một câu.',
  'Giữ khoảng nghỉ tự nhiên 0.08 giây trước đầu câu và 0.12 giây sau cuối câu.',
  'Loại bỏ tiếng đệm "ờm", "à", "kiểu như là" khi đứng đầu câu.',
  'Bảo vệ tuyệt đối tên riêng: PodsCare, AirPods Pro 2, ANC, Transparency.',
  'Không cắt vào khoảng lấy hơi ngắn dưới 0.3 giây giữa hai vế câu liên tiếp.',
  'Khi câu có đọc con số báo giá hoặc nhiệt độ (68 độ C), chọn lần đọc rõ chữ số nhất.',
  'Loại bỏ khoảng lặng đầu video trước chữ đầu tiên và khoảng lặng cuối video khi tắt máy.',
  'Giữ nguyên từ nối chuyển ý ("Tuy nhiên", "Đặc biệt là") ở đầu đoạn.',
  'Không cắt sát phụ âm bật ở đầu từ tiếng Việt có dấu nặng hoặc dấu ngã.',
  'Tự động làm mượt âm lượng 0.03 giây tại điểm nối hai đoạn cắt.',
  'Ưu tiên đoạn mở đầu có câu hỏi trực diện vào triệu chứng hỏng thiết bị.',
  'Cảnh báo người dùng kiểm tra lại nếu vết cắt nằm cách từ khóa chính dưới 0.1 giây.',
];
