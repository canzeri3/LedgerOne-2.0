/** One user-confirmed submission, including its immutable retry identity. */
export type TradePayload = {
  user_id: string
  coingecko_id: string
  side: 'buy' | 'sell'
  price: number
  quantity: number
  fee: number
  trade_time: string
  buy_planner_id: string | null
  sell_planner_id: string | null
}

export type TradeAttempt = TradePayload & { id: string }
export type TradeSaveState = {
  phase: 'idle' | 'saving' | 'checking' | 'uncertain' | 'retryable' | 'saved' | 'error'
  attempt: TradeAttempt | null
  message: string | null
}

export const EMPTY_TRADE_SAVE: TradeSaveState = { phase: 'idle', attempt: null, message: null }

type Reply = { error: { code?: string; message?: string } | null; status?: number }
export type TradeTransport = {
  insert: (trade: TradeAttempt, signal: AbortSignal) => PromiseLike<Reply>
  exists: (trade: TradeAttempt, signal: AbortSignal) => PromiseLike<boolean>
}

// A timeout is an UNKNOWN outcome, not proof that a write was rolled back.
export async function withTradeDeadline<T>(work: (signal: AbortSignal) => PromiseLike<T>, ms = 12_000): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error('The request timed out.'))
        }, ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function validAttempt(value: unknown, userId: string): value is TradeAttempt {
  if (!value || typeof value !== 'object') return false
  const t = value as TradeAttempt
  return typeof t.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t.id)
    && t.user_id === userId && typeof t.coingecko_id === 'string' && !!t.coingecko_id
    && (t.side === 'buy' || t.side === 'sell')
    && Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.quantity) && t.quantity > 0
    && Number.isFinite(t.fee) && t.fee >= 0
    && typeof t.trade_time === 'string' && Number.isFinite(Date.parse(t.trade_time))
    && (t.buy_planner_id === null || typeof t.buy_planner_id === 'string')
    && (t.sell_planner_id === null || typeof t.sell_planner_id === 'string')
}

/** Shared by both entry points and mobile/desktop mounts in the same tab. */
export class TradeSaveController {
  private state: TradeSaveState = EMPTY_TRADE_SAVE
  private listeners = new Set<() => void>()
  private running = false
  private key: string

  constructor(
    private userId: string,
    private transport: TradeTransport,
    private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
    private newId: () => string,
    private timeoutMs = 12_000,
  ) {
    this.key = `lg1.pending-trade.v1:${userId}`
    try {
      const stored = storage.getItem(this.key)
      if (stored) {
        const attempt: unknown = JSON.parse(stored)
        if (!validAttempt(attempt, userId)) throw new Error('Invalid pending submission')
        this.state = { phase: 'uncertain', attempt, message: 'A previous trade needs its save status checked.' }
      }
    } catch {
      // Do not overwrite an unreadable recovery record with a new submission.
      this.state = { phase: 'error', attempt: null, message: 'Trade recovery storage is unavailable. Enable storage for LedgerOne before recording a trade.' }
    }
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private update(phase: TradeSaveState['phase'], attempt: TradeAttempt | null, message: string | null) {
    this.state = { phase, attempt, message }
    this.listeners.forEach(listener => listener())
  }

  private async find(attempt: TradeAttempt) {
    return withTradeDeadline(signal => this.transport.exists(attempt, signal), this.timeoutMs)
  }

  private confirmed(attempt: TradeAttempt) {
    // Keep the recovery identity until the UI has handled success. A reload in
    // this interval will discover the existing row, not insert a replacement.
    this.update('saved', attempt, 'Trade recorded successfully.')
    return attempt
  }

  acknowledge(id: string, clearDrafts?: (trade: TradeAttempt) => void) {
    if (this.state.phase !== 'saved' || this.state.attempt?.id !== id) return
    try {
      clearDrafts?.(this.state.attempt)
      this.storage.removeItem(this.key)
      this.update('idle', null, null)
    } catch {
      this.update('saved', this.state.attempt, 'Trade recorded. Browser storage could not be cleared; do not enter this trade again.')
    }
  }

  async save(payload: TradePayload): Promise<TradeAttempt | null> {
    if (this.running || this.state.attempt) return null
    this.running = true
    try {
      // Persist before the first network write. Without this, reloading during
      // a lost response would lose the only safe identity for a retry.
      if (this.storage.getItem(this.key)) throw new Error('A previous submission must be checked first.')
      const attempt = { ...payload, id: this.newId() }
      if (!validAttempt(attempt, this.userId)) throw new Error('Review the trade details before saving.')
      this.storage.setItem(this.key, JSON.stringify(attempt))
      return await this.write(attempt, false)
    } catch (error) {
      this.update('error', this.state.attempt, error instanceof Error ? error.message : 'The trade could not be started. Your inputs have been kept.')
      return null
    } finally {
      this.running = false
    }
  }

  // Checks are read-only. Reconnection or returning to the tab never resubmits.
  async check(): Promise<TradeAttempt | null> {
    const attempt = this.state.attempt
    if (!attempt || this.running) return null
    if (this.state.phase === 'saved') return attempt
    this.running = true
    this.update('checking', attempt, 'Checking whether your trade was saved…')
    try {
      if (await this.find(attempt)) return this.confirmed(attempt)
      this.update('retryable', attempt, 'No saved trade was found yet. Retry the original submission safely; it cannot create a second copy.')
    } catch {
      this.update('uncertain', attempt, 'We could not confirm whether your trade was saved. Check your connection, then check its status again. Do not enter it as a new trade.')
    } finally {
      this.running = false
    }
    return null
  }

  async retry(): Promise<TradeAttempt | null> {
    const attempt = this.state.attempt
    if (!attempt || this.running || this.state.phase !== 'retryable') return null
    this.running = true
    this.update('checking', attempt, 'Checking whether your trade was saved…')
    try {
      // A delayed first write might have finished since the last check.
      if (await this.find(attempt)) return this.confirmed(attempt)
      return await this.write(attempt, true)
    } catch {
      this.update('uncertain', attempt, 'Unable to check this trade. Reconnect and check its status before retrying.')
      return null
    } finally {
      this.running = false
    }
  }

  private async write(attempt: TradeAttempt, wasUncertain: boolean): Promise<TradeAttempt | null> {
    this.update('saving', attempt, 'Saving trade…')
    let reply: Reply | undefined
    try {
      reply = await withTradeDeadline(signal => this.transport.insert(attempt, signal), this.timeoutMs)
      if (!reply.error) return this.confirmed(attempt)
    } catch {
      // Includes thrown transport errors and timeouts. Never generate a new ID.
    }
    this.update('checking', attempt, 'Checking whether your trade was saved…')
    try {
      if (await this.find(attempt)) return this.confirmed(attempt)
      // Only an explicitly rejected FIRST write is safe to edit. After an
      // uncertain write, an earlier request could still commit later.
      const code = reply?.error?.code ?? ''
      const rejected = code !== '23505' && (code === 'PGRST202' || /^(22|23|42|P0001)/.test(code) || reply?.status === 401 || reply?.status === 403)
      if (!wasUncertain && rejected) {
        this.storage.removeItem(this.key)
        this.update('error', null, reply?.error?.message || 'The trade was not saved. Review the details and try again.')
      } else {
        this.update('retryable', attempt, 'Save was not confirmed. Retry this submission safely using its original reference.')
      }
    } catch {
      this.update('uncertain', attempt, 'We could not confirm whether your trade was saved. Check your connection, then check its status again. Do not enter it as a new trade.')
    }
    return null
  }
}
