const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')
function extract(file, names) {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/planner/', file), 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) found.push(`const ${node.getText(ast)};`)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return ts.transpileModule(found.join('\n') + `\nresult = { ${names.join(',')} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText
}
const sellCode = extract('SellPlannerInputs.tsx', ['onGenerate'])
function sellHarness(overrides = {}) {
  const insert = jest.fn().mockResolvedValue({ error: null })
  const query = { delete: jest.fn(() => query), eq: jest.fn(() => query), insert }
  const ctx = {
    result: null, console: { error: jest.fn() },
    atomicPlannerWorkflowsEnabled: false, atomicWorkflowError: e => e.message,
    activeSell: { id: 'plan-1' },
    user: { id: 'user-a' }, userLoading: false, coingeckoId: 'bitcoin',
    generatingRef: { current: false },
    draft: { ready: true, markSaved: jest.fn() },
    levels: 12, step: 150, sellPct: 25,
    setErr: jest.fn(), setMsg: jest.fn(), setBusy: jest.fn(),
    mutateActiveSell: jest.fn().mockResolvedValue({ id: 'plan-1', avg_lock_price: 100 }),
    readPresets: jest.fn().mockResolvedValue({ step: 50, sellPct: 10 }),
    getPoolTokens: jest.fn().mockResolvedValue(10),
    getCurrentBuyPlannerAvgCost: jest.fn().mockResolvedValue(100),
    supabaseBrowser: { from: jest.fn(() => query) },
    mutatePresets: jest.fn().mockResolvedValue(undefined),
    globalMutate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  vm.runInNewContext(sellCode, ctx)
  return { ...ctx.result, ctx, insert }
}

test('manual Sell save uses the reviewed draft and clears it only after a successful write', async () => {
  const h = sellHarness()
  h.insert.mockImplementation(async rows => {
    expect(rows[0]).toMatchObject({ rise_pct: 150, sell_pct_of_remaining: 0.25 })
    expect(h.ctx.draft.markSaved).not.toHaveBeenCalled()
    return { error: null }
  })
  await h.onGenerate()
  expect(h.ctx.draft.markSaved).toHaveBeenCalledTimes(1)
  expect(h.ctx.readPresets).not.toHaveBeenCalled()
})

test('automatic refresh uses committed settings, never the unsaved draft, and leaves that draft intact', async () => {
  const h = sellHarness()
  await h.onGenerate({ automatic: true })
  expect(h.ctx.readPresets).toHaveBeenCalledWith('plan-1')
  expect(h.insert.mock.calls[0][0][0]).toMatchObject({ rise_pct: 50, sell_pct_of_remaining: 0.1 })
  expect(h.ctx.draft.markSaved).not.toHaveBeenCalled()
  expect(h.ctx.mutatePresets).not.toHaveBeenCalled()
})

test('failed Sell saves preserve the draft and release busy state', async () => {
  const h = sellHarness()
  h.insert.mockResolvedValue({ error: { message: 'offline' } })
  await h.onGenerate()
  expect(h.ctx.draft.markSaved).not.toHaveBeenCalled()
  expect(h.ctx.setErr).toHaveBeenCalledWith('offline')
  expect(h.ctx.generatingRef.current).toBe(false)
  expect(h.ctx.setBusy).toHaveBeenLastCalledWith(false)
})

test('automatic refresh cannot fall back to draft values when saved settings cannot be read', async () => {
  const h = sellHarness({ readPresets: jest.fn().mockRejectedValue(new Error('offline')) })
  await h.onGenerate({ automatic: true })
  expect(h.insert).not.toHaveBeenCalled()
  expect(h.ctx.supabaseBrowser.from).not.toHaveBeenCalled()
  expect(h.ctx.draft.markSaved).not.toHaveBeenCalled()
})

test('loading a draft cannot save default settings before recovery is ready', async () => {
  const h = sellHarness({ draft: { ready: false, markSaved: jest.fn() } })
  await h.onGenerate()
  expect(h.ctx.mutateActiveSell).not.toHaveBeenCalled()
})

test('manual save and a background refresh cannot overlap', async () => {
  let finish
  const h = sellHarness({ getPoolTokens: jest.fn(() => new Promise(resolve => { finish = resolve })) })
  const pending = h.onGenerate()
  await Promise.resolve()
  await h.onGenerate({ automatic: true })
  expect(h.ctx.mutateActiveSell).toHaveBeenCalledTimes(1)
  finish(10)
  await pending
  expect(h.insert).toHaveBeenCalledTimes(1)
})

test('atomic generation makes exactly one RPC and no direct table writes', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: 'plan-1', error: null })
  const h = sellHarness({ atomicPlannerWorkflowsEnabled: true, supabaseBrowser: { rpc } })
  await h.onGenerate()
  expect(rpc).toHaveBeenCalledTimes(1)
  expect(rpc).toHaveBeenCalledWith('ledgerone_generate_sell_ladder_v1', {
    p_coin: 'bitcoin', p_expected: 'plan-1', p_step: 150, p_sell_pct: 25,
  })
  expect(h.insert).not.toHaveBeenCalled()
  expect(h.ctx.draft.markSaved).toHaveBeenCalledTimes(1)
})

