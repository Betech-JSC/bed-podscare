import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import {
  MediaNotFoundError,
  PathTraversalError,
  resolveSafeMediaFilePath,
} from '../../../../lib/video-studio/server-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildDispositionHeader(filename: string, isDownload: boolean): string {
  const safeAscii = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const mode = isDownload ? 'attachment' : 'inline';
  return `${mode}; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * GET /api/video-studio/media?projectId=<id>&file=<relative_path>&download=1
 * Streams video/audio/subtitle/draft files from `tools/video-pipeline/workspace/<project_id>/`
 * with full HTTP Range Requests (`206 Partial Content`, `Content-Range`, `Accept-Ranges: bytes`,
 * `Content-Length`, `Content-Type`) and strict Path Traversal protection (`403 Forbidden`).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawProjectId =
      searchParams.get('projectId') ||
      searchParams.get('project_id') ||
      searchParams.get('project') ||
      'demo_podscare_studio';
    const requestedFile =
      searchParams.get('file') ||
      searchParams.get('path') ||
      searchParams.get('src') ||
      'exports/output_roughcut.mp4';
    const isDownload =
      searchParams.get('download') === '1' || searchParams.get('download') === 'true';

    const mediaInfo = resolveSafeMediaFilePath(rawProjectId, requestedFile);
    const { filePath, fileSize, contentType, filename } = mediaInfo;

    const rangeHeader = request.headers.get('range') || request.headers.get('Range');

    if (rangeHeader && fileSize > 0) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
      if (!match) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }

      const rawStart = match[1];
      const rawEnd = match[2];

      let start: number;
      let end: number;

      if (rawStart === '' && rawEnd !== '') {
        // Suffix byte range: bytes=-500 (last 500 bytes)
        const suffixLength = parseInt(rawEnd, 10);
        start = Math.max(0, fileSize - suffixLength);
        end = fileSize - 1;
      } else {
        start = rawStart !== '' ? parseInt(rawStart, 10) : 0;
        end = rawEnd !== '' ? Math.min(parseInt(rawEnd, 10), fileSize - 1) : fileSize - 1;
      }

      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        start >= fileSize ||
        start > end
      ) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }

      const chunkSize = end - start + 1;
      const nodeStream = fs.createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': contentType,
          'Content-Disposition': buildDispositionHeader(filename, isDownload),
          'Cache-Control': 'no-cache, no-transform',
        },
      });
    }

    // Full file response (200 OK)
    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(fileSize),
        'Content-Type': contentType,
        'Content-Disposition': buildDispositionHeader(filename, isDownload),
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (error: any) {
    if (error instanceof PathTraversalError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          message: error.message,
        },
        { status: 403 }
      );
    }

    if (error instanceof MediaNotFoundError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          message: error.message,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Lỗi khi truyền phát file media.',
        message: error?.message || 'Lỗi khi truyền phát file media.',
      },
      { status: 500 }
    );
  }
}

/**
 * HEAD /api/video-studio/media
 * Supports metadata preflight probes by HTML5 <video> / <audio> players.
 */
export async function HEAD(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawProjectId =
      searchParams.get('projectId') ||
      searchParams.get('project_id') ||
      searchParams.get('project') ||
      'demo_podscare_studio';
    const requestedFile =
      searchParams.get('file') ||
      searchParams.get('path') ||
      searchParams.get('src') ||
      'exports/output_roughcut.mp4';
    const isDownload =
      searchParams.get('download') === '1' || searchParams.get('download') === 'true';

    const mediaInfo = resolveSafeMediaFilePath(rawProjectId, requestedFile);

    return new NextResponse(null, {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(mediaInfo.fileSize),
        'Content-Type': mediaInfo.contentType,
        'Content-Disposition': buildDispositionHeader(mediaInfo.filename, isDownload),
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (error: any) {
    if (error instanceof PathTraversalError) {
      return new NextResponse(null, { status: 403 });
    }
    if (error instanceof MediaNotFoundError) {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(null, { status: 500 });
  }
}
