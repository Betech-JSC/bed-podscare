import { NextRequest, NextResponse } from 'next/server';

const HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

async function handleProxy(req: NextRequest, { params }: { params: { proxy: string[] } }) {
  const backendBase = (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:8000'
  ).replace(/\/$/, '');
  const path = (params?.proxy || []).join('/');

  // Loại bỏ /api hoặc /api/v1/ khỏi backendBase nếu có
  const normalizedBase = backendBase.replace(/\/api(\/v\d+)?\/?$/, '');
  const cleanPath = path.startsWith('api/') ? path : `api/${path}`;
  const url = `${normalizedBase}/${cleanPath}${req.nextUrl.search}`;

  const forwardHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  req.headers.forEach((val, key) => {
    const lowerKey = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lowerKey)) {
      forwardHeaders[key] = val;
    }
  });

  // Dual-Token Resolution: Ưu tiên header Authorization, fallback tự động đọc từ Cookie 'podscare_session_token'
  let authHeader = req.headers.get('authorization');
  if (!authHeader) {
    const cookieToken = req.cookies.get('podscare_session_token')?.value;
    if (cookieToken) {
      const cleanToken = decodeURIComponent(cookieToken).trim();
      authHeader = cleanToken.startsWith('Bearer ') ? cleanToken : `Bearer ${cleanToken}`;
    }
  }

  if (authHeader) {
    forwardHeaders['Authorization'] = authHeader;
  }

  let body: Buffer | undefined = undefined;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    try {
      const arrayBuf = await req.arrayBuffer();
      if (arrayBuf && arrayBuf.byteLength > 0) {
        body = Buffer.from(arrayBuf);
        const hasContentType = Object.keys(forwardHeaders).some(
          (k) => k.toLowerCase() === 'content-type'
        );
        if (!hasContentType) {
          forwardHeaders['Content-Type'] = 'application/json';
        }
      }
    } catch (readErr: any) {
      return NextResponse.json(
        {
          success: false,
          message: `Failed to read request body: ${readErr.message}`,
          error: readErr.message,
        },
        { status: 400 }
      );
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: req.method,
      headers: forwardHeaders,
      body: body as any,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const resContentType = res.headers.get('content-type') || '';
    const resText = await res.text();

    if (res.status === 204 || resText.length === 0) {
      return new NextResponse(null, { status: res.status });
    }

    let data: unknown;
    if (resContentType.includes('application/json')) {
      try {
        data = JSON.parse(resText);
      } catch {
        data = { raw: resText };
      }
    } else {
      try {
        data = JSON.parse(resText);
      } catch {
        data = {
          success: res.ok,
          message: resText,
          raw: resText,
        };
      }
    }

    return NextResponse.json(data, {
      status: res.status,
      statusText: res.statusText,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    const cause = err?.cause as any;
    const errorCode = cause?.code || err?.code || 'FETCH_FAILED';
    const errorDetail = cause?.message || err?.message || 'Unknown network error';
    const causeInfo = cause
      ? {
          code: cause.code,
          syscall: cause.syscall,
          errno: cause.errno,
          message: cause.message || String(cause),
        }
      : undefined;

    console.error(`[PodsCare Proxy Error] ${req.method} ${url}:`, {
      message: err.message,
      code: errorCode,
      cause: causeInfo,
    });

    return NextResponse.json(
      {
        success: false,
        message: `PodsCare Proxy Error (${req.method} ${url}): ${err.message}`,
        error: err.message,
        error_code: errorCode,
        error_detail: errorDetail,
        target_url: url,
        cause: causeInfo,
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: { proxy: string[] } }) {
  return handleProxy(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: { proxy: string[] } }) {
  return handleProxy(req, ctx);
}

export async function PUT(req: NextRequest, ctx: { params: { proxy: string[] } }) {
  return handleProxy(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: { params: { proxy: string[] } }) {
  return handleProxy(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: { proxy: string[] } }) {
  return handleProxy(req, ctx);
}
