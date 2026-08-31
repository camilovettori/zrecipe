import 'server-only'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'

export type SquareTenantAccess = {
  userId: string
  tenantId: string
  role: string
}

export async function requireSquareTenantAccess(request: NextRequest, requireManager = false): Promise<SquareTenantAccess> {
  const supabase = createRequestSupabaseClient(request)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: membership, error: membershipError } = await (admin.from('tenant_users') as any)
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (membershipError || !membership) throw new Error('Tenant not found')
  if (requireManager && membership.role !== 'owner' && membership.role !== 'admin') {
    throw new Error('Only an owner or admin can manage Square integration.')
  }

  return { userId: user.id, tenantId: membership.tenant_id, role: membership.role }
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
}
