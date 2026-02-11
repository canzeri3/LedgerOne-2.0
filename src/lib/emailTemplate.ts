/**
 * Branded HTML email template for LedgerOne alert notifications.
 * Table-based layout with inline CSS for maximum email-client compatibility.
 * Matches the dark theme from the LedgerOne web app (planner/login pages).
 *
 * Enterprise layout:
 *  1. LEDGERONE header
 *  2. "New Alert" section — the trigger(s) that fired this email
 *  3. CTA button → planner
 *  4. "Outstanding Alerts" section — all active alerts minus the new ones
 *  5. Footer (timestamp + disclaimer)
 */

export type AlertEntry = {
  side: 'Buy' | 'Sell' | 'Cycle'
  coin: string // coingecko_id e.g. "bitcoin"
}

/* ─── helpers ─────────────────────────────────────────────────── */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** "bitcoin-cash" → "Bitcoin Cash" */
function humanCoin(cgId: string): string {
  return cgId
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ')
}

type SideStyle = { bg: string; text: string; label: string }

function sideStyle(side: AlertEntry['side']): SideStyle {
  switch (side) {
    case 'Buy':
      return { bg: '#052e16', text: '#22c55e', label: 'BUY' }
    case 'Sell':
      return { bg: '#450a0a', text: '#ef4444', label: 'SELL' }
    case 'Cycle':
      return { bg: '#422006', text: '#f59e0b', label: 'CYCLE' }
  }
}

/** Deduplicate by side+coin keeping first occurrence */
function dedup(entries: AlertEntry[]): AlertEntry[] {
  const seen = new Set<string>()
  const out: AlertEntry[] = []
  for (const e of entries) {
    const key = `${e.side}:${e.coin}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

/* ─── Design tokens (match LedgerOne web app) ────────────────── */
const T = {
  pageBg: '#131415',
  cardBg: '#1c1d1f',
  cardBorder: '#2b2c2d',
  divider: '#292a2d',
  textPrimary: '#e5e7eb',
  textSecondary: '#d1d5db',
  textDim: '#a3a3a4',
  textMuted: '#94a3b8',
  textFaint: '#64748b',
  accentPurple: '#8880d5',
  accentPurpleDark: '#6e68b0',
  white: '#ffffff',
  font: 'Arial, Helvetica, sans-serif',
  mono: "'Courier New', monospace",
} as const

/* ─── row builders ────────────────────────────────────────────── */

function alertRow(entry: AlertEntry, size: 'lg' | 'sm'): string {
  const s = sideStyle(entry.side)
  const name = escapeHtml(humanCoin(entry.coin))
  const fontSize = size === 'lg' ? 15 : 13
  const nameColor = size === 'lg' ? T.textPrimary : T.textSecondary
  const padV = size === 'lg' ? 8 : 5
  return `
<tr>
  <td style="padding:${padV}px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="padding:4px 10px;border-radius:4px;background-color:${s.bg};font-family:${T.font};font-size:10px;font-weight:700;letter-spacing:1.2px;color:${s.text};line-height:14px;">${s.label}</td>
      <td style="padding-left:12px;font-family:${T.font};font-size:${fontSize}px;font-weight:500;color:${nameColor};line-height:20px;">${name}</td>
    </tr></table>
  </td>
</tr>`
}

/* ─── main builder ────────────────────────────────────────────── */

export function buildAlertEmailHtml(opts: {
  newAlerts: AlertEntry[]
  currentAlerts: AlertEntry[]
  reviewUrl: string
  timestamp?: string
}): string {
  const reviewUrl = escapeHtml(opts.reviewUrl)
  const ts =
    opts.timestamp ??
    new Date()
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, ' UTC')

  const newAlerts = dedup(opts.newAlerts)
  const newKeys = new Set(newAlerts.map((a) => `${a.side}:${a.coin}`))
  const outstanding = dedup(opts.currentAlerts).filter(
    (a) => !newKeys.has(`${a.side}:${a.coin}`)
  )

  const newRows = newAlerts.map((a) => alertRow(a, 'lg')).join('')

  const outstandingSection =
    outstanding.length > 0
      ? `
<!-- Outstanding Alerts -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:20px 0 0 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="border-top:1px solid ${T.divider};padding:16px 0 10px 0;">
    <span style="font-family:${T.font};font-size:10px;font-weight:600;letter-spacing:1.5px;color:${T.textDim};text-transform:uppercase;">Outstanding Alerts</span>
  </td></tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${outstanding.map((a) => alertRow(a, 'sm')).join('')}
  </table>
</td></tr>
</table>`
      : ''

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>LedgerOne Alert</title>
<!--[if mso]>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<style>table{border-collapse:collapse;}td{font-family:Arial,sans-serif;}</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${T.pageBg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- Full-width background wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${T.pageBg};min-height:100%;">
<tr><td align="center" style="padding:40px 16px 32px 16px;">

<!-- Brand header -->
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
<tr><td align="center" style="padding-bottom:6px;">
  <span style="font-family:${T.mono};font-size:20px;font-weight:700;letter-spacing:5px;color:${T.textPrimary};text-transform:uppercase;">LEDGERONE</span>
</td></tr>
<tr><td align="center" style="padding-bottom:24px;">
  <span style="font-family:${T.font};font-size:11px;font-weight:400;color:${T.textMuted};letter-spacing:2px;">planner &middot; tracker</span>
</td></tr>
</table>

<!-- Main card -->
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background-color:${T.cardBg};border:1px solid ${T.cardBorder};border-radius:12px;">
<tr><td style="padding:28px 24px 24px 24px;">

  <!-- Section label -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="padding-bottom:14px;">
    <span style="font-family:${T.font};font-size:10px;font-weight:600;letter-spacing:1.5px;color:${T.textDim};text-transform:uppercase;">New Alert</span>
  </td></tr>
  </table>

  <!-- New alert rows -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${newRows}
  </table>

  <!-- CTA button -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="padding-top:22px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="border-radius:6px;background-color:${T.accentPurple};">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${reviewUrl}" style="height:40px;v-text-anchor:middle;width:200px;" arcsize="15%" strokecolor="${T.accentPurple}" fillcolor="${T.accentPurple}">
      <w:anchorlock/>
      <center style="font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:${T.white};">Review on LedgerOne</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!--><a href="${reviewUrl}" target="_blank" style="display:inline-block;padding:10px 28px;font-family:${T.font};font-size:13px;font-weight:600;color:${T.white};background-color:${T.accentPurple};border-radius:6px;text-decoration:none;text-align:center;line-height:20px;">Review on LedgerOne</a><!--<![endif]-->
    </td></tr>
    </table>
  </td></tr>
  </table>

  ${outstandingSection}

</td></tr>
</table>

<!-- Footer -->
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
<tr><td style="padding:20px 0 6px 0;font-family:${T.font};font-size:11px;color:${T.textMuted};text-align:center;line-height:16px;">
${escapeHtml(ts)}
</td></tr>
<tr><td style="padding:0 0 6px 0;font-family:${T.font};font-size:11px;color:${T.textFaint};text-align:center;line-height:16px;">
This is an automated alert based on your planner settings. Not financial advice.
</td></tr>
<tr><td style="padding:0 0 0 0;font-family:${T.font};font-size:11px;color:${T.textFaint};text-align:center;line-height:16px;">
LedgerOne.app
</td></tr>
</table>

</td></tr>
</table>

</body>
</html>`
}
