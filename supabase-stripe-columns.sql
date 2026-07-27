-- Run once in the Supabase SQL editor.
-- Adds the columns the Stripe webhook writes to. Safe/idempotent: only adds if missing.

-- If user_subscriptions doesn't exist yet, create a minimal version.
create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'FREE',
  status text not null default 'none',
  created_at timestamptz not null default now()
);

alter table public.user_subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists updated_at timestamptz not null default now();

-- Webhook resolves a user from the Stripe customer id — index it.
create index if not exists user_subscriptions_stripe_customer_id_idx
  on public.user_subscriptions (stripe_customer_id);

-- RLS: users may read their own subscription row (the webhook uses the service
-- role and bypasses RLS). Adjust if your project already has policies here.
alter table public.user_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_subscriptions'
      and policyname = 'read own subscription'
  ) then
    create policy "read own subscription"
      on public.user_subscriptions
      for select
      using (auth.uid() = user_id);
  end if;
end$$;
