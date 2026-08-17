'use server'

/*
 * Run in Supabase SQL Editor before deploying:
 *
 * -- Add is_comped column (idempotent)
 * ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_comped BOOLEAN DEFAULT false;
 *
 * -- Allow 'suspended' in subscription_status
 * ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subscription_status_check;
 * ALTER TABLE tenants ADD CONSTRAINT tenants_subscription_status_check
 *   CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'suspended'));
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAIL = 'camilovettori@gmail.com'

async function requireSuperAdmin(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    throw new Error('Unauthorized')
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateTenant(tenantId: string, data: Record<string, unknown>) {
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from('tenants') as any)
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', tenantId)
  if (error) throw new Error(error.message)
}

function revalidateTenant(tenantId: string) {
  revalidatePath(`/adminziffera/tenants/${tenantId}`)
  revalidatePath('/adminziffera/tenants')
  revalidatePath('/adminziffera')
}

// ── existing actions ──────────────────────────────────────────────────────────

export async function activateCompedPlan(tenantId: string): Promise<void> {
  await requireSuperAdmin()
  await updateTenant(tenantId, { subscription_status: 'active', is_comped: true, plan_tier: 'pro' })
  revalidateTenant(tenantId)
}

export async function revokeCompedPlan(tenantId: string): Promise<void> {
  await requireSuperAdmin()
  await updateTenant(tenantId, { subscription_status: 'trialing', is_comped: false })
  revalidateTenant(tenantId)
}

// ── new actions ───────────────────────────────────────────────────────────────

export async function suspendTenant(tenantId: string): Promise<void> {
  await requireSuperAdmin()
  await updateTenant(tenantId, { subscription_status: 'suspended' })
  revalidateTenant(tenantId)
}

export async function unsuspendTenant(
  tenantId: string,
  restoreTo: 'trialing' | 'active_comped' | 'active_stripe',
): Promise<void> {
  await requireSuperAdmin()
  const update =
    restoreTo === 'trialing'
      ? { subscription_status: 'trialing', is_comped: false }
      : restoreTo === 'active_comped'
      ? { subscription_status: 'active', is_comped: true, plan_tier: 'pro' }
      : { subscription_status: 'active', is_comped: false } // active_stripe — admin manages Stripe separately
  await updateTenant(tenantId, update)
  revalidateTenant(tenantId)
}

export async function cancelTenantSubscription(tenantId: string): Promise<void> {
  await requireSuperAdmin()
  await updateTenant(tenantId, { subscription_status: 'canceled', is_comped: false })
  revalidateTenant(tenantId)
}

export async function endTrial(tenantId: string): Promise<void> {
  await requireSuperAdmin()
  await updateTenant(tenantId, { subscription_status: 'canceled' })
  revalidateTenant(tenantId)
}

export async function deleteTenant(tenantId: string): Promise<void> {
  await requireSuperAdmin()
  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (admin.from('tenants') as any)
    .select('stripe_subscription_id, subscription_status, is_comped')
    .eq('id', tenantId)
    .single()

  if (
    tenant?.stripe_subscription_id &&
    tenant?.subscription_status === 'active' &&
    !tenant?.is_comped
  ) {
    throw new Error(
      'This tenant has an active Stripe subscription. Cancel it in the Stripe Dashboard first, then delete.'
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from('tenants') as any).delete().eq('id', tenantId)
  if (error) throw new Error(error.message)
  revalidatePath('/adminziffera/tenants')
  revalidatePath('/adminziffera')
}
