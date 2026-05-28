import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from "@/lib/supabase/middleware";
import { getEffectiveSubscriptionStatus, getTenantContext } from '@/lib/tenant'

const PUBLIC_PATHS = ["/login", "/register", "/auth/callback", "/api/webhooks"];

// Authenticated paths that skip tenant/subscription checks.
// /workspace/setup — new OAuth users who have no tenant yet.
// /api/auth/setup-tenant — the API route called from that page.
const SETUP_PATHS = ["/workspace/setup", "/api/auth/setup-tenant"];

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

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (user && !isPublicPath(pathname) && !isSetupPath(pathname)) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll() {
            // Middleware only needs to read the session state.
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
