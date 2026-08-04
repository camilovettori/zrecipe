import { NextRequest, NextResponse } from 'next/server'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantContext } from '@/lib/tenant'

type TenantMemberRow = {
  id: string
  tenant_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const resolvedParams = await params
  const supabase = createRequestSupabaseClient(request)
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const context = await getTenantContext(supabase, user.id)
  if (!context) {
    return NextResponse.json({ message: 'Tenant not found' }, { status: 404 })
  }

  if (context.role !== 'owner') {
    return NextResponse.json({ message: 'Only the owner can remove members' }, { status: 403 })
  }

  const { data: member, error: fetchError } = (await admin
    .from('tenant_users')
    .select('id, tenant_id, user_id, role')
    .eq('id', resolvedParams.memberId)
    .maybeSingle()) as { data: TenantMemberRow | null; error: unknown }

  if (fetchError || !member) {
    return NextResponse.json({ message: 'Member not found' }, { status: 404 })
  }

  if (member.tenant_id !== context.tenantId) {
    return NextResponse.json({ message: 'Member not found' }, { status: 404 })
  }

  if (member.role === 'owner') {
    return NextResponse.json({ message: 'Owner cannot be removed' }, { status: 400 })
  }

  const { error: deleteError } = await admin.from('tenant_users').delete().eq('id', member.id)

  if (deleteError) {
    return NextResponse.json({ message: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
