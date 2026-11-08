import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_PROJECT_ID,
  getJobStepsSnapshot,
  startSimplePipelineJob,
} from '../../../../lib/video-studio/server-bridge';
import { VideoStudioRunRequest } from '../../../../lib/video-studio/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/video-studio/run?projectId=...
 * Inspect active or most recent simple-mode job for a project.
 */
export async function GET(request: NextRequest) {
  try {
    const projectId =
      request.nextUrl.searchParams.get('projectId') ||
      request.nextUrl.searchParams.get('project_id') ||
      request.nextUrl.searchParams.get('jobId') ||
      DEFAULT_PROJECT_ID;
    const snap = await getJobStepsSnapshot(projectId);
    return NextResponse.json({
      ok: true,
      job_id: snap.jobId,
      project_id: snap.projectId,
      status: snap.status,
      steps: snap.steps,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Không đọc được trạng thái phiên xử lý.',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/video-studio/run
 * Starts a Simple Mode 5-step pipeline job (or retries from step 1..5).
 * Accepts:
 * - video / videoPath
 * - projectId / project_id
 * - script
 * - cutPreset / cut_preset: 'light' | 'medium' | 'strong'
 * - hookPrompt / hook_prompt (takes priority over sample style hook when non-empty)
 * - hookClipPath / hook_clip_path
 * - template: 'auto_polish' | 'clean_cut'
 * - padding / padding_ms
 * - keepLaughter / keep_laughter
 * - retry_from / retryFrom (1..5)
 * - style_id / styleId: string | null (Sample style ID from PS1 or memory/styles/)
 * - style_toggles / styleToggles: { pacing, captions, hook, audio, punchin }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as VideoStudioRunRequest;
    const result = await startSimplePipelineJob(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Không thể khởi tạo phiên dựng video tự động.',
      },
      { status: 500 }
    );
  }
}
