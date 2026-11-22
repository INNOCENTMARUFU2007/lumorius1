import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/api/v1/auth',
  '/_next',
  '/favicon.ico',
  '/logo.svg',
  '/logo-wordmark.svg',
  '/logo-horizontal.svg',
  '/logo-stacked.svg',
  '/android-icon-192.png',
  '/android-icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.svg',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes and static assets through.
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (isPublic) {
    return NextResponse.next();
  }

  // Authentication token is stored in a cookie so middleware
  // can protect server-rendered routes.
  // The session marker outlives the 15-minute access token; the client refreshes the token on load.
  const token = request.cookies.get('lumorius_access')?.value || request.cookies.get('lumorius_session')?.value;

  if (!token && pathname !== '/login') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run middleware on application routes but exclude
     * Next.js internals and common static files.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};