// src/server/ids.ts
/**
 * Canonicalizes incoming coin identifiers to CoinGecko IDs.
 * Accepts symbols (e.g., "trx") or known aliases and returns the correct ID (e.g., "tron").
 * - Case-insensitive, trims whitespace
 * - Normalizes underscores/dashes/spaces when comparing symbols
 * - Covers top ~50 coins plus common rebrands
 *
 * If a symbol/alias is missing here, add it once and BOTH routes (/api/price and /api/price-live)
 * will benefit immediately because they call normalizeCoinId().
 */

function clean(input: string): string {
  return (input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
    .replace(/-/g, '');
}

/** Common aliases & symbols -> CoinGecko canonical IDs (extend anytime). */
const ID_ALIASES: Record<string, string> = {
  // Layer-1s / majors
  btc: 'bitcoin',
  xbt: 'bitcoin',
  wbtc: 'wrapped-bitcoin',

  eth: 'ethereum',
  etc: 'ethereum-classic',

  usdt: 'tether',
  usdc: 'usd-coin',
  dai: 'dai',

  bnb: 'binancecoin',
  xrp: 'ripple',
  sol: 'solana',
  ada: 'cardano',
  doge: 'dogecoin',

  trx: 'tron',
  ton: 'the-open-network',
  dot: 'polkadot',

  // Polygon / MATIC (canonical CG id is "matic-network")
  matic: 'matic-network',
  polygon: 'matic-network',
  'polygon-ecosystem-token': 'matic-network',

  avax: 'avalanche-2',
  shib: 'shiba-inu',
  ltc: 'litecoin',
  bch: 'bitcoin-cash',

  atom: 'cosmos',
  icp: 'internet-computer',
  fil: 'filecoin',
  near: 'near',
  xlm: 'stellar',
  xmr: 'monero',

  // L2 / infra / staking
  arb: 'arbitrum',
  op: 'optimism',
  imx: 'immutable',            // CG now uses 'immutable' (was 'immutable-x')
  'immutablex': 'immutable',

  ldo: 'lido-dao',
  rpl: 'rocket-pool',

  // DeFi / blue chips
  link: 'chainlink',
  uni: 'uniswap',
  aave: 'aave',
  mkr: 'maker',
  snx: 'synthetix-network-token',
  crv: 'curve-dao-token',
  comp: 'compound-governance-token',
  inj: 'injective',
  rune: 'thorchain',
  cake: 'pancakeswap-token',
  gmx: 'gmx',

  // Gaming / metaverse
  mana: 'decentraland',
  sand: 'the-sandbox',
  axs: 'axie-infinity',
  gala: 'gala',
  enj: 'enjincoin',
  ape: 'apecoin',

  // Other L1s / ecosystems
  hbar: 'hedera',                  // formerly 'hedera-hashgraph'
  qnt: 'quant-network',
  algo: 'algorand',
  egld: 'multiversx',              // formerly 'elrond-erd-2'
  vet: 'vechain',
  stx: 'stacks',
  kas: 'kaspa',
  apt: 'aptos',
  sui: 'sui',
  sei: 'sei-network',
  pyth: 'pyth-network',
  ftm: 'fantom',
  rose: 'oasis-network',
  mina: 'mina-protocol',
  theta: 'theta-token',
  flow: 'flow',
  xtz: 'tezos',
  one: 'harmony',
  icx: 'icon',
  neo: 'neo',

  // Data / infra tokens
  grt: 'the-graph',
  rndr: 'render',

  // Stable wrappers & odds/ends
  tusd: 'true-usd',
  usdd: 'usdd',
  frax: 'frax',
  ustc: 'terrausd',                // legacy
  busd: 'binance-usd',             // legacy

  // Common mis-typed hyphenated forms -> real IDs
  'binance-coin': 'binancecoin',
  'internetcomputer': 'internet-computer',
  'bitcoin-sv': 'bitcoin-cash-sv', // not top 50 but common confusion
};

/**
 * If input already looks like a CoinGecko ID (hyphens or digits), return a lowercased trimmed version.
 * Otherwise, treat it as a symbol/alias and consult the map. If missing, fall back to the cleaned symbol.
 */
export function normalizeCoinId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim().toLowerCase();

  // Looks like a CG id? (contains hyphen or number) -> return normalized id as-is
  if (/-/.test(trimmed) || /\d/.test(trimmed)) {
    return trimmed;
  }

  // Otherwise treat as a symbol/alias
  const key = clean(trimmed);
  return ID_ALIASES[key] ?? key;
}

/** Normalize an array of ids/symbols (keeps order, de-dupes). */
export function normalizeMany(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids ?? []) {
    const norm = normalizeCoinId(raw);
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

/**
 * Optional: dynamically extend aliases at runtime (e.g., from env/config)
 * Example: registerAliases({ pepe: 'pepe', bonk: 'bonk' })
 */
export function registerAliases(extra: Record<string, string>) {
  for (const [k, v] of Object.entries(extra ?? {})) {
    const key = clean(k);
    if (!key) continue;
    ID_ALIASES[key] = v.trim().toLowerCase();
  }
}
