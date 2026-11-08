import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_PROJECT_ID,
  buildVideoStudioJobResult,
} from '../../../../../../lib/video-studio/server-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/video-studio/jobs/[id]/result
 * Returns the Section 5.2 + S3.1 data contract:
 * {
 *   "source_duration_ms": 134000,
 *   "out_duration_ms": 108000,
 *   "cuts": [
 *     { "src_start_ms": 12400, "src_end_ms": 15800, "type": "retake", "reason": "Nói lại câu 3, giữ lần sau" }
 *   ],
 *   "hooks": [
 *     { "id": "hook_1", "style": "teaser", "text": "...", "duration_ms": 6800, "selected": true }
 *   ],
 *   "selected_hook_id": "hook_1",
 *   "files": {
 *     "polished": "/api/video-studio/media?...",
 *     "cut_master": "/api/video-studio/media?...",
 *     "srt": "/api/video-studio/media?...",
 *     "clips_zip": "/api/video-studio/media?...",
 *     "capcut_draft": { "available": false, "reason": "Chưa tạo được dự án CapCut (bản CapCut mới mã hóa dự án). Dùng video đã cắt và file .srt để nhập vào CapCut." }
 *   },
 *   "style": {
 *     "id": "style_ab12",
 *     "name": "Podcast dọc nhịp nhanh",
 *     "summary": [{ "key": "pacing", "text": "...", "confidence": "measured" }],
 *     "toggles": { "pacing": true, "captions": true, "hook": true, "audio": true, "punchin": true }
 *   } | null,
 *   "style_match": [
 *     { "key": "loudness_lufs", "label": "Âm lượng", "sample_value": "-14,2 LUFS", "output_value": "-14,0 LUFS", "within_tolerance": true, "note": "..." }
 *   ],
 *   "warnings": [
 *     { "code": "prompt_warning", "message": "Mô tả phần mở đầu không khớp nội dung video nên đang dùng gợi ý tự động.", "action": "Thử mô tả bằng từ có trong video." }
 *   ]
 * }
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const jobIdOrProjectId = resolvedParams?.id || DEFAULT_PROJECT_ID;
    const cacheBust = request.nextUrl.searchParams.get('fresh') === '1';

    const result = await buildVideoStudioJobResult(jobIdOrProjectId, {
      cacheBust,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Không lấy được kết quả dựng video.',
      },
      { status: 500 }
    );
  }
}
