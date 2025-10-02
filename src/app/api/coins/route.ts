import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

export async function GET() {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase environment variables are not configured.' },
      { status: 503 }
    )
  }
  const { data, error } = await supabase
    .from('coins')
    .select('coingecko_id, symbol, name, rank')
    .not('rank', 'is', null)
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

