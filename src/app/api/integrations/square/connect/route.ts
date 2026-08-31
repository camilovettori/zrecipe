import { NextRequest, NextResponse } from 'next/server'
import { requireSquareTenantAccess } from '@/lib/square/auth'
import { createOAuthState, getSquareAuthorizeUrl } from '@/lib/square/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const access = await requireSquareTenantAccess(request, true)
    const state = createOAuthState({ tenantId: access.tenantId, userId: access.userId })
    return NextResponse.redirect(getSquareAuthorizeUrl(state))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start Square connection.'
    const url = new URL('/settings/integrations/square', request.url)
    url.searchParams.set('square_error', message)
    return NextResponse.redirect(url)
  }
}
