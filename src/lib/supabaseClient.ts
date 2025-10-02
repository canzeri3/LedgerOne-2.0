'use client'

import { createBrowserClient } from '@supabase/ssr'

const fallbackUrl = 'https://example.supabase.co'
const fallbackAnonKey = 'public-anon-key'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fallbackUrl
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? fallbackAnonKey

export const supabaseBrowser = createBrowserClient(supabaseUrl, supabaseAnonKey)
