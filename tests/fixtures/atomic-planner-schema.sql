-- Local-only test schema, based on the connected project's read-only OpenAPI schema.
-- Real project triggers/RLS still require staging verification before rollout.
CREATE SCHEMA auth;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION public.ledgerone_can_use_planners() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('test.paid', true), 'true') <> 'false'
$$;
CREATE FUNCTION public.lg1_planned_assets_limit(p_user_id uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN coalesce(current_setting('test.paid', true), 'true') = 'false' THEN 0 ELSE 5 END
$$;
CREATE TYPE public.trade_side AS ENUM ('buy', 'sell');
CREATE TABLE public.buy_planners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  coingecko_id text NOT NULL, top_price numeric NOT NULL,
  ladder_depth integer NOT NULL DEFAULT 70, growth_pct numeric NOT NULL DEFAULT 25,
  budget_usd numeric NOT NULL DEFAULT 1000, total_budget numeric NOT NULL DEFAULT 1000,
  growth_per_level numeric, is_active boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz
);
CREATE UNIQUE INDEX buy_active ON public.buy_planners(user_id, coingecko_id) WHERE is_active;
CREATE TABLE public.sell_planners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  coingecko_id text NOT NULL, top_price numeric(18,8) NOT NULL DEFAULT 0,
  avg_lock_price numeric(18,8), is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), frozen_at timestamptz,
  step_pct integer, levels_count integer, sell_pct_of_remaining numeric(8,4), plan_tokens numeric(18,8)
);
CREATE UNIQUE INDEX sell_active ON public.sell_planners(user_id, coingecko_id) WHERE is_active;
CREATE TABLE public.sell_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  coingecko_id text NOT NULL, level integer NOT NULL, rise_pct numeric(8,4) NOT NULL,
  price numeric(18,8) NOT NULL CHECK(price > 0), sell_pct_of_remaining numeric(8,4) NOT NULL,
  sell_tokens numeric(18,8), created_at timestamptz NOT NULL DEFAULT now(), epoch_id uuid,
  sell_planner_id uuid REFERENCES public.sell_planners(id), UNIQUE(sell_planner_id, level)
);
CREATE TABLE public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  coingecko_id text NOT NULL, side public.trade_side NOT NULL,
  price numeric(18,8) NOT NULL CHECK(price > 0), quantity numeric(18,8) NOT NULL CHECK(quantity > 0), fee numeric(18,8),
  trade_time timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), client_request_id uuid,
  buy_planner_id uuid REFERENCES public.buy_planners(id), sell_planner_id uuid REFERENCES public.sell_planners(id) ON DELETE SET NULL
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, coingecko_id text,
  entity text NOT NULL, action text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.test_fail_level() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.fail', true) = 'level' AND NEW.level = 3 THEN
    RAISE EXCEPTION 'Injected level failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER test_level_failure BEFORE INSERT ON public.sell_levels FOR EACH ROW EXECUTE FUNCTION public.test_fail_level();
CREATE FUNCTION public.test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.fail', true) = 'audit' THEN RAISE EXCEPTION 'Injected audit failure'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER test_audit_failure BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.test_fail_audit();
