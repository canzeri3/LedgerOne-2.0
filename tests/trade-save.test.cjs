const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')
const { randomUUID } = require('crypto')

const source = fs.readFileSync(path.join(__dirname, '../src/lib/tradeSave.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText
const context = { exports: {}, AbortController, setTimeout, clearTimeout, Error }
vm.runInNewContext(compiled, context)
const { TradeSaveController, withTradeDeadline } = context.exports

const USER = 'test-user'
const KEY = `lg1.pending-trade.v1:${USER}`
const trade = {
  user_id: USER, coingecko_id: 'bitcoin', side: 'buy', price: 100, quantity: 2,
  fee: 0, trade_time: '2026-08-30T12:00:00.000Z', buy_planner_id: null, sell_planner_id: null,
}

function harness(options = {}) {
  const records = new Map()
  const storage = {
    getItem: jest.fn(key => records.get(key) ?? null),
    setItem: jest.fn((key, value) => records.set(key, value)),
    removeItem: jest.fn(key => records.delete(key)),
  }
  const transport = {
    insert: jest.fn(async () => ({ error: null })),
    exists: jest.fn(async () => false),
    ...options.transport,
  }
  const newId = jest.fn(randomUUID)
  const controller = new TradeSaveController(USER, transport, storage, newId, 25)
  return { controller, records, storage, transport, newId }
}

test('persists identity before inserting; success is acknowledged separately', async () => {
  const h = harness()
  h.transport.insert.mockImplementation(async row => {
    expect(JSON.parse(h.records.get(KEY))).toEqual(row)
    return { error: null }
  })
  const saved = await h.controller.save(trade)
  expect(saved).toMatchObject(trade)
  expect(h.controller.getSnapshot().phase).toBe('saved')
  expect(h.records.has(KEY)).toBe(true)
  h.controller.acknowledge(saved.id)
  expect(h.controller.getSnapshot().phase).toBe('idle')
  expect(h.records.has(KEY)).toBe(false)
})

test('rapid double-clicks issue only one insert', async () => {
  const h = harness()
  const first = h.controller.save(trade)
  expect(await h.controller.save(trade)).toBeNull()
  await first
  expect(h.transport.insert).toHaveBeenCalledTimes(1)
  expect(h.newId).toHaveBeenCalledTimes(1)
})

test('acknowledgment clears matching drafts before unlocking the confirmed trade', async () => {
  const h = harness()
  const saved = await h.controller.save(trade)
  const cleanup = jest.fn(attempt => {
    expect(attempt.id).toBe(saved.id)
    expect(h.records.has(KEY)).toBe(true)
  })
  h.controller.acknowledge(saved.id, cleanup)
  expect(cleanup).toHaveBeenCalledTimes(1)
  expect(h.controller.getSnapshot().phase).toBe('idle')
})

test('draft cleanup failure cannot unlock a confirmed trade and invite duplicate entry', async () => {
  const h = harness()
  const saved = await h.controller.save(trade)
  h.controller.acknowledge(saved.id, () => { throw new Error('storage unavailable') })
  expect(h.controller.getSnapshot().phase).toBe('saved')
  expect(h.records.has(KEY)).toBe(true)
  expect(await h.controller.save(trade)).toBeNull()
  expect(h.transport.insert).toHaveBeenCalledTimes(1)
})

test('a lost response after commit is recovered without another insert', async () => {
  const h = harness({ transport: {
    insert: jest.fn(async () => { throw new Error('lost response') }),
    exists: jest.fn(async () => true),
  } })
  const result = await h.controller.save(trade)
  expect(result).toMatchObject(trade)
  expect(h.controller.getSnapshot().phase).toBe('saved')
  expect(h.transport.insert).toHaveBeenCalledTimes(1)
})

test('an unknown outcome cannot be replaced by an edited/new trade', async () => {
  const h = harness({ transport: { insert: jest.fn(async () => { throw new Error('offline') }) } })
  await h.controller.save(trade)
  const attempt = h.controller.getSnapshot().attempt
  expect(h.controller.getSnapshot().phase).toBe('retryable')
  expect(await h.controller.save({ ...trade, quantity: 3 })).toBeNull()
  expect(h.controller.getSnapshot().attempt).toEqual(attempt)
  expect(h.transport.insert).toHaveBeenCalledTimes(1)
})

test('retry checks again and reuses the exact original ID, price, and planner links', async () => {
  const h = harness({ transport: { insert: jest.fn(async () => { throw new Error('offline') }) } })
  const payload = { ...trade, buy_planner_id: 'buy-plan', sell_planner_id: 'sell-plan' }
  await h.controller.save(payload)
  payload.price = 200
  h.transport.insert.mockResolvedValueOnce({ error: null })
  const saved = await h.controller.retry()
  expect(h.transport.exists).toHaveBeenCalledTimes(2)
  expect(h.transport.insert.mock.calls[1][0]).toEqual(h.transport.insert.mock.calls[0][0])
  expect(saved.price).toBe(100)
  expect(h.newId).toHaveBeenCalledTimes(1)
})

test('a late first commit discovered before retry avoids a second write', async () => {
  const h = harness({ transport: { insert: jest.fn(async () => { throw new Error('offline') }) } })
  await h.controller.save(trade)
  h.transport.exists.mockResolvedValueOnce(true)
  expect(await h.controller.retry()).toMatchObject(trade)
  expect(h.transport.insert).toHaveBeenCalledTimes(1)
})

test('a commit racing the retry is recovered from its primary-key conflict', async () => {
  const h = harness({ transport: { insert: jest.fn(async () => { throw new Error('offline') }) } })
  await h.controller.save(trade)
  h.transport.exists.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  h.transport.insert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' }, status: 409 })
  expect(await h.controller.retry()).toMatchObject(trade)
  expect(h.transport.insert.mock.calls[1][0].id).toBe(h.transport.insert.mock.calls[0][0].id)
})

test('failed confirmation reads do not unlock the form or permit another write', async () => {
  const h = harness({ transport: {
    insert: jest.fn(async () => { throw new Error('offline') }),
    exists: jest.fn(async () => { throw new Error('offline') }),
  } })
  await h.controller.save(trade)
  expect(h.controller.getSnapshot().phase).toBe('uncertain')
  expect(await h.controller.retry()).toBeNull()
  expect(await h.controller.save(trade)).toBeNull()
  expect(h.transport.insert).toHaveBeenCalledTimes(1)
  await h.controller.check()
  expect(h.controller.getSnapshot().phase).toBe('uncertain')
  h.transport.exists.mockResolvedValueOnce(true)
  expect(await h.controller.check()).toMatchObject(trade)
})

test('refresh restores an unresolved submission and checks without writing', async () => {
  const h = harness({ transport: { insert: jest.fn(async () => { throw new Error('offline') }) } })
  await h.controller.save(trade)
  const restored = new TradeSaveController(USER, h.transport, h.storage, randomUUID, 25)
  expect(restored.getSnapshot().phase).toBe('uncertain')
  h.transport.exists.mockResolvedValueOnce(true)
  expect(await restored.check()).toMatchObject(trade)
  expect(h.transport.insert).toHaveBeenCalledTimes(1)
})

test('a hung insert times out and uses read-only recovery even if abort is ignored', async () => {
  const h = harness({ transport: { insert: jest.fn(() => new Promise(() => {})) } })
  await h.controller.save(trade)
  expect(h.transport.insert.mock.calls[0][1].aborted).toBe(true)
  expect(h.controller.getSnapshot().phase).toBe('retryable')
  h.transport.exists.mockResolvedValueOnce(true)
  expect(await h.controller.check()).toMatchObject(trade)
})

test('a hung confirmation read also stops checking and exposes recovery', async () => {
  const h = harness({ transport: {
    insert: jest.fn(async () => { throw new Error('offline') }),
    exists: jest.fn(() => new Promise(() => {})),
  } })
  await h.controller.save(trade)
  expect(h.controller.getSnapshot().phase).toBe('uncertain')
  expect(h.transport.exists.mock.calls[0][1].aborted).toBe(true)
})

test('an explicitly rejected first write keeps inputs editable', async () => {
  const h = harness({ transport: { insert: jest.fn(async () => ({ error: { code: '23514', message: 'Invalid quantity' }, status: 400 })) } })
  expect(await h.controller.save(trade)).toBeNull()
  expect(h.controller.getSnapshot()).toMatchObject({ phase: 'error', attempt: null, message: 'Invalid quantity' })
  expect(h.records.has(KEY)).toBe(false)
  h.transport.insert.mockResolvedValueOnce({ error: null })
  expect(await h.controller.save({ ...trade, quantity: 1 })).toMatchObject({ quantity: 1 })
})

test('a rejected retry does not discard a potentially still-running first write', async () => {
  const h = harness({ transport: { insert: jest.fn(async () => { throw new Error('offline') }) } })
  await h.controller.save(trade)
  const original = h.controller.getSnapshot().attempt
  h.transport.insert.mockResolvedValueOnce({ error: { code: 'P0001', message: 'Insufficient holdings' }, status: 400 })
  await h.controller.retry()
  expect(h.controller.getSnapshot()).toMatchObject({ phase: 'retryable', attempt: original })
  expect(h.records.has(KEY)).toBe(true)
})

test('browser storage failure prevents the write rather than losing retry identity', async () => {
  const h = harness()
  h.storage.setItem.mockImplementation(() => { throw new Error('Storage full') })
  await h.controller.save(trade)
  expect(h.controller.getSnapshot().phase).toBe('error')
  expect(h.transport.insert).not.toHaveBeenCalled()
})

test('pending records are isolated by account', async () => {
  const h = harness({ transport: { insert: jest.fn(async () => { throw new Error('offline') }) } })
  await h.controller.save(trade)
  const other = new TradeSaveController('other-user', h.transport, h.storage, randomUUID, 25)
  expect(other.getSnapshot().attempt).toBeNull()
  expect(await other.save(trade)).toBeNull()
  expect(h.transport.insert).toHaveBeenCalledTimes(1)
})

test('malformed recovery records are not silently replaced', async () => {
  const h = harness()
  h.records.set(KEY, '{bad-json')
  const restored = new TradeSaveController(USER, h.transport, h.storage, randomUUID, 25)
  expect(restored.getSnapshot().phase).toBe('error')
  expect(await restored.save(trade)).toBeNull()
  expect(h.records.get(KEY)).toBe('{bad-json')
  expect(h.transport.insert).not.toHaveBeenCalled()
})

test('identical but intentionally separate trades receive different identities', async () => {
  const h = harness()
  const first = await h.controller.save(trade)
  h.controller.acknowledge(first.id)
  const second = await h.controller.save(trade)
  expect(second.id).not.toBe(first.id)
  expect(h.transport.insert).toHaveBeenCalledTimes(2)
})

test('recovery cleanup failure keeps the already-saved submission locked', async () => {
  const h = harness()
  const saved = await h.controller.save(trade)
  h.storage.removeItem.mockImplementationOnce(() => { throw new Error('Storage blocked') })
  h.controller.acknowledge(saved.id)
  expect(h.controller.getSnapshot().phase).toBe('saved')
  expect(await h.controller.save(trade)).toBeNull()
  h.controller.acknowledge(saved.id)
  expect(h.controller.getSnapshot().phase).toBe('idle')
})

test('deadline catches synchronous setup failures and releases its timer', async () => {
  await expect(withTradeDeadline(() => { throw new Error('unexpected') }, 25)).rejects.toThrow('unexpected')
})

test('a missing atomic RPC is an explicit rejection, not an ambiguous pending save', async () => {
  const h = harness({ transport: { insert: jest.fn().mockResolvedValue({ error: { code: 'PGRST202', message: 'Migration required' } }) } })
  await h.controller.save(trade)
  expect(h.controller.getSnapshot()).toMatchObject({ phase: 'error', attempt: null, message: 'Migration required' })
  expect(h.records.has(KEY)).toBe(false)
  expect(h.transport.insert).toHaveBeenCalledTimes(1)
})

test('all trade form paths use the shared saver rather than unprotected inserts', () => {
  for (const file of ['src/components/coins/TradesPanel.tsx', 'src/components/dashboard/DashboardActivation.tsx']) {
    const form = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    expect(form).toContain('useTradeSave(')
    expect(form).not.toMatch(/from\('trades'\)\.insert/)
  }
  const adapter = fs.readFileSync(path.join(__dirname, '../src/lib/useTradeSave.ts'), 'utf8')
  expect(adapter).toContain(".insert(trade).abortSignal(signal)")
  expect(adapter).toContain(".eq('user_id', userId).eq('id', trade.id)")
  expect(adapter).not.toContain('.upsert(')
})
