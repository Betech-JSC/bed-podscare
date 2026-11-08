import { NextRequest, NextResponse } from 'next/server';
import { getStyleById } from '../../../../../lib/video-studio/server-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/video-studio/style/[id]
 * Return full detail for a saved or analyzed sample style profile by `id` (`style_id`).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const id = resolvedParams?.id || '';
    const { searchParams } = new URL(request.url);
    const projectId =
      searchParams.get('project_id') || searchParams.get('projectId') || null;
    const sourceAspect =
      searchParams.get('source_aspect') || searchParams.get('sourceAspect') || null;
    const sourceWidth = searchParams.get('source_width')
      ? Number(searchParams.get('source_width'))
      : null;
    const sourceHeight = searchParams.get('source_height')
      ? Number(searchParams.get('source_height'))
      : null;

    const detail = await getStyleById(id, {
      projectId,
      sourceAspect,
      sourceWidth,
      sourceHeight,
    });

    if (!detail) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: `Không tìm thấy phong cách mẫu "${id}".`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(detail, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: err?.message || 'Không đọc được chi tiết phong cách mẫu.',
      },
      { status: 500 }
    );
  }
}
