type PlannerAuditResponse = {
  ok: boolean
  error?: string
}

async function postPlannerAudit(payload: Record<string, unknown>) {
  const res = await fetch('/api/planner/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  let json: PlannerAuditResponse | null = null
  try {
    json = (await res.json()) as PlannerAuditResponse
  } catch {
    json = null
  }

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || 'Planner audit request failed.')
  }

  return json
}

export async function deleteSellPlannerWithAudit(plannerId: string) {
  return postPlannerAudit({
    op: 'delete',
    entity: 'sell_planner',
    plannerId,
  })
}

export async function deletePlannerWithAudit({
  entity,
  plannerId,
}: {
  entity: string
  plannerId: string
}) {
  return postPlannerAudit({ op: 'delete', entity, plannerId })
}

export async function restoreSellPlannerFromAudit(logId: string) {
  return postPlannerAudit({
    op: 'restore',
    logId,
  })
}