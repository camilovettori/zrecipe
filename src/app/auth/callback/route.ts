import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildWorkspaceSlug(businessName: string, userId: string) {
  const base = slugify(businessName) || 'workspace'
  return `${base}-${userId.slice(0, 8)}`
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function applyCookies(
  response: NextResponse,
  cookiesToSet: Array<{
    name: string
    value: string
    options?: Parameters<NextResponse['cookies']['set']>[2]
  }>
) {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })
}

function setHasTenantCookie(response: NextResponse) {
  response.cookies.set('has-tenant', 'true', {
    httpOnly: false, // false so document.cookie can also write it as a fallback
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  })
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextPath = requestUrl.searchParams.get('next')
  const destination =
    nextPath && nextPath.startsWith('/') && nextPath !== '/' && nextPath !== '/login' && nextPath !== '/auth/callback'
      ? nextPath
      : '/dashboard'
  const admin = createAdminClient()
  const cookiesToSet: Array<{
    name: string
    value: string
    options?: Parameters<NextResponse['cookies']['set']>[2]
  }> = []

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=workspace_setup_failed', request.url))
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookies) {
          cookiesToSet.push(...cookies)
        },
      },
    }
  )

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    console.error('Auth callback exchange error:', exchangeError)
    const response = NextResponse.redirect(
      new URL('/login?error=workspace_setup_failed', request.url)
    )
    applyCookies(response, cookiesToSet)
    return response
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    console.error('Auth callback user error:', userError)
    await supabase.auth.signOut()
    const response = NextResponse.redirect(
      new URL('/login?error=workspace_setup_failed', request.url)
    )
    applyCookies(response, cookiesToSet)
    return response
  }

  const metadata = user.user_metadata ?? {}
  const businessName = isString(metadata.business_name) ? metadata.business_name : 'Workspace'
  const fullName = isString(metadata.full_name) ? metadata.full_name : ''
  const businessType = isString(metadata.business_type)
    ? metadata.business_type.toLowerCase()
    : 'other'
  const plan = isString(metadata.plan) ? metadata.plan : 'pro'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantUsersTable = admin.from('tenant_users') as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantsTable = admin.from('tenants') as any

  const { data: existingMember, error: memberLookupError } = await tenantUsersTable
    .select('id, tenant_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (memberLookupError) {
    console.error('Tenant user lookup error:', memberLookupError)
    await supabase.auth.signOut()
    const response = NextResponse.redirect(
      new URL('/login?error=workspace_setup_failed', request.url)
    )
    applyCookies(response, cookiesToSet)
    return response
  }

  if (existingMember) {
    const response = NextResponse.redirect(new URL(destination, request.url))
    applyCookies(response, cookiesToSet)
    setHasTenantCookie(response)
    return response
  }

  // OAuth users (e.g. Google) arrive here without business metadata.
  // Send them to the workspace setup form to collect it.
  if (!isString(metadata.business_name)) {
    const setupUrl = new URL('/workspace/setup', request.url)
    setupUrl.searchParams.set('next', destination)
    const response = NextResponse.redirect(setupUrl)
    applyCookies(response, cookiesToSet)
    return response
  }

  const ownerEmail = user.email?.toLowerCase() ?? ''
  const tenantSlug = buildWorkspaceSlug(businessName, user.id)
  const { data: tenant, error: tenantError } = await tenantsTable
    .insert({
      name: businessName,
      slug: tenantSlug,
      owner_email: ownerEmail,
      business_type: businessType,
      plan,
      subscription_status: 'trialing',
      // Consent is enforced client-side (required checkbox, disabled submit)
      // on the register form before signUp is ever called — this just
      // records it for the audit trail. Bump terms_version whenever
      // Terms/Privacy is materially updated, so we know which version each
      // tenant accepted.
      terms_accepted_at: new Date().toISOString(),
      terms_accepted_ip: request.ip ?? request.headers.get('x-forwarded-for') ?? null,
      terms_version: 'v1',
    })
    .select('id')
    .single()

  if (tenantError || !tenant) {
    console.error('Tenant insert error:', tenantError)
    await supabase.auth.signOut()
    const response = NextResponse.redirect(
      new URL('/login?error=workspace_setup_failed', request.url)
    )
    applyCookies(response, cookiesToSet)
    return response
  }

  const { error: tenantUserError } = await tenantUsersTable
    .insert({
      tenant_id: tenant.id,
      user_id: user.id,
      role: 'owner',
    })

  if (tenantUserError) {
    console.error('Tenant user insert error:', tenantUserError)
    const { error: cleanupError } = await tenantsTable.delete().eq('id', tenant.id)
    if (cleanupError) {
      console.error('Tenant cleanup error:', cleanupError)
    }
    await supabase.auth.signOut()
    const response = NextResponse.redirect(
      new URL('/login?error=workspace_setup_failed', request.url)
    )
    applyCookies(response, cookiesToSet)
    return response
  }

  if (fullName) {
    const { error: profileError } = await supabase.auth.updateUser({
      data: {
        full_name: fullName,
        business_name: businessName,
        business_type: businessType,
        plan,
      },
    })

    if (profileError) {
      console.error('Auth metadata update error:', profileError)
    }
  }

  const response = NextResponse.redirect(new URL(destination, request.url))
  applyCookies(response, cookiesToSet)
  setHasTenantCookie(response)
  return response
}
