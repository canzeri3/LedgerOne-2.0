import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { atomicPlannerWorkflowsEnabled, atomicWorkflowError } from '@/lib/atomicPlannerWorkflows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type JsonObject = Record<string, any>

type PlannerEntity = 'sell_planner' | 'buy_planner'

type DeleteBody = {
  op: 'delete'
  entity: PlannerEntity
  plannerId: string
}

type RestoreBody = {
  op: 'restore'
  logId: string
}

function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

async function getAuthedSupabase() {
  const store = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return store.getAll()
        },
        setAll() {
          // no-op in route handlers
        },
      },
    }
  )
}

function getPrivilegedSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? ''

  if (!url || !key) return null

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function asArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((row) => row && typeof row === 'object') as JsonObject[]
    : []
}

async function insertAuditLog(
  db: SupabaseClient,
  args: {
    userId: string
    coingeckoId: string | null
    action: 'deleted' | 'restored'
    details: JsonObject
    entity?: PlannerEntity
  }
) {
  const { error } = await db.from('audit_logs').insert({
    user_id: args.userId,
    coingecko_id: args.coingeckoId,
    entity: args.entity ?? 'sell_planner',
    action: args.action,
    details: args.details,
  })

  if (error) throw error
}

async function restoreSellSnapshot(db: SupabaseClient, userId: string, snapshot: JsonObject) {
  const planner = asObject(snapshot.planner)
  const levels = asArray(snapshot.levels)

  if (!planner.id) {
    throw new Error('Missing sell planner snapshot.')
  }

  const { error: clearLevelsError } = await db
    .from('sell_levels')
    .delete()
    .eq('user_id', userId)
    .eq('sell_planner_id', planner.id)

  if (clearLevelsError) throw clearLevelsError

  const { error: insertPlannerError } = await db.from('sell_planners').insert(planner)
  if (insertPlannerError) throw insertPlannerError

  if (!levels.length) return

  const { error: insertLevelsError } = await db.from('sell_levels').insert(levels)
  if (insertLevelsError) {
    await db.from('sell_planners').delete().eq('id', planner.id).eq('user_id', userId)
    throw insertLevelsError
  }
}

/**
 * Buy planners are soft-deleted (is_active -> false) rather than hard-deleted:
 * `trades` rows reference buy_planners.id, and the delete UX promises past trades
 * and history stay intact. The Audit Log restore path flips is_active back to true,
 * so the row must survive the delete.
 */
async function handleBuyPlannerDelete(db: SupabaseClient, userId: string, plannerId: string) {
  const { data: planner, error: plannerError } = await db
    .from('buy_planners')
    .select('id,coingecko_id,is_active')
    .eq('id', plannerId)
    .eq('user_id', userId)
    .maybeSingle()

  if (plannerError) return jsonError(plannerError.message, 500)
  if (!planner) return jsonError('Buy planner not found.', 404)

  const { error: deactivateError } = await db
    .from('buy_planners')
    .update({ is_active: false })
    .eq('id', plannerId)
    .eq('user_id', userId)

  if (deactivateError) return jsonError(deactivateError.message, 500)

  try {
    await insertAuditLog(db, {
      userId,
      entity: 'buy_planner',
      coingeckoId: planner.coingecko_id ?? null,
      action: 'deleted',
      details: {
        message: 'Buy planner deleted.',
        planner_id: planner.id,
        planner_state: planner.is_active ? 'active' : 'frozen',
        delete_mode: 'soft',
        undo_available: true,
      },
    })
  } catch (auditError: any) {
    // Roll back the soft delete so the planner isn't silently lost without an undo entry.
    await db
      .from('buy_planners')
      .update({ is_active: planner.is_active })
      .eq('id', plannerId)
      .eq('user_id', userId)

    return jsonError(auditError?.message ?? 'Failed to write buy planner audit log.', 500)
  }

  return NextResponse.json({ ok: true })
}

async function handleDelete(db: SupabaseClient, userId: string, body: DeleteBody) {
  if (body.entity !== 'sell_planner' && body.entity !== 'buy_planner') {
    return jsonError('Unsupported entity.')
  }

  const plannerId = String(body.plannerId || '').trim()
  if (!plannerId) return jsonError('Missing plannerId.')

  if (body.entity === 'buy_planner') {
    return handleBuyPlannerDelete(db, userId, plannerId)
  }

  const { data: planner, error: plannerError } = await db
    .from('sell_planners')
    .select('*')
    .eq('id', plannerId)
    .eq('user_id', userId)
    .maybeSingle()

  if (plannerError) return jsonError(plannerError.message, 500)
  if (!planner) return jsonError('Sell planner not found.', 404)

  const { data: levels, error: levelsError } = await db
    .from('sell_levels')
    .select('*')
    .eq('user_id', userId)
    .eq('sell_planner_id', plannerId)
    .order('level', { ascending: true })

  if (levelsError) return jsonError(levelsError.message, 500)

  const snapshot = {
    planner,
    levels: levels ?? [],
  }

  const { error: clearLevelsError } = await db
    .from('sell_levels')
    .delete()
    .eq('user_id', userId)
    .eq('sell_planner_id', plannerId)

  if (clearLevelsError) return jsonError(clearLevelsError.message, 500)

  const { error: deletePlannerError } = await db
    .from('sell_planners')
    .delete()
    .eq('id', plannerId)
    .eq('user_id', userId)

  if (deletePlannerError) return jsonError(deletePlannerError.message, 500)

  try {
    await insertAuditLog(db, {
      userId,
      coingeckoId: planner.coingecko_id ?? null,
      action: 'deleted',
      details: {
        message: 'Sell planner deleted.',
        planner_id: planner.id,
        planner_state: planner.is_active ? 'active' : 'frozen',
        delete_mode: 'hard',
        undo_available: true,
        snapshot,
      },
    })
  } catch (auditError: any) {
    try {
      await restoreSellSnapshot(db, userId, snapshot)
    } catch {}
    return jsonError(auditError?.message ?? 'Failed to write sell planner audit log.', 500)
  }

  return NextResponse.json({ ok: true })
}

