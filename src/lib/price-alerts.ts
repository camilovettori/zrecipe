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

// created_at, when present, is a real DB-assigned timestamp with intra-day
// precision. recorded_at is always written as midnight UTC for the given
// date (see IngredientForm.tsx's `.slice(0, 10)` truncation on insert), so
// two entries recorded on the same day tie exactly on recorded_at even
// though they represent genuinely different, orderable price observations.
// Preferring created_at per-entry (falling back to recorded_at only when
// created_at is absent) resolves same-day ties correctly once the entries
// carry a real created_at value.
function resolveSortTimestamp(entry: PriceHistoryEntry): string {
  return entry.created_at ?? resolveEntryDate(entry)
}

/**
 * Given a list of price history entries for one ingredient (any order),
 * returns the change between the two most recent entries, or null if
 * there are fewer than two entries or the price is unchanged.
 */
export function computePriceChange(history: PriceHistoryEntry[]): PriceChangeResult | null {
  if (history.length < 2) return null
  const sorted = [...history].sort((a, b) => {
    const diff = new Date(resolveSortTimestamp(a)).getTime() - new Date(resolveSortTimestamp(b)).getTime()
    if (diff !== 0) return diff
    // Deterministic last-resort tiebreaker for entries that still tie after
    // the above (legacy rows with no created_at, or rows backfilled with an
    // identical created_at by a one-off ALTER TABLE default). `id` carries
    // no chronological meaning — it only guarantees the SAME pair of rows
    // always sorts the same way everywhere, so two independent call sites
    // reading identical rows can never disagree on direction/magnitude.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
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
