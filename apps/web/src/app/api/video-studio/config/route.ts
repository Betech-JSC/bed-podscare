import { NextRequest, NextResponse } from 'next/server';
import {
  getProjectSnapshot,
  readAgentConfig,
  sanitizeProjectId,
  writeAgentConfig,
} from '../../../../lib/video-studio/server-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/video-studio/config
 * Reads `tools/video-pipeline/memory/profile.yaml`, `tools/video-pipeline/config/models.yaml`,
 * `tools/video-pipeline/memory/lessons/p4.md`, and `tools/video-pipeline/memory/golden/p4.jsonl`.
 */
export async function GET() {
  try {
    const configData = readAgentConfig();
    return NextResponse.json({
      success: true,
      data: configData,
      profile: configData.profile,
      models: configData.models,
      lessons_md: configData.lessons_md,
      lessonsMd: configData.lessons_md,
      lessons_line_count: configData.lessons_line_count,
      golden_examples: configData.golden_examples,
      goldenExamples: configData.golden_examples,
      profile_path: configData.profile_path,
      models_path: configData.models_path,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Không thể đọc cấu hình Agent Profile & 9Router Models.',
        message: error?.message || 'Không thể đọc cấu hình Agent Profile & 9Router Models.',
      },
      { status: 500 }
    );
  }
}

async function handleSaveConfig(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const updated = writeAgentConfig(body || {});

    const rawProjectId = body?.projectId || body?.project_id;
    const snapshot = rawProjectId
      ? await getProjectSnapshot(sanitizeProjectId(String(rawProjectId)))
      : undefined;

    return NextResponse.json({
      success: true,
      message:
        'Đã lưu cấu hình Agent Profile (memory/profile.yaml) và 9Router Models (config/models.yaml) thành công.',
      data: updated,
      profile: updated.profile,
      models: updated.models,
      lessons_md: updated.lessons_md,
      lessonsMd: updated.lessons_md,
      lessons_line_count: updated.lessons_line_count,
      golden_examples: updated.golden_examples,
      goldenExamples: updated.golden_examples,
      profile_path: updated.profile_path,
      models_path: updated.models_path,
      snapshot,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Lỗi khi lưu cấu hình Agent Profile & 9Router Models.',
        message: error?.message || 'Lỗi khi lưu cấu hình Agent Profile & 9Router Models.',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/video-studio/config
 * Writes updated Agent Profile parameters to `tools/video-pipeline/memory/profile.yaml`
 * and 9Router model assignments to `tools/video-pipeline/config/models.yaml`.
 */
export async function PUT(request: NextRequest) {
  return handleSaveConfig(request);
}

/**
 * POST /api/video-studio/config
 * Alias for PUT to support clients submitting config updates via POST.
 */
export async function POST(request: NextRequest) {
  return handleSaveConfig(request);
}
