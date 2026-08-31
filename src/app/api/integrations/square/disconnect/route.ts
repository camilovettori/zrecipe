import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSquareTenantAccess, SQUARE_PLAN_ERROR } from '@/lib/square/auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const access = await requireSquareTenantAccess(request, true)
    const admin = createAdminClient()
    // Deletes encrypted credentials and imported sales for this tenant. The
    // seller can also revoke ZRecipe in Square's app permissions at any time.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin.from('square_connections') as any)
      .delete()
      .eq('tenant_id', access.tenantId)
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to disconnect Square.'
    const status = message === 'Unauthorized' ? 401 : message === SQUARE_PLAN_ERROR ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
