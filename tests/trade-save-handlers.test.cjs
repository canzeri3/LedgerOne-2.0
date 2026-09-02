const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/components/coins/TradesPanel.tsx'), 'utf8')
const ast = ts.createSourceFile('TradesPanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function declaration(name) {
  let result
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!result) throw new Error(`Missing ${name}`)
  return result
}

function harness(overrides = {}) {
  const ctx = {
    atomicPlannerWorkflowsEnabled: false,
    Error, user: { id: 'user-1' }, id: 'bitcoin', entitlementsLoading: false,
    tradeSave: { attempt: null, save: jest.fn(), acknowledge: jest.fn() },
    saveActionRef: { current: false }, handledSaveRef: { current: null },
    finishingSaveRef: { current: false },
    saveContextRef: { current: { userId: 'user-1', coinId: 'bitcoin' } },
    saving: false, side: 'buy', effectiveLedgerOnly: true, time: '2026-08-30T12:00',
    price: '100', qty: '2', qtyMode: 'tokens', fee: '', displayCode: 'USD',
    displayToUsd: value => value,
    setSaving: jest.fn(), setErr: jest.fn(), setOk: jest.fn(),
    recordTrade: jest.fn().mockResolvedValue(undefined),
    activeBuy: { id: 'buy-plan' }, activeSell: { id: 'sell-plan' },
    selectedSellPlannerId: '', livePrice: 100,
    withTradeDeadline: work => Promise.resolve().then(() => work(new AbortController().signal)),
    fetchHoldingsTokensNow: jest.fn().mockResolvedValue(10),
    computeBuyAlertAllowance: jest.fn().mockResolvedValue({ hasLevels: false }),
    computeAlertAllowance: jest.fn().mockResolvedValue({ hasLevels: false }),
    setConfirmOffPlanCtx: jest.fn(), setPendingBuy: jest.fn(), setPendingSell: jest.fn(),
    setConfirmOffPlanOpen: jest.fn(), plannerLabelFor: () => 'Active', fmtTokens: String,
    pendingBuy: null, pendingSell: null, closeConfirmOffPlan: jest.fn(),
    resetAfterSubmit: jest.fn(), regenerateActiveSellLadder: jest.fn().mockResolvedValue(undefined),
    broadcast: jest.fn(), refreshUiAfterTrade: jest.fn(), refreshHoldingsTokens: jest.fn(),
    globalMutate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  vm.createContext(ctx)
  const code = ['toIso', 'parseNum', 'submitTrade', 'confirmOffPlanProceed', 'finishSavedTrade'].map(declaration).join('\n')
  vm.runInContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, ctx)
  return { ctx, submit: () => ctx.submitTrade(), confirm: () => ctx.confirmOffPlanProceed() }
}

test.each(['buy', 'sell'])('ledger-only %s retains null planner links and clears its busy state', async side => {
  const { ctx, submit } = harness({ side })
  await submit()
  expect(ctx.recordTrade).toHaveBeenCalledWith(expect.objectContaining({ side, price: 100, quantity: 2, buy_planner_id: null, sell_planner_id: null }))
  expect(ctx.saveActionRef.current).toBe(false)
  expect(ctx.setSaving).toHaveBeenLastCalledWith(false)
})

test.each(['buy', 'sell'])('paid %s retains its original planner association', async side => {
  const { ctx, submit } = harness({ side, effectiveLedgerOnly: false })
  await submit()
  expect(ctx.recordTrade).toHaveBeenCalledWith(expect.objectContaining({
    side, buy_planner_id: side === 'buy' ? 'buy-plan' : null, sell_planner_id: 'sell-plan',
  }))
})

test('fiat quantity conversion and fee remain unchanged', async () => {
  const { ctx, submit } = harness({ qtyMode: 'usd', qty: '270', price: '135', fee: '1.35', displayToUsd: n => n / 1.35 })
  await submit()
  expect(ctx.recordTrade).toHaveBeenCalledWith(expect.objectContaining({ price: 100, quantity: 2, fee: 1 }))
})

