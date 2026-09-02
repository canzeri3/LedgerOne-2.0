const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/lib/formDraft.ts'), 'utf8')
const context = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, context)
const { FormDraft, draftKey, DRAFT_TTL_MS, removeTradeDrafts, removeDrafts,
  isTradeDraft, isPurchaseDraft, isBuyDraft, isSellDraft } = context.exports

const scope = { userId: 'user-a', form: 'trade', asset: 'bitcoin', currency: 'USD' }
const defaults = { side: 'buy', price: '', qty: '', qtyMode: 'usd', qtyLocked: true,
  fee: '', time: '2026-08-30T12:00', ledgerOnly: false, selectedSellPlannerId: '' }
function harness() {
  const records = new Map()
  const storage = {
    get length() { return records.size },
    key: i => [...records.keys()][i] ?? null,
    getItem: jest.fn(k => records.get(k) ?? null),
    setItem: jest.fn((k, v) => records.set(k, v)),
    removeItem: jest.fn(k => records.delete(k)),
  }
  let now = 10000
  const make = (s = scope, d = defaults, valid = isTradeDraft) => new FormDraft(s, d, valid, storage, () => now)
  return { records, storage, make, advance: ms => { now += ms } }
}

test('empty forms create no stored draft or autosave side effect', () => {
  const h = harness()
  expect(h.make().getSnapshot()).toEqual({ values: defaults, dirty: false, restored: false, warning: null })
  expect(h.storage.setItem).not.toHaveBeenCalled()
})

test('every edit is persisted synchronously, including the final keystroke before leaving', () => {
  const h = harness(), draft = h.make()
  draft.setField('price', '12')
  draft.setField('price', '123.45')
  draft.setField('qty', '0.00000123')
  expect(JSON.parse(h.records.get(draftKey(scope))).values).toMatchObject({ price: '123.45', qty: '0.00000123' })
  expect(h.storage.setItem).toHaveBeenCalledTimes(3)
})

test('refresh restores exact values, units, trade side, fee, time, and planner intent', () => {
  const h = harness()
  const values = { ...defaults, side: 'sell', price: '12,345.67', qty: '0.042', qtyMode: 'tokens',
    qtyLocked: false, fee: '0.123', time: '2026-08-29T14:30', ledgerOnly: true, selectedSellPlannerId: 'frozen-plan' }
  h.make().patch(values)
  expect(h.make().getSnapshot()).toMatchObject({ values, dirty: true, restored: true })
})

test.each([{ userId: 'user-b' }, { asset: 'ethereum' }, { currency: 'CAD' }, { revision: 'different-plan' }])(
  'drafts are isolated by context: %j', change => {
    const h = harness()
    h.make().setField('price', '123.45')
    expect(h.make({ ...scope, ...change }).getSnapshot().values.price).toBe('')
    expect(h.make().getSnapshot().values.price).toBe('123.45')
  },
)

test('JSON scope keys cannot collide on delimiter characters', () => {
  expect(draftKey({ ...scope, userId: 'a:b', asset: 'c' })).not.toBe(draftKey({ ...scope, userId: 'a', asset: 'b:c' }))
})

test('drafts expire exactly at 24 hours; editing extends expiry', () => {
  const h = harness(), draft = h.make()
  draft.setField('qty', '1')
  h.advance(DRAFT_TTL_MS - 1)
  expect(h.make().getSnapshot().restored).toBe(true)
  draft.setField('qty', '2')
  h.advance(DRAFT_TTL_MS - 1)
  expect(h.make().getSnapshot().values.qty).toBe('2')
  h.advance(1)
  expect(h.make().getSnapshot().restored).toBe(false)
  expect(h.records.size).toBe(0)
})

test.each(['invalid json', JSON.stringify({ version: 99 }), JSON.stringify({ version: 1, scope, updatedAt: 10000, values: { qty: 1 } }),
  JSON.stringify({ version: 1, scope, updatedAt: 11000, values: defaults })])('malformed/invalid stored data is safely ignored (%s)', raw => {
  const h = harness()
  h.records.set(draftKey(scope), raw)
  expect(h.make().getSnapshot().values).toEqual(defaults)
  expect(h.records.size).toBe(0)
})

test('discard clears only this form and returns to defaults', () => {
  const h = harness(), draft = h.make()
  h.records.set('lg1.pending-trade.v1:user-a', 'pending-trade')
  h.make({ ...scope, asset: 'ethereum' }).setField('qty', '9')
  draft.setField('qty', '3')
  draft.reset()
  expect(draft.getSnapshot()).toMatchObject({ values: defaults, dirty: false, restored: false })
  expect(h.make().getSnapshot().restored).toBe(false)
  expect(h.records.get('lg1.pending-trade.v1:user-a')).toBe('pending-trade')
  expect(h.make({ ...scope, asset: 'ethereum' }).getSnapshot().values.qty).toBe('9')
})

test('returning all fields to their defaults removes the draft', () => {
  const h = harness(), draft = h.make()
  draft.setField('qty', '3')
  draft.setField('qty', '')
  expect(draft.getSnapshot().dirty).toBe(false)
  expect(h.records.size).toBe(0)
})

test('functional changes use the latest snapshot, not a stale render', () => {
  const h = harness(), draft = h.make()
  draft.setField('qtyLocked', value => !value)
  draft.setField('qtyLocked', value => !value)
  expect(draft.getSnapshot().values.qtyLocked).toBe(true)
})

