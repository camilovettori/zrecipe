import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const supabase = createRequestSupabaseClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (admin.from('tenant_users') as any)
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!member) return NextResponse.json({ error: 'No tenant' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (admin.from('tenants') as any)
    .select('stripe_subscription_id')
    .eq('id', member.tenant_id)
    .limit(1)
    .maybeSingle()

  if (!tenant?.stripe_subscription_id) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 400 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const subscription = await stripe.subscriptions.update(
    tenant.stripe_subscription_id as string,
    { cancel_at_period_end: true }
  )

  const cancelAt = subscription.cancel_at
    ? new Date(subscription.cancel_at * 1000).toISOString()
    : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from('tenants') as any)
    .update({ subscription_cancel_at: cancelAt })
    .eq('id', member.tenant_id)

  return NextResponse.json({ success: true, cancel_at: cancelAt })
}
