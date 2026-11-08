import { NextRequest, NextResponse } from 'next/server';
import {
  MediaNotFoundError,
  saveStyleById,
} from '../../../../../../lib/video-studio/server-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/video-studio/style/[id]/save
 * Name and permanently save a style profile into `tools/video-pipeline/memory/styles/<style_id>.json`.
 *
 * Body:
 * ```json
 * {
 *   "name": "Podcast dọc nhịp nhanh",
 *   "profile": { ...optional override... },
 *   "project_id": "demo_podscare_studio"
 * }
 * ```
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const id = resolvedParams?.id || '';
    const body = await request.json().catch(() => ({}));

    const name =
      body?.name ??
      body?.style_name ??
      body?.styleName ??
      null;
    const profile =
      body?.profile ??
      body?.style_profile ??
      body?.styleProfile ??
      null;
    const projectId =
      body?.project_id ??
      body?.projectId ??
      null;

    const saved = await saveStyleById(id, {
      name,
      profile,
      projectId,
    });

    return NextResponse.json(
      {
        ...saved,
        saved: true,
        message: `Đã lưu phong cách "${saved.name}" vào bộ nhớ.`,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err: any) {
    if (err instanceof MediaNotFoundError) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: err.message,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: err?.message || 'Không thể lưu phong cách mẫu.',
      },
      { status: 500 }
    );
  }
}
