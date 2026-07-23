import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from "@/lib/supabase/middleware";

// Routes restricted by role (checked only when path matches — keeps middleware fast)
const OWNER_ONLY_PREFIXES = ['/settings/billing']
const STAFF_BLOCKED_PREFIXES = ['/settings', '/invoices']

// Paths that never need a tenant check
const EXEMPT_PREFIXES = [
  '/login',
  '/signup',
  '/register',
  '/auth',
  '/api',           // all API routes — they handle their own auth
  '/workspace/setup',
  '/suspended',     // shown to suspended tenants — must be exempt to avoid redirect loop
  '/models',
  '/privacy',
  '/terms',
  '/gdpr',
  '/_next',
  '/favicon',
]

function isExemptPath(pathname: string): boolean {
  return EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
}

async function checkTenantStatus(
  userId: string
): Promise<{ hasTenant: boolean; isSuspended: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return { hasTenant: true, isSuspended: false }

  try {
    const adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Join tenant_users → tenants to get both existence and subscription_status in one query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tenantData, error: tenantError } = await (adminClient.from('tenant_users') as any)
      .select('tenant_id, tenants(subscription_status)')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    if (tenantError) {
      console.error('Middleware tenant check failed:', tenantError.message)
      return { hasTenant: true, isSuspended: false }
    }

    if (tenantData === null) {
      return { hasTenant: false, isSuspended: false }
    }

    const status = tenantData.tenants?.subscription_status as string | undefined
    const isSuspended = status === 'suspended'
    return { hasTenant: true, isSuspended }
  } catch (error) {
    console.error(
      'Middleware tenant check failed:',
      error instanceof Error ? error.message : error
    )
    return { hasTenant: true, isSuspended: false }
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const { response, user } = await updateSession(request)

  // Root path: public marketing page for logged-out visitors,
  // dashboard for logged-in users.
  if (pathname === '/') {
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // ── Exempt paths bypass all checks ──────────────────────────────────────
  if (isExemptPath(pathname)) {
    return response
  }

  // ── Unauthenticated → login ──────────────────────────────────────────────
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', `${pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(loginUrl)
  }

  // ── Logged-in users off auth pages ───────────────────────────────────────
  if (pathname === '/login' || pathname === '/register' || pathname === '/signup') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ── Super-admin route guard ──────────────────────────────────────────────
  if (pathname.startsWith('/adminziffera')) {
    if (user.email !== 'camilovettori@gmail.com') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    // Admin passes through without a tenant check
    return response
  }

  // ── Tenant presence check ────────────────────────────────────────────────
  const hasTenantCookie = request.cookies.get('has-tenant')?.value === 'true'

  if (!hasTenantCookie) {
    const { hasTenant, isSuspended } = await checkTenantStatus(user.id)

    if (isSuspended) {
      const redirectResponse = NextResponse.redirect(new URL('/suspended', request.url))
      response.cookies.getAll().forEach(({ name, value }) => {
        redirectResponse.cookies.set(name, value)
      })
      // Don't set has-tenant cookie for suspended tenants so they're re-checked on every request
      return redirectResponse
    }

    if (!hasTenant) {
      const redirectResponse = NextResponse.redirect(
        new URL('/workspace/setup', request.url)
      )
      response.cookies.getAll().forEach(({ name, value }) => {
        redirectResponse.cookies.set(name, value)
      })
      return redirectResponse
    }

    response.cookies.set('has-tenant', 'true', {
      httpOnly: false, // false allows document.cookie to also write it as a fallback
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  // ── Role-based access (only checked for protected paths) ─────────────────
  const needsRoleCheck =
    OWNER_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) ||
    STAFF_BLOCKED_PREFIXES.some((p) => pathname.startsWith(p))

  if (needsRoleCheck) {
    const roleCookie = request.cookies.get('user-role')?.value

    let role = roleCookie ?? ''

    if (!role) {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
        if (url && key) {
          const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: m } = await (admin.from('tenant_users') as any)
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle()
          role = m?.role ?? 'staff'
        }
      } catch {
        role = 'staff'
      }
    }

    if (role === 'staff' && STAFF_BLOCKED_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/recipes', request.url))
    }

    if (role !== 'owner' && OWNER_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/settings', request.url))
    }

    // Cache the role in a cookie (1 day) to avoid a DB query on every navigation
    response.cookies.set('user-role', role, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    })
  }

  // Subscription status is enforced in the UI via useSubscription() / limits,
  // not by blocking middleware redirects.  Canceled/past_due users stay in the
  // app with FREE_LIMITS restrictions so they can still access their data.
  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:css|js|mjs|map|json|txt|xml|ico|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|otf|eot|glb|mp4|webm)$).*)",
  ],
}
