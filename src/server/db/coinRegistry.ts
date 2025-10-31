// src/server/db/coinRegistry.ts
// Reads from Supabase core_* tables with a safe in-memory fallback.
// If SUPABASE_URL / SUPABASE_SERVICE_ROLE (or anon key) aren't set or queries fail,
// we quietly fall back so NOTHING breaks during migration.

import type { PostgrestResponse } from "@supabase/supabase-js";

// Lazy import to avoid issues if supabase-js isn't installed yet.
// If you don't have it, run:  npm i @supabase/supabase-js
let supabaseClient: any = null;
function getSupabase() {
  if (supabaseClient !== null) return supabaseClient;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient } = require("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      supabaseClient = createClient(url, key, {
        auth: { persistSession: false },
        db: { schema: "public" },
      });
    } else {
      supabaseClient = null;
    }
  } catch (_) {
    supabaseClient = null;
  }
  return supabaseClient;
}

export type Coin = {
  id: string;           // canonical id: 'bitcoin', 'ethereum', 'trx'
  symbol: string;       // canonical symbol: 'btc', 'eth', 'trx'
  name: string;
  decimals: number;
  tick_size: number;
  active: boolean;
};

export type Mapping = {
  coin_id: string;
  provider: string;     // 'coingecko' | 'binance' | 'coinbase' | ...
  external_id: string;  // provider-specific id/symbol (e.g., 'tron' for TRX at Coingecko)
};

type Registry = {
  coins: Coin[];
  mappings: Mapping[];
};

/** In-memory fallback so the app keeps working even if DB/env isn't ready. */
const fallbackRegistry: Registry = {
  coins: [
    { id: "bitcoin",  symbol: "btc", name: "Bitcoin",  decimals: 8, tick_size: 0.00000001, active: true },
    { id: "ethereum", symbol: "eth", name: "Ethereum", decimals: 8, tick_size: 0.00000001, active: true },
    { id: "trx",      symbol: "trx", name: "TRON",     decimals: 8, tick_size: 0.00000001, active: true },
  ],
  mappings: [
    { coin_id: "bitcoin",  provider: "coingecko", external_id: "bitcoin" },
    { coin_id: "ethereum", provider: "coingecko", external_id: "ethereum" },
    { coin_id: "trx",      provider: "coingecko", external_id: "tron" },
  ],
};

async function loadFromDb(): Promise<Registry | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const coinsRes: PostgrestResponse<Coin> = await supabase
      .from("core_coins")
      .select("*")
      .eq("active", true);

    if (coinsRes.error) {
      // console.warn("core_coins query error:", coinsRes.error);
      return null;
    }

    const mappingsRes: PostgrestResponse<Mapping> = await supabase
      .from("core_coin_mappings")
      .select("*");

    if (mappingsRes.error) {
      // console.warn("core_coin_mappings query error:", mappingsRes.error);
      return null;
    }

    const coins = (coinsRes.data ?? []).map((c) => ({
      ...c,
      id: String(c.id).toLowerCase(),
      symbol: String(c.symbol).toLowerCase(),
      name: c.name,
      decimals: Number(c.decimals),
      tick_size: Number(c.tick_size),
      active: !!c.active,
    }));

    const mappings = (mappingsRes.data ?? []).map((m) => ({
      coin_id: String(m.coin_id).toLowerCase(),
      provider: String(m.provider).toLowerCase(),
      external_id: String(m.external_id).toLowerCase(),
    }));

    return { coins, mappings };
  } catch {
    return null;
  }
}

export async function getCoins(): Promise<Coin[]> {
  const db = await loadFromDb();
  return (db?.coins ?? fallbackRegistry.coins).filter((c) => c.active);
}

export async function getMappings(): Promise<Mapping[]> {
  const db = await loadFromDb();
  return db?.mappings ?? fallbackRegistry.mappings;
}

/** Normalize any incoming id/symbol/external_id to our canonical coin_id. */
export async function normalizeCoinId(input: string): Promise<string | null> {
  const q = (input || "").trim().toLowerCase();
  if (!q) return null;

  const coins = await getCoins();
  // 1) direct match on canonical id or symbol
  const direct = coins.find((c) => c.id === q || c.symbol === q);
  if (direct) return direct.id;

  // 2) match via provider mappings (external_id)
  const maps = await getMappings();
  const m = maps.find((x) => x.external_id === q);
  return m?.coin_id ?? null;
}

/** Get provider-specific external id for a given coin & provider. */
export async function mapToProvider(coinId: string, provider: string): Promise<string | null> {
  const maps = await getMappings();
  const row = maps.find((m) => m.coin_id === coinId && m.provider === provider.toLowerCase());
  return row?.external_id ?? null;
}

