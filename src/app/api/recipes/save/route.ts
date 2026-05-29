import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'

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
    console.log('[RECIPE SAVE] === START ===')
    console.log('[RECIPE SAVE] User:', user?.id)
    console.log('[RECIPE SAVE] Recipe data:', JSON.stringify(body).substring(0, 500))

    const admin = createAdminClient()

    console.log('[RECIPE SAVE] Looking up tenant...')
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
    console.log('[RECIPE SAVE] Tenant:', tenantId)

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
      overhead_cost: body.overheadCost,
      selling_price: body.sellingPrice,
      image_url: body.imageUrl,
      is_active: true,
      is_sub_ingredient: body.isSubIngredient ?? false,
      sub_ingredient_unit: body.subIngredientUnit || 'g',
      sub_ingredient_cost_per_unit: body.subIngredientCostPerUnit ?? null,
    }

    let recipeId: string

    if (body.id) {
      console.log('[RECIPE SAVE] Updating recipe...')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: recipe, error: recipeError } = await (admin.from('recipes') as any)
        .update(recipeData)
        .eq('id', body.id)
        .eq('tenant_id', tenantId)
        .select('id')
        .single()
      console.log('[RECIPE SAVE] Recipe result:', recipe?.id, 'error:', JSON.stringify(recipeError))
      if (recipeError || !recipe) throw recipeError ?? new Error('Unable to update recipe')
      recipeId = recipe.id
    } else {
      console.log('[RECIPE SAVE] Inserting recipe...')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: recipe, error: recipeError } = await (admin.from('recipes') as any)
        .insert(recipeData)
        .select('id')
        .single()
      console.log('[RECIPE SAVE] Recipe result:', recipe?.id, 'error:', JSON.stringify(recipeError))
      if (recipeError || !recipe) throw recipeError ?? new Error('Unable to create recipe')
      recipeId = recipe.id
    }

    console.log('[RECIPE SAVE] Deleting existing recipe ingredients...')
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
        })
      )
      console.log('[RECIPE SAVE] Inserting ingredients...')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: ingError } = await (admin.from('recipe_ingredients') as any).insert(ingredientRows)
      console.log('[RECIPE SAVE] Ingredients error:', JSON.stringify(ingError))
      if (ingError) throw ingError
    }

    return NextResponse.json({ success: true, recipeId })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[RECIPE SAVE] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