test('late server settings never overwrite dirty values, including a failed-storage draft', () => {
  const h = harness(), draft = h.make()
  h.storage.setItem.mockImplementation(() => { throw new Error('quota') })
  draft.setField('price', '567.89')
  draft.updateDefaults({ ...defaults, price: '123' })
  expect(draft.getSnapshot().values.price).toBe('567.89')
  expect(draft.getSnapshot().warning).toContain('could not be stored')
  draft.reset()
  expect(draft.getSnapshot().values.price).toBe('123')
})

test('clean forms follow server settings without creating a draft', () => {
  const h = harness(), draft = h.make()
  draft.updateDefaults({ ...defaults, qty: '1' })
  expect(draft.getSnapshot()).toMatchObject({ values: { qty: '1' }, dirty: false })
  expect(h.storage.setItem).not.toHaveBeenCalled()
})

test('a draft started on the free plan retains ledger-only intent after upgrading', () => {
  const h = harness(), draft = h.make(scope, { ...defaults, ledgerOnly: true })
  draft.setField('qty', '2')
  draft.updateDefaults({ ...defaults, ledgerOnly: false })
  expect(draft.getSnapshot().values.ledgerOnly).toBe(true)
  expect(h.make().getSnapshot().values.ledgerOnly).toBe(true)
})

test('storage read failure has a visible fallback instead of crashing', () => {
  const h = harness()
  h.storage.getItem.mockImplementation(() => { throw new Error('blocked') })
  expect(h.make().getSnapshot()).toMatchObject({ values: defaults, warning: expect.stringContaining('unavailable') })
})

test('failed discard retains the draft and warns, rather than falsely claiming it cleared', () => {
  const h = harness(), draft = h.make()
  draft.setField('qty', '3')
  h.storage.removeItem.mockImplementation(() => { throw new Error('blocked') })
  draft.reset()
  expect(draft.getSnapshot()).toMatchObject({ values: { qty: '3' }, dirty: true, warning: expect.stringContaining('could not be cleared') })
})

test('successful planner save removes the draft while keeping saved controls visible', () => {
  const h = harness(), draft = h.make({ ...scope, form: 'buy-planner' }, { budget: '', depth: '70', growth: '1.25' }, isBuyDraft)
  draft.patch({ budget: '10,000', depth: '90' })
  draft.markSaved()
  expect(draft.getSnapshot()).toMatchObject({ values: { budget: '10,000', depth: '90' }, dirty: false })
  expect(h.records.size).toBe(0)
  draft.setField('budget', '20,000')
  draft.reset()
  expect(draft.getSnapshot().values.budget).toBe('10,000')
})

test('first purchase preserves selected asset and optional fields without advancing to submission', () => {
  const h = harness(), s = { ...scope, form: 'first-purchase', asset: 'portfolio' }
  const d = { selectedCoin: null, coinQuery: '', quantity: '', price: '', tradeTime: '', fee: '', moreOpen: false }
  h.make(s, d, isPurchaseDraft).patch({ selectedCoin: { coingecko_id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' }, quantity: '0.1', fee: '2', moreOpen: true })
  expect(h.make(s, d, isPurchaseDraft).getSnapshot()).toMatchObject({ restored: true, values: { quantity: '0.1', fee: '2', moreOpen: true, selectedCoin: { coingecko_id: 'bitcoin' } } })
})

test('sell planner drafts restore supported presets and stay separate from buy drafts', () => {
  const h = harness(), s = { ...scope, form: 'sell-planner', revision: 'plan-1' }, d = { step: 50, sellPct: 15 }
  h.make(s, d, isSellDraft).patch({ step: 150, sellPct: 25 })
  expect(h.make(s, d, isSellDraft).getSnapshot()).toMatchObject({ restored: true, values: { step: 150, sellPct: 25 } })
  expect(h.make({ ...s, revision: 'plan-2' }, d, isSellDraft).getSnapshot().restored).toBe(false)
})

test('confirmed trades clear matching entry drafts across currencies, not other assets, accounts, or planners', () => {
  const h = harness()
  const draftScopes = [scope, { ...scope, currency: 'CAD' }, { ...scope, asset: 'ethereum' }, { ...scope, userId: 'user-b' }]
  for (const s of draftScopes) h.make(s).setField('qty', '1')
  const buyScope = { ...scope, form: 'buy-planner' }
  h.make(buyScope, { budget: '', depth: '70', growth: '1.25' }, isBuyDraft).setField('budget', '500')
  h.records.set('lg1.pending-trade.v1:user-a', 'pending')
  removeTradeDrafts(h.storage, 'user-a', 'bitcoin')
  expect(h.make().getSnapshot().restored).toBe(false)
  expect(h.make(draftScopes[1]).getSnapshot().restored).toBe(false)
  expect(h.make(draftScopes[2]).getSnapshot().restored).toBe(true)
  expect(h.make(draftScopes[3]).getSnapshot().restored).toBe(true)
  expect(h.records.has(draftKey(buyScope))).toBe(true)
  expect(h.records.get('lg1.pending-trade.v1:user-a')).toBe('pending')
})

test('signout cleanup touches only form drafts, not pending trades or other browser preferences', () => {
  const h = harness()
  h.make().setField('qty', '1')
  h.records.set('lg1.pending-trade.v1:user-a', 'pending')
  h.records.set('currency', 'CAD')
  removeDrafts(h.storage, () => true)
  expect([...h.records.entries()]).toEqual([['lg1.pending-trade.v1:user-a', 'pending'], ['currency', 'CAD']])
})

test('the pure draft layer has no network, trade, planner-write, or submit dependencies', () => {
  expect(source).not.toMatch(/\b(fetch|supabaseBrowser|XMLHttpRequest|setTimeout|setInterval)\s*\(/)
  expect(source).not.toMatch(/^import /m)
})
