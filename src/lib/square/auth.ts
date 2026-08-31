import 'server-only'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getTenantContext, getEffectiveSubscriptionStatus, getEffectiveTier } from '@/lib/tenant'
import { getLimitsForTier } from '@/lib/subscription/limits'

export type SquareTenantAccess = {
  userId: string
  tenantId: string
  role: string
}

export const SQUARE_PLAN_ERROR = 'Square POS is available on the Pro and Business plans. Upgrade to connect Square.'

function assertSquarePlanAccess(tenant: {
  subscriptionStatus?: string | null
  planTier?: string | null
  isComped?: boolean | null
  createdAt: string
}) {
  const status = getEffectiveSubscriptionStatus(tenant.subscriptionStatus, tenant.createdAt)
  const tier = getEffectiveTier({
    subscriptionStatus: status,
    planTier: tenant.planTier,
    isComped: tenant.isComped,
  })
  if (!getLimitsForTier(tier).canUseSquareIntegration) {
    throw new Error(SQUARE_PLAN_ERROR)
  }
}

export async function requireSquareTenantAccess(request: NextRequest, requireManager = false): Promise<SquareTenantAccess> {
  const supabase = createRequestSupabaseClient(request)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  const context = await getTenantContext(supabase, user.id)
  if (!context) throw new Error('Tenant not found')

  if (requireManager && context.role !== 'owner' && context.role !== 'admin') {
    throw new Error('Only an owner or admin can manage Square integration.')
  }

  assertSquarePlanAccess({
    subscriptionStatus: context.tenant.subscriptionStatus,
    planTier: context.tenant.planTier,
    isComped: context.tenant.isComped,
    createdAt: context.tenant.createdAt,
  })

  return { userId: user.id, tenantId: context.tenantId, role: context.role }
}

export async function verifySquareTenantManager(userId: string, tenantId: string) {
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: membership } = await (admin.from('tenant_users') as any)
    .select('tenant_id, role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    throw new Error('You no longer have permission to connect Square for this workspace.')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (admin.from('tenants') as any)
    .select('subscription_status, plan_tier, is_comped, created_at')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) throw new Error('Tenant not found')

  assertSquarePlanAccess({
    subscriptionStatus: tenant.subscription_status,
    planTier: tenant.plan_tier,
    isComped: tenant.is_comped,
    createdAt: tenant.created_at,
  })
}
