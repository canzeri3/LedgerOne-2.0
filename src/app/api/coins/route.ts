import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase credentials are not configured.')
  }
  return createClient(url, anonKey)
}

export async function GET() {
  let supabase
  try {
    supabase = getSupabase()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase init failed.'
    return NextResponse.json({ error: message }, { status: 500 })
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

