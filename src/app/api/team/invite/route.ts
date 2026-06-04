import { type NextRequest, NextResponse } from 'next/server'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'

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

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .single()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL ?? 'localhost:3000'}`

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
