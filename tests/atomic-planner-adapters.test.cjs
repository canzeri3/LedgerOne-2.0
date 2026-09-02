const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8')
function loadFlags(value) {
  const ctx = { exports: {}, process: { env: { NEXT_PUBLIC_ATOMIC_PLANNER_WORKFLOWS: value } } }
  vm.runInNewContext(compile(read('src/lib/atomicPlannerWorkflows.ts')),ctx)
  return ctx.exports
}

test('atomic rollout is opt-in and a missing RPC gives a useful error', () => {
  expect(loadFlags(undefined).atomicPlannerWorkflowsEnabled).toBe(false)
  expect(loadFlags('false').atomicPlannerWorkflowsEnabled).toBe(false)
  expect(loadFlags('true').atomicPlannerWorkflowsEnabled).toBe(true)
  expect(loadFlags('true').atomicWorkflowError({code:'PGRST202'})).toContain('migration')
})

function tradeAdapter(enabled, reply = { error:null, data:'trade-id' }, sessionUser = 'user-a') {
  const source = read('src/lib/useTradeSave.ts')
  const ast = ts.createSourceFile('useTradeSave.ts',source,ts.ScriptTarget.Latest,true)
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'controllerFor').getText(ast)
  const abortSignal = jest.fn().mockResolvedValue(reply)
  const insert = jest.fn(() => ({abortSignal}))
  const from = jest.fn(() => ({insert}))
  const rpc = jest.fn(() => ({abortSignal}))
  const ctx = {
    ...loadFlags(enabled?'true':'false'), controllers:new Map(),
    TradeSaveController: class { constructor(user, transport) {this.transport=transport} },
    crypto:{randomUUID:()=> 'new-id'}, window:{sessionStorage:{}},
    supabaseBrowser:{from,rpc,auth:{getSession:jest.fn().mockResolvedValue({data:{session:{user:{id:sessionUser}}},error:null})}},
  }
  vm.runInNewContext(compile(fn),ctx)
  return { transport:ctx.controllerFor('user-a').transport, rpc,from,insert,abortSignal }
}

test('atomic trade adapter uses one RPC with the unchanged immutable trade ID', async () => {
  const h=tradeAdapter(true), trade={id:'trade-id',user_id:'user-a'}, signal=new AbortController().signal
  await h.transport.insert(trade,signal)
  expect(h.rpc).toHaveBeenCalledWith('ledgerone_record_trade_v1',{p_trade:trade})
  expect(h.abortSignal).toHaveBeenCalledWith(signal)
  expect(h.from).not.toHaveBeenCalled()
})

test('an atomic RPC rejection never falls back to a plain insert', async () => {
  const h=tradeAdapter(true,{error:{code:'PGRST202',message:'missing'}})
  const result=await h.transport.insert({id:'trade-id'},new AbortController().signal)
  expect(result.error.message).toContain('migration')
  expect(h.from).not.toHaveBeenCalled()
})

test('the disabled rollout preserves the existing trade adapter', async () => {
  const h=tradeAdapter(false), trade={id:'trade-id'}
  await h.transport.insert(trade,new AbortController().signal)
  expect(h.from).toHaveBeenCalledWith('trades')
  expect(h.insert).toHaveBeenCalledWith(trade)
  expect(h.rpc).not.toHaveBeenCalled()
})

test('an account change blocks the atomic trade before any write', async () => {
  const h=tradeAdapter(true,undefined,'user-b')
  await expect(h.transport.insert({id:'trade-id'},new AbortController().signal)).rejects.toThrow('same account')
  expect(h.rpc).not.toHaveBeenCalled()
  expect(h.from).not.toHaveBeenCalled()
})

function auditRoute(options={}) {
  const rpc=jest.fn().mockResolvedValue({error:options.error??null}), from=jest.fn()
  const createPrivileged=jest.fn(()=>{throw new Error('Atomic route must not use a service client')})
  const authClient={rpc,from,auth:{getUser:jest.fn().mockResolvedValue({data:{user:options.signedOut?null:{id:'user-a'}},error:null})}}
  const modules={
    'next/server':{NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),{status:init?.status??200})}},
    'next/headers':{cookies:async()=>({getAll:()=>[]})},
    '@supabase/ssr':{createServerClient:()=>authClient},
    '@supabase/supabase-js':{createClient:createPrivileged},
    '@/lib/atomicPlannerWorkflows':loadFlags('true'),
  }
  const ctx={exports:{},process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test-only',NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid'}},require:name=>{
    if(!(name in modules)) throw new Error(`Unexpected dependency ${name}`)
    return modules[name]
  }}
  vm.runInNewContext(compile(read('src/app/api/planner/audit/route.ts')),ctx)
  return {post:body=>ctx.exports.POST({json:async()=>body}),rpc,from,createPrivileged}
}
const plannerId='11111111-1111-4111-8111-111111111111'

test.each(['buy_planner','sell_planner'])('atomic %s delete is exactly one caller-authenticated RPC', async entity => {
  const h=auditRoute(),res=await h.post({op:'delete',entity,plannerId})
  expect(res.status).toBe(200)
  expect(h.rpc).toHaveBeenCalledWith('ledgerone_planner_audit_v1',{p_op:'delete',p_entity:entity,p_target:plannerId})
  expect(h.from).not.toHaveBeenCalled()
  expect(h.createPrivileged).not.toHaveBeenCalled()
})

test('atomic restore derives ownership/entity from the server audit entry', async () => {
  const h=auditRoute()
  expect((await h.post({op:'restore',logId:plannerId})).status).toBe(200)
  expect(h.rpc).toHaveBeenCalledWith('ledgerone_planner_audit_v1',{p_op:'restore',p_entity:null,p_target:plannerId})
})

test.each([
  {op:'delete',entity:'trades',plannerId},
  {op:'delete',entity:'sell_planner',plannerId:'bad-id'},
  {op:'restore'},
  {op:'arbitrary'},
])('malformed audit requests never reach the database (%j)',async body=>{
  const h=auditRoute()
  expect((await h.post(body)).status).toBe(400)
  expect(h.rpc).not.toHaveBeenCalled()
})

test('signed-out audit mutations are rejected before database access', async () => {
  const h=auditRoute({signedOut:true})
  expect((await h.post({op:'delete',entity:'sell_planner',plannerId})).status).toBe(401)
  expect(h.rpc).not.toHaveBeenCalled()
})

test.each([['PGRST202',500],['42501',403],['P0002',404],['23505',409]])('audit error %s preserves the database error outcome without fallback', async (code,status)=>{
  const h=auditRoute({error:{code,message:'Database refused operation'}})
  expect((await h.post({op:'delete',entity:'sell_planner',plannerId})).status).toBe(status)
  expect(h.from).not.toHaveBeenCalled()
  expect(h.createPrivileged).not.toHaveBeenCalled()
})