async function handleRestore(db: SupabaseClient, userId: string, body: RestoreBody) {
  const logId = String(body.logId || '').trim()
  if (!logId) return jsonError('Missing logId.')

  const { data: log, error: logError } = await db
    .from('audit_logs')
    .select('id,entity,action,coingecko_id,details')
    .eq('id', logId)
    .eq('user_id', userId)
    .maybeSingle()

  if (logError) return jsonError(logError.message, 500)
  if (!log) return jsonError('Audit log entry not found.', 404)
  if (log.entity !== 'sell_planner') return jsonError('This audit entry is not a sell planner delete.', 400)
  if (log.action !== 'deleted') return jsonError('Only deleted sell planners can be restored.', 400)

  const details = asObject(log.details)
  if (details.restored_at) return jsonError('This sell planner has already been restored.', 409)

  const snapshot = asObject(details.snapshot)
  const planner = asObject(snapshot.planner)
  const plannerId = String(planner.id || details.planner_id || '').trim()
  const coinId = String(planner.coingecko_id || log.coingecko_id || '').trim() || null
  const plannerIsActive = planner.is_active === true

  if (!plannerId) return jsonError('Planner snapshot is missing the planner id.', 400)

  const { data: existingPlanner, error: existingPlannerError } = await db
    .from('sell_planners')
    .select('id')
    .eq('id', plannerId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingPlannerError) return jsonError(existingPlannerError.message, 500)
  if (existingPlanner?.id) return jsonError('This sell planner has already been restored.', 409)

  if (plannerIsActive) {
    const { data: activeConflict, error: activeConflictError } = await db
      .from('sell_planners')
      .select('id')
      .eq('user_id', userId)
      .eq('coingecko_id', coinId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (activeConflictError) return jsonError(activeConflictError.message, 500)
    if (activeConflict?.id) {
      return jsonError('Restore blocked because this coin already has an active Sell Planner.', 409)
    }
  }

  try {
    await restoreSellSnapshot(db, userId, snapshot)
  } catch (restoreError: any) {
    return jsonError(restoreError?.message ?? 'Failed to restore sell planner.', 500)
  }

  const restoredAt = new Date().toISOString()
  const nextDetails = {
    ...details,
    restored_at: restoredAt,
  }

  await db.from('audit_logs').update({ details: nextDetails }).eq('id', logId).eq('user_id', userId)

  try {
    await insertAuditLog(db, {
      userId,
      coingeckoId: coinId,
      action: 'restored',
      details: {
        message: 'Sell planner restored from audit log.',
        planner_id: plannerId,
        planner_state: plannerIsActive ? 'active' : 'frozen',
        restored_from_log_id: logId,
      },
    })
  } catch {
    // restore succeeded; do not fail request on follow-up audit log
  }

  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const authClient = await getAuthedSupabase()
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError) return jsonError(authError.message, 401)
  if (!user) return jsonError('Not signed in.', 401)

  let body: DeleteBody | RestoreBody | null = null
  try {
    body = (await req.json()) as DeleteBody | RestoreBody
  } catch {
    return jsonError('Invalid JSON body.')
  }

  if (!body || typeof body !== 'object') return jsonError('Invalid request body.')

  if (atomicPlannerWorkflowsEnabled) {
    if (body.op !== 'delete' && body.op !== 'restore') return jsonError('Unsupported operation.')
    if (body.op === 'delete' && body.entity !== 'buy_planner' && body.entity !== 'sell_planner') return jsonError('Unsupported entity.')
    const target = body.op === 'delete' ? body.plannerId : body.logId
    if (typeof target !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)) {
      return jsonError('Invalid planner reference.')
    }
    // Use the caller's JWT, never the service role. The RPC binds all writes to auth.uid().
    const { error } = await authClient.rpc('ledgerone_planner_audit_v1', {
      p_op: body.op, p_entity: body.op === 'delete' ? body.entity : null, p_target: target,
    })
    if (error) {
      const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === '23505' ? 409 : 500
      return jsonError(atomicWorkflowError(error), status)
    }
    return NextResponse.json({ ok: true })
  }

  if (body.op === 'delete') {
    const db = getPrivilegedSupabase() ?? authClient
    return handleDelete(db, user.id, body as DeleteBody)
  }

  if (body.op === 'restore') {
    const db = getPrivilegedSupabase() ?? authClient
    return handleRestore(db, user.id, body as RestoreBody)
  }

  return jsonError('Unsupported operation.')
}
