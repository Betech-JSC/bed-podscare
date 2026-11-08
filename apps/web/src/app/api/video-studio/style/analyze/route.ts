import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeSampleVideoStyle,
  getStyleById,
} from '../../../../../lib/video-studio/server-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/video-studio/style/analyze?style_id=style_ab12
 * Poll or retrieve an analyzed sample style profile by `style_id`.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const styleId =
      searchParams.get('style_id') ||
      searchParams.get('styleId') ||
      searchParams.get('id') ||
      '';
    const projectId =
      searchParams.get('project_id') ||
      searchParams.get('projectId') ||
      null;
    const sourceAspect =
      searchParams.get('source_aspect') ||
      searchParams.get('sourceAspect') ||
      null;

    if (styleId.trim()) {
      const found = await getStyleById(styleId.trim(), {
        projectId,
        sourceAspect,
      });
      if (found) {
        return NextResponse.json(found, {
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        });
      }
    }

    const fallback = await analyzeSampleVideoStyle({
      styleId: styleId.trim() || null,
      projectId,
      sourceAspect,
    });
    return NextResponse.json(fallback, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: err?.message || 'Không đọc được hồ sơ phong cách mẫu.',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/video-studio/style/analyze
 *
 * Accepts either:
 * 1. `multipart/form-data` with file (`sample_video` | `file` | `video`) and optional metadata
 * 2. `application/json` with `{ sample_path, file_path, style_id, name, project_id, source_aspect, source_width, source_height }`
 *
 * Supports SSE streaming if `Accept: text/event-stream` or `?stream=true` / `stream=1`,
 * or synchronous JSON response with `{ ok, style_id, name, saved, style, profile, summary, toggles, warnings, unsupported }`.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    const acceptHeader = (request.headers.get('accept') || '').toLowerCase();

    let fileBuffer: Buffer | null = null;
    let originalName: string | null = null;
    let samplePath: string | null = null;
    let styleId: string | null =
      searchParams.get('style_id') || searchParams.get('styleId') || null;
    let name: string | null = searchParams.get('name') || null;
    let projectId: string | null =
      searchParams.get('project_id') || searchParams.get('projectId') || null;
    let sourceAspect: string | null =
      searchParams.get('source_aspect') || searchParams.get('sourceAspect') || null;
    let sourceWidth: number | null = searchParams.get('source_width')
      ? Number(searchParams.get('source_width'))
      : null;
    let sourceHeight: number | null = searchParams.get('source_height')
      ? Number(searchParams.get('source_height'))
      : null;
    let streamRequested =
       acceptHeader.includes('text/event-stream') ||
      searchParams.get('stream') === 'true' ||
      searchParams.get('stream') === '1';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const uploaded =
        formData.get('sample_video') ||
        formData.get('file') ||
        formData.get('video');

      if (uploaded && typeof uploaded !== 'string' && 'arrayBuffer' in uploaded) {
        fileBuffer = Buffer.from(await (uploaded as Blob).arrayBuffer());
        originalName = (uploaded as File).name || 'video_mau.mp4';
      }

      const formSamplePath =
        formData.get('sample_path') ||
        formData.get('file_path') ||
        formData.get('samplePath') ||
        formData.get('videoPath');
      if (typeof formSamplePath === 'string' && formSamplePath.trim()) {
        samplePath = formSamplePath.trim();
      }
      const formFilename = formData.get('filename') || formData.get('original_name');
      if (!originalName && typeof formFilename === 'string' && formFilename.trim()) {
        originalName = formFilename.trim();
      }
      const formStyleId = formData.get('style_id') || formData.get('styleId');
      if (typeof formStyleId === 'string' && formStyleId.trim()) {
        styleId = formStyleId.trim();
      }
      const formName = formData.get('name') || formData.get('style_name');
      if (typeof formName === 'string' && formName.trim()) {
        name = formName.trim();
      }
      const formProjectId = formData.get('project_id') || formData.get('projectId');
      if (typeof formProjectId === 'string' && formProjectId.trim()) {
        projectId = formProjectId.trim();
      }
      const formAspect = formData.get('source_aspect') || formData.get('sourceAspect');
      if (typeof formAspect === 'string' && formAspect.trim()) {
        sourceAspect = formAspect.trim();
      }
      const formStream = formData.get('stream');
      if (formStream === 'true' || formStream === '1') {
        streamRequested = true;
      }
    } else {
      const body = await request.json().catch(() => ({}));
      if (body && typeof body === 'object') {
        samplePath =
          body.sample_path ??
          body.file_path ??
          body.samplePath ??
          body.video_path ??
          body.videoPath ??
          body.path ??
          null;
        originalName =
          body.filename ?? body.original_name ?? body.originalName ?? null;
        styleId = body.style_id ?? body.styleId ?? styleId;
        name = body.name ?? body.style_name ?? body.styleName ?? name;
        projectId = body.project_id ?? body.projectId ?? body.job_id ?? projectId;
        sourceAspect =
          body.source_aspect ?? body.sourceAspect ?? body.user_aspect ?? sourceAspect;
        if (typeof body.source_width === 'number') sourceWidth = body.source_width;
        if (typeof body.source_height === 'number') sourceHeight = body.source_height;
        if (body.stream === true || body.stream === 'true') {
          streamRequested = true;
        }
      }
    }

    if (streamRequested) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (eventName: string, payload: unknown) => {
            try {
              controller.enqueue(
                encoder.encode(
                  `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
                )
              );
            } catch {
              // ignore closed stream
            }
          };

          try {
            const result = await analyzeSampleVideoStyle({
              fileBuffer,
              originalName,
              samplePath,
              styleId,
              name,
              projectId,
              sourceAspect,
              sourceWidth,
              sourceHeight,
              onProgress: (ev: {
                step: number;
                label: string;
                status: 'running' | 'done';
                percent: number;
                detail: string;
              }) => {
                sendEvent('progress', ev);
              },
            });

            sendEvent('result', result);
            sendEvent('done', result);
          } catch (err: any) {
            sendEvent('error', {
              ok: false,
              error: err?.message || 'Không thể phân tích video mẫu.',
            });
          } finally {
            try {
              controller.close();
            } catch {
              // ignore
            }
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const result = await analyzeSampleVideoStyle({
      fileBuffer,
      originalName,
      samplePath,
      styleId,
      name,
      projectId,
      sourceAspect,
      sourceWidth,
      sourceHeight,
    });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: err?.message || 'Không thể trích xuất phong cách từ video mẫu.',
      },
      { status: 500 }
    );
  }
}
