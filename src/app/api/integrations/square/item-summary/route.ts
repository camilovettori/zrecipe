import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSquareTenantAccess, SQUARE_PLAN_ERROR } from '@/lib/square/auth'

export const runtime = 'nodejs'

const ITEM_LOOKBACK_DAYS = 90
const DAILY_LOOKBACK_DAYS = 30

function isoDaysAgo(days: number) {
  const value = new Date()
  value.setDate(value.getDate() - days)
  return value.toISOString()
}

type SquareOrderRow = { square_order_id: string; total_amount_cents: number | null; currency: string | null; created_at_square: string }
type SquareLineItemRow = { square_order_id: string; name: string; quantity: number | string | null; total_amount_cents: number | null; currency: string | null }
type SquareLinkRow = { square_item_name: string; recipe_id: string }

export async function GET(request: NextRequest) {
  try {
    const access = await requireSquareTenantAccess(request)
    const admin = createAdminClient()

    // square_order_line_items has no state/date columns of its own — state
    // and created_at_square live on square_orders, joined only via a
    // composite (tenant_id, square_order_id) FK, which PostgREST doesn't
    // reliably auto-embed. Fetch both sides and join in JS instead (same
    // non-embedding style status/route.ts already uses), rather than
    // depending on embed syntax working for a composite key.
    const since90 = isoDaysAgo(ITEM_LOOKBACK_DAYS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orders, error: ordersError } = await (admin.from('square_orders') as any)
      .select('square_order_id, total_amount_cents, currency, created_at_square')
      .eq('tenant_id', access.tenantId)
      .eq('state', 'COMPLETED')
      .gte('created_at_square', since90)
    if (ordersError) throw new Error(ordersError.message)

    const completedOrders = (orders ?? []) as SquareOrderRow[]
    const completedOrderIds = new Set(completedOrders.map((order) => order.square_order_id))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lineItems, error: lineItemsError } = await (admin.from('square_order_line_items') as any)
      .select('square_order_id, name, quantity, total_amount_cents, currency')
      .eq('tenant_id', access.tenantId)
    if (lineItemsError) throw new Error(lineItemsError.message)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: links, error: linksError } = await (admin.from('square_item_recipe_links') as any)
      .select('square_item_name, recipe_id')
      .eq('tenant_id', access.tenantId)
    if (linksError) throw new Error(linksError.message)

    const linkByItemName = new Map(
      ((links ?? []) as SquareLinkRow[]).map((link) => [link.square_item_name, link.recipe_id])
    )

    type Agg = { unitsSold: number; revenueCents: number; currency: string }
    const byItem = new Map<string, Agg>()
    for (const line of (lineItems ?? []) as SquareLineItemRow[]) {
      if (!completedOrderIds.has(line.square_order_id)) continue
      const key = (line.name ?? '').trim()
      if (!key) continue
      const existing = byItem.get(key) ?? { unitsSold: 0, revenueCents: 0, currency: line.currency ?? 'EUR' }
      existing.unitsSold += Number(line.quantity ?? 0)
      existing.revenueCents += Number(line.total_amount_cents ?? 0)
      byItem.set(key, existing)
    }

    const items = [...byItem.entries()]
      .map(([itemName, agg]) => ({
        itemName,
        unitsSold: agg.unitsSold,
        revenueCents: agg.revenueCents,
        currency: agg.currency,
        linkedRecipeId: linkByItemName.get(itemName) ?? null,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents)

    const since30 = isoDaysAgo(DAILY_LOOKBACK_DAYS)
    const dailyMap = new Map<string, number>()
    for (const order of completedOrders) {
      if (order.created_at_square < since30) continue
      const day = order.created_at_square.slice(0, 10)
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + Number(order.total_amount_cents ?? 0))
    }
    const dailySales = [...dailyMap.entries()]
      .map(([date, revenueCents]) => ({ date, revenueCents }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({ items, dailySales })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Square item analytics.'
    const status = message === 'Unauthorized' ? 401 : message === SQUARE_PLAN_ERROR ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
