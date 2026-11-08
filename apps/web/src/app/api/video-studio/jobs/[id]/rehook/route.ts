import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_PROJECT_ID,
  rehookVideoStudioJob,
} from '../../../../../../lib/video-studio/server-bridge';
import { VideoStudioRehookRequest } from '../../../../../../lib/video-studio/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/video-studio/jobs/[id]/rehook
 * Accepts `{ selected_hook_id, hook_prompt?, hook_clip_path?, restore_cut_id?, unrestore_cut_id? }`,
 * quickly rebuilds the opening hook + cutlist + exports (P5 -> P6 -> P7 -> P8),
 * and returns the updated `VideoStudioJobResult` (same contract as `GET /api/video-studio/jobs/[id]/result`)
 * for instant in-place preview update.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const jobIdOrProjectId = resolvedParams?.id || DEFAULT_PROJECT_ID;
    const body = (await request.json().catch(() => ({}))) as VideoStudioRehookRequest;

    const updatedResult = await rehookVideoStudioJob(jobIdOrProjectId, body);
    return NextResponse.json(updatedResult);
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Không thể cập nhật câu mở đầu cho video.',
      },
      { status: 500 }
    );
  }
}
