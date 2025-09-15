'use client'

import useSWR from 'swr'
import { useUser } from './useUser'
import { supabaseBrowser } from './supabaseClient'

type FavRow = { coingecko_id: string }

export function useFavorites() {
  const { user } = useUser()

  const { data, error, mutate, isLoading } = useSWR<FavRow[]>(
    user ? ['/favorites', user.id] : null,
    async () => {
      const { data, error } = await supabaseBrowser
        .from('favorites')
        .select('coingecko_id')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    }
  )

  const set = new Set((data ?? []).map(r => r.coingecko_id))

  async function toggle(coingecko_id: string) {
    if (!user) return
    if (set.has(coingecko_id)) {
      const { error } = await supabaseBrowser
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('coingecko_id', coingecko_id)
      if (error) throw error
    } else {
      const { error } = await supabaseBrowser
        .from('favorites')
        .insert([{ user_id: user.id, coingecko_id }])
      if (error) throw error
    }
    mutate()
  }

  function isFavorite(coingecko_id: string) {
    return set.has(coingecko_id)
  }

  return { list: data ?? [], set, isFavorite, toggle, isLoading, error }
}

