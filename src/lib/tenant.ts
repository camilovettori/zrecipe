import type { SupabaseClient } from '@supabase/supabase-js'

export type TenantSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'inactive'

export interface TenantContext {
  tenantId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  tenant: {
    id: string
    name: string
    slug?: string | null
    createdAt: string
    plan?: string | null
    businessType?: string | null
    ownerEmail?: string | null
    subscriptionStatus?: string | null
    stripeCustomerId?: string | null
    subscriptionCurrentPeriodEnd?: string | null
    subscriptionTrialEnd?: string | null
    subscriptionCancelAt?: string | null
  }
}

export const TRIAL_PERIOD_DAYS = 14

export function getTrialEndsAt(createdAt: string, days = TRIAL_PERIOD_DAYS) {
  const created = new Date(createdAt)
  return new Date(created.getTime() + days * 24 * 60 * 60 * 1000)
}

export function isTrialActive(createdAt: string, now = new Date()) {
  return now.getTime() < getTrialEndsAt(createdAt).getTime()
}

export function getEffectiveSubscriptionStatus(
  status: string | null | undefined,
  createdAt: string,
  now = new Date()
): TenantSubscriptionStatus {
  if (status === 'active') return 'active'
  if (status === 'canceled') return 'canceled'
  if (status === 'past_due') return 'past_due'
  if (status === 'trialing') return isTrialActive(createdAt, now) ? 'trialing' : 'past_due'
  return isTrialActive(createdAt, now) ? 'trialing' : 'past_due'
}

export async function getTenantContext(
  supabase: SupabaseClient,
  userId: string
): Promise<TenantContext | null> {
  const { data: member, error: memberError } = await supabase
    .from('tenant_users')
    .select('id, tenant_id, role')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (memberError || !member) {
    return null
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select(
      'id, name, slug, created_at, plan, business_type, owner_email, subscription_status, stripe_customer_id, subscription_current_period_end, subscription_trial_end, subscription_cancel_at'
    )
    .eq('id', member.tenant_id)
    .limit(1)
    .maybeSingle()

  if (tenantError || !tenant) {
    return null
  }

  return {
    tenantId: tenant.id,
    role: member.role,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug ?? null,
      createdAt: tenant.created_at,
      plan: tenant.plan ?? null,
      businessType: tenant.business_type ?? null,
      ownerEmail: tenant.owner_email ?? null,
      subscriptionStatus: tenant.subscription_status ?? null,
      stripeCustomerId: tenant.stripe_customer_id ?? null,
      subscriptionCurrentPeriodEnd: tenant.subscription_current_period_end ?? null,
      subscriptionTrialEnd: tenant.subscription_trial_end ?? null,
      subscriptionCancelAt: tenant.subscription_cancel_at ?? null,
    },
  }
}
