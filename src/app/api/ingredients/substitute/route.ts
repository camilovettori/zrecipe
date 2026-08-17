import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getEffectiveSubscriptionStatus, getEffectiveTier } from '@/lib/tenant'
import { getLimitsForTier } from '@/lib/subscription/limits'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const supabase = createRequestSupabaseClient(request)
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as {
    currentIngredientId?: unknown
    replacementKind?: unknown
    replacementId?: unknown
  }
  const currentIngredientId = typeof body.currentIngredientId === 'string'
    ? body.currentIngredientId
    : ''
  const replacementId = typeof body.replacementId === 'string' ? body.replacementId : ''
  const replacementKind = body.replacementKind

  if (!currentIngredientId || !replacementId || !['ingredient', 'subRecipe'].includes(String(replacementKind))) {
    return NextResponse.json({ error: 'Invalid substitution request' }, { status: 400 })
  }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (admin.from('tenant_users') as any)
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const tenantId = member.tenant_id as string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (admin.from('tenants') as any)
    .select('subscription_status, plan_tier, is_comped, created_at')
    .eq('id', tenantId)
    .single()
  const status = getEffectiveSubscriptionStatus(
    tenant?.subscription_status,
    tenant?.created_at ?? new Date().toISOString()
  )
  const tier = getEffectiveTier({
    subscription_status: status,
    plan_tier: tenant?.plan_tier,
    is_comped: tenant?.is_comped,
  })

  if (!getLimitsForTier(tier).canSubstituteAcrossRecipes) {
    return NextResponse.json({ error: 'Upgrade to Pro' }, { status: 403 })
  }

  const { data: currentIngredient } = await admin
    .from('ingredients')
    .select('id')
    .eq('id', currentIngredientId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!currentIngredient) {
    return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 })
  }

  const targetTable = replacementKind === 'ingredient' ? 'ingredients' : 'recipes'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: replacement } = await (admin.from(targetTable) as any)
    .select('id, name')
    .eq('id', replacementId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!replacement) {
    return NextResponse.json({ error: 'Replacement not found' }, { status: 404 })
  }

  const updatePayload = replacementKind === 'ingredient'
    ? { ingredient_id: replacement.id, sub_recipe_id: null, notes: replacement.name }
    : { sub_recipe_id: replacement.id, ingredient_id: null, notes: replacement.name }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (admin.from('recipe_ingredients') as any)
    .update(updatePayload)
    .eq('tenant_id', tenantId)
    .eq('ingredient_id', currentIngredientId)
    .select('id')

  if (error) {
    return NextResponse.json({ error: 'Failed to substitute ingredient' }, { status: 500 })
  }

  return NextResponse.json({ success: true, affectedCount: updated?.length ?? 0 })
}
