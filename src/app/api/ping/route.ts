import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

export async function GET() {
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase environment variables are not configured.' },
      { status: 503 }
    )
  }
  try {
    const { data, error } = await supabase
      .from('ping')
      .select('*')
      .limit(1)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'unknown error' }, { status: 500 })
  }
}

