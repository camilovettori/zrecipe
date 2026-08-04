import { createClient } from '@/lib/supabase/client'

/**
 * Marks a single ingredient_price_history row as the selected price for
 * its ingredient, clearing any previous selection first. Pass historyId
 * = null to clear the selection entirely (falls back to "most recent").
 *
 * Runs as a single atomic RPC (see set_selected_price migration) so a
 * failure partway through can never leave a transient "nothing selected"
 * state — either both the clear and the set apply, or neither does.
 */
export async function setSelectedPrice(
  ingredientId: string,
  historyId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()

  const { error } = await supabase.rpc('set_selected_price', {
    p_ingredient_id: ingredientId,
    p_history_id: historyId,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
