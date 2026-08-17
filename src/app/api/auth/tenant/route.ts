import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createRequestSupabaseClient(request)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    const admin = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (admin.from('tenant_users') as any)
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ error: 'No tenant' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (admin.from('tenants') as any)
      .update({
        name:          body.name          ?? undefined,
        business_type: body.businessType  ?? null,
      })
      .eq('id', member.tenant_id)

    if (updateError) {
      console.error('[/api/auth/tenant PATCH]', updateError.message)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[/api/auth/tenant PATCH] unhandled:', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    // ── 1. Verify session ────────────────────────────────────────────────
    const supabase = createRequestSupabaseClient(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 2. Service-role lookup (bypasses RLS) ────────────────────────────
    const admin = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member, error: memberError } = await (admin.from('tenant_users') as any)
      .select('id, tenant_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (memberError) {
      console.error('[/api/auth/tenant] MEMBER QUERY FAILED:', JSON.stringify(memberError))
      return NextResponse.json(
        { error: 'Tenant lookup failed', detail: memberError.message },
        { status: 500 }
      )
    }

    if (!member) {
      return NextResponse.json({ error: 'No tenant' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tenant, error: tenantError } = await (admin.from('tenants') as any)
      .select(
        'id, name, slug, created_at, plan, plan_tier, business_type, owner_email, subscription_status, stripe_customer_id, subscription_current_period_end, subscription_trial_end, subscription_cancel_at, is_comped, custom_logo_url'
      )
      .eq('id', member.tenant_id)
      .limit(1)
      .maybeSingle()

    if (tenantError) {
      console.error('[/api/auth/tenant] TENANT QUERY FAILED:', JSON.stringify(tenantError))
      return NextResponse.json(
        { error: 'Tenant lookup failed', detail: tenantError.message },
        { status: 500 }
      )
    }

    if (!tenant) {
      return NextResponse.json({ error: 'No tenant' }, { status: 404 })
    }

    return NextResponse.json({
      tenantId: tenant.id as string,
      role:     member.role as string,
      tenant: {
        id:                           tenant.id,
        name:                         tenant.name,
        slug:                         tenant.slug ?? null,
        createdAt:                    tenant.created_at,
        plan:                         tenant.plan ?? null,
        planTier:                     tenant.plan_tier ?? 'starter',
        businessType:                 tenant.business_type ?? null,
        ownerEmail:                   tenant.owner_email ?? null,
        subscriptionStatus:           tenant.subscription_status ?? null,
        stripeCustomerId:             tenant.stripe_customer_id ?? null,
        subscriptionCurrentPeriodEnd: tenant.subscription_current_period_end ?? null,
        subscriptionTrialEnd:         tenant.subscription_trial_end ?? null,
        subscriptionCancelAt:         tenant.subscription_cancel_at ?? null,
        isComped:                     tenant.is_comped ?? false,
        customLogoUrl:                tenant.custom_logo_url ?? null,
      },
    })
  } catch (err) {
    // Catches anything that slipped through — createAdminClient() throwing on
    // missing env vars, network errors, etc.  Always return JSON so the client
    // never sees an HTML error page and tries to parse it.
    console.error('[/api/auth/tenant] UNHANDLED EXCEPTION:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Tenant lookup failed', detail: message }, { status: 500 })
  }
}
