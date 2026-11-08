import {
  DEFAULT_PROJECT_ID,
  type SimpleCutItem,
  type SimpleHookItem,
  type SimpleLearningProposalItem,
  type SimplePrepareData,
  type SimpleSseStepEvent,
  type SimpleStudioResult,
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
