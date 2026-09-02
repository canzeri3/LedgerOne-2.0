const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/components/coins/TradesPanel.tsx'), 'utf8')
const ast = ts.createSourceFile('TradesPanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

// Exercise the actual handlers without adding a browser/testing runtime dependency.
function declaration(name) {
  let result
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(ast)
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = `const ${node.getText(ast)};`
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!result) throw new Error(`Missing declaration: ${name}`)
  return result
}

function compile(code) {
  return ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText
}

function harness(overrides = {}) {
  const node = { value: '', select: jest.fn() }
  const context = {
    qty: '', side: 'buy', effectiveLedgerOnly: false, loading: false,
    user: { id: 'user-1' }, id: 'bitcoin',
    activeBuy: { id: 'planner-1', user_id: 'user-1', coingecko_id: 'bitcoin' },
    livePrice: 80, price: '', qtyMode: 'usd',
    qtyRef: { current: node }, qtyPrefillRequestRef: { current: 0 },
    document: { activeElement: node },
    usdToDisplay: n => n, displayToUsd: n => n,
    computeBuyAlertAllowance: jest.fn().mockResolvedValue({ allowedUsd: 1234.5 }),
    setQty: jest.fn(value => { node.value = value }),
    requestAnimationFrame: callback => callback(),
    ...overrides,
  }
  vm.createContext(context)
  vm.runInContext(compile(['groupInt', 'formatGrouped', 'parseNum', 'onQtyFocus'].map(declaration).join('\n')), context)
  return { context, node, focus: () => vm.runInContext('onQtyFocus()', context) }
}

test('Quantity input is wired to focus autofill and blur cancellation', () => {
  expect(source).toMatch(/value=\{qty\}\s+onFocus=\{onQtyFocus\}/)
  expect(source).toContain('onBlur={() => { qtyPrefillRequestRef.current += 1 }}')
})

test('fills the alerted fiat Qty with grouping and selects it for replacement', async () => {
  const { context, node, focus } = harness()
  await focus()
  expect(context.computeBuyAlertAllowance).toHaveBeenCalledWith(context.activeBuy, 80)
  expect(context.setQty).toHaveBeenCalledWith('1,234.5')
  expect(node.select).toHaveBeenCalledTimes(1)
})

test('converts the alerted USD amount into the display currency', async () => {
  const { context, focus } = harness({ usdToDisplay: n => n * 1.35 })
  await focus()
  expect(context.setQty).toHaveBeenCalledWith('1,666.58')
})

test.each([
  ['', '15.43125'],
  ['100', '12.345'],
])('token mode uses the entered price, or live price when empty (%s)', async (price, expected) => {
  const { context, focus } = harness({ qtyMode: 'tokens', price })
  await focus()
  expect(context.setQty).toHaveBeenCalledWith(expected)
})

test('token conversion interprets the entered price in the display currency', async () => {
  const { context, focus } = harness({ qtyMode: 'tokens', price: '135', displayToUsd: n => n / 1.35 })
  await focus()
  expect(context.setQty).toHaveBeenCalledWith('12.345')
})

test.each([
  { qty: '42' }, { side: 'sell' }, { effectiveLedgerOnly: true }, { loading: true },
  { user: null }, { activeBuy: null }, { livePrice: null }, { livePrice: 0 }, { livePrice: NaN },
  { activeBuy: { user_id: 'another-user', coingecko_id: 'bitcoin' } },
  { activeBuy: { user_id: 'user-1', coingecko_id: 'ethereum' } },
])('does not suggest a quantity for an ineligible form: %j', async overrides => {
  const { context, focus } = harness(overrides)
  await focus()
  expect(context.computeBuyAlertAllowance).not.toHaveBeenCalled()
  expect(context.setQty).not.toHaveBeenCalled()
})

test.each([0, NaN, Infinity])('leaves Quantity empty when no valid alert amount exists (%s)', async allowedUsd => {
  const { context, focus } = harness({ computeBuyAlertAllowance: async () => ({ allowedUsd }) })
  await focus()
  expect(context.setQty).not.toHaveBeenCalled()
})

test.each(['typing', 'blur', 'context change', 'input replaced'])('ignores delayed suggestions after %s', async change => {
  let resolve
  const { context, node, focus } = harness({
    computeBuyAlertAllowance: () => new Promise(done => { resolve = done }),
  })
  const pending = focus()
  if (change === 'typing') node.value = '42'
  if (change === 'blur') context.document.activeElement = null
  if (change === 'context change') context.qtyPrefillRequestRef.current += 1
  if (change === 'input replaced') context.qtyRef.current = { value: '' }
  resolve({ allowedUsd: 100 })
  await pending
  expect(context.setQty).not.toHaveBeenCalled()
  expect(node.select).not.toHaveBeenCalled()
})

test('a failed lookup leaves manual trade entry available', async () => {
  const { context, focus } = harness({ computeBuyAlertAllowance: async () => { throw new Error('offline') } })
  await expect(focus()).resolves.toBeUndefined()
  expect(context.setQty).not.toHaveBeenCalled()
})

test('alert allowance includes only remaining highlighted allocations for this user, coin, and planner', async () => {
  const query = {}
  for (const name of ['select', 'eq']) query[name] = jest.fn(() => query)
  query.order = jest.fn().mockResolvedValue({ data: [], error: null })
  const context = {
    user: { id: 'user-1' }, id: 'bitcoin',
    supabaseBrowser: { from: jest.fn(() => query) },
    buildBuyLevels: () => [
      { price: 80, allocation: 100 },
      { price: 70, allocation: 200 },
      { price: 60, allocation: 300 },
      { price: 50, allocation: 400 },
    ],
    computeBuyFills: () => ({ allocatedUsd: [99, 50, 0, 0] }),
  }
  vm.createContext(context)
  vm.runInContext(compile(declaration('computeBuyAlertAllowance')), context)
  const result = await vm.runInContext("computeBuyAlertAllowance({ id: 'planner-1' }, 60)", context)
  // The 99%-filled row is green, the next two have $150 + $300 missing,
  // and the $50 level has not triggered yet.
  expect(result).toEqual({ allowedUsd: 450, allowedTokens: 7.5, hasLevels: true })
  expect(query.eq.mock.calls).toEqual([
    ['user_id', 'user-1'], ['coingecko_id', 'bitcoin'], ['side', 'buy'], ['buy_planner_id', 'planner-1'],
  ])
})
