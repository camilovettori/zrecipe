import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'

export async function POST(request: NextRequest) {
  try {
    // ── 1. Verify session ────────────────────────────────────────────────
    const supabase = createRequestSupabaseClient(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (userError) {
      console.error('[STRIPE] Auth error:', userError.message)
    }

    // ── 2. Resolve tenant ────────────────────────────────────────────────
    const admin = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member, error: memberError } = await (admin.from('tenant_users') as any)
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (memberError) {
      console.error('[STRIPE] Member lookup error:', memberError.message)
    }

    if (!member) {
      return NextResponse.json({ message: 'Tenant not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tenant, error: tenantError } = await (admin.from('tenants') as any)
      .select('id, stripe_customer_id')
      .eq('id', member.tenant_id)
      .limit(1)
      .maybeSingle()

    if (tenantError) {
      console.error('[STRIPE] Tenant lookup error:', tenantError.message)
    }

    if (!tenant) {
      return NextResponse.json({ message: 'Tenant not found' }, { status: 404 })
    }

    // ── 3. Validate Stripe config ────────────────────────────────────────
    const priceId = process.env.STRIPE_PRICE_ID ?? process.env.STRIPE_PRO_PRICE_ID
    if (!priceId) {
      console.error('[STRIPE] No price ID configured')
      return NextResponse.json({ message: 'Stripe price is not configured' }, { status: 500 })
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('[STRIPE] No secret key configured')
      return NextResponse.json({ message: 'Stripe is not configured' }, { status: 500 })
    }

    // ── 4. Create Stripe client ──────────────────────────────────────────
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin

    // ── 5. Create Checkout Session ───────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      ...(tenant.stripe_customer_id
        ? { customer: tenant.stripe_customer_id as string }
        : { customer_email: user.email ?? undefined }),
      subscription_data: {
        ...(tenant.stripe_customer_id ? {} : { trial_period_days: 14 }),
        metadata: { tenantId: tenant.id as string },
      },
      metadata: { tenantId: tenant.id as string },
      success_url: `${appUrl}/settings/billing?success=true`,
      cancel_url:  `${appUrl}/settings/billing?notice=checkout_canceled`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Checkout failed'
    console.error('[STRIPE] Error:', message)
    if (err instanceof Error) console.error('[STRIPE] Stack:', err.stack)
    return NextResponse.json({ message }, { status: 500 })
  }
}
