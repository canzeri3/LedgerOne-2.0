import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { notFound, redirect } from 'next/navigation'
import AdminAnchorsClient from './AdminAnchorsClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function envOrThrow(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

function getAdminEmailAllowlist(): Set<string> {
  // Use one of these env vars; prefer LEDGERONE_ADMIN_EMAILS in prod.
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

export default async function AdminAnchorsPage() {
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

  const { data } = await supabase.auth.getUser()
  const user = data?.user

  // Not logged in -> send to login
  if (!user) redirect('/login')

  // Logged in but not admin -> show NOTHING (404)
  const email = (user.email ?? '').toLowerCase()
  const allow = getAdminEmailAllowlist()
  if (!email || !allow.has(email)) notFound()

  // Admin -> render your existing UI component unchanged
  return <AdminAnchorsClient />
}
