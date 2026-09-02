const fs = require('fs')
const path = require('path')
const { PGlite } = require('@electric-sql/pglite')
const { randomUUID } = require('crypto')
jest.setTimeout(30000)
let db
const user = '11111111-1111-4111-8111-111111111111'
const otherUser = '22222222-2222-4222-8222-222222222222'
const buy = '33333333-3333-4333-8333-333333333333'
const sell = '44444444-4444-4444-8444-444444444444'
const firstTrade = '55555555-5555-4555-8555-555555555555'
const migration = fs.readFileSync(path.join(__dirname, '../db/migrations/20260830_atomic_planner_workflows.sql'), 'utf8')
const query = async (sql, params = []) => (await db.query(sql, params)).rows
const setting = (key, value) => query('select set_config($1, $2, false)', [key, value])
const generate = (expected = sell, step = 50, pct = 15) => query('select public.ledgerone_generate_sell_ladder_v1($1,$2,$3,$4) as id', ['bitcoin', expected, step, pct])
const audit = (op, entity, target) => query('select public.ledgerone_planner_audit_v1($1,$2,$3)', [op, entity, target])
const payload = changes => ({ id: randomUUID(), user_id: user, coingecko_id: 'bitcoin', side: 'buy', price: 200, quantity: 2,
  fee: 0, trade_time: '2026-08-30T12:00:00Z', buy_planner_id: buy, sell_planner_id: sell, ...changes })
const save = trade => query('select public.ledgerone_record_trade_v1($1) as id', [JSON.stringify(trade)])
const snapshot = async () => {
  const result = {}
  for (const table of ['buy_planners','sell_planners','sell_levels','trades','audit_logs']) {
    result[table] = await query(`select * from public.${table} order by id`)
  }
  return result
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(fs.readFileSync(path.join(__dirname, 'fixtures/atomic-planner-schema.sql'), 'utf8'))
  await db.exec(migration)
})
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec('reset role; truncate public.trades, public.sell_levels, public.sell_planners, public.buy_planners, public.audit_logs cascade;')
  await setting('request.jwt.claim.sub', user)
  await setting('test.paid', 'true')
  await setting('test.fail', '')
  await query('insert into public.buy_planners(id,user_id,coingecko_id,top_price) values($1,$2,$3,300)', [buy,user,'bitcoin'])
  await query('insert into public.sell_planners(id,user_id,coingecko_id,top_price) values($1,$2,$3,300)', [sell,user,'bitcoin'])
  await query("insert into public.trades(id,user_id,coingecko_id,side,price,quantity,fee,trade_time,buy_planner_id,sell_planner_id) values($1,$2,'bitcoin','buy',100,10,0,'2026-08-29T12:00:00Z',$3,$4)", [firstTrade,user,buy,sell])
  await generate()
})

test('migration is additive and can be reapplied without changing account data', async () => {
  const before = await snapshot()
  await db.exec(migration)
  expect(await snapshot()).toEqual(before)
})

test('failed replacement restores every old ladder row with its original ID', async () => {
  const before = await snapshot()
  await setting('test.fail', 'level')
  await expect(generate(sell,150,25)).rejects.toThrow('Injected level failure')
  expect(await snapshot()).toEqual(before)
})

test('successful generation has twelve levels and conserves the token pool', async () => {
  await generate(sell,100,25)
  const rows = await query('select level,price,sell_tokens from public.sell_levels order by level')
  expect(rows).toHaveLength(12)
  expect(Number(rows[0].price)).toBe(200)
  expect(Number(rows[0].sell_tokens)).toBe(2.5)
  expect(rows.reduce((total,r) => total + Number(r.sell_tokens),0)).toBeCloseTo(10,12)
})

test('creating a missing planner and its ladder rolls back together', async () => {
  await query('update public.trades set sell_planner_id=null')
  await query('delete from public.sell_levels')
  await query('delete from public.sell_planners')
  const before = await snapshot()
  await setting('test.fail','level')
  await expect(generate(null)).rejects.toThrow('Injected level failure')
  expect(await snapshot()).toEqual(before)
})

test('a saved buy and its recomputed ladder commit together', async () => {
  const trade = payload()
  await save(trade)
  expect((await query('select id from public.trades where id=$1',[trade.id]))).toHaveLength(1)
  const [{ price }] = await query('select price from public.sell_levels where level=1')
  expect(Number(price)).toBeCloseTo((1400/12)*1.5,10)
  const [{ tokens }] = await query('select sum(sell_tokens) as tokens from public.sell_levels')
  expect(Number(tokens)).toBeCloseTo(12,12)
  expect(tokens).toBe('12.00000000')
})

