-- Minimal seed so you can use the registry immediately (expand later).

insert into providers (name, weight, enabled) values
  ('coingecko', 1.0, true),
  ('binance',   1.0, true),
  ('coinbase',  1.0, true)
on conflict (name) do nothing;

insert into coins (id, symbol, name, decimals, tick_size, active) values
  ('bitcoin',  'btc', 'Bitcoin',  8, 0.00000001, true),
  ('ethereum', 'eth', 'Ethereum', 8, 0.00000001, true),
  ('trx',      'trx', 'TRON',     8, 0.00000001, true)
on conflict (id) do nothing;

-- Coingecko uses 'tron' for TRX
insert into coin_mappings (coin_id, provider, external_id) values
  ('bitcoin',  'coingecko', 'bitcoin'),
  ('ethereum', 'coingecko', 'ethereum'),
  ('trx',      'coingecko', 'tron')
on conflict (coin_id, provider) do nothing;

/* Example placeholders for other providers (fill when you wire them)
insert into coin_mappings (coin_id, provider, external_id) values
  ('bitcoin',  'binance',  'BTCUSDT'),
  ('ethereum', 'binance',  'ETHUSDT'),
  ('trx',      'binance',  'TRXUSDT')
on conflict (coin_id, provider) do nothing;

insert into coin_mappings (coin_id, provider, external_id) values
  ('bitcoin',  'coinbase', 'BTC-USD'),
  ('ethereum', 'coinbase', 'ETH-USD'),
  ('trx',      'coinbase', 'TRX-USD')
on conflict (coin_id, provider) do nothing;
*/

