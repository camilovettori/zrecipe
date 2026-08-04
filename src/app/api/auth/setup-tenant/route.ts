import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'

const HAS_TENANT_COOKIE_OPTIONS = {
  httpOnly: false, // false so document.cookie can also set/read it
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 365, // 1 year
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { businessName, businessType, userId: bodyUserId } = body as Record<string, string>

  if (!businessName?.trim() || !businessType?.trim()) {
    return NextResponse.json({ error: 'Business name and type are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Prefer session user (OAuth / authenticated flows); fall back to explicit userId
  // passed from the email signup form (user exists in auth but has no session yet).
  let userId: string
  let ownerEmail: string

  const supabase = createRequestSupabaseClient(request)
  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser()

  if (sessionUser) {
    userId = sessionUser.id
    ownerEmail = sessionUser.email?.toLowerCase() ?? ''
  } else if (bodyUserId) {
    // Email signup — verify the user actually exists before trusting the id
    const {
      data: { user: authUser },
      error: userErr,
    } = await admin.auth.admin.getUserById(bodyUserId)
    if (userErr || !authUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 })
    }
    userId = authUser.id
    ownerEmail = authUser.email?.toLowerCase() ?? ''
  } else {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantUsersTable = admin.from('tenant_users') as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantsTable = admin.from('tenants') as any

  // Idempotent: workspace already set up for this user
  const { data: existing } = await tenantUsersTable
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    const response = NextResponse.json({ success: true })
    response.cookies.set('has-tenant', 'true', HAS_TENANT_COOKIE_OPTIONS)
    return response
  }

  const tenantSlug = `${slugify(businessName) || 'workspace'}-${userId.slice(0, 8)}`

  const { data: tenant, error: tenantError } = await tenantsTable
    .insert({
      name: businessName.trim(),
      slug: tenantSlug,
      owner_email: ownerEmail,
      business_type: businessType.toLowerCase(),
      plan: 'pro',
      subscription_status: 'trialing',
      // Consent is enforced client-side (required checkbox, disabled submit)
      // before this route is ever reached — this just records it for the
      // audit trail. Bump terms_version whenever Terms/Privacy is materially
      // updated, so we know which version each tenant accepted.
      terms_accepted_at: new Date().toISOString(),
      terms_accepted_ip: request.headers.get('x-forwarded-for') ?? null,
      terms_version: 'v1',
    })
    .select('id')
    .single()

  if (tenantError || !tenant) {
    console.error('Tenant insert error:', tenantError)
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
  }

  const { error: tenantUserError } = await tenantUsersTable.insert({
    tenant_id: tenant.id,
    user_id: userId,
    role: 'owner',
  })

  if (tenantUserError) {
    console.error('Tenant user insert error:', tenantUserError)
    await tenantsTable.delete().eq('id', tenant.id)
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('has-tenant', 'true', HAS_TENANT_COOKIE_OPTIONS)
  return response
}
