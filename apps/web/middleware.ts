import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionToken = request.cookies.get('podscare_session_token')?.value;

  const isLoginPage = pathname === '/login';

  // Nếu người dùng đã có token hợp lệ mà truy cập /login -> Chuyển hướng ngay vào dashboard
  if (isLoginPage) {
    if (sessionToken && sessionToken.trim() !== '') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // Chặn 0ms ở tầng Edge: Nếu truy cập các route nội bộ mà không có cookie phiên -> Chuyển hướng về login kèm returnTo
  if (!sessionToken || sessionToken.trim() === '') {
    const returnTo = pathname + (search || '');
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('returnTo', returnTo);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/repairs/:path*',
    '/tech/:path*',
    '/qc/:path*',
    '/inventory/:path*',
    '/platform/:path*',
    '/branches/:path*',
    '/users/:path*',
    '/settings/:path*',
    '/print/:path*',
    '/login',
  ],
};
