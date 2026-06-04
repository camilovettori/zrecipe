import { type NextRequest, NextResponse } from 'next/server'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const supabase = createRequestSupabaseClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve tenant and role for this user
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
  }

  const { tenant_id: tenantId, role: currentUserRole } = membership
  const admin = createAdminClient()

  // Fetch all members with auth.users data via admin (bypasses RLS on auth.users)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenantUsers } = await (admin.from('tenant_users') as any)
    .select('id, user_id, role, created_at')
    .eq('tenant_id', tenantId)

  // Hydrate with email / full_name from auth.users
  type TU = { id: string; user_id: string; role: string; created_at: string }
  const members = await Promise.all(
    ((tenantUsers ?? []) as TU[]).map(async (m) => {
      const { data: authUser } = await admin.auth.admin.getUserById(m.user_id)
      return {
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        created_at: m.created_at,
        email: authUser?.user?.email ?? '',
        full_name: (authUser?.user?.user_metadata?.full_name as string | undefined) ?? null,
      }
    })
  )

  // Pending invites
  const { data: pendingInvites } = await supabase
    .from('tenant_invites')
    .select('id, email, role, invited_at, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')

  return NextResponse.json({
    tenantId,
    currentUserRole,
    members,
    pendingInvites: pendingInvites ?? [],
  })
}
