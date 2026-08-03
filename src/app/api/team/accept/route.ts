import { type NextRequest, NextResponse } from 'next/server'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const supabase = createRequestSupabaseClient(request)
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Look up the invite by the authenticated user's email — never trust
  // tenant_id/role from user_metadata, which is self-writable by the user
  // via supabase.auth.updateUser() and is not a valid authorization source.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invites } = await (admin.from('tenant_invites') as any)
    .select('id, tenant_id, role')
    .eq('status', 'pending')
    .ilike('email', user.email)

  type Invite = { id: string; tenant_id: string; role: string }
  const pending = (invites ?? []) as Invite[]

  if (pending.length === 0) {
    // No pending invite for this email — user may be setting up their own
    // workspace rather than accepting a team invite.
    return NextResponse.json({ redirect: '/workspace/setup' })
  }

  // If multiple pending invites exist for this email, prefer the one hinted
  // by user_metadata (set by inviteUserByEmail) but only as a tie-breaker —
  // the actual tenant_id/role always come from the verified invite row.
  const hintedTenantId = user.user_metadata?.tenant_id as string | undefined
  const invite = pending.find((i) => i.tenant_id === hintedTenantId) ?? pending[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from('tenant_users') as any)
    .upsert(
      { tenant_id: invite.tenant_id, user_id: user.id, role: invite.role },
      { onConflict: 'tenant_id,user_id' }
    )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from('tenant_invites') as any)
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  return NextResponse.json({ success: true })
}
