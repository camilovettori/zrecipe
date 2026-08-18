// Shared helper for price-change detection across dashboard, ingredient page, and invoice import.

export interface PriceHistoryEntry {
  id: string
  ingredient_id: string
  price: number
  unit: string
  recorded_at?: string | null
  effective_date?: string | null
  created_at?: string | null
}

export interface PriceChangeResult {
  previousPrice: number
  currentPrice: number
  unit: string
  percentChange: number
  direction: 'up' | 'down'
}

export interface IngredientPriceChange extends PriceChangeResult {
  ingredientId: string
  ingredientName: string
  recordedAt: string
}

export function resolveEntryDate(entry: PriceHistoryEntry): string {
  return (
    entry.recorded_at ??
    entry.effective_date ??
    entry.created_at ??
    new Date().toISOString()
  )
}

/**
 * Given a list of price history entries for one ingredient (any order),
 * returns the change between the two most recent entries, or null if
 * there are fewer than two entries or the price is unchanged.
 */
export function computePriceChange(history: PriceHistoryEntry[]): PriceChangeResult | null {
  if (history.length < 2) return null
  const sorted = [...history].sort(
    (a, b) =>
      new Date(resolveEntryDate(a)).getTime() - new Date(resolveEntryDate(b)).getTime()
  )
  const current = sorted[sorted.length - 1]
  const previous = sorted[sorted.length - 2]
  if (Math.abs(current.price - previous.price) < 0.00001) return null
  // A previous price this low is almost always a data entry error (e.g.
  // €0.01 → €9.40 reads as a +99900% spike), not a real price change.
  if (previous.price < 0.10) return null
  const percentChange = ((current.price - previous.price) / previous.price) * 100
  // Anything beyond ±500% is still almost certainly bad data even once the
  // near-zero guard above has already run.
  if (Math.abs(percentChange) > 500) return null
  return {
    previousPrice: previous.price,
    currentPrice: current.price,
    unit: current.unit,
    percentChange,
    direction: current.price > previous.price ? 'up' : 'down',
  }
}

export function formatPrice(price: number, unit: string): string {
  return `€${price.toFixed(2)} / ${unit}`
}

export function formatPct(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}
