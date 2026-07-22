import { createClient } from '@/lib/supabase/client'

/**
 * Marks a single ingredient_price_history row as the selected price for
 * its ingredient, clearing any previous selection first. Pass historyId
 * = null to clear the selection entirely (falls back to "most recent").
 *
 * Two sequential updates, not a DB transaction — soft-enforced per the
 * is_selected_price column comment; a failure between the two leaves at
 * most a transient "nothing selected" state, never a data-integrity issue.
 */
export async function setSelectedPrice(
  ingredientId: string,
  historyId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()

  const { error: clearError } = await supabase
    .from('ingredient_price_history')
    .update({ is_selected_price: false })
    .eq('ingredient_id', ingredientId)

  if (clearError) return { ok: false, error: clearError.message }
  if (!historyId) return { ok: true }

  const { error: setError } = await supabase
    .from('ingredient_price_history')
    .update({ is_selected_price: true })
    .eq('id', historyId)

  if (setError) return { ok: false, error: setError.message }
  return { ok: true }
}
