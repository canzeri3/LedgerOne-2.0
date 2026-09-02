'use client'

import type { useTradeSave } from '@/lib/useTradeSave'
import type { TradeAttempt } from '@/lib/tradeSave'

type Props = {
  save: ReturnType<typeof useTradeSave>
  onSaved: (trade: TradeAttempt) => void | Promise<void>
}

/** Recovery controls stay outside the locked form, including on small screens. */
export default function TradeSaveFeedback({ save, onSaved }: Props) {
  if (!save.message) return null
  const run = async (action: 'check' | 'retry' | 'continue') => {
    const trade = action === 'continue' ? save.attempt : await save[action]()
    if (trade) await onSaved(trade)
  }
  return (
    <div className="my-3 rounded-lg border border-[rgb(58,59,63)] bg-[rgb(32,33,35)] px-4 py-3 text-[12px] leading-5 text-slate-300">
      <p role={save.phase === 'error' || save.phase === 'uncertain' ? 'alert' : 'status'}>{save.message}</p>
      {save.attempt ? (
        <p className="mt-1 break-words text-slate-400">
          {save.attempt.side === 'buy' ? 'Buy' : 'Sell'} · {save.attempt.coingecko_id} · {save.attempt.quantity} tokens
        </p>
      ) : null}
      {!save.busy && save.attempt ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" onClick={() => void run(save.phase === 'saved' ? 'continue' : 'check')}
            className="min-h-11 rounded-lg border border-[rgb(58,59,63)] px-4 font-medium hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            {save.phase === 'saved' ? 'Continue' : 'Check save status'}
          </button>
          {save.phase === 'retryable' ? (
            <button type="button" onClick={() => void run('retry')}
              className="min-h-11 rounded-lg border border-[rgb(137,128,213)] bg-[rgb(91,84,145)] px-4 font-semibold text-white hover:bg-[rgb(103,95,164)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              Retry original trade
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
