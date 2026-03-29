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

  // Refresh session on each request so server routes see a valid session
  await supabase.auth.getSession()

  // Apply CORS headers to actual API responses (not just preflights)
  if (isApi) applyCors(req, res)

  return res
}

export const config = {
  matcher: [
    // run on everything except Next internals & static files
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
}

