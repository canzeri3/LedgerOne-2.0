import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { notFound, redirect } from 'next/navigation'
import AdminUsersClient from './AdminUsersClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function envOrThrow(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

function getAdminEmailAllowlist(): Set<string> {
  const raw =
    process.env.LEDGERONE_ADMIN_EMAILS ??
    process.env.ADMIN_EMAILS ??
    process.env.NEXT_PUBLIC_ADMIN_EMAILS ??
    ''

  const emails = raw
    .split(/[,;\n\t ]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  return new Set(emails)
}

export default async function AdminUsersPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    envOrThrow('NEXT_PUBLIC_SUPABASE_URL'),
    envOrThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options, maxAge: 0 })
        },
      },
    }
  )

  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes?.user

  if (!user) redirect('/login')

  const email = (user.email ?? '').toLowerCase()
  const allow = getAdminEmailAllowlist()

  if (!email || !allow.has(email)) notFound()

  return (
    <div className="px-4 md:px-8 lg:px-10 py-6 md:py-8 max-w-6xl mx-auto space-y-6">
      <header className="border-b border-[rgb(41,42,45)]/80 pb-4">
        <h1 className="text-[20px] md:text-[22px] font-semibold text-white/90">
          User Access Administration
        </h1>
        <p className="mt-1 text-[13px] md:text-[14px] text-[rgb(163,163,164)] max-w-3xl">
          View all users and their subscription tier. You can grant a paid tier to a
          FREE user (comp access) without changing the standard billing flow for
          everyone else.
        </p>
      </header>

      <AdminUsersClient />

      <div className="text-[12px] text-[rgb(140,140,144)]">
        Admin allowlist is read from{' '}
        <span className="font-mono">LEDGERONE_ADMIN_EMAILS</span> (comma-separated).
      </div>
    </div>
  )
}
