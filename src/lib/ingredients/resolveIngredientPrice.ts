export interface ResolvedPrice {
  price: number | null
  unit: string | null
  source: 'selected' | 'latest' | 'manual' | 'none'
  /** The history row that won, if any. */
  historyId: string | null
}

export interface PriceHistoryEntry {
  id: string
  price: number
  unit: string
  is_selected_price: boolean
  recorded_at: string | null
}

function entryTimestamp(entry: PriceHistoryEntry): number {
  // Rows with no recorded_at sort as "oldest possible" rather than being
  // dropped, so they can still surface as the fallback when nothing else
  // has a timestamp.
  return entry.recorded_at ? new Date(entry.recorded_at).getTime() : 0
}

/**
 * Returns the "effective" current price for an ingredient:
 *   1. A history row with is_selected_price = true wins, if one exists.
 *   2. Otherwise the most-recent row by recorded_at.
 *   3. Otherwise the ingredient's own manual current_price/price_unit
 *      (set directly on the ingredient, with no purchase history yet).
 *   4. Otherwise null — no price available.
 */
export function resolveIngredientPrice(
  priceHistory: PriceHistoryEntry[],
  manualCurrentPrice: number | null,
  manualPriceUnit: string | null
): ResolvedPrice {
  const selected = priceHistory.find((entry) => entry.is_selected_price)
  if (selected) {
    return { price: selected.price, unit: selected.unit, source: 'selected', historyId: selected.id }
  }

  if (priceHistory.length > 0) {
    const latest = priceHistory.reduce((newest, entry) =>
      entryTimestamp(entry) > entryTimestamp(newest) ? entry : newest
    )
    return { price: latest.price, unit: latest.unit, source: 'latest', historyId: latest.id }
  }

  if (manualCurrentPrice != null) {
    return { price: manualCurrentPrice, unit: manualPriceUnit, source: 'manual', historyId: null }
  }

  return { price: null, unit: null, source: 'none', historyId: null }
}
