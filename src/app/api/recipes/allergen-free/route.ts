import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'

export const runtime = 'nodejs'

// GET /api/recipes/allergen-free?allergen_id=2
// Returns { excludeRecipeIds: string[] }
// excludeRecipeIds = recipes that CONTAIN or MAY CONTAIN the allergen
// The client filters: show recipes NOT in this list.

export async function GET(request: NextRequest) {
  try {
    const supabase = createRequestSupabaseClient(request)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const allergenId = Number(new URL(request.url).searchParams.get('allergen_id'))
    if (!allergenId || !Number.isFinite(allergenId)) {
      return NextResponse.json({ error: 'allergen_id required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Get the user's tenant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (admin.from('tenant_users') as any)
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ excludeRecipeIds: [] })
    }

    const tenantId = member.tenant_id as string

    // Get ingredient IDs in this tenant that contain/may_contain the allergen
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allergenRows } = await (admin.from('ingredient_allergens') as any)
      .select('ingredient_id')
      .eq('allergen_id', allergenId)

    const allergenIngredientIds: string[] = (allergenRows ?? []).map(
      (r: { ingredient_id: string }) => r.ingredient_id
    )

    if (allergenIngredientIds.length === 0) {
      return NextResponse.json({ excludeRecipeIds: [] })
    }

    // Verify those ingredients belong to this tenant (security + relevance)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tenantIngs } = await (admin.from('ingredients') as any)
      .select('id')
      .eq('tenant_id', tenantId)
      .in('id', allergenIngredientIds)

    const tenantAllergenIngIds = (tenantIngs ?? []).map((i: { id: string }) => i.id)
    if (tenantAllergenIngIds.length === 0) {
      return NextResponse.json({ excludeRecipeIds: [] })
    }

    type RecipeIngredientRow = {
      ingredient_id?: string | null
      sub_recipe_id?: string | null
    }

    type RecipeRow = {
      id: string
      recipe_ingredients?: RecipeIngredientRow[] | RecipeIngredientRow | null
    }

    // Pull all tenant recipes and inspect their ingredient tree locally so
    // sub-recipes inherit allergen matches from nested ingredients.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recipeRows } = await (admin.from('recipes') as any)
      .select(
        `
          id,
          recipe_ingredients!recipe_ingredients_recipe_id_fkey (
            ingredient_id,
            sub_recipe_id
          )
        `
      )
      .eq('tenant_id', tenantId)

    const recipeMap = new Map<string, RecipeIngredientRow[]>()
    for (const row of (recipeRows ?? []) as RecipeRow[]) {
      const ingredients = Array.isArray(row.recipe_ingredients)
        ? row.recipe_ingredients
        : row.recipe_ingredients
          ? [row.recipe_ingredients]
          : []
      recipeMap.set(row.id, ingredients)
    }

    const allergenIngredientSet = new Set(tenantAllergenIngIds)
    const memo = new Map<string, boolean>()

    const recipeHasAllergen = (recipeId: string, visited = new Set<string>()): boolean => {
      if (memo.has(recipeId)) {
        return memo.get(recipeId) ?? false
      }
      if (visited.has(recipeId)) {
        return false
      }

      const ingredients = recipeMap.get(recipeId) ?? []
      const nextVisited = new Set(visited)
      nextVisited.add(recipeId)

      for (const item of ingredients) {
        if (item.ingredient_id && allergenIngredientSet.has(item.ingredient_id)) {
          memo.set(recipeId, true)
          return true
        }

        if (item.sub_recipe_id && recipeHasAllergen(item.sub_recipe_id, nextVisited)) {
          memo.set(recipeId, true)
          return true
        }
      }

      memo.set(recipeId, false)
      return false
    }

    const excludeRecipeIds = Array.from(recipeMap.keys()).filter((recipeId) =>
      recipeHasAllergen(recipeId)
    )

    return NextResponse.json({ excludeRecipeIds })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch allergen data' },
      { status: 500 }
    )
  }
}
