-- Additive rollout: install/verify BEFORE enabling NEXT_PUBLIC_ATOMIC_PLANNER_WORKFLOWS.
-- No existing functions, triggers, policies or user rows are replaced here.
-- Each RPC is one PostgreSQL transaction; exceptions roll back ALL its writes.
BEGIN;

-- Internal only. All callers hold the same account/asset transaction lock.
CREATE OR REPLACE FUNCTION public.ledgerone_rebuild_sell_internal_v1(
  p_coin text, p_expected uuid, p_mode text, p_step integer, p_pct numeric, p_levels integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_buy public.buy_planners%ROWTYPE;
  v_sell public.sell_planners%ROWTYPE;
  v_avg numeric; v_bought numeric; v_sold numeric; v_remaining numeric; v_tokens numeric;
  v_step numeric := p_step; v_pct numeric := p_pct; v_levels integer := p_levels;
  v_level integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501'; END IF;
  -- Match the authoritative live cap triggers, including administrator tier
  -- overrides. A zero limit is FREE; any positive/null limit has planners.
  IF public.lg1_planned_assets_limit(v_uid) = 0 THEN
    RAISE EXCEPTION 'Your plan does not include planners.' USING ERRCODE = '42501';
  END IF;
  IF p_coin IS NULL OR btrim(p_coin) = '' OR p_mode NOT IN ('manual', 'trade') THEN
    RAISE EXCEPTION 'Invalid planner request.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_coin, 0));
  -- Lock parents before reading their trades. Raw FK inserts also respect these locks.
  SELECT * INTO v_buy FROM public.buy_planners
    WHERE user_id = v_uid AND coingecko_id = p_coin AND is_active
    ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
  IF v_buy.id IS NULL THEN RAISE EXCEPTION 'Create an active Buy planner first.'; END IF;
  SELECT * INTO v_sell FROM public.sell_planners
    WHERE user_id = v_uid AND coingecko_id = p_coin AND is_active
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF p_expected IS NOT NULL AND v_sell.id IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'The active Sell planner changed. Reload before saving.' USING ERRCODE = '40001';
  END IF;
  -- Preserve the previous trade behavior: no automatic creation of a missing plan.
  IF p_mode = 'trade' AND v_sell.id IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(sum(quantity), 0), sum(price * quantity) / nullif(sum(quantity), 0)
    INTO v_bought, v_avg FROM public.trades
    WHERE user_id = v_uid AND coingecko_id = p_coin AND side = 'buy'
      AND buy_planner_id = v_buy.id AND quantity > 0 AND price > 0;
  IF p_mode = 'manual' AND coalesce(v_sell.avg_lock_price, 0) > 0 THEN v_avg := v_sell.avg_lock_price; END IF;
  IF v_avg IS NULL OR v_avg <= 0 THEN RAISE EXCEPTION 'Enter your 1st buy before creating a sell planner.'; END IF;

  IF p_mode = 'trade' THEN
    SELECT count(*) INTO v_levels FROM public.sell_levels
      WHERE user_id = v_uid AND sell_planner_id = v_sell.id;
    SELECT rise_pct, sell_pct_of_remaining INTO v_step, v_pct FROM public.sell_levels
      WHERE user_id = v_uid AND sell_planner_id = v_sell.id ORDER BY level LIMIT 1;
    v_levels := CASE WHEN v_levels = 0 THEN 8 ELSE v_levels END;
    v_step := coalesce(v_step, 50); v_pct := coalesce(v_pct, 0.10);
  END IF;
  IF v_levels IS NULL OR v_levels NOT BETWEEN 1 AND 60 OR v_step IS NULL OR v_step <= 0
    OR v_pct IS NULL OR v_pct <= 0 OR v_pct > 1
    OR v_step::text IN ('NaN', 'Infinity', '-Infinity')
    OR v_pct::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Invalid sell ladder settings. Existing ladder kept.';
  END IF;
  IF v_sell.id IS NULL THEN
    INSERT INTO public.sell_planners (user_id, coingecko_id, top_price, avg_lock_price, is_active)
      VALUES (v_uid, p_coin, CASE WHEN v_buy.top_price > 0 THEN v_buy.top_price ELSE v_avg END, NULL, true)
      RETURNING * INTO v_sell;
  END IF;
  SELECT coalesce(sum(quantity), 0) INTO v_sold FROM public.trades
    WHERE user_id = v_uid AND coingecko_id = p_coin AND side = 'sell' AND sell_planner_id = v_sell.id;
  -- The live ledger stores quantities/tokens at 8 decimal places. Round each
  -- allocation before subtracting it so the final stored row receives the
  -- exact stored-precision remainder (and the ladder cannot gain/lose dust).
  v_remaining := round(greatest(0, v_bought - v_sold), 8);

  DELETE FROM public.sell_levels WHERE user_id = v_uid AND sell_planner_id = v_sell.id;
  FOR v_level IN 1..v_levels LOOP
    v_tokens := CASE WHEN v_level = v_levels THEN v_remaining
      ELSE least(v_remaining, round(greatest(0, v_remaining * v_pct), 8)) END;
    INSERT INTO public.sell_levels
      (user_id, coingecko_id, sell_planner_id, level, rise_pct, price, sell_pct_of_remaining, sell_tokens)
      VALUES (v_uid, p_coin, v_sell.id, v_level, v_step * v_level,
        v_avg * (1 + v_step / 100 * v_level), v_pct, v_tokens);
    v_remaining := round(greatest(0, v_remaining - v_tokens), 8);
  END LOOP;
  RETURN v_sell.id;
END;
$$;
REVOKE ALL ON FUNCTION public.ledgerone_rebuild_sell_internal_v1(text, uuid, text, integer, numeric, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ledgerone_generate_sell_ladder_v1(
  p_coin text, p_expected uuid, p_step integer, p_sell_pct integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_step IS NULL OR p_step NOT IN (50, 100, 150) OR p_sell_pct IS NULL OR p_sell_pct NOT IN (10, 15, 20, 25) THEN
    RAISE EXCEPTION 'Choose a valid volatility and sell intensity.';
  END IF;
  RETURN public.ledgerone_rebuild_sell_internal_v1(p_coin, p_expected, 'manual', p_step, p_sell_pct::numeric / 100, 12);
END;
$$;
REVOKE ALL ON FUNCTION public.ledgerone_generate_sell_ladder_v1(text, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ledgerone_generate_sell_ladder_v1(text, uuid, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.ledgerone_record_trade_v1(p_trade jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trade public.trades%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501'; END IF;
  v_trade := jsonb_populate_record(NULL::public.trades, p_trade);
  IF v_trade.user_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Account mismatch.' USING ERRCODE = '42501'; END IF;
  IF v_trade.id IS NULL OR v_trade.coingecko_id IS NULL OR v_trade.side IS NULL
    OR v_trade.price IS NULL OR v_trade.price <= 0 OR v_trade.quantity IS NULL OR v_trade.quantity <= 0
    OR coalesce(v_trade.fee, 0) < 0 OR v_trade.trade_time IS NULL OR NOT isfinite(v_trade.trade_time)
    OR v_trade.price::text IN ('NaN', 'Infinity', '-Infinity')
    OR v_trade.quantity::text IN ('NaN', 'Infinity', '-Infinity')
    OR coalesce(v_trade.fee, 0)::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Review the trade details before saving.';
  END IF;
  IF (v_trade.side = 'buy' AND v_trade.sell_planner_id IS NOT NULL AND v_trade.buy_planner_id IS NULL)
    OR (v_trade.side = 'sell' AND v_trade.buy_planner_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Review the trade planner associations.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_trade.coingecko_id, 0));
  IF v_trade.buy_planner_id IS NOT NULL OR v_trade.sell_planner_id IS NOT NULL THEN
    IF public.lg1_planned_assets_limit(v_uid) = 0 THEN
      RAISE EXCEPTION 'Your plan permits ledger-only trades.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_trade.buy_planner_id IS NOT NULL THEN
    PERFORM 1 FROM public.buy_planners WHERE id = v_trade.buy_planner_id AND user_id = v_uid
      AND coingecko_id = v_trade.coingecko_id AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Buy planner changed. Review this trade.'; END IF;
  END IF;
  IF v_trade.sell_planner_id IS NOT NULL THEN
    PERFORM 1 FROM public.sell_planners WHERE id = v_trade.sell_planner_id AND user_id = v_uid
      AND coingecko_id = v_trade.coingecko_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sell planner changed. Review this trade.'; END IF;
  END IF;
  -- A duplicate key is intentional: NEVER upsert an existing financial record.
  -- The existing client retry controller checks this exact ID after a lost response.
  INSERT INTO public.trades (id, user_id, coingecko_id, side, price, quantity, fee, trade_time, buy_planner_id, sell_planner_id)
    VALUES (v_trade.id, v_uid, v_trade.coingecko_id, v_trade.side, v_trade.price, v_trade.quantity,
      coalesce(v_trade.fee, 0), v_trade.trade_time, v_trade.buy_planner_id, v_trade.sell_planner_id)
    RETURNING * INTO v_trade;
  IF v_trade.side = 'buy' AND v_trade.buy_planner_id IS NOT NULL THEN
    PERFORM public.ledgerone_rebuild_sell_internal_v1(v_trade.coingecko_id, NULL, 'trade', NULL, NULL, NULL);
  END IF;
  RETURN v_trade.id;
END;
$$;
REVOKE ALL ON FUNCTION public.ledgerone_record_trade_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ledgerone_record_trade_v1(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.ledgerone_planner_audit_v1(p_op text, p_entity text, p_target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_coin text; v_id uuid; v_active boolean; v_entity text := p_entity;
  v_planner jsonb; v_levels jsonb; v_links jsonb; v_details jsonb; v_snapshot jsonb;
  v_log public.audit_logs%ROWTYPE; v_link jsonb; v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in.' USING ERRCODE = '42501'; END IF;
  IF p_target IS NULL THEN RAISE EXCEPTION 'Missing planner reference.'; END IF;
  IF p_op = 'restore' THEN
    SELECT * INTO v_log FROM public.audit_logs WHERE id = p_target AND user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Audit entry not found.' USING ERRCODE = 'P0002'; END IF;
    IF v_log.entity NOT IN ('buy_planner', 'sell_planner') OR lower(v_log.action) NOT IN
      ('delete', 'deleted', 'remove', 'removed', 'deactivate', 'deactivated', 'archive', 'archived') THEN
      RAISE EXCEPTION 'Only deleted planners can be restored.';
    END IF;
    IF v_log.details->>'restored_at' IS NOT NULL THEN RETURN jsonb_build_object('ok', true); END IF;
    IF public.lg1_planned_assets_limit(v_uid) = 0 THEN
      RAISE EXCEPTION 'Your plan does not include planners.' USING ERRCODE = '42501';
    END IF;
    v_entity := v_log.entity;
    v_snapshot := v_log.details->'snapshot'; v_planner := v_snapshot->'planner';
    v_id := coalesce(v_planner->>'id', v_log.details->>'planner_id', v_log.details->>'plannerId',
      v_log.details->>'buy_planner_id', v_log.details->>'buyPlannerId',
      v_log.details->>'sell_planner_id', v_log.details->>'sellPlannerId', v_log.details->>'id')::uuid;
    v_coin := coalesce(v_log.coingecko_id, v_planner->>'coingecko_id', v_log.details->>'coingecko_id', v_log.details->>'coinId');
    IF v_id IS NULL OR v_coin IS NULL THEN RAISE EXCEPTION 'Incomplete planner snapshot.'; END IF;
  ELSIF p_op = 'delete' AND p_entity IN ('buy_planner', 'sell_planner') THEN
    v_id := p_target;
    IF p_entity = 'buy_planner' THEN
      SELECT coingecko_id INTO v_coin FROM public.buy_planners WHERE id = v_id AND user_id = v_uid;
    ELSE
      SELECT coingecko_id INTO v_coin FROM public.sell_planners WHERE id = v_id AND user_id = v_uid;
    END IF;
    IF v_coin IS NULL THEN
      -- Lost delete responses are safe to repeat, but never delete a different row.
      IF EXISTS (SELECT 1 FROM public.audit_logs WHERE user_id = v_uid AND entity = p_entity
        AND action = 'deleted' AND details->>'planner_id' = v_id::text AND details->>'atomic_version' = '1') THEN
        RETURN jsonb_build_object('ok', true);
      END IF;
      RAISE EXCEPTION 'Planner not found.' USING ERRCODE = 'P0002';
    END IF;
  ELSE RAISE EXCEPTION 'Unsupported planner operation.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_coin, 0));

  IF p_op = 'delete' THEN
    IF v_entity = 'buy_planner' THEN
      SELECT to_jsonb(b), b.is_active INTO v_planner, v_active FROM public.buy_planners b
        WHERE id = v_id AND user_id = v_uid FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Planner changed. Reload and try again.'; END IF;
      -- Do not create repeated undo entries on retries of our own soft delete.
      IF NOT v_active AND EXISTS (SELECT 1 FROM public.audit_logs WHERE user_id = v_uid AND entity = v_entity
        AND action = 'deleted' AND details->>'planner_id' = v_id::text AND details->>'atomic_version' = '1'
        AND details->>'restored_at' IS NULL) THEN RETURN jsonb_build_object('ok', true); END IF;
      UPDATE public.buy_planners SET is_active = false WHERE id = v_id AND user_id = v_uid;
      v_details := jsonb_build_object('delete_mode', 'soft');
    ELSE
      SELECT to_jsonb(s), s.is_active INTO v_planner, v_active FROM public.sell_planners s
        WHERE id = v_id AND user_id = v_uid FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Planner changed. Reload and try again.'; END IF;
      SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY level), '[]'::jsonb) INTO v_levels
        FROM public.sell_levels l WHERE user_id = v_uid AND sell_planner_id = v_id;
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', id)), '[]'::jsonb) INTO v_links
        FROM public.trades WHERE user_id = v_uid AND sell_planner_id = v_id;
      v_details := jsonb_build_object('delete_mode', 'hard', 'snapshot',
        jsonb_build_object('planner', v_planner, 'levels', v_levels, 'trade_links', v_links));
      -- FK unlinking belongs to this transaction and is included in the undo snapshot.
      UPDATE public.trades SET sell_planner_id = NULL WHERE user_id = v_uid AND sell_planner_id = v_id;
      DELETE FROM public.sell_levels WHERE user_id = v_uid AND sell_planner_id = v_id;
      DELETE FROM public.sell_planners WHERE id = v_id AND user_id = v_uid;
    END IF;
    INSERT INTO public.audit_logs(user_id, coingecko_id, entity, action, details)
      VALUES (v_uid, v_coin, v_entity, 'deleted', v_details || jsonb_build_object('planner_id', v_id,
        'planner_state', CASE WHEN v_active THEN 'active' ELSE 'frozen' END,
        'message', 'Planner deleted.', 'undo_available', true, 'atomic_version', 1));
  ELSE
    IF v_entity = 'buy_planner' OR v_planner IS NULL THEN
      -- Legacy soft-delete audit entries have no full snapshot.
      IF v_entity = 'buy_planner' THEN
        PERFORM 1 FROM public.buy_planners WHERE id = v_id AND user_id = v_uid AND coingecko_id = v_coin FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Planner not found.' USING ERRCODE = 'P0002'; END IF;
        IF EXISTS (SELECT 1 FROM public.buy_planners WHERE user_id = v_uid AND coingecko_id = v_coin AND is_active AND id <> v_id) THEN
          RAISE EXCEPTION 'This coin already has an active Buy planner.' USING ERRCODE = '23505';
        END IF;
        UPDATE public.buy_planners SET is_active = true WHERE id = v_id AND user_id = v_uid;
      ELSE
        PERFORM 1 FROM public.sell_planners WHERE id = v_id AND user_id = v_uid AND coingecko_id = v_coin FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Planner not found.' USING ERRCODE = 'P0002'; END IF;
        IF EXISTS (SELECT 1 FROM public.sell_planners WHERE user_id = v_uid AND coingecko_id = v_coin AND is_active AND id <> v_id) THEN
          RAISE EXCEPTION 'This coin already has an active Sell planner.' USING ERRCODE = '23505';
        END IF;
        UPDATE public.sell_planners SET is_active = true WHERE id = v_id AND user_id = v_uid;
      END IF;
    ELSE
      IF (v_planner->>'user_id')::uuid IS DISTINCT FROM v_uid OR v_planner->>'coingecko_id' IS DISTINCT FROM v_coin THEN
        RAISE EXCEPTION 'Invalid snapshot ownership.' USING ERRCODE = '42501';
      END IF;
      IF EXISTS (SELECT 1 FROM public.sell_planners WHERE id = v_id) THEN
        RAISE EXCEPTION 'This planner already exists.' USING ERRCODE = '23505';
      END IF;
      IF (v_planner->>'is_active')::boolean AND EXISTS (SELECT 1 FROM public.sell_planners
        WHERE user_id = v_uid AND coingecko_id = v_coin AND is_active) THEN
        RAISE EXCEPTION 'This coin already has an active Sell planner.' USING ERRCODE = '23505';
      END IF;
      INSERT INTO public.sell_planners SELECT * FROM jsonb_populate_record(NULL::public.sell_planners, v_planner);
      FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(v_snapshot->'levels', '[]'::jsonb)) LOOP
        IF (v_row->>'user_id')::uuid IS DISTINCT FROM v_uid OR v_row->>'coingecko_id' IS DISTINCT FROM v_coin
          OR (v_row->>'sell_planner_id')::uuid IS DISTINCT FROM v_id THEN
          RAISE EXCEPTION 'Invalid ladder snapshot ownership.' USING ERRCODE = '42501';
        END IF;
        INSERT INTO public.sell_levels SELECT * FROM jsonb_populate_record(NULL::public.sell_levels, v_row);
      END LOOP;
      FOR v_link IN SELECT value FROM jsonb_array_elements(coalesce(v_snapshot->'trade_links', '[]'::jsonb)) LOOP
        PERFORM 1 FROM public.trades WHERE id = (v_link->>'id')::uuid AND user_id = v_uid AND coingecko_id = v_coin FOR UPDATE;
        IF NOT FOUND THEN CONTINUE; END IF; -- A subsequently deleted trade is never recreated.
        IF EXISTS (SELECT 1 FROM public.trades WHERE id = (v_link->>'id')::uuid AND sell_planner_id IS NOT NULL) THEN
          RAISE EXCEPTION 'A trade is now linked to another planner. Restore cancelled.' USING ERRCODE = '23505';
        END IF;
        UPDATE public.trades SET sell_planner_id = v_id WHERE id = (v_link->>'id')::uuid AND user_id = v_uid;
      END LOOP;
    END IF;
    UPDATE public.audit_logs SET details = details || jsonb_build_object('restored_at', now()) WHERE id = p_target AND user_id = v_uid;
    INSERT INTO public.audit_logs(user_id, coingecko_id, entity, action, details)
      VALUES (v_uid, v_coin, v_entity, 'restored', jsonb_build_object('planner_id', v_id, 'restored_from_log_id', p_target, 'atomic_version', 1));
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.ledgerone_planner_audit_v1(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ledgerone_planner_audit_v1(text, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
