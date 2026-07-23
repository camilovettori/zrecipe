import type { createClient } from '@/lib/supabase/client'

export type DeleteIngredientResult =
  | { ok: true }
  | { ok: false; reason: 'in_use'; recipeCount: number; ingredientName: string | null }
  | { ok: false; reason: 'unknown'; message: string }

/**
 * Deletes an ingredient by id. On a foreign-key violation (still referenced
 * by recipe_ingredients, price history, allergens, etc.) this counts recipe
 * usage so the caller can show a specific, actionable message instead of a
 * generic failure — the count query only runs when the delete actually
 * fails, so the happy path stays a single round trip.
 */
export async function deleteIngredientById(
  supabase: ReturnType<typeof createClient>,
  id: string
): Promise<DeleteIngredientResult> {
  const { error } = await supabase.from('ingredients').delete().eq('id', id)

  if (!error) return { ok: true }

  // Foreign key violation → the ingredient is still referenced somewhere.
  // Most common cause: still used in recipes. Count them so the message is specific.
  if (error.code === '23503') {
    const [{ count: recipeCount }, { data: ing }] = await Promise.all([
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
    return {
      ok: false,
      reason: 'in_use',
      recipeCount: recipeCount ?? 0,
      ingredientName: ing?.name ?? null,
    }
  }

  return { ok: false, reason: 'unknown', message: error.message ?? 'Unknown error' }
}
