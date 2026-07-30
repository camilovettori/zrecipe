import type { createClient } from '@/lib/supabase/client'

export type DeleteIngredientResult =
  | { ok: true }
  | { ok: false; reason: 'in_use'; recipeCount: number; ingredientName: string | null }
  | { ok: false; reason: 'unknown'; message: string }

/**
 * Deletes an ingredient only when it is not used by a recipe. The preflight
 * check is intentional: older databases may use ON DELETE SET NULL, which
 * would otherwise leave an unlinked ingredient line behind.
 */
export async function deleteIngredientById(
  supabase: ReturnType<typeof createClient>,
  id: string
): Promise<DeleteIngredientResult> {
  const [{ count: recipeCount, error: usageError }, { data: ingredient }] = await Promise.all([
    supabase
      .from('recipe_ingredients')
      .select('id', { count: 'exact', head: true })
      .eq('ingredient_id', id),
    supabase
      .from('ingredients')
      .select('name')
      .eq('id', id)
      .maybeSingle(),
  ])

  if (usageError) {
    return {
      ok: false,
      reason: 'unknown',
      message: `Could not verify recipe usage: ${usageError.message}`,
    }
  }

  if ((recipeCount ?? 0) > 0) {
    return {
      ok: false,
      reason: 'in_use',
      recipeCount: recipeCount ?? 0,
      ingredientName: ingredient?.name ?? null,
    }
  }

  const { error } = await supabase.from('ingredients').delete().eq('id', id)

  if (!error) return { ok: true }

  if (error.code === '23503') {
    return {
      ok: false,
      reason: 'in_use',
      recipeCount: recipeCount ?? 0,
      ingredientName: ingredient?.name ?? null,
    }
  }

  return { ok: false, reason: 'unknown', message: error.message ?? 'Unknown error' }
}