test('ladder failure rolls back the new trade as well, preserving the draft retry ID', async () => {
  const before = await snapshot(), trade = payload()
  await setting('test.fail','level')
  await expect(save(trade)).rejects.toThrow('Injected level failure')
  expect(await snapshot()).toEqual(before)
  await setting('test.fail','')
  await save(trade)
  const committed = await snapshot()
  await expect(save(trade)).rejects.toThrow(/duplicate key/)
  expect(await snapshot()).toEqual(committed)
})

test('free ledger-only buys never rebuild or attach to planners', async () => {
  const before = await snapshot()
  await setting('test.paid','false')
  await setting('test.fail','level')
  await save(payload({buy_planner_id:null,sell_planner_id:null}))
  const after = await snapshot()
  expect(after.sell_levels).toEqual(before.sell_levels)
  expect(after.trades).toHaveLength(2)
  await expect(save(payload())).rejects.toThrow('ledger-only')
})

test('cross-account trade payloads and planner references are rejected without writes', async () => {
  const before = await snapshot()
  await expect(save(payload({user_id:otherUser}))).rejects.toThrow('Account mismatch')
  await setting('request.jwt.claim.sub',otherUser)
  await expect(save(payload({user_id:otherUser}))).rejects.toThrow('Buy planner changed')
  await expect(generate()).rejects.toThrow('active Buy planner')
  await expect(audit('delete','sell_planner',sell)).rejects.toThrow('not found')
  expect(await snapshot()).toEqual(before)
})

test('stale planner selection never overwrites a different active planner', async () => {
  const before = await snapshot()
  await expect(generate(randomUUID())).rejects.toThrow('active Sell planner changed')
  expect(await snapshot()).toEqual(before)
})

test('manual regeneration respects a locked average while retaining pool accounting', async () => {
  await query('update public.sell_planners set avg_lock_price=80 where id=$1',[sell])
  await query("insert into public.trades(user_id,coingecko_id,side,price,quantity,fee,trade_time,sell_planner_id) values($1,'bitcoin','sell',200,2,0,now(),$2)",[user,sell])
  await generate(sell,50,15)
  expect(Number((await query('select price from public.sell_levels where level=1'))[0].price)).toBe(120)
  expect(Number((await query('select sum(sell_tokens) as tokens from public.sell_levels'))[0].tokens)).toBe(8)
})

test('trade regeneration preserves the saved ladder shape, not manual defaults', async () => {
  await query('delete from public.sell_levels where level>8')
  await query('update public.sell_levels set rise_pct=100*level,sell_pct_of_remaining=0.10')
  await save(payload())
  const rows=await query('select rise_pct,sell_pct_of_remaining from public.sell_levels order by level')
  expect(rows).toHaveLength(8)
  expect(Number(rows[0].rise_pct)).toBe(100)
  expect(Number(rows[0].sell_pct_of_remaining)).toBe(0.1)
})

test('sales do not change the stored ladder shape or create a new planner', async () => {
  const before=await snapshot()
  await save(payload({side:'sell',buy_planner_id:null,quantity:1}))
  const after=await snapshot()
  expect(after.sell_levels).toEqual(before.sell_levels)
  expect(after.sell_planners).toEqual(before.sell_planners)
})

test.each([{price:'NaN'},{quantity:0},{fee:-1},{trade_time:'infinity'}, {side:'buy',buy_planner_id:null}])(
  'invalid trade %j leaves all rows untouched', async invalid=>{
    const before=await snapshot()
    await expect(save(payload(invalid))).rejects.toThrow(/Review the trade/)
    expect(await snapshot()).toEqual(before)
  },
)

test('free users cannot generate or restore paid planners', async () => {
  await audit('delete','buy_planner',buy)
  const [{id:log}]=await query("select id from public.audit_logs where action='deleted'")
  const before=await snapshot()
  await setting('test.paid','false')
  await expect(generate()).rejects.toThrow('does not include planners')
  await expect(audit('restore',null,log)).rejects.toThrow('does not include planners')
  expect(await snapshot()).toEqual(before)
})

test('authenticated role can use only the ownership-checked public entry point',async()=>{
  await db.exec('set role authenticated')
  await generate(sell,100,25)
  await db.exec('reset role')
  expect(Number((await query('select price from public.sell_levels where level=1'))[0].price)).toBe(200)
})

test('failed audit insert rolls back sell deletion, ladder deletion, and trade unlinking', async () => {
  const before = await snapshot()
  await setting('test.fail','audit')
  await expect(audit('delete','sell_planner',sell)).rejects.toThrow('Injected audit failure')
  expect(await snapshot()).toEqual(before)
})

