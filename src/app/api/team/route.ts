import { NextRequest, NextResponse } from 'next/server'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantContext } from '@/lib/tenant'

type TenantMemberRow = {
  id: string
  tenant_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  created_at: string
}

type TenantUsersQuery = {
  eq: (column: string, value: string) => TenantUsersQuery
  maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }>
}

type TenantUsersTable = {
  select: (columns: string) => TenantUsersQuery
  update: (values: { role: string }) => { eq: (column: string, value: string) => Promise<unknown> }
  insert: (values: {
    tenant_id: string
    user_id: string
    role: string
  }) => Promise<unknown>
}

export async function GET(request: NextRequest) {
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

  const [{ data: members, error: memberError }, { data: usersData }] = await Promise.all([
    admin
      .from('tenant_users')
      .select('id, tenant_id, user_id, role, created_at')
      .eq('tenant_id', context.tenantId)
      .order('created_at', { ascending: true }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  if (memberError) {
    return NextResponse.json({ message: memberError.message }, { status: 500 })
  }

  const emailById = new Map(
    (usersData?.users ?? []).map((item) => [item.id, item.email ?? null] as const)
  )

  return NextResponse.json({
    members: ((members ?? []) as TenantMemberRow[]).map((member) => ({
      id: member.id,
      userId: member.user_id,
      email: emailById.get(member.user_id) ?? null,
      role: member.role,
      createdAt: member.created_at,
      isOwner: member.role === 'owner',
    })),
    currentUserRole: context.role,
    tenantId: context.tenantId,
  })
}

export async function POST(request: NextRequest) {
  const supabase = createRequestSupabaseClient(request)
  const admin = createAdminClient()
  const body = await request.json().catch(() => ({}))
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const role = typeof body?.role === 'string' ? body.role.trim() : 'member'

  if (!email) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 })
  }

  if (!['owner', 'admin', 'member', 'viewer'].includes(role)) {
    return NextResponse.json({ message: 'Invalid role' }, { status: 400 })
  }

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

  if (!['owner', 'admin'].includes(context.role)) {
    return NextResponse.json({ message: 'Only owners and admins can invite members' }, { status: 403 })
  }

  const inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      tenant_id: context.tenantId,
      role,
    },
  })

  if (inviteResult.error || !inviteResult.data.user) {
    return NextResponse.json(
      { message: inviteResult.error?.message ?? 'Unable to invite member' },
      { status: 400 }
    )
  }

  const invitedUser = inviteResult.data.user
  const tenantUsers = admin.from('tenant_users') as unknown as TenantUsersTable

  const existingMember = await tenantUsers
    .select('id')
    .eq('tenant_id', context.tenantId)
    .eq('user_id', invitedUser.id)
    .maybeSingle()

  if (existingMember.data) {
    await tenantUsers
      .update({ role })
      .eq('id', existingMember.data.id)
  } else {
    await tenantUsers.insert({
      tenant_id: context.tenantId,
      user_id: invitedUser.id,
      role,
    })
  }

  return NextResponse.json({
    id: invitedUser.id,
    userId: invitedUser.id,
    email: invitedUser.email,
    role,
    createdAt: new Date().toISOString(),
    isOwner: role === 'owner',
  })
}
