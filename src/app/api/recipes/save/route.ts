import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getEffectiveSubscriptionStatus } from '@/lib/tenant'
import { FREE_LIMITS } from '@/lib/subscription/limits'

export const runtime = 'nodejs'

type TenantUserRow = {
  tenant_id: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRequestSupabaseClient(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const admin = createAdminClient()

    const { data: member } = (await admin
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()) as { data: TenantUserRow | null }

    if (!member) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const tenantId = member.tenant_id

    // Enforce free plan recipe limit for new recipes only
    if (!body.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tenant } = await (admin.from('tenants') as any)
        .select('subscription_status, created_at')
        .eq('id', tenantId)
        .single()

      const effectiveStatus = getEffectiveSubscriptionStatus(
        tenant?.subscription_status ?? null,
        tenant?.created_at ?? new Date().toISOString()
      )
      const hasFullAccess = effectiveStatus === 'active' || effectiveStatus === 'trialing'

      if (!hasFullAccess) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = await (admin.from('recipes') as any)
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)

        if ((count ?? 0) >= FREE_LIMITS.maxRecipes) {
          return NextResponse.json(
            { error: `Free plan limit of ${FREE_LIMITS.maxRecipes} recipes reached. Upgrade to Pro for unlimited recipes.` },
            { status: 403 }
          )
        }
      }
    }

    const recipeData = {
      tenant_id: tenantId,
      name: body.name,
      description: body.description || null,
      category: body.category || 'Other',
      instructions: body.instructions,
      yield_quantity: body.yieldQuantity,
      yield_unit: body.yieldUnit,
      prep_time_minutes: body.prepTimeMinutes,
      cook_time_minutes: body.cookTimeMinutes,
      labor_cost: body.laborCost,
      labor_mode: body.laborMode ?? 'fixed',
      overhead_cost: body.overheadCost,
      overhead_mode: body.overheadMode ?? 'fixed',
      overhead_percent: body.overheadPercent ?? 0,
      waste_percent: body.wastePercent ?? 0,
      selling_price: body.sellingPrice,
      image_url: body.imageUrl,
      is_active: true,
      is_sub_ingredient: body.isSubIngredient ?? false,
      sub_ingredient_unit: body.subIngredientUnit || 'g',
      sub_ingredient_cost_per_unit: body.subIngredientCostPerUnit ?? null,
      storage_instructions: body.storageInstructions ?? null,
    }

    let recipeId: string

    if (body.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: recipe, error: recipeError } = await (admin.from('recipes') as any)
        .update(recipeData)
        .eq('id', body.id)
        .eq('tenant_id', tenantId)
        .select('id')
        .single()
      if (recipeError || !recipe) throw recipeError ?? new Error('Unable to update recipe')
      recipeId = recipe.id
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: recipe, error: recipeError } = await (admin.from('recipes') as any)
        .insert(recipeData)
        .select('id')
        .single()
      if (recipeError || !recipe) throw recipeError ?? new Error('Unable to create recipe')
      recipeId = recipe.id
    }

    const { error: deleteError } = await admin
      .from('recipe_ingredients')
      .delete()
      .eq('recipe_id', recipeId)
    if (deleteError) throw deleteError

    if (body.ingredients?.length > 0) {
      const ingredientRows = body.ingredients.map(
        (
          ing: {
            ingredientId?: string | null
            subRecipeId?: string | null
            quantity: number
            unit: string
            notes?: string | null
            ingredientName?: string
            yield_percent?: number | null
            yield_override?: boolean | null
            ep_weight_manual?: number | null
          },
          idx: number
        ) => ({
          recipe_id: recipeId,
          ingredient_id: ing.ingredientId ?? null,
          sub_recipe_id: ing.subRecipeId ?? null,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes ?? ing.ingredientName ?? null,
          sort_order: idx,
          tenant_id: tenantId,
          yield_percent: ing.yield_percent ?? 100,
          yield_override: ing.yield_override ?? false,
          ep_weight_manual: ing.ep_weight_manual ?? null,
        })
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: ingError } = await (admin.from('recipe_ingredients') as any).insert(ingredientRows)
      if (ingError) throw ingError
    }

    return NextResponse.json({ success: true, recipeId })
  } catch (error: unknown) {
    console.error('Recipe save failed:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
