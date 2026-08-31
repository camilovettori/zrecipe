import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSquareTenantAccess, SQUARE_PLAN_ERROR } from '@/lib/square/auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const access = await requireSquareTenantAccess(request)
    const body = await request.json().catch(() => ({})) as { squareItemName?: string; recipeId?: string }
    const squareItemName = typeof body.squareItemName === 'string' ? body.squareItemName.trim() : ''
    const recipeId = typeof body.recipeId === 'string' ? body.recipeId : ''
    if (!squareItemName || !recipeId) {
      return NextResponse.json({ error: 'squareItemName and recipeId are required.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // recipeId is client-supplied — confirm it belongs to this tenant before
    // linking, rather than trusting it. This is the tenant-isolation check
    // for this write (the link row itself is tenant-scoped either way, but
    // a cross-tenant recipeId would otherwise create a dangling/wrong
    // reference instead of failing loudly).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recipe, error: recipeError } = await (admin.from('recipes') as any)
      .select('id')
      .eq('id', recipeId)
      .eq('tenant_id', access.tenantId)
      .maybeSingle()
    if (recipeError) throw new Error(recipeError.message)
    if (!recipe) return NextResponse.json({ error: 'Recipe not found.' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin.from('square_item_recipe_links') as any).upsert(
      { tenant_id: access.tenantId, square_item_name: squareItemName, recipe_id: recipeId },
      { onConflict: 'tenant_id,square_item_name' }
    )
    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to link Square item.'
    const status = message === 'Unauthorized' ? 401 : message === SQUARE_PLAN_ERROR ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireSquareTenantAccess(request)
    const body = await request.json().catch(() => ({})) as { squareItemName?: string }
    const squareItemName = typeof body.squareItemName === 'string' ? body.squareItemName.trim() : ''
    if (!squareItemName) {
      return NextResponse.json({ error: 'squareItemName is required.' }, { status: 400 })
    }

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin.from('square_item_recipe_links') as any)
      .delete()
      .eq('tenant_id', access.tenantId)
      .eq('square_item_name', squareItemName)
    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to unlink Square item.'
    const status = message === 'Unauthorized' ? 401 : message === SQUARE_PLAN_ERROR ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
