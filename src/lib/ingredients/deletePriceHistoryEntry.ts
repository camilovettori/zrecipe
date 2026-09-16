import { createClient } from '@/lib/supabase/client'

/**
 * Permanently deletes a single ingredient_price_history row. Scoped by both
 * id and ingredient_id as defense-in-depth — RLS already restricts this to
 * the caller's tenant, but the extra clause guarantees a row can never be
 * deleted out from under the wrong ingredient even if the caller passes a
 * mismatched pair.
 */
export async function deletePriceHistoryEntry(
  ingredientId: string,
  historyId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()

  const { error } = await supabase
    .from('ingredient_price_history')
    .delete()
    .eq('id', historyId)
    .eq('ingredient_id', ingredientId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
