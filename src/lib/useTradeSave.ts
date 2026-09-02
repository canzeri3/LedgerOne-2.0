'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { EMPTY_TRADE_SAVE, TradeSaveController, type TradePayload } from '@/lib/tradeSave'
import { removeTradeDrafts } from '@/lib/formDraft'
import { atomicPlannerWorkflowsEnabled, atomicWorkflowError } from '@/lib/atomicPlannerWorkflows'

const controllers = new Map<string, TradeSaveController>()
const serverSnapshot = () => EMPTY_TRADE_SAVE
const noSubscribe = () => () => {}

function controllerFor(userId: string) {
  let controller = controllers.get(userId)
  if (!controller) {
    // Access itself can throw in restricted browsers. The controller fails
    // before writing if durable retry identity cannot be stored.
    const storage = {
      getItem: (key: string) => window.sessionStorage.getItem(key),
      setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value),
      removeItem: (key: string) => window.sessionStorage.removeItem(key),
    }
    const verifySession = async () => {
      const { data, error } = await supabaseBrowser.auth.getSession()
      if (error || data.session?.user.id !== userId) throw new Error('Sign in to the same account to finish this trade.')
    }
    controller = new TradeSaveController(userId, {
      insert: async (trade, signal) => {
        await verifySession()
        if (atomicPlannerWorkflowsEnabled) {
          const result = await supabaseBrowser.rpc('ledgerone_record_trade_v1', { p_trade: trade }).abortSignal(signal)
          return { ...result, error: result.error ? { ...result.error, message: atomicWorkflowError(result.error) } : null }
        }
        // Plain INSERT: a retry may conflict with the primary key, but must
        // NEVER upsert/overwrite an existing trade or repeat its DB effects.
        return supabaseBrowser.from('trades').insert(trade).abortSignal(signal)
      },
      exists: async (trade, signal) => {
        await verifySession()
        const { data, error } = await supabaseBrowser.from('trades')
          .select('id').eq('user_id', userId).eq('id', trade.id)
          .abortSignal(signal).maybeSingle()
        if (error) throw error
        return data?.id === trade.id
      },
    }, storage, () => crypto.randomUUID())
    controllers.set(userId, controller)
  }
  return controller
}

export function useTradeSave(userId?: string) {
  const controller = useMemo(() => userId && typeof window !== 'undefined' ? controllerFor(userId) : null, [userId])
  const state = useSyncExternalStore(controller?.subscribe ?? noSubscribe, controller?.getSnapshot ?? serverSnapshot, serverSnapshot)

  useEffect(() => {
    if (!controller) return
    const check = () => {
      const phase = controller.getSnapshot().phase
      if (phase === 'uncertain' || phase === 'retryable') void controller.check()
    }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    check()
    window.addEventListener('online', check)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [controller])

  return {
    ...state,
    busy: state.phase === 'saving' || state.phase === 'checking',
    save: (payload: TradePayload) => controller?.save(payload) ?? Promise.resolve(null),
    check: () => controller?.check() ?? Promise.resolve(null),
    retry: () => controller?.retry() ?? Promise.resolve(null),
    acknowledge: (id: string) => controller?.acknowledge(id, trade => removeTradeDrafts(window.sessionStorage, trade.user_id, trade.coingecko_id)),
  }
}
