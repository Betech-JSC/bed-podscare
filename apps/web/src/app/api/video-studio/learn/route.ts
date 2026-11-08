import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_PROJECT_ID,
  getLearnState,
  mutateLearnState,
} from '../../../../lib/video-studio/server-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/video-studio/learn?projectId=...
 * Returns the current self-learning state for Section 4.4 ("Rút kinh nghiệm từ bản sửa của bạn"):
 * - proposals: diff cards ("Máy cắt hơi tay" / "Máy bỏ sót") with [Lưu quy tắc này] & [Bỏ qua]
 * - lessons: active rules in `memory/lessons/p4.md` (N/30) with [Xoá] support
 */
export async function GET(request: NextRequest) {
  try {
    const projectId =
      request.nextUrl.searchParams.get('projectId') ||
      request.nextUrl.searchParams.get('project_id') ||
      DEFAULT_PROJECT_ID;
    const data = await getLearnState(projectId);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Không tải được dữ liệu rút kinh nghiệm.',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/video-studio/learn
 * Actions:
 * - `compare` / `diff_capcut`: Compare AI cutlist against editor's final CapCut edit
 * - `approve_proposal` / `save_lesson`: Save a proposed rule to `memory/lessons/p4.md` (<= 30 lines)
 * - `dismiss_proposal`: Ignore a proposed rule card
 * - `delete_lesson`: Delete an existing rule from `memory/lessons/p4.md`
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = await mutateLearnState(body || {});
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Không thực hiện được thao tác rút kinh nghiệm.',
      },
      { status: 500 }
    );
  }
}
