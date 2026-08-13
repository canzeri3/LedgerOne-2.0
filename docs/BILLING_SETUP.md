# Stripe billing setup

The application uses Stripe Checkout for new subscriptions, Stripe Customer
Portal for changes and invoices, and Supabase as the local entitlement source.
Stripe webhook events are the authority that changes billed access.

## 1. Apply the database migration

Apply `db/migrations/20260812_stripe_billing_hardening.sql` to the same Supabase
project referenced by `NEXT_PUBLIC_SUPABASE_URL`.

If the repository is linked with the Supabase CLI:

```bash
supabase db push
```

Otherwise, paste the complete migration into the Supabase SQL editor and run it
once. It is idempotent.

Verify the RPC is exposed to the service role:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'process_stripe_subscription_event';
```

## 2. Reconcile legacy rows

Find billed rows that are not connected to Stripe:

```sql
select user_id, tier, status
from public.user_subscriptions
where status in ('active', 'trialing', 'past_due')
  and (stripe_customer_id is null or stripe_subscription_id is null);
```

For complimentary users, create an `admin_tier_overrides` record with the
appropriate tier, then reset the billing row to `tier = 'FREE'` and
`status = 'none'`. For real subscribers, populate the Stripe customer and
subscription IDs from the Stripe Dashboard. Do not leave a row billed and
active without both Stripe identifiers.

## 3. Configure environment variables

Set these independently in development, staging, and production:

```dotenv
STRIPE_SECRET_KEY=sk_test_or_live_value
STRIPE_WEBHOOK_SECRET=whsec_value_for_this_endpoint
STRIPE_PRICE_STANDARD=price_value
STRIPE_PRICE_DIVERSIFIED=price_value
STRIPE_PRICE_ULTIMATE=price_value
NEXT_PUBLIC_SITE_URL=https://canonical-app-domain.example
SUPABASE_SERVICE_ROLE_KEY=service_role_value
CRON_SECRET=random_secret_value
```

Test and live Stripe objects are separate. Never combine a live secret key with
sandbox prices or a sandbox webhook secret.

Vercel Preview deployments can use sandbox keys. The Production environment
fails closed unless it has a recognized `sk_live_...` key.

## 4. Configure Customer Portal

In Stripe's sandbox Customer Portal settings, enable:

- Payment-method updates
- Invoice history
- Subscription cancellation
- Plan switching between the Standard, Diversified, and Ultimate prices

Set the return URL to `https://YOUR_DOMAIN/settings`. Repeat the configuration
in live mode before launch.

## 5. Test webhooks locally

Run the app and Stripe CLI in separate terminals:

```bash
npm run dev
```

```bash
stripe listen \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted \
  --forward-to localhost:3000/api/billing/webhook
```

Replace local `STRIPE_WEBHOOK_SECRET` with the temporary `whsec_...` printed by
the CLI, then restart the application.

Complete a Checkout with Stripe's successful test card `4242 4242 4242 4242`,
any future expiry, and any CVC. Confirm that `user_subscriptions` receives the
customer ID, subscription ID, price ID, tier, status, and renewal date.

## 6. Register deployed webhook endpoints

In Stripe Workbench, register this HTTPS destination:

```text
https://YOUR_DOMAIN/api/billing/webhook
```

Subscribe only to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy that endpoint's signing secret into the matching deployment environment.
The Stripe CLI signing secret is not the deployed endpoint secret.

## 7. Verify the complete lifecycle

In sandbox mode, verify:

1. A new subscription activates the selected tier.
2. Repeated Checkout clicks do not create a second subscription.
3. Portal upgrades and downgrades change the entitlement.
4. Cancellation-at-period-end is shown with the real access end date.
5. Final cancellation returns the billed tier to Free.
6. Payment-method and invoice controls open the Customer Portal.
7. Stripe Workbench shows HTTP 200 for successful webhook deliveries.

The scheduled `/api/billing/reconcile` job runs daily through Vercel. It repairs
mapped subscription drift and returns HTTP 500 when it detects missing mappings,
duplicate subscriptions, unknown prices, or identity mismatches. Monitor those
failures in Vercel logs.
