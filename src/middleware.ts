import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from "@/lib/supabase/middleware";
import { getEffectiveSubscriptionStatus, getTenantContext } from '@/lib/tenant'

const PUBLIC_PATHS = ["/login", "/register", "/auth/callback", "/api/webhooks"];

// Authenticated paths that skip tenant/subscription checks.
const SETUP_PATHS = ["/workspace/setup", "/api/auth/setup-tenant"];

// Cookie name used to cache "user has a tenant" across requests.
// Avoids a DB round-trip on every navigation once the check has passed.
const HAS_TENANT_COOKIE = 'has-tenant'

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function isSetupPath(pathname: string) {
  return SETUP_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

// Direct Supabase REST call with the service role key — bypasses RLS and is
// Edge-compatible (no Node.js APIs, pure fetch).
async function userHasTenant(userId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tenant_users?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        cache: 'no-store',
      }
    )
    if (!res.ok) return true // fail open on infrastructure errors
    const rows: unknown[] = await res.json()
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return true // fail open — don't lock users out due to DB errors
  }
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // ── Unauthenticated users ────────────────────────────────────────────────
  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  // ── Redirect logged-in users away from auth pages ────────────────────────
  if (user && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ── Protected routes: tenant presence + subscription checks ─────────────
  if (user && !isPublicPath(pathname) && !isSetupPath(pathname)) {

    // ── 1. Tenant presence check (with cookie cache) ──────────────────────
    // On first visit: DB query via service role to check tenant_users.
    // On subsequent visits: trust the cookie, skip the DB call.
    const hasTenantCookie = request.cookies.get(HAS_TENANT_COOKIE)?.value === 'true'

    if (!hasTenantCookie) {
      const hasTenant = await userHasTenant(user.id)

      if (!hasTenant) {
        // No workspace yet — redirect BEFORE any page content loads.
        // Copy auth cookies so the session survives the redirect.
        const setupUrl = new URL('/workspace/setup', request.url)
        const redirectResponse = NextResponse.redirect(setupUrl)
        response.cookies.getAll().forEach(({ name, value }) => {
          redirectResponse.cookies.set(name, value)
        })
        return redirectResponse
      }

      // Workspace confirmed — cache for the next 24 hours.
      response.cookies.set(HAS_TENANT_COOKIE, 'true', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24,
      })
    }

    // ── 2. Subscription status check ──────────────────────────────────────
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll() {
            // Middleware only reads session state — writes are handled by updateSession.
          },
        },
      }
    )

    const context = await getTenantContext(supabase, user.id)
    if (context) {
      const effectiveStatus = getEffectiveSubscriptionStatus(
        context.tenant.subscriptionStatus,
        context.tenant.createdAt
      )

      const isBillingSettings =
        pathname === '/settings' && request.nextUrl.searchParams.get('tab') === 'billing'

      if (effectiveStatus === 'canceled' || effectiveStatus === 'past_due') {
        if (!isBillingSettings) {
          const redirectUrl = new URL('/settings', request.url)
          redirectUrl.searchParams.set('tab', 'billing')
          redirectUrl.searchParams.set('notice', 'subscription_locked')
          const redirectResponse = NextResponse.redirect(redirectUrl)
          response.cookies.getAll().forEach(({ name, value }) => {
            redirectResponse.cookies.set(name, value)
          })
          return redirectResponse
        }
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:css|js|mjs|map|json|txt|xml|ico|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|otf|eot|glb)$).*)",
  ],
};
