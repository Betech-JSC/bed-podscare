import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  PathTraversalError,
  approveCuratorProposals,
  diffCapCutEdit,
  getProjectSnapshot,
  pushDraftToCapCut,
  resolveCapCutDraftsRoot,
  sanitizeProjectId,
  simulateCapCutEditAndDiff,
  writeAgentConfig,
} from '../../../../lib/video-studio/server-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/video-studio/capcut-sync?projectId=<id>
 * Returns current CapCut sync status, P9 Curator diff results, proposals.md,
 * memory/lessons/p4.md, and memory/golden/p4.jsonl.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawProjectId =
      searchParams.get('projectId') ||
      searchParams.get('project_id') ||
      searchParams.get('id') ||
      'demo_podscare_studio';
    const projectId = sanitizeProjectId(rawProjectId);
    const snapshot = await getProjectSnapshot(projectId);
    const capcutTargetDir = path.join(resolveCapCutDraftsRoot(), projectId);

    return NextResponse.json({
      success: true,
      project_id: projectId,
      projectId,
      target_path: capcutTargetDir,
      targetPath: capcutTargetDir,
      capcut_projects_root: resolveCapCutDraftsRoot(),
      draft_ready: snapshot.capcut_draft_exists,
      diff_result: snapshot.curator,
      diffResult: snapshot.curator,
      proposals_md: snapshot.proposals_md,
      proposalsMd: snapshot.proposals_md,
      lessons_md: snapshot.lessons_md,
      lessonsMd: snapshot.lessons_md,
      lessons_line_count: snapshot.lessons_line_count,
      golden_examples: snapshot.golden_examples,
      goldenExamples: snapshot.golden_examples,
      data: snapshot,
      snapshot,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Không thể đọc trạng thái đồng bộ CapCut.',
        message: error?.message || 'Không thể đọc trạng thái đồng bộ CapCut.',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/video-studio/capcut-sync
 * Actions:
 * - push_to_capcut: Copy `exports/capcut_draft/` -> `~/Movies/CapCut/User Data/Projects/com.lveditor.draft/<project_id>/`
 * - simulate_capcut_edit: Generate realistic human edit (`final_edit.json` + CapCut draft tweak) and run P9 diff
 * - diff_capcut: Run P9 Curator diff between AI `cutlist.json` and CapCut edited draft / `final_edit.json`
 * - approve_proposals: Approve P9 proposals into `memory/lessons/p4.md` (<= 30 lines) & `memory/golden/p4.jsonl`
 * - save_lessons: Save manual edits to `memory/lessons/p4.md` (enforcing <= 30 lines)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || body?.command || 'push_to_capcut')
      .trim()
      .toLowerCase();
    const rawProjectId =
      body?.projectId || body?.project_id || body?.id || 'demo_podscare_studio';
    const projectId = sanitizeProjectId(String(rawProjectId));

    // 1. Push Draft to macOS CapCut Desktop (< v5)
    if (
      action === 'push_to_capcut' ||
      action === 'push_draft' ||
      action === 'sync_to_capcut' ||
      action === 'push'
    ) {
      const result = await pushDraftToCapCut(projectId);
      return NextResponse.json({
        success: true,
        ...result,
        data: result.snapshot,
      });
    }

    // 2. Simulate Human CapCut Edit & Run P9 Diff
    if (
      action === 'simulate_capcut_edit' ||
      action === 'simulate_edit' ||
      action === 'simulate'
    ) {
      const result = await simulateCapCutEditAndDiff(projectId);
      return NextResponse.json({
        success: true,
        ...result,
        data: result.snapshot,
      });
    }

    // 3. Pull CapCut Draft / final_edit.json & Run P9 Diff
    if (
      action === 'diff_capcut' ||
      action === 'pull_and_diff' ||
      action === 'run_p9' ||
      action === 'diff'
    ) {
      const customDraftPath =
        body?.customDraftPath || body?.draftPath || body?.draft_path || undefined;
      const result = await diffCapCutEdit(projectId, customDraftPath);
      return NextResponse.json({
        success: true,
        ...result,
        data: result.snapshot,
      });
    }

    // 4. Approve Proposals into Tier-2 Lessons (<= 30 lines) & Tier-3 Golden JSONL
    if (
      action === 'approve_proposals' ||
      action === 'approve' ||
      action === 'commit_memory'
    ) {
      const result = await approveCuratorProposals(projectId);
      return NextResponse.json({
        success: true,
        ...result,
        data: result.snapshot,
      });
    }

    // 5. Save Manual Edits to memory/lessons/p4.md (<= 30 lines)
    if (action === 'save_lessons' || action === 'update_lessons') {
      const lessonsText = String(body?.lessonsMd ?? body?.lessons_md ?? '');
      const updatedConfig = writeAgentConfig({
        projectId,
        lessons_md: lessonsText,
      });
      const snapshot = await getProjectSnapshot(projectId);
      return NextResponse.json({
        success: true,
        action: 'save_lessons',
        project_id: projectId,
        projectId,
        message: `Đã lưu nội dung memory/lessons/p4.md (${updatedConfig.lessons_line_count}/30 dòng).`,
        lessons_md: updatedConfig.lessons_md,
        lessonsMd: updatedConfig.lessons_md,
        lessons_line_count: updatedConfig.lessons_line_count,
        golden_examples: updatedConfig.golden_examples,
        goldenExamples: updatedConfig.golden_examples,
        data: snapshot,
        snapshot,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: `Action không hợp lệ: "${action}". Hỗ trợ: push_to_capcut, simulate_capcut_edit, diff_capcut, approve_proposals, save_lessons.`,
        message: `Action không hợp lệ: "${action}".`,
      },
      { status: 400 }
    );
  } catch (error: any) {
    if (error instanceof PathTraversalError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          message: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Lỗi khi đồng bộ CapCut / P9 Curator.',
        message: error?.message || 'Lỗi khi đồng bộ CapCut / P9 Curator.',
      },
      { status: 500 }
    );
  }
}