test('missing atomic RPC never falls back to delete-then-insert', async () => {
  const rpc = jest.fn().mockResolvedValue({ error: { code: 'PGRST202', message: 'Migration required' } })
  const h = sellHarness({ atomicPlannerWorkflowsEnabled: true, supabaseBrowser: { rpc } })
  await h.onGenerate()
  expect(h.insert).not.toHaveBeenCalled()
  expect(h.ctx.draft.markSaved).not.toHaveBeenCalled()
  expect(h.ctx.setErr).toHaveBeenCalledWith('Migration required')
})

test('atomic background events are read-only and keep unsaved settings intact', async () => {
  const rpc = jest.fn()
  const h = sellHarness({ atomicPlannerWorkflowsEnabled: true, supabaseBrowser: { rpc } })
  await h.onGenerate({ automatic: true })
  expect(rpc).not.toHaveBeenCalled()
  expect(h.ctx.draft.markSaved).not.toHaveBeenCalled()
})

test('cache refresh failure after atomic success is not reported as a failed save', async () => {
  const h = sellHarness({ atomicPlannerWorkflowsEnabled: true,
    supabaseBrowser: { rpc: jest.fn().mockResolvedValue({ data: 'plan-1', error: null }) },
    mutateActiveSell: jest.fn().mockRejectedValue(new Error('offline')),
  })
  await h.onGenerate()
  expect(h.ctx.draft.markSaved).toHaveBeenCalledTimes(1)
  expect(h.ctx.setErr).not.toHaveBeenCalledWith(expect.any(String))
  expect(h.ctx.setMsg).toHaveBeenLastCalledWith('Ladder saved. Reload to see the latest levels.')
})

const buyCode = extract('BuyPlannerInputs.tsx', ['onEdit', 'onSaveNew'])
function buyHarness(overrides = {}) {
  const query = { update: jest.fn(() => query), eq: jest.fn(() => query) }
  const ctx = {
    result: null, draft: { ready: true, markSaved: jest.fn() }, busy: false,
    user: { id: 'user-a' }, planner: { id: 'plan-1' }, coingeckoId: 'bitcoin',
    budget: '10,000', depth: '90', growth: '1.25',
    setErr: jest.fn(), setMsg: jest.fn(), setBusy: jest.fn(),
    validate: () => null, toNum: s => Number(s.replace(/,/g, '')), displayToUsd: n => n,
    getGrowthOrDefault: () => 1.25,
    resolveTopPriceForPlanner: jest.fn().mockResolvedValue(100),
    supabaseBrowser: { from: jest.fn(() => query), rpc: jest.fn().mockResolvedValue({ error: null }) },
    mutate: jest.fn().mockResolvedValue(undefined), mutateGlobal: jest.fn().mockResolvedValue(undefined),
    blockNewPlannedCoin: false,
    ...overrides,
  }
  vm.runInNewContext(buyCode, ctx)
  return { ...ctx.result, ctx, query }
}

test.each(['onEdit', 'onSaveNew'])('%s clears the Buy draft after confirmation of success', async action => {
  const h = buyHarness()
  await h[action]()
  expect(h.ctx.draft.markSaved).toHaveBeenCalledTimes(1)
  expect(h.ctx.setBusy).toHaveBeenLastCalledWith(false)
})

test.each(['onEdit', 'onSaveNew'])('%s keeps the Buy draft on a failed price lookup', async action => {
  const h = buyHarness({ resolveTopPriceForPlanner: jest.fn().mockRejectedValue(new Error('offline')) })
  await h[action]()
  expect(h.ctx.draft.markSaved).not.toHaveBeenCalled()
  expect(h.ctx.supabaseBrowser.from).not.toHaveBeenCalled()
  expect(h.ctx.supabaseBrowser.rpc).not.toHaveBeenCalled()
  expect(h.ctx.setBusy).toHaveBeenLastCalledWith(false)
})

test.each(['onEdit', 'onSaveNew'])('%s cannot submit before the draft is ready', async action => {
  const h = buyHarness({ draft: { ready: false, markSaved: jest.fn() } })
  await h[action]()
  expect(h.ctx.resolveTopPriceForPlanner).not.toHaveBeenCalled()
})

test('failed Buy writes retain the draft', async () => {
  const h = buyHarness()
  h.ctx.supabaseBrowser.rpc.mockResolvedValue({ error: new Error('offline') })
  await h.onSaveNew()
  expect(h.ctx.draft.markSaved).not.toHaveBeenCalled()
  expect(h.ctx.setErr).toHaveBeenCalledWith('offline')
})
