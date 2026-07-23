import { resolveIngredientPrice, type PriceHistoryEntry } from './resolveIngredientPrice'

export type PriceHistoryRow = PriceHistoryEntry

/**
 * Single source of truth: an ingredient "needs price" when its
 * effective (resolved) price is null or ≤ 0. This is what makes
 * recipes cost incorrectly, and it's the only thing worth flagging.
 *
 * Ingredients created by any path — AI recipe import, invoice
 * extraction (with or without the (verify) suffix), manual add,
 * NewIngredientModal in RecipeBuilder — all naturally show up as
 * "needs price" when they lack a real price, without each path
 * having to remember to set a flag.
 */
export function ingredientNeedsPrice(
  priceHistory: PriceHistoryRow[] | null | undefined,
  manualCurrentPrice: number | null | undefined,
  manualPriceUnit: string | null | undefined
): boolean {
  const resolved = resolveIngredientPrice(
    priceHistory ?? [],
    manualCurrentPrice ?? null,
    manualPriceUnit ?? null
  )
  return resolved.price === null || resolved.price <= 0
}
