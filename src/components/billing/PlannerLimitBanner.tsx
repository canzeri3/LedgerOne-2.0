'use client'

import Link from 'next/link'
import type { Entitlements } from '@/lib/entitlements'

export default function PlannerLimitBanner({ entitlements }: { entitlements: Entitlements }) {
  const limit = entitlements.plannedAssetsLimit
  const used = entitlements.plannedAssetsUsed

  if (limit == null) return null // unlimited tiers
  if (limit <= 0) return null

  const atCap = used >= limit

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-[#151618] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-50">Planned assets</p>
          <p className="mt-1 text-sm text-slate-400">
<span className="font-semibold text-slate-50">
  {used}/{limit}
</span>{' '}
            {atCap ? (
              <span className="text-indigo-200">— limit reached for your current tier.</span>
            ) : (
              <span>— remaining: {limit - used}.</span>
            )}
          </p>
        </div>

        {atCap ? (
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-full bg-indigo-500/90 px-4 py-2 text-xs font-medium text-slate-50 shadow shadow-indigo-500/30 transition hover:bg-indigo-400"
          >
            Upgrade to increase capacity
          </Link>
        ) : null}
      </div>
    </div>
  )
}

