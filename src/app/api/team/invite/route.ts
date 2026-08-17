import { type NextRequest, NextResponse } from 'next/server'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveSubscriptionStatus, getEffectiveTier } from '@/lib/tenant'
import { getLimitsForTier } from '@/lib/subscription/limits'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.json() as { email?: string; role?: string; tenantId?: string }
  const { email, role, tenantId } = body

  if (!email || !role || !tenantId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createRequestSupabaseClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only owners can send invites
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single()

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can invite team members' }, { status: 403 })
  }

  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (admin.from('tenants') as any)
    .select('name, subscription_status, plan_tier, is_comped, created_at')
    .eq('id', tenantId)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const status = getEffectiveSubscriptionStatus(
    tenant.subscription_status,
    tenant.created_at ?? new Date().toISOString()
  )
  const tier = getEffectiveTier({
    subscription_status: status,
    plan_tier: tenant.plan_tier,
    is_comped: tenant.is_comped,
  })
  const limits = getLimitsForTier(tier)
  const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
    admin.from('tenant_users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    admin.from('tenant_invites').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending'),
  ])

  if ((memberCount ?? 0) + (pendingCount ?? 0) >= limits.maxTeamMembers) {
    return NextResponse.json(
      { error: `Team limit reached for the ${tier} plan.` },
      { status: 403 }
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.error('NEXT_PUBLIC_APP_URL is not set — cannot build invite link')
    return NextResponse.json(
      { error: 'Server misconfiguration: app URL not set. Contact support.' },
      { status: 500 }
    )
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/accept-invite`,
    data: {
      tenant_id: tenantId,
      role,
      tenant_name: tenant?.name ?? 'ZRecipe',
    },
  })

  if (inviteError && !inviteError.message.toLowerCase().includes('already registered')) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 })
  }

  // Record / refresh the invite row
  await supabase
    .from('tenant_invites')
    .upsert(
      { tenant_id: tenantId, email, role, invited_by: user.id, status: 'pending', invited_at: new Date().toISOString() },
      { onConflict: 'tenant_id,email' }
    )

  return NextResponse.json({ success: true })
}
