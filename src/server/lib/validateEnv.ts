/**
 * src/server/lib/validateEnv.ts
 *
 * Validates that all required environment variables are present at startup.
 * Import this at the top of any long-lived server module (e.g. priceService.ts)
 * so missing vars are surfaced immediately in Vercel function logs rather than
 * causing cryptic failures deep in a request.
 *
 * Validation runs once per process (cold start) via the module-level call at
 * the bottom of this file.
 */

type EnvVar = {
  key: string
  /** If true the app will likely fail hard without this var */
  critical: boolean
  /** Human-readable explanation of what breaks without it */
  description: string
}

const REQUIRED_ENV: EnvVar[] = [
  // ── Client-exposed (build-time) ─────────────────────────────────────────
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    critical: true,
    description: 'Supabase project URL — auth and DB will not work without it',
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    critical: true,
    description: 'Supabase anon key — client-side auth will not work',
  },
  {
    key: 'NEXT_PUBLIC_SITE_URL',
    critical: true,
    description: 'Canonical site URL — password reset links and CORS will be wrong',
  },

  // ── Server-only ──────────────────────────────────────────────────────────
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    critical: true,
    description: 'Supabase service role key — price history DB writes will fail',
  },
  {
    key: 'INTERNAL_BASE_URL',
    critical: true,
    description: 'Server-to-server base URL — cron, portfolio-risk, and notifications will call localhost instead of production',
  },
  {
    key: 'CRON_SECRET',
    critical: true,
    description: 'Cron job secret — notification cron will reject all Vercel scheduler calls',
  },
  {
    key: 'LEDGERONE_ADMIN_EMAILS',
    critical: true,
    description: 'Admin email allowlist — admin panel will be inaccessible',
  },
  {
    key: 'METRICS_TOKEN',
    critical: true,
    description: 'Metrics endpoint token — /api/metrics will block all requests (fail-closed) without this',
  },
  {
    key: 'RESEND_API_KEY',
    critical: false,
    description: 'Resend API key — email notifications will silently fail',
  },
  {
    key: 'REDIS_URL',
    critical: false,
    description: 'Redis connection URL — rate limiting falls back to in-memory only (no cross-instance protection)',
  },
  {
    key: 'CG_PRO_API_KEY',
    critical: false,
    description: 'CoinGecko Pro API key — price fetching may be rate-limited or fall back to demo tier',
  },
]

let validated = false

export function validateEnv(): void {
  // Only run once per process (cold start)
  if (validated) return
  validated = true

  const missing: EnvVar[] = REQUIRED_ENV.filter(
    ({ key }) => !process.env[key]?.trim()
  )

  if (missing.length === 0) return

  const criticalMissing = missing.filter((v) => v.critical)
  const warnMissing = missing.filter((v) => !v.critical)

  if (criticalMissing.length > 0) {
    console.error(
      '[env] CRITICAL: The following required environment variables are not set. ' +
        'The app will malfunction in production.\n' +
        criticalMissing
          .map((v) => `  ✗ ${v.key}: ${v.description}`)
          .join('\n')
    )
  }

  if (warnMissing.length > 0) {
    console.warn(
      '[env] WARNING: The following optional environment variables are not set. ' +
        'Some features will be degraded.\n' +
        warnMissing
          .map((v) => `  ⚠ ${v.key}: ${v.description}`)
          .join('\n')
    )
  }
}

// Run immediately on import so the first cold-start request surfaces issues
// in Vercel function logs before any user-visible failure occurs.
validateEnv()
