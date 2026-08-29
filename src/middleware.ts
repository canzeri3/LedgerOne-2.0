import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ── CORS config ──────────────────────────────────────────────────────────────
// Only API routes need CORS headers. We allow the canonical site origin plus
// localhost for local development. All other origins get no ACAO header, so
// browsers will block cross-origin requests from unknown origins.
const ALLOWED_ORIGINS: Set<string> = new Set(
  [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL, // Supabase edge functions may call back
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean) as string[]
)

const CORS_ALLOW_METHODS = 'GET, POST, OPTIONS'
const CORS_ALLOW_HEADERS = 'Content-Type, Authorization, x-cron-secret'
const CORS_MAX_AGE = '86400' // 24 h preflight cache

const PROTECTED_ROUTE_PREFIXES = [
  '/admin',
  '/audit',
  '/coins',
  '/csv',
  '/dashboard',
  '/how-to',
  '/planner',
  '/portfolio',
  '/reports',
  '/settings',
] as const

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

function redirectToLogin(req: NextRequest, cookieSource?: NextResponse): NextResponse {
  const loginUrl = req.nextUrl.clone()
  const returnTo = `${req.nextUrl.pathname}${req.nextUrl.search}`
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  loginUrl.searchParams.set('next', returnTo)

  const redirect = NextResponse.redirect(loginUrl)
  for (const cookie of cookieSource?.cookies.getAll() ?? []) {
    redirect.cookies.set(cookie)
  }
  return redirect
}

function applyCors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get('origin') ?? ''
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin)
    res.headers.set('Access-Control-Allow-Methods', CORS_ALLOW_METHODS)
    res.headers.set('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS)
    res.headers.set('Access-Control-Max-Age', CORS_MAX_AGE)
    res.headers.set('Vary', 'Origin')
  }
  return res
}

export async function middleware(req: NextRequest) {
  // ── CORS preflight (OPTIONS) — respond immediately, no auth refresh needed ──
  const isApi = req.nextUrl.pathname.startsWith('/api/')
  if (isApi && req.method === 'OPTIONS') {
    const preflight = new NextResponse(null, { status: 204 })
    return applyCors(req, preflight)
  }

  const res = NextResponse.next()
  const protectedRoute = isProtectedRoute(req.nextUrl.pathname)

  // Only refresh the session when the request actually carries Supabase auth
  // cookies (all named `sb-*`). Anonymous traffic (marketing pages, public
  // APIs) has no session to refresh, so skipping avoids a wasted auth
  // round-trip on every request. Authenticated requests behave exactly as before.
  const hasAuthCookies = req.cookies.getAll().some((c) => c.name.startsWith('sb-'))

  if (!hasAuthCookies && protectedRoute) {
    return redirectToLogin(req)
  }

  if (hasAuthCookies) {
    // Create a Supabase server client for the middleware runtime
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            // Next 15: set via response so the cookie is forwarded downstream
            res.cookies.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            res.cookies.set({ name, value: '', ...options, maxAge: 0 })
          },
        },
      }
    )

    if (protectedRoute) {
      // Verify private-route requests with Supabase Auth before any app shell or
      // page code can render. getUser() validates the token with the auth server;
      // getSession() alone only reads the cookie payload.
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error || !data.user) return redirectToLogin(req, res)
      } catch {
        return redirectToLogin(req, res)
      }
    } else {
      // Public pages only need a lightweight refresh for existing sessions.
      await supabase.auth.getSession()
    }
  }

  // Apply CORS headers to actual API responses (not just preflights)
  if (isApi) applyCors(req, res)

  return res
}

export const config = {
  matcher: [
    // run on everything except Next internals, static files, and PWA assets.
    // The service worker refetches these constantly; there's no session to
    // refresh for them, and sw.js must be served untouched at the root scope.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sw\\.js|manifest\\.webmanifest|offline\\.html|icons/).*)',
  ],
}