test('failed audit insert rolls back buy deactivation', async () => {
  const before = await snapshot()
  await setting('test.fail','audit')
  await expect(audit('delete','buy_planner',buy)).rejects.toThrow('Injected audit failure')
  expect(await snapshot()).toEqual(before)
})

test('sell undo restores the full planner, original ladder IDs and surviving trade associations', async () => {
  const before = await snapshot()
  await audit('delete','sell_planner',sell)
  const [{id:log}] = await query("select id from public.audit_logs where action='deleted'")
  await audit('restore',null,log)
  const after = await snapshot()
  for(const table of ['buy_planners','sell_planners','sell_levels','trades']) expect(after[table]).toEqual(before[table])
  expect(after.audit_logs).toHaveLength(2)
  expect(after.audit_logs.find(r=>r.id===log).details.restored_at).toBeTruthy()
})

test.each(['level','audit'])('failed sell restore (%s) leaves no partial planner and keeps undo available', async failure => {
  await audit('delete','sell_planner',sell)
  const [{id:log}] = await query("select id from public.audit_logs where action='deleted'")
  const before = await snapshot()
  await setting('test.fail',failure)
  await expect(audit('restore',null,log)).rejects.toThrow(/Injected/)
  expect(await snapshot()).toEqual(before)
})

test('buy restore and restored audit entry roll back together', async () => {
  await audit('delete','buy_planner',buy)
  const [{id:log}] = await query("select id from public.audit_logs where action='deleted'")
  const before = await snapshot()
  await setting('test.fail','audit')
  await expect(audit('restore',null,log)).rejects.toThrow('Injected audit failure')
  expect(await snapshot()).toEqual(before)
})

test('delete/restore retries do not duplicate audit records', async () => {
  await audit('delete','sell_planner',sell)
  await audit('delete','sell_planner',sell)
  const [{id:log}] = await query("select id from public.audit_logs where action='deleted'")
  await audit('restore',null,log)
  await audit('restore',null,log)
  expect(await query('select id from public.audit_logs')).toHaveLength(2)
})

test('restore refuses to replace a newer active plan', async () => {
  await audit('delete','sell_planner',sell)
  const [{id:log}] = await query("select id from public.audit_logs where action='deleted'")
  await query("insert into public.sell_planners(user_id,coingecko_id) values($1,'bitcoin')",[user])
  const before = await snapshot()
  await expect(audit('restore',null,log)).rejects.toThrow('already has an active')
  expect(await snapshot()).toEqual(before)
})

test('snapshot ownership is checked even inside a privileged RPC', async () => {
  await audit('delete','sell_planner',sell)
  const [{id:log}] = await query("select id from public.audit_logs where action='deleted'")
  await query("update public.audit_logs set details=jsonb_set(details,'{snapshot,planner,user_id}',to_jsonb($1::text)) where id=$2",[otherUser,log])
  const before = await snapshot()
  await expect(audit('restore',null,log)).rejects.toThrow('snapshot ownership')
  expect(await snapshot()).toEqual(before)
})

test('restore cannot overwrite a trade association changed after deletion',async()=>{
  await audit('delete','sell_planner',sell)
  const [{id:log}]=await query("select id from public.audit_logs where action='deleted'")
  const replacement=randomUUID()
  await query("insert into public.sell_planners(id,user_id,coingecko_id,is_active) values($1,$2,'bitcoin',false)",[replacement,user])
  await query('update public.trades set sell_planner_id=$1 where id=$2',[replacement,firstTrade])
  const before=await snapshot()
  await expect(audit('restore',null,log)).rejects.toThrow('linked to another planner')
  expect(await snapshot()).toEqual(before)
})

test('restoring a planner does not recreate a trade deleted since its snapshot',async()=>{
  await audit('delete','sell_planner',sell)
  const [{id:log}]=await query("select id from public.audit_logs where action='deleted'")
  await query('delete from public.trades where id=$1',[firstTrade])
  await audit('restore',null,log)
  expect(await query('select id from public.trades')).toHaveLength(0)
  expect(await query('select id from public.sell_planners where id=$1',[sell])).toHaveLength(1)
})

test('public callers cannot invoke internal helpers or anonymous mutations', async () => {
  await db.exec('set role authenticated')
  await expect(query("select public.ledgerone_rebuild_sell_internal_v1('bitcoin',null,'trade',null,null,null)")).rejects.toThrow('permission denied')
  await db.exec('reset role; set role anon')
  await expect(generate()).rejects.toThrow('permission denied')
  await db.exec('reset role')
  await setting('request.jwt.claim.sub','')
  await expect(generate()).rejects.toThrow('Not signed in')
})
