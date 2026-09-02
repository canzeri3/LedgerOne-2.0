-- Run only through a trusted owner connection. Every test row and helper is
-- enclosed in this transaction and is removed by the final ROLLBACK.
BEGIN;

CREATE OR REPLACE FUNCTION public.ledgerone_atomic_smoke_fail_level()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('ledgerone.atomic_smoke_fail', true) = 'true'
    AND NEW.coingecko_id LIKE 'ledgerone-atomic-test-%'
    AND NEW.level = 3 THEN
    RAISE EXCEPTION 'Injected atomic smoke failure';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledgerone_atomic_smoke_fail_level ON public.sell_levels;
CREATE TRIGGER ledgerone_atomic_smoke_fail_level
BEFORE INSERT ON public.sell_levels
FOR EACH ROW EXECUTE FUNCTION public.ledgerone_atomic_smoke_fail_level();

DO $smoke$
DECLARE
  v_uid uuid;
  v_coin text := 'ledgerone-atomic-test-' || gen_random_uuid()::text;
  v_buy uuid := gen_random_uuid();
  v_sell uuid := gen_random_uuid();
  v_trade uuid := gen_random_uuid();
  v_failed_trade uuid := gen_random_uuid();
  v_free_trade uuid := gen_random_uuid();
  v_denied_trade uuid := gen_random_uuid();
  v_deleted_log uuid;
  v_before_hash text;
  v_after_hash text;
  v_before_snapshots bigint;
  v_levels bigint;
  v_tokens numeric;
