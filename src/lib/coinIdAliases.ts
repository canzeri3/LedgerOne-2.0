const COIN_ID_ALIASES: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  trx: 'tron',
  bnb: 'binancecoin',
  xrp: 'ripple',
  sol: 'solana',
  ada: 'cardano',
  dot: 'polkadot',
  link: 'chainlink',
  atom: 'cosmos',
  matic: 'polygon-pos',
  doge: 'dogecoin',
  avax: 'avalanche-2',
  near: 'near',
  sui: 'sui',
  ton: 'toncoin',
  op: 'optimism',
  arb: 'arbitrum',
  apt: 'aptos',
  ltc: 'litecoin',
  dai: 'dai',
  usdc: 'usd-coin',
  usdt: 'tether',
}

const REVERSE_COIN_ID_ALIASES: Record<string, string[]> = Object.entries(COIN_ID_ALIASES).reduce(
  (acc, [alias, target]) => {
    const key = target.toLowerCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(alias.toLowerCase())
    return acc
  },
  {} as Record<string, string[]>
)

function uniqueLower(values: Array<string | null | undefined>): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const key = String(value ?? '').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }

  return out
}

export function aliasCoinId(id: string | null | undefined): string | null {
  const raw = String(id ?? '').trim().toLowerCase()
  if (!raw) return null
  return COIN_ID_ALIASES[raw] ?? raw
}

export function reverseAliasCoinIds(id: string | null | undefined): string[] {
  const raw = String(id ?? '').trim().toLowerCase()
  if (!raw) return []
  return REVERSE_COIN_ID_ALIASES[raw] ?? []
}

export function addProtocolAlias(id: string | null | undefined): string[] {
  const raw = String(id ?? '').trim().toLowerCase()
  if (!raw) return []

  if (raw.endsWith('-protocol')) {
    return [raw, raw.replace(/-protocol$/, '')]
  }

  return [raw, `${raw}-protocol`]
}

export function getCoinIdCandidates(id: string | null | undefined): string[] {
  const raw = String(id ?? '').trim().toLowerCase()
  if (!raw) return []

  const aliased = aliasCoinId(raw)
  const reverse = reverseAliasCoinIds(raw)
  const reverseAliased = reverse.flatMap((value) => addProtocolAlias(value))

  return uniqueLower([
    raw,
    aliased,
    ...reverse,
    ...addProtocolAlias(raw),
    ...addProtocolAlias(aliased),
    ...reverseAliased,
  ])
}
