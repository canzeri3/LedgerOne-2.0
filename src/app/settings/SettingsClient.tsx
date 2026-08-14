'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  User as UserIcon,
  Palette,
  Bell,
  ShieldCheck,
  Info,
  LogOut,
  ArrowUpRight,
  CreditCard,
  Sparkles,
  CheckCircle2,
  X as XIcon,
} from 'lucide-react'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'
import { useDisplayCurrency } from '@/lib/displayCurrency'
import type { DisplayCurrency } from '@/lib/format'
import { useEntitlements } from '@/lib/useEntitlements'
import { plannedLimitForTier, type Tier, type SubscriptionStatus } from '@/lib/entitlements'
import { startCheckout, openBillingPortal } from '@/lib/billing/checkout'
import { isCheckoutTier } from '@/lib/billing/plans'

const APP_VERSION = '0.1.0'

/* Plan display metadata — mirrors the public pricing tiers. */
const PLAN_META: Record<Tier, { name: string; price: string; period: string; tier: string }> = {
  FREE: { name: 'LedgerOne Tracker', price: 'Free', period: '', tier: 'Tier 0' },
  PLANNER: { name: 'LedgerOne Standard', price: '$14.99', period: '/mo', tier: 'Tier 1' },
  PORTFOLIO: { name: 'LedgerOne Diversified', price: '$29.99', period: '/mo', tier: 'Tier 2' },
  DISCIPLINED: { name: 'LedgerOne Ultimate', price: '$45.00', period: '/mo', tier: 'Tier 3' },
  ADVISORY: { name: 'LedgerOne Advisory', price: 'Custom', period: '', tier: 'Tier 4' },
}

const STATUS_META: Record<SubscriptionStatus, { label: string; cls: string }> = {
  none: { label: 'Free plan', cls: '' },
  active: { label: 'Active', cls: 'st-pill-ok' },
  trialing: { label: 'Trial', cls: 'st-pill-ok' },
  inactive: { label: 'Inactive', cls: '' },
  canceled: { label: 'Canceled', cls: 'st-pill-warn' },
  past_due: { label: 'Past due', cls: 'st-pill-danger' },
}

type Channel = 'none' | 'email' | 'sms'

type PrefRow = {
  user_id: string
  channel: Channel
  email: string | null
  phone_e164: string | null
  updated_at: string | null
}

/* ── Small building blocks ────────────────────────────────────────────── */

function Section({
  icon, title, desc, children,
}: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="st-section">
      <div className="st-section-head">
        <span className="st-section-ic">{icon}</span>
        <div>
          <div className="st-section-title">{title}</div>
          <div className="st-section-desc">{desc}</div>
        </div>
      </div>
      <div className="st-card">{children}</div>
    </section>
  )
}

