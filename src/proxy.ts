import { NextRequest, NextResponse } from 'next/server'

// Note: We use localStorage-based auth (iframe-compatible), so session validation
// happens client-side. This middleware only provides basic route protection hints.
// True auth guards are in layout.tsx files with client-side useAuth.

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes
  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/join') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.json' ||
    pathname.startsWith('/icons')
  ) {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