BEGIN
  SELECT u.id INTO v_uid
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admin_tier_overrides o WHERE o.user_id = u.id
  )
  ORDER BY u.created_at
  LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No isolated test principal is available.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  PERFORM set_config('ledgerone.atomic_smoke_fail', 'false', true);
  INSERT INTO public.admin_tier_overrides(user_id, tier, note)
    VALUES (v_uid, 'DISCIPLINED', 'Temporary atomic workflow smoke test');
  INSERT INTO public.coins(coingecko_id, symbol, name)
    VALUES (v_coin, 'ATOMIC', 'Atomic workflow test');
  INSERT INTO public.buy_planners(
    id, user_id, coingecko_id, top_price, ladder_depth, growth_pct,
    budget_usd, total_budget, growth_per_level, is_active
  ) VALUES (v_buy, v_uid, v_coin, 200, 70, 25, 1000, 1000, 1.25, true);
  INSERT INTO public.sell_planners(id, user_id, coingecko_id, top_price, is_active)
    VALUES (v_sell, v_uid, v_coin, 200, true);

  -- A planner-linked buy and its initial ladder must commit together.
  PERFORM public.ledgerone_record_trade_v1(jsonb_build_object(
    'id', v_trade, 'user_id', v_uid, 'coingecko_id', v_coin,
    'side', 'buy', 'price', 100, 'quantity', 10, 'fee', 0,
    'trade_time', now(), 'buy_planner_id', v_buy, 'sell_planner_id', v_sell
  ));
  SELECT count(*) INTO v_levels FROM public.sell_levels
    WHERE user_id = v_uid AND sell_planner_id = v_sell;
  IF v_levels <> 8 THEN RAISE EXCEPTION 'Trade ladder expected 8 levels, found %.', v_levels; END IF;

  -- Manual generation must atomically replace it with the configured 12 levels.
  PERFORM public.ledgerone_generate_sell_ladder_v1(v_coin, v_sell, 100, 25);
  SELECT count(*), sum(sell_tokens) INTO v_levels, v_tokens FROM public.sell_levels
    WHERE user_id = v_uid AND sell_planner_id = v_sell;
  IF v_levels <> 12 OR abs(v_tokens - 10) > 0.000000000001 THEN
    RAISE EXCEPTION 'Manual ladder failed conservation: levels %, tokens %.', v_levels, v_tokens;
  END IF;

  SELECT md5(coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb)::text)
    INTO v_before_hash FROM public.sell_levels l
    WHERE l.user_id = v_uid AND l.sell_planner_id = v_sell;
  SELECT count(*) INTO v_before_snapshots FROM public.price_snapshots WHERE coingecko_id = v_coin;
  PERFORM set_config('ledgerone.atomic_smoke_fail', 'true', true);

  -- Forced replacement failure must preserve the exact previous ladder.
  BEGIN
    PERFORM public.ledgerone_generate_sell_ladder_v1(v_coin, v_sell, 150, 20);
    RAISE EXCEPTION 'Expected manual ladder failure was not raised.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Injected atomic smoke failure' THEN RAISE; END IF;
  END;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb)::text)
    INTO v_after_hash FROM public.sell_levels l
    WHERE l.user_id = v_uid AND l.sell_planner_id = v_sell;
  IF v_after_hash IS DISTINCT FROM v_before_hash THEN
    RAISE EXCEPTION 'Failed generation changed the previous ladder.';
  END IF;

  -- Forced rebuild failure must also roll back the trade and price snapshot.
  BEGIN
    PERFORM public.ledgerone_record_trade_v1(jsonb_build_object(
      'id', v_failed_trade, 'user_id', v_uid, 'coingecko_id', v_coin,
      'side', 'buy', 'price', 110, 'quantity', 2, 'fee', 0,
      'trade_time', now(), 'buy_planner_id', v_buy, 'sell_planner_id', v_sell
    ));
    RAISE EXCEPTION 'Expected trade rebuild failure was not raised.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Injected atomic smoke failure' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.trades WHERE id = v_failed_trade) THEN
    RAISE EXCEPTION 'Failed trade remained in the ledger.';
  END IF;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb)::text)
    INTO v_after_hash FROM public.sell_levels l
    WHERE l.user_id = v_uid AND l.sell_planner_id = v_sell;
  IF v_after_hash IS DISTINCT FROM v_before_hash THEN
    RAISE EXCEPTION 'Failed trade changed the previous ladder.';
  END IF;
  IF (SELECT count(*) FROM public.price_snapshots WHERE coingecko_id = v_coin) <> v_before_snapshots THEN
    RAISE EXCEPTION 'Failed trade left a price snapshot.';
  END IF;
  PERFORM set_config('ledgerone.atomic_smoke_fail', 'false', true);

  -- Delete and restore must preserve planner, ladder IDs, and trade links.
  PERFORM public.ledgerone_planner_audit_v1('delete', 'sell_planner', v_sell);
  IF EXISTS (SELECT 1 FROM public.sell_planners WHERE id = v_sell)
    OR EXISTS (SELECT 1 FROM public.sell_levels WHERE sell_planner_id = v_sell)
    OR EXISTS (SELECT 1 FROM public.trades WHERE id = v_trade AND sell_planner_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Planner delete was incomplete.';
  END IF;
  SELECT id INTO v_deleted_log FROM public.audit_logs
    WHERE user_id = v_uid AND entity = 'sell_planner' AND action = 'deleted'
      AND details->>'planner_id' = v_sell::text AND details->>'atomic_version' = '1'
    ORDER BY created_at DESC LIMIT 1;
  IF v_deleted_log IS NULL THEN RAISE EXCEPTION 'Planner delete audit entry is missing.'; END IF;
  PERFORM public.ledgerone_planner_audit_v1('restore', NULL, v_deleted_log);
  SELECT md5(coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb)::text)
    INTO v_after_hash FROM public.sell_levels l
    WHERE l.user_id = v_uid AND l.sell_planner_id = v_sell;
  IF NOT EXISTS (SELECT 1 FROM public.sell_planners WHERE id = v_sell)
    OR v_after_hash IS DISTINCT FROM v_before_hash
    OR NOT EXISTS (SELECT 1 FROM public.trades WHERE id = v_trade AND sell_planner_id = v_sell) THEN
    RAISE EXCEPTION 'Planner restore did not reproduce the original state.';
  END IF;

  -- FREE can still record ledger-only trades but cannot attach to planners.
  DELETE FROM public.admin_tier_overrides WHERE user_id = v_uid;
  PERFORM public.ledgerone_record_trade_v1(jsonb_build_object(
    'id', v_free_trade, 'user_id', v_uid, 'coingecko_id', v_coin,
    'side', 'buy', 'price', 120, 'quantity', 1, 'fee', 0,
    'trade_time', now(), 'buy_planner_id', NULL, 'sell_planner_id', NULL
  ));
  IF NOT EXISTS (SELECT 1 FROM public.trades WHERE id = v_free_trade
    AND buy_planner_id IS NULL AND sell_planner_id IS NULL) THEN
    RAISE EXCEPTION 'FREE ledger-only trade was not saved.';
  END IF;
  BEGIN
    PERFORM public.ledgerone_record_trade_v1(jsonb_build_object(
      'id', v_denied_trade, 'user_id', v_uid, 'coingecko_id', v_coin,
      'side', 'buy', 'price', 120, 'quantity', 1, 'fee', 0,
      'trade_time', now(), 'buy_planner_id', v_buy, 'sell_planner_id', v_sell
    ));
    RAISE EXCEPTION 'Expected FREE planner rejection was not raised.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Your plan permits ledger-only trades.' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.trades WHERE id = v_denied_trade) THEN
    RAISE EXCEPTION 'Rejected FREE planner trade was written.';
  END IF;
END;
$smoke$;

ROLLBACK;

SELECT 'live_atomic_smoke_ok' AS result,
  (SELECT count(*) FROM public.coins WHERE coingecko_id LIKE 'ledgerone-atomic-test-%') AS persisted_test_rows;
