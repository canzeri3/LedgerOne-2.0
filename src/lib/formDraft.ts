export const DRAFT_PREFIX = 'lg1.form-draft.v1:'
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000
export type DraftScope = {
  userId: string
  form: 'trade' | 'first-purchase' | 'buy-planner' | 'sell-planner'
  asset: string
  currency?: string
  revision?: string
}
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>
export type DraftState<T> = { values: T; dirty: boolean; restored: boolean; warning: string | null }

export function draftKey(scope: DraftScope) {
  return DRAFT_PREFIX + JSON.stringify([scope.userId, scope.form, scope.asset, scope.currency ?? '', scope.revision ?? ''])
}

/** Only form drafts are removed; pending trade submissions use a separate key. */
export function removeDrafts(storage: DraftStorage, matches: (scope: DraftScope, values: any) => boolean) {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
  for (const key of keys) {
    if (!key?.startsWith(DRAFT_PREFIX)) continue
    let entry
    try { entry = JSON.parse(storage.getItem(key) ?? 'null') } catch { continue }
    if (entry?.scope && matches(entry.scope, entry.values)) storage.removeItem(key)
  }
}

export function removeTradeDrafts(storage: DraftStorage, userId: string, coinId: string) {
  removeDrafts(storage, (scope, values) => scope.userId === userId && (
    (scope.form === 'trade' && scope.asset === coinId) ||
    (scope.form === 'first-purchase' && values?.selectedCoin?.coingecko_id === coinId)
  ))
}

/** Pure, synchronously persisted state: no network requests, timers, or submits. */
export class FormDraft<T extends object> {
  private state: DraftState<T>
  private listeners = new Set<() => void>()
  readonly key: string

  constructor(
    readonly scope: DraftScope,
    private defaults: T,
    private valid: (value: unknown) => value is T,
    private storage: DraftStorage,
    private now: () => number = Date.now,
  ) {
    this.key = draftKey(scope)
    this.state = { values: defaults, dirty: false, restored: false, warning: null }
    try {
      const raw = storage.getItem(this.key)
      if (!raw) return
      let saved
      try { saved = JSON.parse(raw) } catch { storage.removeItem(this.key); return }
      if (saved?.version !== 1 || !saved.scope || draftKey(saved.scope) !== this.key ||
          !Number.isFinite(saved.updatedAt) || saved.updatedAt > now() ||
          now() - saved.updatedAt >= DRAFT_TTL_MS || !valid(saved.values)) {
        storage.removeItem(this.key)
        return
      }
      this.state = { values: saved.values, dirty: true, restored: true, warning: null }
    } catch {
      this.state.warning = 'Draft recovery is unavailable in this browser. Keep this page open until you finish.'
    }
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private emit() { this.listeners.forEach(listener => listener()) }

  patch = (change: Partial<T>) => {
    const values = { ...this.state.values, ...change }
    if (!this.valid(values)) return
    if (JSON.stringify(values) === JSON.stringify(this.state.values)) return
    if (JSON.stringify(values) === JSON.stringify(this.defaults)) { this.reset(); return }
    let warning: string | null = null
    try {
      this.storage.setItem(this.key, JSON.stringify({ version: 1, scope: this.scope, updatedAt: this.now(), values }))
    } catch {
      warning = 'Your changes are still on this page, but the draft could not be stored. Keep this page open until you finish.'
    }
    this.state = { values, dirty: true, restored: this.state.restored, warning }
    this.emit()
  }

  setField = <K extends keyof T>(field: K, value: T[K] | ((previous: T[K]) => T[K])) => {
    const next = typeof value === 'function' ? (value as (previous: T[K]) => T[K])(this.state.values[field]) : value
    this.patch({ [field]: next } as unknown as Partial<T>)
  }

  reset = (values: T = this.defaults) => {
    try {
      this.storage.removeItem(this.key)
      this.defaults = values
      this.state = { values, dirty: false, restored: false, warning: null }
    } catch {
      // Keep the current values if deletion failed; don't falsely claim discard.
      this.state = { ...this.state, warning: 'The draft could not be cleared. Keep this page open and try again.' }
    }
    this.emit()
  }

  updateDefaults = (defaults: T) => {
    this.defaults = defaults
    if (!this.state.dirty && JSON.stringify(this.state.values) !== JSON.stringify(defaults)) {
      this.state = { ...this.state, values: defaults }
      this.emit()
    }
  }

  /** A successful save clears the draft but keeps the just-saved controls visible. */
  markSaved = () => { this.reset(this.state.values) }
}

const text = (value: unknown) => typeof value === 'string' && value.length <= 300
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)

export type TradeDraft = {
  side: 'buy' | 'sell'; price: string; qty: string; qtyMode: 'tokens' | 'usd'
  qtyLocked: boolean; fee: string; time: string; ledgerOnly: boolean; selectedSellPlannerId: string
}
export function isTradeDraft(v: unknown): v is TradeDraft {
  return record(v) && ['buy', 'sell'].includes(v.side) && ['tokens', 'usd'].includes(v.qtyMode)
    && ['price', 'qty', 'fee', 'time', 'selectedSellPlannerId'].every(k => text(v[k]))
    && typeof v.qtyLocked === 'boolean' && typeof v.ledgerOnly === 'boolean'
}
export type PurchaseDraft = {
  selectedCoin: { coingecko_id: string; symbol: string; name: string } | null
  coinQuery: string; quantity: string; price: string; tradeTime: string; fee: string; moreOpen: boolean
}
export function isPurchaseDraft(v: unknown): v is PurchaseDraft {
  return record(v) && ['coinQuery', 'quantity', 'price', 'tradeTime', 'fee'].every(k => text(v[k]))
    && typeof v.moreOpen === 'boolean' && (v.selectedCoin === null || (record(v.selectedCoin)
      && ['coingecko_id', 'symbol', 'name'].every(k => text(v.selectedCoin[k]))))
}
export type BuyDraft = { budget: string; depth: '70' | '75' | '90'; growth: string }
export function isBuyDraft(v: unknown): v is BuyDraft {
  return record(v) && text(v.budget) && ['70', '75', '90'].includes(v.depth) && text(v.growth)
}
export type SellDraft = { step: number; sellPct: number }
export function isSellDraft(v: unknown): v is SellDraft {
  return record(v) && [50, 100, 150].includes(v.step) && [10, 15, 20, 25].includes(v.sellPct)
}
