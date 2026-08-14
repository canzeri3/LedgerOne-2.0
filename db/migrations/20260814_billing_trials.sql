-- One-time billing trial tracking and atomic Stripe event processing v2.
-- Apply before deploying code that calls process_stripe_subscription_event_v2.

alter table public.user_subscriptions
  add column if not exists trial_used_at timestamptz;

-- Conservatively treat an existing trialing row as having consumed its trial.
update public.user_subscriptions
set trial_used_at = coalesce(trial_used_at, created_at, now())
where status = 'trialing'
  and trial_used_at is null;

create or replace function public.process_stripe_subscription_event_v2(
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
  p_cancel_at_period_end boolean,
  p_trial_used boolean
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
    trial_used_at,
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
    case when p_trial_used then p_event_created_at else null end,
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
    trial_used_at = coalesce(
      public.user_subscriptions.trial_used_at,
      excluded.trial_used_at
    ),
    updated_at = now()
  where public.user_subscriptions.stripe_last_event_created_at is null
     or public.user_subscriptions.stripe_last_event_created_at <= excluded.stripe_last_event_created_at;

  -- Trial use is permanent and must not be lost when Stripe delivers an older
  -- event after a newer subscription snapshot has already been stored.
  if p_trial_used then
    update public.user_subscriptions
    set trial_used_at = coalesce(trial_used_at, p_event_created_at)
    where user_id = p_user_id;
  end if;

  return true;
end;
$$;

revoke all on function public.process_stripe_subscription_event_v2(
  text, text, timestamptz, boolean, uuid, text, text, text, text, text, timestamptz, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.process_stripe_subscription_event_v2(
  text, text, timestamptz, boolean, uuid, text, text, text, text, text, timestamptz, boolean, boolean
) to service_role;

comment on function public.process_stripe_subscription_event_v2 is
  'Atomically deduplicates a Stripe event, updates subscription state, and permanently records trial use.';