test('duplicate clicks while preflight/save is running do not start a second submission', async () => {
  let finish
  const { ctx, submit } = harness({ recordTrade: jest.fn(() => new Promise(resolve => { finish = resolve })) })
  const pending = submit()
  await submit()
  expect(ctx.recordTrade).toHaveBeenCalledTimes(1)
  finish()
  await pending
  expect(ctx.saveActionRef.current).toBe(false)
})

test('unexpected setup exceptions always release Saving', async () => {
  const { ctx, submit } = harness({ displayToUsd: () => { throw new Error('conversion unavailable') } })
  await submit()
  expect(ctx.setErr).toHaveBeenCalledWith('conversion unavailable')
  expect(ctx.saveActionRef.current).toBe(false)
  expect(ctx.setSaving).toHaveBeenLastCalledWith(false)
  expect(ctx.resetAfterSubmit).not.toHaveBeenCalled()
})

test('unexpected asynchronous exceptions always release Saving without clearing inputs', async () => {
  const { ctx, submit } = harness({ recordTrade: jest.fn().mockRejectedValue(new Error('transport failed')) })
  await submit()
  expect(ctx.setErr).toHaveBeenCalledWith('transport failed')
  expect(ctx.setSaving).toHaveBeenLastCalledWith(false)
  expect(ctx.saveActionRef.current).toBe(false)
  expect(ctx.resetAfterSubmit).not.toHaveBeenCalled()
})

test('an unresolved trade blocks fresh submissions', async () => {
  const { ctx, submit } = harness({ tradeSave: { attempt: { id: 'pending' } } })
  await submit()
  expect(ctx.recordTrade).not.toHaveBeenCalled()
})

test('off-plan buy still requires confirmation before the shared saver is called', async () => {
  const { ctx, submit } = harness({ effectiveLedgerOnly: false,
    computeBuyAlertAllowance: jest.fn().mockResolvedValue({ hasLevels: true, allowedTokens: 1, allowedUsd: 100 }),
  })
  await submit()
  expect(ctx.recordTrade).not.toHaveBeenCalled()
  expect(ctx.setConfirmOffPlanOpen).toHaveBeenCalledWith(true)
  expect(ctx.setPendingBuy.mock.calls[0][0].payload).toMatchObject({ buy_planner_id: 'buy-plan', quantity: 2 })
  expect(ctx.saveActionRef.current).toBe(false)
})

test.each(['buy', 'sell'])('off-plan %s confirmation uses its captured payload exactly once', async side => {
  const payload = { side, quantity: 2, price: 100 }
  let finish
  const { ctx, confirm } = harness({
    pendingBuy: side === 'buy' ? { payload } : null,
    pendingSell: side === 'sell' ? { payload } : null,
    recordTrade: jest.fn(() => new Promise(resolve => { finish = resolve })),
  })
  const pending = confirm()
  await confirm()
  expect(ctx.recordTrade).toHaveBeenCalledTimes(1)
  expect(ctx.recordTrade).toHaveBeenCalledWith(payload)
  finish()
  await pending
  expect(ctx.setSaving).toHaveBeenLastCalledWith(false)
})

test('insufficient holdings still blocks a sale without entering the saver', async () => {
  const { ctx, submit } = harness({ side: 'sell', fetchHoldingsTokensNow: jest.fn().mockResolvedValue(1) })
  await submit()
  expect(ctx.recordTrade).not.toHaveBeenCalled()
  expect(ctx.setErr).toHaveBeenCalledWith(expect.stringContaining('Insufficient holdings'))
  expect(ctx.saveActionRef.current).toBe(false)
})

const saved = { id: 'saved-1', user_id: 'user-1', coingecko_id: 'bitcoin', side: 'buy', buy_planner_id: 'buy-plan', sell_planner_id: 'sell-plan' }
test.each(['buy', 'sell'])('confirmed ledger-only %s does not regenerate or broadcast planner changes', async side => {
  const { ctx } = harness()
  await ctx.finishSavedTrade({ ...saved, side, buy_planner_id: null, sell_planner_id: null })
  expect(ctx.regenerateActiveSellLadder).not.toHaveBeenCalled()
  expect(ctx.broadcast).not.toHaveBeenCalled()
  expect(ctx.refreshUiAfterTrade).toHaveBeenCalledWith({ buyPlannerId: null, sellPlannerId: null })
  expect(ctx.tradeSave.acknowledge).toHaveBeenCalledWith(saved.id)
})

