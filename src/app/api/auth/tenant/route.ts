import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'

export async function GET(request: NextRequest) {
  // 1. Verify the caller is authenticated (reads session from cookies)
  const supabase = createRequestSupabaseClient(request)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Use the service-role admin client — bypasses RLS entirely.
  //    The browser client uses the user's JWT, which may lack custom claims
  //    (e.g. tenant_id) required by the tenant_users RLS policy.
  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member, error: memberError } = await (admin.from('tenant_users') as any)
    .select('id, tenant_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (memberError) {
    console.error('[/api/auth/tenant] member error:', memberError.message)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }

  if (!member) {
    return NextResponse.json({ error: 'No tenant' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant, error: tenantError } = await (admin.from('tenants') as any)
    .select(
      'id, name, slug, created_at, plan, business_type, owner_email, subscription_status, stripe_customer_id, subscription_current_period_end, subscription_trial_end'
    )
    .eq('id', member.tenant_id)
    .limit(1)
    .maybeSingle()

  if (tenantError) {
    console.error('[/api/auth/tenant] tenant error:', tenantError.message)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }

  if (!tenant) {
    return NextResponse.json({ error: 'No tenant' }, { status: 404 })
  }

  return NextResponse.json({
    tenantId: tenant.id as string,
    role: member.role as string,
    tenant: {
      id:                           tenant.id,
      name:                         tenant.name,
      slug:                         tenant.slug ?? null,
      createdAt:                    tenant.created_at,
      plan:                         tenant.plan ?? null,
      businessType:                 tenant.business_type ?? null,
      ownerEmail:                   tenant.owner_email ?? null,
      subscriptionStatus:           tenant.subscription_status ?? null,
      stripeCustomerId:             tenant.stripe_customer_id ?? null,
      subscriptionCurrentPeriodEnd: tenant.subscription_current_period_end ?? null,
      subscriptionTrialEnd:         tenant.subscription_trial_end ?? null,
    },
  })
}
