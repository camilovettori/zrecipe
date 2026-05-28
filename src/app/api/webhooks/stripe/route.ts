import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type TenantsTable = {
  update: (values: Record<string, string | number | null>) => {
    eq: (column: string, value: string) => Promise<unknown>
  }
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe secret key is not configured.')
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY, {
  })
}

async function updateTenantByCustomerId(
  customerId: string,
  updates: Record<string, string | number | null>
) {
  const admin = createAdminClient()
  const tenants = admin.from('tenants') as unknown as TenantsTable
  await tenants.update(updates).eq('stripe_customer_id', customerId)
}

async function handleSubscriptionEvent(
  subscription: Stripe.Subscription,
  status: string,
  customerId: string
) {
  const currentPeriodEnd = (subscription as Stripe.Subscription & {
    current_period_end?: number
  }).current_period_end

  await updateTenantByCustomerId(customerId, {
    subscription_status: status,
    stripe_subscription_id: subscription.id,
    subscription_current_period_end: currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null,
    subscription_trial_end:
      subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    plan: status === 'canceled' ? 'free' : 'pro',
  })
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe()
    const payload = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!process.env.STRIPE_WEBHOOK_SECRET || !signature) {
      return NextResponse.json({ message: 'Webhook secret missing' }, { status: 400 })
    }

    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = typeof session.customer === 'string' ? session.customer : null
        const metadata = session.metadata as Record<string, string | undefined> | undefined
        const tenantId =
          metadata?.tenantId ?? metadata?.tenant_id ?? session.client_reference_id ?? null
        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : null

        if (customerId && tenantId) {
          const admin = createAdminClient()
          const tenants = admin.from('tenants') as unknown as TenantsTable
          await tenants
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: 'active',
              plan: 'pro',
            })
            .eq('id', tenantId)
        }

        break
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === 'string' ? subscription.customer : null

        if (customerId) {
          await handleSubscriptionEvent(subscription, subscription.status, customerId)
        }

        break
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === 'string' ? subscription.customer : null

        if (customerId) {
          await handleSubscriptionEvent(subscription, 'canceled', customerId)
        }

        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : null

        if (customerId) {
          await updateTenantByCustomerId(customerId, {
            subscription_status: 'past_due',
          })
        }

        break
      }
      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Webhook error' },
      { status: 400 }
    )
  }
}