test('a post-save planner failure remains a successful ledger save', async () => {
  const { ctx } = harness({ regenerateActiveSellLadder: jest.fn().mockRejectedValue(new Error('refresh failed')) })
  await ctx.finishSavedTrade(saved)
  expect(ctx.resetAfterSubmit).toHaveBeenCalledTimes(1)
  expect(ctx.tradeSave.acknowledge).toHaveBeenCalledWith(saved.id)
  expect(ctx.setErr).not.toHaveBeenCalledWith(expect.any(String))
  expect(ctx.setOk).toHaveBeenCalledWith(expect.stringContaining('Buy recorded. Planner refresh could not finish.'))
  expect(ctx.setSaving).toHaveBeenLastCalledWith(false)
})

test('atomic trade completion refreshes the UI without a second ladder write', async () => {
  const { ctx } = harness({ atomicPlannerWorkflowsEnabled: true })
  await ctx.finishSavedTrade(saved)
  expect(ctx.regenerateActiveSellLadder).not.toHaveBeenCalled()
  expect(ctx.refreshUiAfterTrade).toHaveBeenCalled()
  expect(ctx.tradeSave.acknowledge).toHaveBeenCalledWith(saved.id)
})

test('a completion belonging to the previous account/coin does not clear the new form', async () => {
  const { ctx } = harness({ saveContextRef: { current: { userId: 'other-user', coinId: 'ethereum' } } })
  await ctx.finishSavedTrade(saved)
  expect(ctx.resetAfterSubmit).not.toHaveBeenCalled()
  expect(ctx.tradeSave.acknowledge).not.toHaveBeenCalled()
})

const dashboardSource = fs.readFileSync(path.join(__dirname, '../src/components/dashboard/DashboardActivation.tsx'), 'utf8')
const dashboardAst = ts.createSourceFile('DashboardActivation.tsx', dashboardSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function dashboardHarness(overrides = {}) {
  const declarations = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['savePurchase', 'finishSavedPurchase'].includes(node.name.getText(dashboardAst))) {
      declarations.push(`const ${node.getText(dashboardAst)};`)
    }
    ts.forEachChild(node, visit)
  }
  visit(dashboardAst)
  const ctx = {
    userId: 'user-1', currentUserRef: { current: 'user-1' },
    saveActionRef: { current: false }, handledSaveRef: { current: null }, finishingSaveRef: { current: false },
    tradeSave: { attempt: null, save: jest.fn().mockResolvedValue(null), acknowledge: jest.fn() },
    draft: { reset: jest.fn() },
    validateDetails: () => null, selectedCoin: { coingecko_id: 'bitcoin' },
    quantityNumber: 2, priceNumber: 100, feeNumber: 0, tradeTime: '2026-08-30T12:00',
    displayToUsd: n => n,
    setError: jest.fn(), setStage: jest.fn(), setSaving: jest.fn(), setQuantity: jest.fn(),
    setPrice: jest.fn(), setFee: jest.fn(), setSelectedCoin: jest.fn(),
    withTradeDeadline: work => Promise.resolve().then(work),
    onTradeAdded: jest.fn().mockResolvedValue(undefined),
    window: { location: { reload: jest.fn() } },
    ...overrides,
  }
  vm.createContext(ctx)
  vm.runInContext(ts.transpileModule(declarations.join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, ctx)
  const handlers = vm.runInContext('({ savePurchase, finishSavedPurchase })', ctx)
  return { ctx, ...handlers }
}

test('first-purchase success sends canonical ledger-only data and clears the review', async () => {
  const h = dashboardHarness()
  h.ctx.tradeSave.save.mockImplementation(async payload => ({ ...payload, id: 'saved-dashboard' }))
  await h.savePurchase()
  expect(h.ctx.tradeSave.save).toHaveBeenCalledWith(expect.objectContaining({ price: 100, quantity: 2, buy_planner_id: null, sell_planner_id: null }))
  expect(h.ctx.onTradeAdded).toHaveBeenCalledWith(expect.objectContaining({ side: 'buy', price: 100, quantity: 2 }))
  expect(h.ctx.tradeSave.acknowledge).toHaveBeenCalledWith('saved-dashboard')
  expect(h.ctx.draft.reset).toHaveBeenCalledTimes(1)
  expect(h.ctx.setStage).toHaveBeenCalledWith('intro')
  expect(h.ctx.setSaving).toHaveBeenLastCalledWith(false)
})

