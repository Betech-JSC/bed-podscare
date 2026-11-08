import { NextResponse } from 'next/server';
import { listSavedStyles } from '../../../../lib/video-studio/server-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/video-studio/styles
 * Return all saved style profiles in `tools/video-pipeline/memory/styles/*.json`.
 */
export async function GET() {
  try {
    const styles = await listSavedStyles();
    return NextResponse.json(
      {
        ok: true,
        success: true,
        styles,
        items: styles,
        total: styles.length,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        styles: [],
        items: [],
        total: 0,
        error: err?.message || 'Không đọc được danh sách phong cách đã lưu.',
      },
      { status: 500 }
    );
  }
}
