'use client'

import type { CheckoutTier } from '@/lib/billing/plans'

/**
 * Client helpers to launch Stripe Checkout / the Billing Portal.
 * Both hit our server routes (which hold the secret key) and redirect
 * the browser to the Stripe-hosted URL they return.
 */

async function postForUrl(path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || `Request failed (${res.status})`)
  }
  window.location.href = data.url as string
}

export async function startCheckout(tier: CheckoutTier): Promise<void> {
  await postForUrl('/api/billing/checkout', { tier })
}

export async function openBillingPortal(): Promise<void> {
  await postForUrl('/api/billing/portal')
}
