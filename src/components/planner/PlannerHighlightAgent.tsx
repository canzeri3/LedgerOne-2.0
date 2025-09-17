'use client'

import { useMemo, useEffect } from 'react'
import useSWR from 'swr'
import { usePathname } from 'next/navigation'

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json())

function toNum(x: unknown): number | null {
  if (x == null) return null
  if (typeof x === 'number') return Number.isFinite(x) ? x : null
  if (typeof x === 'string') {
    const n = Number(x.replace(/[,$\s]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseLevel(text: string): number | null {
  if (!text) return null
  // first money/number in the row
  const m = text.match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function highlight(container: HTMLElement, live: number) {
  // highlight BUY rows: within ±3% OR price <= level
  container.querySelectorAll<HTMLElement>('[data-buy-planner] tr, [data-buy-planner] li, [data-buy-planner] .row')
    .forEach(row => {
      const level = parseLevel(row.textContent || '')
      const on = level != null && (
        Math.abs(live - level) / level <= 0.03 ||   // ±3%
        live <= level                                // crossed for BUY
      )
      row.classList.toggle('text-yellow-300', !!on)
    })
  // highlight SELL rows: within ±3% OR price >= level
  container.querySelectorAll<HTMLElement>('[data-sell-planner] tr, [data-sell-planner] li, [data-sell-planner] .row')
    .forEach(row => {
      const level = parseLevel(row.textContent || '')
      const on = level != null && (
        Math.abs(live - level) / level <= 0.03 ||   // ±3%
        live >= level                                // crossed for SELL
      )
      row.classList.toggle('text-yellow-300', !!on)
    })
}

export default function PlannerHighlightAgent() {
  // infer coin id from /coins/[id] in URL (works on coin planner route too)
  const pathname = usePathname()
  const coinId = useMemo(() => {
    if (!pathname) return null
    const m = pathname.match(/\/coins\/([^/]+)/)
    return m?.[1] ?? null
  }, [pathname])

  const { data: priceResp } = useSWR<any>(
    coinId ? `/api/price/${coinId}` : null,
    fetcher,
    { refreshInterval: 30_000 }
  )

  const live = useMemo(() => {
    const direct = toNum(priceResp?.price ?? priceResp?.usd ?? priceResp)
    return direct ?? null
  }, [priceResp])

  useEffect(() => {
    if (live == null || !Number.isFinite(live)) return
    const root = document.getElementById('__next') || document.body
    if (!root) return

    // initial pass
    highlight(root as HTMLElement, live)

    // re-run when rows mutate (entries added/removed)
    const obs = new MutationObserver(() => highlight(root as HTMLElement, live))
    obs.observe(root, { childList: true, subtree: true })

    return () => obs.disconnect()
  }, [live])

  return null
}

