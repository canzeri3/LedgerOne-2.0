# Atomic planner workflows — deployment gate

## Status

As of 2026-09-01, the migration is installed on the `LedgerOne-2.0` Supabase
project and the Vercel flag is configured as `true` for production, preview, and
development. The live-schema dry run and the rollback-only production smoke test
passed; the smoke test persisted zero test rows. The application behavior changes
only in builds created after the flag was enabled.

## What changes when enabled

- A planner-linked buy and its existing Sell ladder rebuild share one transaction.
  A ladder failure rolls back the new trade. The existing immutable trade UUID
  still makes a retry safe after a lost response. Ledger-only trades do not touch planners.
- Manual Sell generation/replacement is one transaction, including creation of a
  missing Sell planner. A failed insertion leaves the previous ladder untouched.
- Planner delete/restore, associated ladder rows, trade-link snapshots, and audit
  entries commit together. Restore cannot silently overwrite a newer active plan.
- Browser completion callbacks and planner events only refresh cached views;
  they do not run a second ladder replacement after an atomic trade save.
- When enabled, a missing/failed RPC never falls back to a multi-request write.

The existing `rotate_buy_sell_planners` RPC is already one database request and
has not been replaced. Single-row operations and other entry points (CSV/import,
old open browser tabs) are not converted by this migration. No existing triggers,
RLS policies, table privileges, or functions are removed/replaced by it.

## Verify against the real schema first

The local tests execute actual PostgreSQL/PL/pgSQL in PGlite against a schema
fixture based on read-only OpenAPI metadata. They intentionally fail ladder and
audit writes and compare all rows before/after. They do **not** recreate every
deployed trigger, foreign-key action, or concurrent connection.

Before enabling, use a staging clone of the real schema and inspect the deployed
trade/planner/audit triggers, foreign keys, policies and
`lg1_planned_assets_limit(uuid)` definition. This is the same authoritative
entitlement function used by the live planner-cap triggers, including admin
tier overrides. In particular, verify that existing
trade triggers do not independently alter the ladder shape or unexpectedly react
to undo restoring a trade's planner association. The new functions explicitly
bind ownership to `auth.uid()` and call the existing planner-entitlement check;
they must be installed by the trusted database owner, not a customer role.

Useful read-only SQL for that review:

```sql
select pg_get_functiondef('public.lg1_planned_assets_limit(uuid)'::regprocedure);
select pg_get_functiondef('public.rotate_buy_sell_planners(text,numeric,numeric,integer,numeric)'::regprocedure);
select c.relname, t.tgname, pg_get_triggerdef(t.oid), pg_get_functiondef(t.tgfoid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
  and c.relname in ('trades','buy_planners','sell_planners','sell_levels','audit_logs');
select conrelid::regclass, conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.trades'::regclass,'public.sell_planners'::regclass,
  'public.sell_levels'::regclass,'public.buy_planners'::regclass);
```

## Install and enable

1. Back up the database and finish the staging checks. Obtain approval before
   applying any migration to production. The current project did not expose a
   restorable physical backup/PITR at rollout time, so the additive, no-row-write
   migration was dry-run in a transaction and exact row-count baselines were
   checked before and after installation.
2. In the correct Supabase project's SQL Editor, run the **complete** contents of
   `db/migrations/20260830_atomic_planner_workflows.sql`. It is additive and wrapped
   in `BEGIN`/`COMMIT`. Do not run only a fragment. Do not blindly use `db push`:
   this repository's historical migrations may not match the deployed history.
3. Verify the three public entry points exist and are executable only by
   authenticated users (not anon/public); the internal helper must not be callable
   by either anon or authenticated. The migration reloads PostgREST's schema cache.
4. On staging, set `NEXT_PUBLIC_ATOMIC_PLANNER_WORKFLOWS=true`, then rebuild/restart
   the app. Test with dedicated free and paid test accounts, not real trades.
5. Verify generation, buy/sell entry, free ledger-only entry, delete/undo, token
   totals, old frozen planners and linked trades. Repeat a request after dropping
   its response; the trade must not duplicate. With two separate connections/tabs,
   test concurrent generation/trades and rotation/delete conflicts.
6. After acceptance, apply the migration to production with approval, set the same
   flag in the deployment environment, and rebuild/deploy. Refresh old browser tabs
   so they no longer run the legacy client replacement logic.

If the flag is enabled before the migration, affected actions intentionally fail
without falling back to unsafe writes. Revert the flag and rebuild only as an
explicit rollback decision; that restores the old behavior and its known risk.
The additive functions can remain installed during a code rollback.

## Local verification

```bash
npm ci
npm test -- --runTestsByPath tests/atomic-planner-database.test.cjs tests/atomic-planner-adapters.test.cjs tests/planner-draft-handlers.test.cjs tests/trade-save-handlers.test.cjs tests/trade-save.test.cjs
npx tsc --noEmit
```

The rollback-only live smoke script is
`tests/fixtures/live-atomic-smoke.sql`. It creates a temporary coin, exercises
paid and free paths plus injected write failures, rolls the transaction back,
and verifies that no test coin remains.

Transaction behavior reference: [PostgREST transaction rollback](https://postgrest.org/en/stable/references/transactions.html).
Test database: [PGlite](https://pglite.dev/docs/about).
