export type Tier = 'FREE' | 'PLANNER' | 'PORTFOLIO' | 'DISCIPLINED' | 'ADVISORY'
export type SubscriptionStatus = 'none' | 'active' | 'trialing' | 'inactive' | 'canceled' | 'past_due'

export type Entitlements = {
  tier: Tier
  status: SubscriptionStatus
  hasBillingAccount: boolean
  hasSubscription: boolean
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  trialEligible: boolean
  canUsePlanners: boolean
  plannedAssetsLimit: number | null // null = unlimited
  plannedAssetsUsed: number
  asOf: string
}

export function isPaidStatus(status: string | null | undefined): status is 'active' | 'trialing' {
  return status === 'active' || status === 'trialing'
}

export function normalizeSubscriptionStatus(status: unknown): SubscriptionStatus {
  switch (String(status ?? '').toLowerCase()) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'inactive':
      return 'inactive'
    case 'canceled':
      return 'canceled'
    case 'past_due':
      return 'past_due'
    case 'none':
    default:
      return 'none'
  }
}

export function normalizeTier(tier: any): Tier {
  const t = String(tier ?? '').toUpperCase()
  if (t === 'PLANNER') return 'PLANNER'
  if (t === 'PORTFOLIO') return 'PORTFOLIO'
  if (t === 'DISCIPLINED') return 'DISCIPLINED'
  if (t === 'ADVISORY') return 'ADVISORY'
  return 'FREE'
}

export function plannedLimitForTier(tier: Tier): number | null {
  switch (tier) {
    case 'PLANNER':
      return 5
    case 'PORTFOLIO':
      return 20
    case 'DISCIPLINED':
      return null
    case 'ADVISORY':
      return null
    case 'FREE':
    default:
      return 0
  }
}

export function canUsePlannersForTier(tier: Tier): boolean {
  return tier !== 'FREE'
}
