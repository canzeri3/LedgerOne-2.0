-- Canonical coin registry: one source of truth for IDs/symbols/mappings.

-- 1) Canonical coins
create table if not exists coins (
  id text primary key,                -- canonical id: e.g., 'bitcoin', 'ethereum', 'trx'
  symbol text not null,               -- canonical symbol: 'btc', 'eth', 'trx'
  name text not null,                 -- display name: 'Bitcoin'
  decimals int not null default 8,
  tick_size numeric not null default 0.00000001,
  active boolean not null default true
);

-- 2) Provider mappings (a coin may have multiple external ids across providers)
create table if not exists coin_mappings (
  coin_id text references coins(id) on delete cascade,
  provider text not null,             -- 'coingecko' | 'binance' | 'coinbase' | etc.
  external_id text not null,          -- e.g., coingecko_id or a trading pair symbol
  primary key (coin_id, provider)
);

-- 3) Providers metadata (optional, enables scoring/weights later)
create table if not exists providers (
  name text primary key,
  weight numeric not null default 1.0,
  enabled boolean not null default true
);

-- Helpful indexes
create index if not exists idx_coin_mappings_provider on coin_mappings (provider);
create index if not exists idx_coin_mappings_external on coin_mappings (external_id);

