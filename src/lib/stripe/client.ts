import 'server-only'

import Stripe from 'stripe'
import { ZRECIPE_PRO } from './plans'

let stripeClient: Stripe | null = null

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe secret key is not configured.')
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
    })
  }

  return stripeClient
}

export async function createCheckoutSession({
  tenantId,
  customerEmail,
  customerId,
  successUrl,
  cancelUrl,
}: {
  tenantId: string
  customerEmail?: string | null
  customerId?: string | null
  successUrl: string
  cancelUrl: string
}) {
  if (!ZRECIPE_PRO.priceId) {
    throw new Error('Stripe price ID is not configured.')
  }

  const stripe = getStripe()
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId ?? undefined,
    customer_email: customerId ? undefined : customerEmail ?? undefined,
    line_items: [{ price: ZRECIPE_PRO.priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: ZRECIPE_PRO.trialDays,
      metadata: { tenantId },
    },
    metadata: { tenantId },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  })
}

export async function createCustomerPortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string
  returnUrl: string
}) {
  const stripe = getStripe()
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })
}

export async function getSubscriptionStatus(customerId: string) {
  const stripe = getStripe()
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 1,
  })

  const subscription = subscriptions.data[0]

  if (!subscription) {
    return null
  }

  const currentPeriodEnd = (subscription as Stripe.Subscription & {
    current_period_end?: number
  }).current_period_end

  return {
    status: subscription.status,
    currentPeriodEnd,
    trialEnd: subscription.trial_end ?? null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    customerId,
    subscriptionId: subscription.id,
  }
}
