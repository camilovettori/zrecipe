import { createClient } from '@/lib/supabase/client'

export interface MergeOptions {
  keeperId: string
  loserId: string
  photoChoice: 'keeper' | 'loser'
  categoryChoice: 'keeper' | 'loser'
  mergeAllergens: boolean
}

export interface MergeResult {
  ok: boolean
  priceHistoryMoved: number
  recipeIngredientsMoved: number
  error?: string
}

/**
 * Merges `loserId` into `keeperId` via the merge_ingredients RPC — a single
 * atomic Postgres function, since the Supabase JS client can't wrap several
 * queries in one transaction. The loser is deleted as part of the RPC.
 */
export async function mergeIngredients(opts: MergeOptions): Promise<MergeResult> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('merge_ingredients', {
    keeper_id: opts.keeperId,
    loser_id: opts.loserId,
    photo_choice: opts.photoChoice,
    category_choice: opts.categoryChoice,
    merge_allergens: opts.mergeAllergens,
  })

  if (error) {
    return { ok: false, error: error.message, priceHistoryMoved: 0, recipeIngredientsMoved: 0 }
  }

  const result = data as { price_history_moved?: number; recipe_ingredients_moved?: number } | null

  return {
    ok: true,
    priceHistoryMoved: result?.price_history_moved ?? 0,
    recipeIngredientsMoved: result?.recipe_ingredients_moved ?? 0,
  }
}
