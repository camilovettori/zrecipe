import { type NextRequest, NextResponse } from 'next/server'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const supabase = createRequestSupabaseClient(request)
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = user.user_metadata?.tenant_id as string | undefined
  const role = (user.user_metadata?.role as string | undefined) ?? 'staff'

  if (!tenantId) {
    // No tenant in metadata — user may have been invited before this system existed;
    // redirect them to workspace setup.
    return NextResponse.json({ redirect: '/workspace/setup' })
  }

  const admin = createAdminClient()

  // Add user to tenant (admin client bypasses RLS for this cross-tenant write)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from('tenant_users') as any)
    .upsert({ tenant_id: tenantId, user_id: user.id, role }, { onConflict: 'tenant_id,user_id' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from('tenant_invites') as any)
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('email', user.email!)

  return NextResponse.json({ success: true })
}