test('recovering a different asset never clears the current coin draft', async () => {
  const { ctx } = harness()
  await ctx.finishSavedTrade({ ...saved, coingecko_id: 'ethereum' })
  expect(ctx.resetAfterSubmit).not.toHaveBeenCalled()
  expect(ctx.tradeSave.acknowledge).toHaveBeenCalledWith(saved.id)
})

test('first-purchase uncertain outcomes keep input details and release the local spinner', async () => {
  const h = dashboardHarness()
  await h.savePurchase()
  expect(h.ctx.onTradeAdded).not.toHaveBeenCalled()
  expect(h.ctx.draft.reset).not.toHaveBeenCalled()
  expect(h.ctx.setStage).not.toHaveBeenCalled()
  expect(h.ctx.setSaving).toHaveBeenLastCalledWith(false)
  expect(h.ctx.saveActionRef.current).toBe(false)
})

test('first-purchase double-clicks cannot submit twice', async () => {
  const h = dashboardHarness()
  let finish
  h.ctx.tradeSave.save.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const first = h.savePurchase()
  await h.savePurchase()
  expect(h.ctx.tradeSave.save).toHaveBeenCalledTimes(1)
  finish(null)
  await first
})

test('first-purchase post-save refresh failure cannot turn into another insert', async () => {
  const h = dashboardHarness({ onTradeAdded: jest.fn().mockRejectedValue(new Error('refresh failed')) })
  h.ctx.tradeSave.save.mockImplementation(async payload => ({ ...payload, id: 'saved-dashboard' }))
  await h.savePurchase()
  expect(h.ctx.tradeSave.save).toHaveBeenCalledTimes(1)
  expect(h.ctx.window.location.reload).toHaveBeenCalledTimes(1)
  expect(h.ctx.tradeSave.acknowledge).toHaveBeenCalledWith('saved-dashboard')
  expect(h.ctx.draft.reset).toHaveBeenCalledTimes(1)
  expect(h.ctx.setError).not.toHaveBeenCalledWith(expect.any(String))
})

test('first-purchase recovery uses the persisted trade, not current display-currency inputs', async () => {
  const h = dashboardHarness({ displayToUsd: n => n / 2 })
  await h.finishSavedPurchase({ ...saved, price: 100, quantity: 2, fee: 0, trade_time: '2026-08-30T12:00:00Z' })
  expect(h.ctx.onTradeAdded).toHaveBeenCalledWith(expect.objectContaining({ price: 100, quantity: 2 }))
  expect(h.ctx.tradeSave.save).not.toHaveBeenCalled()
})

test('a second success callback cannot acknowledge before the first finishes', async () => {
  let finish
  const h = dashboardHarness({ onTradeAdded: jest.fn(() => new Promise(resolve => { finish = resolve })) })
  const pending = h.finishSavedPurchase(saved)
  await Promise.resolve()
  await h.finishSavedPurchase(saved)
  expect(h.ctx.onTradeAdded).toHaveBeenCalledTimes(1)
  expect(h.ctx.tradeSave.acknowledge).not.toHaveBeenCalled()
  finish()
  await pending
  expect(h.ctx.tradeSave.acknowledge).toHaveBeenCalledTimes(1)
})

test('recovery UI exposes only safe actions for each state', () => {
  const feedback = fs.readFileSync(path.join(__dirname, '../src/components/common/TradeSaveFeedback.tsx'), 'utf8')
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(feedback, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: module.exports, require })
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const render = (phase, busy = false) => renderToStaticMarkup(React.createElement(module.exports.default, {
    save: { phase, busy, attempt: saved, message: 'Save status' }, onSaved: () => {},
  }))
  expect(render('uncertain')).toContain('Check save status')
  expect(render('uncertain')).not.toContain('Retry original trade')
  expect(render('checking', true)).not.toContain('<button')
  expect(render('retryable')).toContain('Retry original trade')
  expect(render('saved')).toContain('Continue')
  expect(render('saved')).not.toContain('Retry original trade')
})
