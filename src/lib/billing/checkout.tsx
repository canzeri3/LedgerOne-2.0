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
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.url) {
    const messages: Record<string, string> = {
      not_signed_in: 'Please sign in before managing a subscription.',
      subscription_exists: 'You already have a subscription. Use the billing portal to change it.',
      billing_state_requires_reconciliation: 'Your billing record needs support before it can be changed.',
      billing_store_unavailable: 'Billing is temporarily unavailable. Please try again shortly.',
      no_customer: 'No Stripe billing account is connected to this user.',
      too_many_checkout_attempts: 'Too many checkout attempts. Please wait and try again.',
      too_many_portal_attempts: 'Too many billing portal requests. Please wait and try again.',
      trial_already_used: 'This account has already used its free trial. You can subscribe immediately instead.',
    }
    const code = String(data?.error ?? '')
    throw new Error(messages[code] || `Billing request failed (${res.status}).`)
  }

  const destination = new URL(String(data.url))
  if (destination.protocol !== 'https:' && destination.hostname !== 'localhost') {
    throw new Error('Billing provider returned an invalid redirect.')
  }
  window.location.assign(destination.toString())
}

export async function startCheckout(tier: CheckoutTier, options?: { trial?: boolean }): Promise<void> {
  const attemptId = crypto.randomUUID()
  await postForUrl('/api/billing/checkout', { tier, attemptId, trial: options?.trial === true })
}

export async function openBillingPortal(): Promise<void> {
  await postForUrl('/api/billing/portal')
}
