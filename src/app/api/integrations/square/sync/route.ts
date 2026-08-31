import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSquareTenantAccess } from '@/lib/square/auth'
import {
  encryptSquareSecret,
  getValidSquareAccessToken,
  squareApi,
  type SquareConnectionRecord,
} from '@/lib/square/server'

export const runtime = 'nodejs'
export const maxDuration = 60

type SquareMoney = { amount?: number | bigint | string | null; currency?: string | null }
type SquareLineItem = {
  uid?: string
  catalog_object_id?: string
  catalog_version?: number | bigint | string | null
  name?: string
  quantity?: string | number
  base_price_money?: SquareMoney
  gross_sales_money?: SquareMoney
  total_money?: SquareMoney
  variation_name?: string
  catalog_object?: { sku?: string }
}
type SquareOrder = {
  id: string
  location_id?: string
  state?: string
  source?: { name?: string }
  created_at?: string
  updated_at?: string
  closed_at?: string
  total_money?: SquareMoney
  total_tax_money?: SquareMoney
  total_discount_money?: SquareMoney
  total_service_charge_money?: SquareMoney
  line_items?: SquareLineItem[]
}
type SquareLocations = Array<{ id?: string; name?: string; status?: string }>

function cents(money?: SquareMoney) {
  return Number(money?.amount ?? 0)
}

function isoDaysAgo(days: number) {
  const value = new Date()
  value.setDate(value.getDate() - days)
  return value.toISOString()
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
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
        const rows = orders.map((order) => ({
          tenant_id: access.tenantId,
          connection_id: connection.id,
          square_order_id: order.id,
          location_id: order.location_id ?? null,
          state: order.state ?? 'UNKNOWN',
          source_name: order.source?.name ?? null,
          created_at_square: order.created_at ?? new Date().toISOString(),
          updated_at_square: order.updated_at ?? null,
          closed_at_square: order.closed_at ?? null,
          currency: order.total_money?.currency ?? 'EUR',
          gross_amount_cents: Math.max(0, cents(order.total_money) + cents(order.total_discount_money)),
          discount_amount_cents: cents(order.total_discount_money),
          tax_amount_cents: cents(order.total_tax_money),
          net_amount_cents: Math.max(0, cents(order.total_money) - cents(order.total_tax_money)),
          total_amount_cents: cents(order.total_money),
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: orderError } = await (admin.from('square_orders') as any)
          .upsert(rows, { onConflict: 'tenant_id,square_order_id' })
        if (orderError) throw new Error(`Unable to store Square sales: ${orderError.message}`)

        const orderIds = orders.map((order) => order.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: deleteLinesError } = await (admin.from('square_order_line_items') as any)
          .delete()
          .eq('tenant_id', access.tenantId)
          .in('square_order_id', orderIds)
        if (deleteLinesError) throw new Error(`Unable to refresh Square sale items: ${deleteLinesError.message}`)

        const lineRows = orders.flatMap((order) => (order.line_items ?? []).map((line, index) => ({
          tenant_id: access.tenantId,
          square_order_id: order.id,
          square_line_item_uid: line.uid ?? `${order.id}-${index}`,
          catalog_object_id: line.catalog_object_id ?? null,
          catalog_version: line.catalog_version != null ? Number(line.catalog_version) : null,
          sku: line.catalog_object?.sku ?? null,
          name: line.name || line.variation_name || 'Square item',
          quantity: Number(line.quantity ?? 0),
          gross_amount_cents: cents(line.gross_sales_money ?? line.base_price_money),
          total_amount_cents: cents(line.total_money),
          currency: line.total_money?.currency ?? order.total_money?.currency ?? 'EUR',
          updated_at: new Date().toISOString(),
        })))

        for (const rowsChunk of chunk(lineRows, 500)) {
          if (!rowsChunk.length) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: lineError } = await (admin.from('square_order_line_items') as any).insert(rowsChunk)
          if (lineError) throw new Error(`Unable to store Square sale items: ${lineError.message}`)
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
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 500 })
  }
}
