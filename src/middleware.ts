import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export default auth((request) => {
  const { pathname } = request.nextUrl

  // DEV-ONLY local bypass (never active on Vercel preview/prod builds).
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next()
  }

  // Skip auth for Auth.js routes, assets, and login.
  if (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname === '/login'
  ) {
    return NextResponse.next()
  }

  // Allow internal agent calls with shared secret.
  const internalSecret = request.headers.get('x-internal-secret')
  if (internalSecret && internalSecret === process.env.INTERNAL_API_SECRET) {
    return NextResponse.next()
  }

  // Use the same Auth.js configuration that creates the session cookie.
  if (!request.auth) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
