// src/types/db.ts
export type BuyPlannerRow = {
  id: string
  user_id: string
  coingecko_id: string
  top_price: number
  // Some environments/tables use one or the other;
  // keep both optional so the UI can coalesce safely.
  budget_usd?: number | null
  total_budget?: number | null
  ladder_depth: number | '70' | '90'
  growth_per_level: number | null
  started_at: string
}

