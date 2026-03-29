-- =============================================================================
-- LedgerOne — Row Level Security Policies
-- Migration: 20260329_rls_policies.sql
--
-- HOW TO APPLY
--   Supabase Dashboard → SQL Editor → paste → Run
--
-- SAFE TO RE-RUN: every block checks IF the table exists before touching it.
-- Tables that don't exist in your DB are silently skipped — no errors.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: USER-OWNED TABLES
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trades') THEN
    EXECUTE 'ALTER TABLE trades ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "trades: user select own" ON trades';
    EXECUTE 'DROP POLICY IF EXISTS "trades: user insert own" ON trades';
    EXECUTE 'DROP POLICY IF EXISTS "trades: user update own" ON trades';
    EXECUTE 'DROP POLICY IF EXISTS "trades: user delete own" ON trades';
    EXECUTE 'CREATE POLICY "trades: user select own" ON trades FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "trades: user insert own" ON trades FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "trades: user update own" ON trades FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "trades: user delete own" ON trades FOR DELETE USING (auth.uid() = user_id)';
    RAISE NOTICE 'trades: RLS enabled';
  ELSE
    RAISE NOTICE 'trades: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'buy_planners') THEN
    EXECUTE 'ALTER TABLE buy_planners ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "buy_planners: user select own" ON buy_planners';
    EXECUTE 'DROP POLICY IF EXISTS "buy_planners: user insert own" ON buy_planners';
    EXECUTE 'DROP POLICY IF EXISTS "buy_planners: user update own" ON buy_planners';
    EXECUTE 'DROP POLICY IF EXISTS "buy_planners: user delete own" ON buy_planners';
    EXECUTE 'CREATE POLICY "buy_planners: user select own" ON buy_planners FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "buy_planners: user insert own" ON buy_planners FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "buy_planners: user update own" ON buy_planners FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "buy_planners: user delete own" ON buy_planners FOR DELETE USING (auth.uid() = user_id)';
    RAISE NOTICE 'buy_planners: RLS enabled';
  ELSE
    RAISE NOTICE 'buy_planners: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sell_planners') THEN
    EXECUTE 'ALTER TABLE sell_planners ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "sell_planners: user select own" ON sell_planners';
    EXECUTE 'DROP POLICY IF EXISTS "sell_planners: user insert own" ON sell_planners';
    EXECUTE 'DROP POLICY IF EXISTS "sell_planners: user update own" ON sell_planners';
    EXECUTE 'DROP POLICY IF EXISTS "sell_planners: user delete own" ON sell_planners';
    EXECUTE 'CREATE POLICY "sell_planners: user select own" ON sell_planners FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "sell_planners: user insert own" ON sell_planners FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "sell_planners: user update own" ON sell_planners FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "sell_planners: user delete own" ON sell_planners FOR DELETE USING (auth.uid() = user_id)';
    RAISE NOTICE 'sell_planners: RLS enabled';
  ELSE
    RAISE NOTICE 'sell_planners: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'buy_levels') THEN
    EXECUTE 'ALTER TABLE buy_levels ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "buy_levels: user select own" ON buy_levels';
    EXECUTE 'DROP POLICY IF EXISTS "buy_levels: user insert own" ON buy_levels';
    EXECUTE 'DROP POLICY IF EXISTS "buy_levels: user update own" ON buy_levels';
    EXECUTE 'DROP POLICY IF EXISTS "buy_levels: user delete own" ON buy_levels';
    EXECUTE 'CREATE POLICY "buy_levels: user select own" ON buy_levels FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "buy_levels: user insert own" ON buy_levels FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "buy_levels: user update own" ON buy_levels FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "buy_levels: user delete own" ON buy_levels FOR DELETE USING (auth.uid() = user_id)';
    RAISE NOTICE 'buy_levels: RLS enabled';
  ELSE
    RAISE NOTICE 'buy_levels: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sell_levels') THEN
    EXECUTE 'ALTER TABLE sell_levels ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "sell_levels: user select own" ON sell_levels';
    EXECUTE 'DROP POLICY IF EXISTS "sell_levels: user insert own" ON sell_levels';
    EXECUTE 'DROP POLICY IF EXISTS "sell_levels: user update own" ON sell_levels';
    EXECUTE 'DROP POLICY IF EXISTS "sell_levels: user delete own" ON sell_levels';
    EXECUTE 'CREATE POLICY "sell_levels: user select own" ON sell_levels FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "sell_levels: user insert own" ON sell_levels FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "sell_levels: user update own" ON sell_levels FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "sell_levels: user delete own" ON sell_levels FOR DELETE USING (auth.uid() = user_id)';
    RAISE NOTICE 'sell_levels: RLS enabled';
  ELSE
    RAISE NOTICE 'sell_levels: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'epochs') THEN
    EXECUTE 'ALTER TABLE epochs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "epochs: user select own" ON epochs';
    EXECUTE 'DROP POLICY IF EXISTS "epochs: user insert own" ON epochs';
    EXECUTE 'DROP POLICY IF EXISTS "epochs: user update own" ON epochs';
    EXECUTE 'DROP POLICY IF EXISTS "epochs: user delete own" ON epochs';
    EXECUTE 'CREATE POLICY "epochs: user select own" ON epochs FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "epochs: user insert own" ON epochs FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "epochs: user update own" ON epochs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "epochs: user delete own" ON epochs FOR DELETE USING (auth.uid() = user_id)';
    RAISE NOTICE 'epochs: RLS enabled';
  ELSE
    RAISE NOTICE 'epochs: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'planner_configs') THEN
    EXECUTE 'ALTER TABLE planner_configs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "planner_configs: user select own" ON planner_configs';
    EXECUTE 'DROP POLICY IF EXISTS "planner_configs: user insert own" ON planner_configs';
    EXECUTE 'DROP POLICY IF EXISTS "planner_configs: user update own" ON planner_configs';
    EXECUTE 'DROP POLICY IF EXISTS "planner_configs: user delete own" ON planner_configs';
    EXECUTE 'CREATE POLICY "planner_configs: user select own" ON planner_configs FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "planner_configs: user insert own" ON planner_configs FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "planner_configs: user update own" ON planner_configs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "planner_configs: user delete own" ON planner_configs FOR DELETE USING (auth.uid() = user_id)';
    RAISE NOTICE 'planner_configs: RLS enabled';
  ELSE
    RAISE NOTICE 'planner_configs: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notification_prefs') THEN
    EXECUTE 'ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "notification_prefs: user select own" ON notification_prefs';
    EXECUTE 'DROP POLICY IF EXISTS "notification_prefs: user insert own" ON notification_prefs';
    EXECUTE 'DROP POLICY IF EXISTS "notification_prefs: user update own" ON notification_prefs';
    EXECUTE 'DROP POLICY IF EXISTS "notification_prefs: user delete own" ON notification_prefs';
    EXECUTE 'CREATE POLICY "notification_prefs: user select own" ON notification_prefs FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "notification_prefs: user insert own" ON notification_prefs FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "notification_prefs: user update own" ON notification_prefs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "notification_prefs: user delete own" ON notification_prefs FOR DELETE USING (auth.uid() = user_id)';
    RAISE NOTICE 'notification_prefs: RLS enabled';
  ELSE
    RAISE NOTICE 'notification_prefs: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notification_state') THEN
    EXECUTE 'ALTER TABLE notification_state ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "notification_state: user select own" ON notification_state';
    EXECUTE 'CREATE POLICY "notification_state: user select own" ON notification_state FOR SELECT USING (auth.uid() = user_id)';
    RAISE NOTICE 'notification_state: RLS enabled';
  ELSE
    RAISE NOTICE 'notification_state: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    EXECUTE 'ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "audit_logs: user select own" ON audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "audit_logs: user insert own" ON audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "audit_logs: user update own" ON audit_logs';
    EXECUTE 'CREATE POLICY "audit_logs: user select own" ON audit_logs FOR SELECT USING (auth.uid() = user_id)';
    RAISE NOTICE 'audit_logs: RLS enabled';
  ELSE
    RAISE NOTICE 'audit_logs: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'favorites') THEN
    EXECUTE 'ALTER TABLE favorites ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "favorites: user select own" ON favorites';
    EXECUTE 'DROP POLICY IF EXISTS "favorites: user insert own" ON favorites';
    EXECUTE 'DROP POLICY IF EXISTS "favorites: user delete own" ON favorites';
    EXECUTE 'CREATE POLICY "favorites: user select own" ON favorites FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "favorites: user insert own" ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "favorites: user delete own" ON favorites FOR DELETE USING (auth.uid() = user_id)';
    RAISE NOTICE 'favorites: RLS enabled';
  ELSE
    RAISE NOTICE 'favorites: table not found, skipped';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: BILLING / SUBSCRIPTION TABLES
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_subscriptions') THEN
    EXECUTE 'ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "user_subscriptions: user select own" ON user_subscriptions';
    EXECUTE 'CREATE POLICY "user_subscriptions: user select own" ON user_subscriptions FOR SELECT USING (auth.uid() = user_id)';
    RAISE NOTICE 'user_subscriptions: RLS enabled';
  ELSE
    RAISE NOTICE 'user_subscriptions: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_tier_overrides') THEN
    EXECUTE 'ALTER TABLE admin_tier_overrides ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "admin_tier_overrides: user select own" ON admin_tier_overrides';
    EXECUTE 'CREATE POLICY "admin_tier_overrides: user select own" ON admin_tier_overrides FOR SELECT USING (auth.uid() = user_id)';
    RAISE NOTICE 'admin_tier_overrides: RLS enabled';
  ELSE
    RAISE NOTICE 'admin_tier_overrides: table not found, skipped';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: SHARED REFERENCE / MARKET DATA TABLES
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coins') THEN
    EXECUTE 'ALTER TABLE coins ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "coins: public read" ON coins';
    EXECUTE 'CREATE POLICY "coins: public read" ON coins FOR SELECT USING (true)';
    RAISE NOTICE 'coins: RLS enabled';
  ELSE
    RAISE NOTICE 'coins: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coin_mappings') THEN
    EXECUTE 'ALTER TABLE coin_mappings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "coin_mappings: public read" ON coin_mappings';
    EXECUTE 'CREATE POLICY "coin_mappings: public read" ON coin_mappings FOR SELECT USING (true)';
    RAISE NOTICE 'coin_mappings: RLS enabled';
  ELSE
    RAISE NOTICE 'coin_mappings: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'core_coins') THEN
    EXECUTE 'ALTER TABLE core_coins ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "core_coins: public read" ON core_coins';
    EXECUTE 'CREATE POLICY "core_coins: public read" ON core_coins FOR SELECT USING (true)';
    RAISE NOTICE 'core_coins: RLS enabled';
  ELSE
    RAISE NOTICE 'core_coins: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'core_coin_mappings') THEN
    EXECUTE 'ALTER TABLE core_coin_mappings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "core_coin_mappings: public read" ON core_coin_mappings';
    EXECUTE 'CREATE POLICY "core_coin_mappings: public read" ON core_coin_mappings FOR SELECT USING (true)';
    RAISE NOTICE 'core_coin_mappings: RLS enabled';
  ELSE
    RAISE NOTICE 'core_coin_mappings: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coin_bars_daily') THEN
    EXECUTE 'ALTER TABLE coin_bars_daily ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "coin_bars_daily: authenticated read" ON coin_bars_daily';
    EXECUTE 'CREATE POLICY "coin_bars_daily: authenticated read" ON coin_bars_daily FOR SELECT TO authenticated USING (true)';
    RAISE NOTICE 'coin_bars_daily: RLS enabled';
  ELSE
    RAISE NOTICE 'coin_bars_daily: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coin_anchors') THEN
    EXECUTE 'ALTER TABLE coin_anchors ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "coin_anchors: authenticated read" ON coin_anchors';
    EXECUTE 'CREATE POLICY "coin_anchors: authenticated read" ON coin_anchors FOR SELECT TO authenticated USING (true)';
    RAISE NOTICE 'coin_anchors: RLS enabled';
  ELSE
    RAISE NOTICE 'coin_anchors: table not found, skipped';
  END IF;
END $$;


DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'price_snapshots') THEN
    EXECUTE 'ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "price_snapshots: authenticated read" ON price_snapshots';
    EXECUTE 'CREATE POLICY "price_snapshots: authenticated read" ON price_snapshots FOR SELECT TO authenticated USING (true)';
    RAISE NOTICE 'price_snapshots: RLS enabled';
  ELSE
    RAISE NOTICE 'price_snapshots: table not found, skipped';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: VERIFY
-- The NOTICE log above tells you what was applied vs skipped.
-- This query shows final RLS status for every table that exists in your DB.
-- Every row should show rls_enabled = true.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'trades', 'buy_planners', 'sell_planners',
    'buy_levels', 'sell_levels', 'epochs',
    'planner_configs', 'notification_prefs', 'notification_state',
    'audit_logs', 'favorites', 'user_subscriptions',
    'admin_tier_overrides', 'coins', 'coin_mappings',
    'coin_bars_daily', 'coin_anchors', 'price_snapshots',
    'core_coins', 'core_coin_mappings'
  )
ORDER BY tablename;
