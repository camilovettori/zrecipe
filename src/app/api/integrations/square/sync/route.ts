import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSquareTenantAccess, SQUARE_PLAN_ERROR } from '@/lib/square/auth'
import {
  buildSquareOrderRow,
  encryptSquareSecret,
  getValidSquareAccessToken,
  squareApi,
  syncOrderLineItems,
  type SquareConnectionRecord,
  type SquareOrderForSync,
} from '@/lib/square/server'

export const runtime = 'nodejs'
export const maxDuration = 60

type SquareOrder = SquareOrderForSync & { total_service_charge_money?: { amount?: number | bigint | string | null; currency?: string | null } }
type SquareLocations = Array<{ id?: string; name?: string; status?: string }>

function isoDaysAgo(days: number) {
  const value = new Date()
  value.setDate(value.getDate() - days)
  return value.toISOString()
}

export async function POST(request: NextRequest) {
  let tenantId: string | null = null
  let connectionId: string | null = null

  try {
    const access = await requireSquareTenantAccess(request, true)
    tenantId = access.tenantId
    const admin = createAdminClient()
    const body = await request.json().catch(() => ({})) as { lookbackDays?: number }
    const requestedDays = Number(body.lookbackDays ?? 90)
    const lookbackDays = Number.isFinite(requestedDays) ? Math.min(Math.max(Math.round(requestedDays), 1), 365) : 90

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: connection, error: connectionError } = await (admin.from('square_connections') as any)
      .select('id, tenant_id, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, locations')
      .eq('tenant_id', access.tenantId)
      .maybeSingle()
    if (connectionError) throw new Error(connectionError.message)
    if (!connection) throw new Error('Connect Square before importing sales.')
    connectionId = connection.id

    const accessToken = await getValidSquareAccessToken(connection as SquareConnectionRecord, async (tokens) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin.from('square_connections') as any)
        .update({
          access_token_ciphertext: encryptSquareSecret(tokens.accessToken),
          refresh_token_ciphertext: encryptSquareSecret(tokens.refreshToken),
          token_expires_at: tokens.expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)
        .eq('tenant_id', access.tenantId)
      if (error) throw new Error(`Unable to save refreshed Square credentials: ${error.message}`)
    })

    let locations = (connection.locations ?? []) as SquareLocations
    if (!locations.length) {
      const response = await squareApi<{ locations?: SquareLocations }>(accessToken, '/v2/locations')
      locations = (response.locations ?? [])
        .filter((location) => location.id && location.status === 'ACTIVE')
        .map((location) => ({ id: location.id, name: location.name ?? 'Square location', status: location.status }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin.from('square_connections') as any)
        .update({ locations, updated_at: new Date().toISOString() })
        .eq('id', connection.id)
      if (error) throw new Error(error.message)
    }

    const locationIds = locations.map((location) => location.id).filter((id): id is string => Boolean(id))
    if (!locationIds.length) throw new Error('No active Square locations were found for this account.')

    const startAt = isoDaysAgo(lookbackDays)
    const endAt = new Date().toISOString()
    let cursor: string | undefined
    let imported = 0
    let pages = 0

    do {
      const response = await squareApi<{ orders?: SquareOrder[]; cursor?: string }>(accessToken, '/v2/orders/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_ids: locationIds,
          cursor,
          limit: 500,
          query: {
            filter: {
              date_time_filter: {
                created_at: { start_at: startAt, end_at: endAt },
              },
            },
            sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' },
          },
        }),
      })

      const orders = response.orders ?? []
      if (orders.length) {
        const rows = orders.map((order) => buildSquareOrderRow(order, access.tenantId, connection.id))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: orderError } = await (admin.from('square_orders') as any)
          .upsert(rows, { onConflict: 'tenant_id,square_order_id' })
        if (orderError) throw new Error(`Unable to store Square sales: ${orderError.message}`)

        // Per-order, not batched across the page: syncOrderLineItems upserts
        // this order's current lines then prunes only this order's own stale
        // uids, so one order's fresh uids can never protect (or accidentally
        // delete) another order's rows. See its doc comment in server.ts for
        // why upsert-then-prune is safe as two separate calls.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lineItemTable = admin.from('square_order_line_items') as any
        for (const order of orders) {
          await syncOrderLineItems(lineItemTable, order, access.tenantId)
        }

        imported += orders.length
      }

      cursor = response.cursor
      pages += 1
      if (pages > 100) throw new Error('Square returned too many pages. Please sync a shorter date range.')
    } while (cursor)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (admin.from('square_connections') as any)
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
      .eq('tenant_id', access.tenantId)
    if (updateError) throw new Error(updateError.message)

    return NextResponse.json({ success: true, imported, lookbackDays })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to synchronize Square sales.'
    if (tenantId && connectionId) {
      try {
        const admin = createAdminClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin.from('square_connections') as any)
          .update({ last_sync_status: 'failed', last_sync_error: message.slice(0, 500), updated_at: new Date().toISOString() })
          .eq('id', connectionId)
          .eq('tenant_id', tenantId)
      } catch {
        // Preserve the original error response if the failure itself cannot be recorded.
      }
    }
    const status = message === 'Unauthorized' ? 401 : message === SQUARE_PLAN_ERROR ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
