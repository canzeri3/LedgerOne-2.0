'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, HelpCircle, Info, FlaskConical } from 'lucide-react'
import { useUser } from '@/lib/useUser'
import { supabaseBrowser } from '@/lib/supabaseClient'

type TabId = 'general' | 'notifications' | 'accounts' | 'about' | 'help' | 'experimental'

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'about', label: 'About' },
  { id: 'help', label: 'Help' },
  { id: 'experimental', label: 'Experimental features' },
]

const APP_VERSION = '0.1.0'
const APP_NAME = 'LedgerOne'

type Channel = 'none' | 'email' | 'sms'

type PrefRow = {
  user_id: string
  channel: Channel
  email: string | null
  phone_e164: string | null
  updated_at: string | null
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('general')

  return (
    <div className="space-y-6" data-settings-page>
      {/* Page heading */}
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Configure how LedgerOne works for you. These preferences apply to
          your current workspace.
        </p>
      </div>

      {/* Main card container */}
      <div className="rounded-2xl border border-white/5 bg-[rgb(24,25,26)] shadow-sm">
        {/* Tabs header */}
        <div className="border-b border-white/5 px-4 pt-3 sm:px-6">
          <nav className="flex flex-wrap gap-4 text-sm">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    'relative pb-3',
                    'transition-colors',
                    isActive
                      ? 'text-slate-50'
                      : 'text-slate-400 hover:text-slate-200',
                  ].join(' ')}
                >
                  {tab.label}
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[rgb(167,139,250)]" />
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Tab content */}
        <div className="divide-y divide-white/5">
          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'accounts' && <AccountsTab />}
          {activeTab === 'about' && <AboutTab />}
          {activeTab === 'help' && <HelpTab />}
          {activeTab === 'experimental' && <ExperimentalTab />}
        </div>
      </div>
    </div>
  )
}

/* ───────────────── Tabs ───────────────── */

function Row(props: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  const { title, description, action } = props
  return (
    <div className="flex flex-col items-start justify-between gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
      <div>
        <div className="text-sm font-medium text-slate-50">{title}</div>
        <div className="mt-1 text-xs text-slate-400">{description}</div>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}

function Pill(props: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-100">
      {props.label}
    </span>
  )
}

function SubtleButton(props: {
  children: React.ReactNode
  href?: string
  external?: boolean
}) {
  const { children, href, external } = props
  const baseClasses =
    'inline-flex items-center rounded-md border border-white/10 bg-[rgb(32,33,36)] px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-white/5 hover:border-white/25 transition-colors'

  if (!href) {
    return (
      <button className={baseClasses} type="button">
        {children}
      </button>
    )
  }

  if (external) {
    return (
      <Link
        href={href}
        target="_blank"
        rel="noreferrer"
        className={baseClasses}
      >
        {children}
        <ExternalLink className="ml-1 h-3 w-3" />
      </Link>
    )
  }

  return (
    <Link href={href} className={baseClasses}>
      {children}
    </Link>
  )
}

