import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSquareTenantAccess, SQUARE_PLAN_ERROR } from '@/lib/square/auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const access = await requireSquareTenantAccess(request)
    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: connection, error } = await (admin.from('square_connections') as any)
      .select('id, merchant_id, merchant_name, locations, last_synced_at, last_sync_status, last_sync_error, created_at')
      .eq('tenant_id', access.tenantId)
      .maybeSingle()
    if (error) throw new Error(error.message)

    if (!connection) {
      return NextResponse.json({ connected: false, configured: Boolean(process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_APPLICATION_SECRET) })
    }

    const from = new Date()
    from.setDate(from.getDate() - 30)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentOrders, error: salesError } = await (admin.from('square_orders') as any)
      .select('total_amount_cents, currency')
      .eq('tenant_id', access.tenantId)
      .eq('state', 'COMPLETED')
      .gte('created_at_square', from.toISOString())
    if (salesError) throw new Error(salesError.message)

    const orders = recentOrders ?? []
    const salesCents = orders.reduce((sum: number, order: { total_amount_cents?: number }) => sum + Number(order.total_amount_cents ?? 0), 0)
    return NextResponse.json({
      connected: true,
      configured: true,
      connection: {
        merchantName: connection.merchant_name,
        merchantId: connection.merchant_id,
        locations: connection.locations ?? [],
        lastSyncedAt: connection.last_synced_at,
        lastSyncStatus: connection.last_sync_status,
        lastSyncError: connection.last_sync_error,
      },
      analytics: {
        periodDays: 30,
        orderCount: orders.length,
        salesCents,
        averageOrderCents: orders.length ? Math.round(salesCents / orders.length) : 0,
        currency: orders[0]?.currency ?? 'EUR',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Square connection.'
    const status = message === 'Unauthorized' ? 401 : message === SQUARE_PLAN_ERROR ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
