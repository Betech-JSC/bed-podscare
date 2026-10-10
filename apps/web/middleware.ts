import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionToken = request.cookies.get('podscare_session_token')?.value;

  const isLoginPage = pathname === '/login';

  // Bỏ việc ép redirect cứng sang /dashboard chỉ dựa vào cookie thô!
  // Trang /login phải luôn được phép tải để người dùng xem form và chủ động đăng nhập.
  if (isLoginPage) {
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