function Row({
  title, desc, action,
}: { title: string; desc: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="st-row">
      <div className="st-row-main">
        <div className="st-row-title">{title}</div>
        <div className="st-row-desc">{desc}</div>
      </div>
      {action && <div className="st-row-action">{action}</div>}
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function SettingsClient() {
  const { user, loading } = useUser()
  const router = useRouter()
  const { code, setCode } = useDisplayCurrency()
  const { entitlements, loading: entLoading, mutate: mutateEntitlements } = useEntitlements(user?.id)

  const email = useMemo(() => String(user?.email ?? '').trim(), [user?.email])
  const initial = (email ? email[0] : 'L').toUpperCase()

  /* Notifications */
  const [channel, setChannel] = useState<Channel>('none')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ msg: string; err?: boolean } | null>(null)

  useEffect(() => {
    let mounted = true
    async function run() {
      if (!user?.id) return
      const { data, error } = await supabaseBrowser
        .from('notification_prefs')
        .select('user_id,channel,email,phone_e164,updated_at')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!mounted || error) return
      const row = (data ?? null) as PrefRow | null
      setChannel((row?.channel as Channel) || 'none')
      setPhone(String(row?.phone_e164 ?? ''))
    }
    run()
    return () => { mounted = false }
  }, [user?.id])

  const validatePhone = (v: string) => {
    const s = v.trim()
    if (!s) return true
    return /^\+\d{8,15}$/.test(s)
  }

  const onSaveNotifications = async () => {
    if (!user?.id) return
    setStatus(null)
    if (channel === 'sms' && !validatePhone(phone)) {
      setStatus({ msg: 'Phone must be E.164 format (e.g. +15145551234).', err: true })
      return
    }
    setSaving(true)
    try {
      const payload: PrefRow = {
        user_id: user.id,
        channel,
        email: email || null,
        phone_e164: channel === 'sms' ? (phone.trim() || null) : null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabaseBrowser
        .from('notification_prefs')
        .upsert(payload, { onConflict: 'user_id' })
      if (error) { setStatus({ msg: error.message, err: true }); return }
      setStatus({ msg: 'Preferences saved.' })
      window.setTimeout(() => setStatus(null), 1800)
    } finally {
      setSaving(false)
    }
  }

  const [signingOut, setSigningOut] = useState(false)
  const onSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await supabaseBrowser.auth.signOut()
      router.replace('/')
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  /* Section navigation */
  type SectionId = 'account' | 'billing' | 'display' | 'notifications' | 'data' | 'about'
  const [active, setActive] = useState<SectionId>('account')
  const NAV: { id: SectionId; label: string; icon: React.ReactNode }[] = [
    { id: 'account', label: 'Account', icon: <UserIcon className="h-[18px] w-[18px]" /> },
    { id: 'billing', label: 'Billing & plan', icon: <CreditCard className="h-[18px] w-[18px]" /> },
    { id: 'display', label: 'Display', icon: <Palette className="h-[18px] w-[18px]" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="h-[18px] w-[18px]" /> },
    { id: 'data', label: 'Data & security', icon: <ShieldCheck className="h-[18px] w-[18px]" /> },
    { id: 'about', label: 'About', icon: <Info className="h-[18px] w-[18px]" /> },
  ]

  /* Derived billing view */
  const tier: Tier = entitlements?.tier ?? 'FREE'
  const subStatus: SubscriptionStatus = entitlements?.status ?? 'none'
  const plan = PLAN_META[tier]
  const statusMeta = STATUS_META[subStatus]
  const hasPaidAccess = tier !== 'FREE'
  const hasBillingAccount = Boolean(entitlements?.hasBillingAccount)
  const displayedStatusMeta = !hasBillingAccount && hasPaidAccess
    ? { label: 'Complimentary', cls: 'st-pill-ok' }
    : statusMeta
  const usedAssets = entitlements?.plannedAssetsUsed ?? 0
  // null = unlimited; fall back to the tier's limit when entitlements haven't loaded
  const limitAssets = entitlements ? entitlements.plannedAssetsLimit : plannedLimitForTier(tier)
  const usagePct = limitAssets && limitAssets > 0 ? Math.min(100, Math.round((usedAssets / limitAssets) * 100)) : 0
  const renewalDate = entitlements?.currentPeriodEnd
    ? new Date(entitlements.currentPeriodEnd).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null

  const [billingBusy, setBillingBusy] = useState<'checkout' | 'portal' | null>(null)
  const [billingErr, setBillingErr] = useState<string>('')
  const onPortal = async () => {
    if (billingBusy) return
    setBillingBusy('portal')
    setBillingErr('')
    try {
      await openBillingPortal()
    } catch (e: any) {
      setBillingErr(e?.message || 'Could not open the billing portal.')
      setBillingBusy(null)
    }
  }
  const onCheckout = async () => {
    if (billingBusy) return
    // Only paid tiers are checkout-able; "Upgrade" from FREE routes to /pricing to choose one.
    if (!isCheckoutTier(tier)) {
      router.push('/pricing')
      return
    }
    setBillingBusy('checkout')
    setBillingErr('')
    try {
      await startCheckout(tier)
    } catch (e: any) {
      setBillingErr(e?.message || 'Could not start checkout.')
      setBillingBusy(null)
    }
  }

  // Post-checkout: Stripe redirects back to /settings?billing=success.
  const [toast, setToast] = useState<string>('')
  const [checkoutPending, setCheckoutPending] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const billingResult = params.get('billing')
    if (billingResult !== 'success' && billingResult !== 'trial') return

    setActive('billing')
    setCheckoutPending(true)
    setToast(
      billingResult === 'trial'
        ? 'Your 7-day trial has started — activating your plan…'
        : 'Payment received — activating your plan…'
    )

    // The webhook may land a beat after the redirect; refresh entitlements a few times.
    void mutateEntitlements?.()
    const timers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => void mutateEntitlements?.(), 1500),
      setTimeout(() => void mutateEntitlements?.(), 4000),
      setTimeout(() => void mutateEntitlements?.(), 8000),
    ]

    // Strip the param so a refresh doesn't re-trigger the toast.
    const url = new URL(window.location.href)
    url.searchParams.delete('billing')
    window.history.replaceState({}, '', url.toString())

    return () => timers.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    if (!checkoutPending) return
    if (subStatus !== 'active' && subStatus !== 'trialing') return
    setCheckoutPending(false)
    setToast('Payment complete — your plan is now active.')
    const timer = setTimeout(() => setToast(''), 7000)
    return () => clearTimeout(timer)
  }, [checkoutPending, subStatus])

  useEffect(() => {
    if (!checkoutPending) return
    const timer = setTimeout(
      () => setToast('Payment received. Activation is taking longer than expected — please refresh shortly.'),
      12000
    )
    return () => clearTimeout(timer)
  }, [checkoutPending])

  // Deep-link to a section via /settings?section=<id> (e.g. header "Manage Communications").
  useEffect(() => {
    if (typeof window === 'undefined') return
    const requested = new URLSearchParams(window.location.search).get('section')
    if (!requested) return

    const valid: SectionId[] = ['account', 'billing', 'display', 'notifications', 'data', 'about']
    if ((valid as string[]).includes(requested)) {
      setActive(requested as SectionId)
    }
  }, [])

  return (
    <>
      {toast && (
        <div className="st-toast" role="status" aria-live="polite">
          <span className="st-toast-ic" aria-hidden="true">
            <CheckCircle2 className="h-[18px] w-[18px]" />
          </span>
          <span>{toast}</span>
          <button type="button" className="st-toast-x" aria-label="Dismiss" onClick={() => setToast('')}>
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="st-head">
        <div className="st-aurora" aria-hidden="true" />
        <div className="st-head-inner">
          <span className="st-eyebrow">LedgerOne · Workspace</span>
          <h1 className="st-title">Settings</h1>
          <p className="st-sub">
            Your account, how the app looks, how you&apos;re alerted, and where your data lives.
          </p>
        </div>
      </header>

      <div className="st-layout">
        {/* Section nav */}
        <nav className="st-nav" aria-label="Settings sections">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`st-nav-item${active === n.id ? ' active' : ''}`}
              aria-current={active === n.id ? 'page' : undefined}
              onClick={() => setActive(n.id)}
            >
              <span className="st-nav-ic">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        {/* Content panel */}
        <div className="st-panel">
      {/* Account */}
      {active === 'account' && (
      <Section icon={<UserIcon className="h-4 w-4" />} title="Account" desc="The identity signed in to this workspace.">
        <Row
          title="Signed in as"
          desc="Alerts and your account email use this address."
          action={
            <div className="st-identity">
              <div className="st-avatar">{initial}</div>
              <div>
                <div className="st-identity-name">{loading ? '…' : (email || 'Not signed in')}</div>
                <div className="st-identity-sub">Personal workspace</div>
              </div>
            </div>
          }
        />
        <Row
          title="Session"
          desc="Sign out of LedgerOne on this device."
          action={
            <button type="button" className="st-btn st-btn-danger" onClick={onSignOut} disabled={signingOut || !user}>
              <LogOut className="h-3.5 w-3.5" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          }
        />
      </Section>
      )}

      {/* Billing & plan */}
      {active === 'billing' && (
      <>
      <Section icon={<CreditCard className="h-4 w-4" />} title="Plan" desc="Your current subscription and what it unlocks.">
        <div className="st-plan">
          <div className="st-plan-main">
            <div className="st-plan-badge">{plan.tier}</div>
            <div className="st-plan-name">{entLoading ? '…' : plan.name}</div>
            <div className="st-plan-price">
              {plan.price}
              {plan.period && <span className="st-plan-period">{plan.period}</span>}
            </div>
          </div>
          <div className="st-plan-side">
            <span className={`st-pill ${displayedStatusMeta.cls}`}>{entLoading ? '…' : displayedStatusMeta.label}</span>
            {hasBillingAccount ? (
              <button type="button" className="st-btn st-btn-ghost" onClick={onPortal} disabled={billingBusy !== null}>
                {billingBusy === 'portal' ? 'Opening…' : 'Change plan'} <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <Link href="/pricing" className="st-btn st-btn-primary"><Sparkles className="h-3.5 w-3.5" /> Upgrade</Link>
            )}
          </div>
        </div>
        {billingErr && (
          <div className="st-note" style={{ color: 'var(--st-danger)' }}>{billingErr}</div>
        )}

        <Row
          title="Planned assets"
          desc={
            limitAssets === null
              ? 'Unlimited planners on your current plan.'
              : hasPaidAccess
                ? `You can build planners for up to ${limitAssets} assets on this plan.`
                : 'Planners are locked on the free plan. Upgrade to build Buy & Sell ladders.'
          }
          action={
            <div className="st-usage">
              <div className="st-usage-nums">
                <span className="st-usage-used">{entLoading ? '…' : usedAssets}</span>
                <span className="st-usage-sep">/</span>
                <span>{limitAssets === null ? '∞' : limitAssets}</span>
              </div>
              {limitAssets !== null && limitAssets > 0 && (
                <div className="st-usage-track"><div className="st-usage-fill" style={{ width: `${usagePct}%` }} /></div>
              )}
            </div>
          }
        />
      </Section>

      <Section icon={<CreditCard className="h-4 w-4" />} title="Billing" desc="Payment method, renewal, and invoices.">
        <Row
          title="Payment method"
          desc={hasBillingAccount ? 'The payment method on file for your Stripe subscription.' : 'No Stripe payment method is connected to this account.'}
          action={
            hasBillingAccount
              ? <button type="button" className="st-btn st-btn-ghost" onClick={onPortal} disabled={billingBusy !== null}>{billingBusy === 'portal' ? 'Opening…' : 'Manage billing'} <ArrowUpRight className="h-3.5 w-3.5" /></button>
              : <span className="st-pill">None on file</span>
          }
        />
        <Row
          title={hasBillingAccount ? 'Next renewal' : 'Billing status'}
          desc={
            hasBillingAccount
              ? entitlements?.cancelAtPeriodEnd
                ? <span className="st-billing-cancel-warning">Your subscription is scheduled to cancel at the end of this billing period.</span>
                : 'Your subscription renews automatically until canceled.'
              : hasPaidAccess
                ? 'Your access is complimentary and is not billed through Stripe.'
                : 'You’re on the free plan — nothing to bill.'
          }
          action={
            <span className={`st-pill st-pill-mono${entitlements?.cancelAtPeriodEnd ? ' st-pill-warn' : ''}`}>
              {renewalDate
                ? `${entitlements?.cancelAtPeriodEnd ? 'Access until' : 'Renews'} ${renewalDate}`
                : hasBillingAccount
                  ? 'Date unavailable'
                  : 'Not billed'}
            </span>
          }
        />
        <Row
          title="Invoices & receipts"
          desc="Download past invoices and manage your billing details."
          action={
            hasBillingAccount
              ? <button type="button" className="st-btn st-btn-ghost" onClick={onPortal} disabled={billingBusy !== null}>{billingBusy === 'portal' ? 'Opening…' : 'Open billing portal'} <ArrowUpRight className="h-3.5 w-3.5" /></button>
              : <span className="st-pill st-pill-mono">No invoices yet</span>
          }
        />
        <div className="st-note">
          Billing is handled securely through our payment provider. LedgerOne never stores your full card number.
        </div>
      </Section>
      </>
      )}

      {/* Display */}
      {active === 'display' && (
      <Section icon={<Palette className="h-4 w-4" />} title="Display" desc="How values and the interface are presented.">
        <Row
          title="Display currency"
          desc="Portfolio values and P&L are shown in this currency, converted from USD at the latest rate."
          action={
            <select
              className="st-select"
              value={code}
              onChange={(e) => setCode(e.target.value as DisplayCurrency)}
              aria-label="Display currency"
            >
              <option value="USD">USD — US Dollar</option>
              <option value="CAD">CAD — Canadian Dollar</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          }
        />
        <Row
          title="Theme"
          desc="A high-contrast dark interface tuned for long sessions."
          action={<span className="st-pill">Dark · always on</span>}
        />
        <Row
          title="Time zone"
          desc="Trade, alert, and activity times follow your device."
          action={<span className="st-pill">Local browser time</span>}
        />
      </Section>
      )}

      {/* Notifications */}
      {active === 'notifications' && (
      <Section icon={<Bell className="h-4 w-4" />} title="Notifications" desc="Get a heads-up the moment an alert becomes active.">
        <Row
          title="Alert delivery"
          desc="Send a short message when a buy, sell, or new-cycle alert fires. You still open the app for full context."
          action={
            <select
              className="st-select"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
              aria-label="Alert delivery channel"
            >
              <option value="none">Off</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          }
        />
        {channel !== 'none' && (
          <Row
            title="Destination"
            desc={channel === 'email' ? 'Delivered to your account email.' : 'Enter a phone number in E.164 format.'}
            action={
              channel === 'email'
                ? <span className="st-pill st-pill-mono">{email || 'No email on file'}</span>
                : <input className="st-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15145551234" inputMode="tel" />
            }
          />
        )}
        <div className="st-note" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button type="button" className="st-btn st-btn-primary" onClick={onSaveNotifications} disabled={saving || loading || !user}>
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
          {status && <span className={`st-status ${status.err ? 'st-status-err' : ''}`}>{status.msg}</span>}
          <span style={{ marginLeft: 'auto' }}>Example messages: <code>BTC trigger</code> · <code>BTC new cycle</code></span>
        </div>
      </Section>
      )}

      {/* Data & security */}
      {active === 'data' && (
      <Section icon={<ShieldCheck className="h-4 w-4" />} title="Data &amp; security" desc="Where your records are kept and how you review them.">
        <Row
          title="Storage"
          desc="Trades, planners, and risk settings are stored securely for your account."
          action={<span className="st-pill st-pill-ok">Encrypted at rest</span>}
        />
        <Row
          title="Trade entry"
          desc="Exchange API connections aren’t enabled — trades are added manually or via CSV import."
          action={<span className="st-pill">Manual + CSV</span>}
        />
        <Row
          title="Activity log"
          desc="Every trade and planner action is recorded and exportable for a full audit trail."
          action={<Link href="/audit" className="st-btn st-btn-ghost">Open audit log <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
        />
      </Section>
      )}

      {/* About */}
      {active === 'about' && (
      <Section icon={<Info className="h-4 w-4" />} title="About" desc="Guides, version, and the legal basics.">
        <Row
          title="How to use LedgerOne"
          desc="The full workflow — from your first Buy Planner to reading alerts."
          action={<Link href="/how-to" className="st-btn st-btn-ghost">Open guide <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
        />
        <Row
          title="Support"
          desc="Questions or feedback? Reach the LedgerOne team."
          action={<a href="mailto:support@ledgerone.app" className="st-btn st-btn-ghost">Email support <ArrowUpRight className="h-3.5 w-3.5" /></a>}
        />
      </Section>
      )}
        </div>
      </div>

      {/* Footer meta */}
      <div className="st-foot">
        <span>LedgerOne · build {APP_VERSION}</span>
        <span className="st-foot-links">
          <Link href="/how-to">Terms</Link>
          <Link href="/how-to">Privacy</Link>
        </span>
      </div>
    </>
  )
}
