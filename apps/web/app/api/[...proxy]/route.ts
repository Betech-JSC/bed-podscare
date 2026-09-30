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
    process.env.BACKEND_API_URL ||
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:8000'
  ).replace(/\/$/, '');
  const path = (params?.proxy || []).join('/');

  // Normalize path to always route to Laravel API (prefixed with /api)
  const cleanPath = path.startsWith('api/') ? path : `api/${path}`;
  const targetBase = backendBase.endsWith('/api')
    ? backendBase.slice(0, -4)
    : backendBase;

  const url = `${targetBase}/${cleanPath}${req.nextUrl.search}`;

  const forwardHeaders: Record<string, string> = {
    Accept: 'application/json',
  };

  req.headers.forEach((val, key) => {
    const lowerKey = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lowerKey)) {
      forwardHeaders[key] = val;
    }
  });

  // Explicitly ensure Authorization is forwarded if present
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    forwardHeaders['Authorization'] = authHeader;
  }

  let body: string | undefined = undefined;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    try {
      const text = await req.text();
      if (text && text.length > 0) {
        body = text;
        if (!forwardHeaders['Content-Type'] && !forwardHeaders['content-type']) {
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

  try {
    const res = await fetch(url, {
      method: req.method,
      headers: forwardHeaders,
      body,
    });

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
    return NextResponse.json(
      {
        success: false,
        message: `PodsCare Proxy Error (${req.method} ${url}): ${err.message}`,
        error: err.message,
        target_url: url,
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
