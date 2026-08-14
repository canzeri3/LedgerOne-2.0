-- Stripe billing state and atomic webhook processing.
-- Safe to run more than once.

create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'FREE',
  status text not null default 'none',
  created_at timestamptz not null default now()
);

alter table public.user_subscriptions
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists stripe_last_event_created_at timestamptz;

drop index if exists public.user_subscriptions_stripe_customer_id_idx;

create unique index if not exists user_subscriptions_stripe_customer_id_uidx
  on public.user_subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists user_subscriptions_stripe_subscription_id_uidx
  on public.user_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.user_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_subscriptions'
      and policyname = 'read own subscription'
  ) then
    create policy "read own subscription"
      on public.user_subscriptions
      for select
      using (auth.uid() = user_id);
  end if;
end
$$;

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_object_id text,
  livemode boolean not null,
  stripe_created_at timestamptz not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

-- Inserts the event receipt and applies its subscription snapshot in one DB
-- transaction. A duplicate event returns false. State from an event older than
-- the most recently applied event is recorded but cannot overwrite newer state.
create or replace function public.process_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_livemode boolean,
  p_user_id uuid,
  p_tier text,
  p_status text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.stripe_webhook_events (
    event_id,
    event_type,
    stripe_object_id,
    livemode,
    stripe_created_at
  ) values (
    p_event_id,
    p_event_type,
    p_stripe_subscription_id,
    p_livemode,
    p_event_created_at
  )
  on conflict (event_id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return false;
  end if;

  insert into public.user_subscriptions (
    user_id,
    tier,
    status,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    current_period_end,
    cancel_at_period_end,
    stripe_last_event_created_at,
    updated_at
  ) values (
    p_user_id,
    p_tier,
    p_status,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_price_id,
    p_current_period_end,
    p_cancel_at_period_end,
    p_event_created_at,
    now()
  )
  on conflict (user_id) do update set
    tier = excluded.tier,
    status = excluded.status,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id = excluded.stripe_price_id,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_last_event_created_at = excluded.stripe_last_event_created_at,
    updated_at = now()
  where public.user_subscriptions.stripe_last_event_created_at is null
     or public.user_subscriptions.stripe_last_event_created_at <= excluded.stripe_last_event_created_at;

  return true;
end;
$$;

revoke all on table public.stripe_webhook_events from public, anon, authenticated;
revoke all on function public.process_stripe_subscription_event(
  text, text, timestamptz, boolean, uuid, text, text, text, text, text, timestamptz, boolean
) from public, anon, authenticated;

grant execute on function public.process_stripe_subscription_event(
  text, text, timestamptz, boolean, uuid, text, text, text, text, text, timestamptz, boolean
) to service_role;

comment on function public.process_stripe_subscription_event is
  'Atomically deduplicates a Stripe event and updates the user subscription snapshot.';
