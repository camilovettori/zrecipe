import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  encryptSquareSecret,
  exchangeAuthorizationCode,
  squareApi,
  verifyOAuthState,
} from '@/lib/square/server'
import { verifySquareTenantManager } from '@/lib/square/auth'

export const runtime = 'nodejs'

type SquareLocation = { id: string; name?: string; status?: string }

function redirectBack(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/settings/integrations/square', request.url)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  try {
    const error = request.nextUrl.searchParams.get('error')
    const state = request.nextUrl.searchParams.get('state')
    if (!state) throw new Error('Square did not return a connection state.')
    const payload = verifyOAuthState(state)

    if (error) {
      return redirectBack(request, { square_error: request.nextUrl.searchParams.get('error_description') || 'Square connection was cancelled.' })
    }

    const code = request.nextUrl.searchParams.get('code')
    if (!code) throw new Error('Square did not return an authorization code.')

    await verifySquareTenantManager(payload.userId, payload.tenantId)
    const tokens = await exchangeAuthorizationCode(code)
    if (!tokens.access_token || !tokens.refresh_token || !tokens.merchant_id) {
      throw new Error('Square did not return the credentials needed to complete the connection.')
    }

    const locationsResponse = await squareApi<{ locations?: SquareLocation[] }>(
      tokens.access_token,
      '/v2/locations'
    )
    const locations = (locationsResponse.locations ?? [])
      .filter((location) => location.status === 'ACTIVE')
      .map((location) => ({ id: location.id, name: location.name ?? 'Square location' }))

    let merchantName: string | null = null
    try {
      const merchantResponse = await squareApi<{ merchant?: { business_name?: string } }>(
        tokens.access_token,
        `/v2/merchants/${tokens.merchant_id}`
      )
      merchantName = merchantResponse.merchant?.business_name ?? null
    } catch {
      // Merchant name is cosmetic. The authenticated merchant ID is enough to
      // complete the connection when this optional profile request is denied.
    }

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: saveError } = await (admin.from('square_connections') as any)
      .upsert({
        tenant_id: payload.tenantId,
        merchant_id: tokens.merchant_id,
        merchant_name: merchantName,
        access_token_ciphertext: encryptSquareSecret(tokens.access_token),
        refresh_token_ciphertext: encryptSquareSecret(tokens.refresh_token),
        token_expires_at: tokens.expires_at ?? null,
        granted_scopes: ['MERCHANT_PROFILE_READ', 'ORDERS_READ', 'PAYMENTS_READ', 'ITEMS_READ'],
        locations,
        last_sync_status: 'never',
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' })

    if (saveError) throw new Error(`Unable to save Square connection: ${saveError.message}`)
    return redirectBack(request, { square_connected: '1' })
  } catch (error) {
    console.error('[square/callback]', error)
    const message = error instanceof Error ? error.message : 'Unable to complete Square connection.'
    return redirectBack(request, { square_error: message })
  }
}