function Select(props: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="h-9 rounded-md border border-white/10 bg-[rgb(32,33,36)] px-3 text-xs font-medium text-slate-100 hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-[rgb(167,139,250)]/35"
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function TextInput(props: {
  value: string
  placeholder?: string
  onChange: (v: string) => void
}) {
  return (
    <input
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      className="h-9 w-[240px] rounded-md border border-white/10 bg-[rgb(32,33,36)] px-3 text-xs font-medium text-slate-100 placeholder:text-slate-500 hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-[rgb(167,139,250)]/35"
    />
  )
}

function InlineNote(props: { children: React.ReactNode }) {
  return <div className="text-xs text-slate-400">{props.children}</div>
}

/* ── Individual tab components ─────────────────────────────── */

function GeneralTab() {
  return (
    <>
      <Row
        title="Base currency"
        description="Your portfolio values and PnL are currently displayed in this currency."
        action={<Pill label="USD (default)" />}
      />
      <Row
        title="Default time range"
        description="Used for charts and performance summaries when you first open a page."
        action={<Pill label="30D rolling window" />}
      />
      <Row
        title="Time zone"
        description="Time stamps for trades, alerts, and activity are shown using this time zone."
        action={<Pill label="Local browser time" />}
      />
      <Row
        title="Theme"
        description="LedgerOne uses a high-contrast institutional dark theme optimized for long sessions."
        action={<Pill label="Dark · Always on" />}
      />
    </>
  )
}

function NotificationsTab() {
  const { user, loading } = useUser()

  const [pref, setPref] = useState<PrefRow | null>(null)
  const [channel, setChannel] = useState<Channel>('none')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string>('')

  const email = useMemo(() => String(user?.email ?? '').trim(), [user?.email])

  useEffect(() => {
    let mounted = true
    async function run() {
      if (!user?.id) return
      setStatus('')
      const { data, error } = await supabaseBrowser
        .from('notification_prefs')
        .select('user_id,channel,email,phone_e164,updated_at')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!mounted) return
      if (error) {
        // Fail-soft: show as "none" if table doesn't exist yet or policies block
        setPref(null)
        setChannel('none')
        setPhone('')
        return
      }

      const row = (data ?? null) as PrefRow | null
      setPref(row)
      setChannel((row?.channel as Channel) || 'none')
      setPhone(String(row?.phone_e164 ?? ''))
    }
    run()
    return () => {
      mounted = false
    }
  }, [user?.id])

  const validatePhone = (v: string) => {
    // simple E.164 check: + and 8-15 digits
    const s = v.trim()
    if (!s) return true
    return /^\+\d{8,15}$/.test(s)
  }

  const onSave = async () => {
    if (!user?.id) return
    setStatus('')
    setSaving(true)
    try {
      if (channel === 'sms' && !validatePhone(phone)) {
        setStatus('Phone must be E.164 format (example: +15145551234).')
        return
      }

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

      if (error) {
        setStatus(error.message)
        return
      }

      setPref(payload)
      setStatus('Saved.')
      window.setTimeout(() => setStatus(''), 1500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Row
        title="Alert delivery"
        description="When an alert becomes active, send a short message (you still open the app for full context)."
        action={
          <Select
            value={channel}
            onChange={(v) => setChannel(v as Channel)}
            options={[
              { value: 'none', label: 'None' },
              { value: 'email', label: 'Email' },
              { value: 'sms', label: 'SMS' },
            ]}
          />
        }
      />

      <Row
        title="Destination"
        description={
          channel === 'email'
            ? 'Uses your account email address.'
            : channel === 'sms'
              ? 'Enter a phone number in E.164 format.'
              : 'Notifications are disabled.'
        }
        action={
          channel === 'email' ? (
            <Pill label={email ? email : 'No email'} />
          ) : channel === 'sms' ? (
            <TextInput
              value={phone}
              onChange={setPhone}
              placeholder="+15145551234"
            />
          ) : (
            <Pill label="—" />
          )
        }
      />

      <div className="px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || loading || !user?.id}
            className={[
              'inline-flex items-center rounded-md border border-white/10 bg-[rgb(32,33,36)] px-3 py-2 text-xs font-semibold text-slate-100',
              'hover:bg-white/5 hover:border-white/25 transition-colors',
              (saving || loading || !user?.id) ? 'opacity-60 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>

          {status ? <InlineNote>{status}</InlineNote> : null}
        </div>

        <div className="mt-2 text-xs text-slate-500">
          Message examples: <span className="text-slate-300">BTC trigger</span>,{' '}
          <span className="text-slate-300">BTC new cycle</span>.
        </div>
      </div>
    </>
  )
}

function AccountsTab() {
  return (
    <>
      <Row
        title="Workspace"
        description="You are working in a single personal workspace. Multi-portfolio workspaces will be available in a future release."
        action={<Pill label="Personal" />}
      />
      <Row
        title="Data storage"
        description="Your trades, planners and risk settings are stored securely in LedgerOne’s Supabase database for this account."
        action={<Pill label="Supabase · encrypted" />}
      />
      <Row
        title="Exchange connections"
        description="Exchange API connections are not enabled yet. Trades are added manually or via CSV import."
        action={<Pill label="Manual + CSV" />}
      />
    </>
  )
}

function AboutTab() {
  return (
    <>
      <Row
        title="Version"
        description={`${APP_NAME} · build ${APP_VERSION}`}
        action={<SubtleButton>Details</SubtleButton>}
      />
      <Row
        title="Terms of Use"
        description="By using LedgerOne you are deemed to have accepted the general Terms of Use. A full legal document will be linked here when finalized."
        action={
          <SubtleButton>
            <Info className="mr-1 h-3 w-3" />
            View summary
          </SubtleButton>
        }
      />
      <Row
        title="Privacy Policy"
        description="A plain-language privacy notice will describe what data we store (portfolio and trade metadata only), how it is used, and how to request deletion."
        action={
          <SubtleButton>
            <Info className="mr-1 h-3 w-3" />
            View summary
          </SubtleButton>
        }
      />
    </>
  )
}

function HelpTab() {
  return (
    <>
      <Row
        title="How to use LedgerOne"
        description="Step-by-step guide covering adding trades, configuring the Buy Planner, setting Sell levels, and using alerts from the dashboard."
        action={
          <SubtleButton href="/how-to">
            <HelpCircle className="mr-1 h-3 w-3" />
            Open guide
          </SubtleButton>
        }
      />
      <Row
        title="Planner workflow"
        description="From Buy planner to Sell planner: follow colour-coded planner rows and dashboard alerts to know when to execute or update positions."
        action={<Pill label="Integrated with dashboard" />}
      />
      <Row
        title="Support"
        description="For feedback or issues, you’ll be able to reach a dedicated LedgerOne inbox. In early builds this may simply link to an email contact."
        action={
          <SubtleButton href="mailto:support@ledgerone.app" external>
            Email support
          </SubtleButton>
        }
      />
    </>
  )
}

function ExperimentalTab() {
  return (
    <>
      <Row
        title="Risk analytics (beta)"
        description="Enables richer breakdowns of structural, volatility, tail, correlation and liquidity risk. In early builds this is always on for your account."
        action={
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
            <FlaskConical className="mr-1 h-3 w-3" />
            Enabled
          </span>
        }
      />
    </>
  )
}
