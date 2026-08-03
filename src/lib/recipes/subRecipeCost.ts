import { calculateCost, type CostIngredientInput } from '@/lib/utils/cost-calculator'
import { convertUnit } from '@/lib/utils/unit-converter'
import { resolveIngredientPrice, type PriceHistoryEntry } from '@/lib/ingredients/resolveIngredientPrice'

// Framework-agnostic on purpose (no React/Supabase client imports) so it can
// be unit-tested directly and reused from any data-fetching layer.

export type SubRecipeCostSource = 'live' | 'live_incomplete' | 'snapshot' | 'unavailable'

export interface SubRecipeCostResult {
  costPerUnit: number | null
  unit: string | null
  source: SubRecipeCostSource
}

type Rel<T> = T | T[] | null | undefined

function one<T>(v: Rel<T>): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export interface SubRecipeIngredientRow {
  id: string
  quantity: number
  unit: string
  yield_percent?: number | null
  ingredient?: Rel<{
    current_price?: number | null
    price_unit?: string | null
    price_history?: PriceHistoryEntry[] | null
  }>
  // Only fetched one level deep for fallback purposes — a sub-recipe nested
  // inside another sub-recipe's ingredient list is priced from its own
  // stored snapshot, not recalculated live. Going further would require
  // unbounded query nesting and cycle detection for no real-world benefit.
  sub_recipe?: Rel<{
    sub_ingredient_cost_per_unit?: number | null
    sub_ingredient_unit?: string | null
  }>
}

export interface SubRecipeCostRow {
  id: string
  sub_ingredient_cost_per_unit?: number | null
  sub_ingredient_unit?: string | null
  yield_quantity?: number | null
  yield_unit?: string | null
  labor_enabled?: boolean | null
  labor_cost?: number | null
  labor_mode?: string | null
  labor_hourly_rate?: number | null
  prep_time_minutes?: number | null
  overhead_enabled?: boolean | null
  overhead_cost?: number | null
  overhead_mode?: string | null
  overhead_percent?: number | null
  waste_percent?: number | null
  recipe_ingredients?: Rel<SubRecipeIngredientRow>
}

/**
 * Computes a sub-recipe's current cost-per-unit from its OWN current
 * ingredients and prices, rather than trusting the frozen
 * `sub_ingredient_cost_per_unit` snapshot written the last time that
 * sub-recipe was saved (see useRecipes.ts saveRecipe). The snapshot is only
 * used as a fallback when live ingredient data isn't available, and the
 * result always says which source won so callers can flag staleness instead
 * of silently trusting a possibly-outdated number.
 */
export function computeLiveSubRecipeCost(row: SubRecipeCostRow | null | undefined): SubRecipeCostResult {
  const fallbackUnit = row?.sub_ingredient_unit ?? null
  const snapshotCost = row?.sub_ingredient_cost_per_unit ?? null

  if (!row) return { costPerUnit: null, unit: null, source: 'unavailable' }

  const ingredientRows = Array.isArray(row.recipe_ingredients)
    ? row.recipe_ingredients
    : row.recipe_ingredients
      ? [row.recipe_ingredients]
      : []

  if (ingredientRows.length === 0) {
    return snapshotCost != null
      ? { costPerUnit: snapshotCost, unit: fallbackUnit, source: 'snapshot' }
      : { costPerUnit: null, unit: fallbackUnit, source: 'unavailable' }
  }

  const lineInputs: CostIngredientInput[] = ingredientRows.map((line) => {
    const ing = one(line.ingredient)
    const nestedSubRecipe = one(line.sub_recipe)
    const resolved = ing
      ? resolveIngredientPrice(ing.price_history ?? [], ing.current_price ?? null, ing.price_unit ?? null)
      : null
    const currentPrice = resolved?.price ?? nestedSubRecipe?.sub_ingredient_cost_per_unit ?? null
    const priceUnit = resolved?.unit ?? nestedSubRecipe?.sub_ingredient_unit ?? line.unit
    return {
      id: line.id,
      quantity: Number(line.quantity),
      unit: line.unit,
      yield_percent: line.yield_percent != null ? Number(line.yield_percent) : 100,
      current_price: currentPrice,
      price_unit: priceUnit,
    }
  })

  const laborMode = row.labor_mode === 'time' ? 'time' : 'fixed'
  const overheadMode = row.overhead_mode === 'percent' ? 'percent' : 'fixed'

  const costs = calculateCost({
    ingredients: lineInputs,
    laborEnabled: row.labor_enabled ?? false,
    laborMode,
    laborCostFixed: Number(row.labor_cost ?? 0),
    prepTimeMinutes: Number(row.prep_time_minutes ?? 0),
    laborHourlyRate: Number(row.labor_hourly_rate ?? 0),
    overheadEnabled: row.overhead_enabled ?? false,
    overheadMode,
    overheadCostFixed: Number(row.overhead_cost ?? 0),
    overheadPercent: Number(row.overhead_percent ?? 0),
    wastePercent: Number(row.waste_percent ?? 0),
    sellingPrice: 0,
    yieldQty: 1,
    yieldUnit: 'unit',
  })

  const subIngredientUnit = row.sub_ingredient_unit || 'unit'
  const yieldInSubUnit = convertUnit(Number(row.yield_quantity ?? 0), row.yield_unit ?? 'unit', subIngredientUnit)

  if (!(yieldInSubUnit > 0)) {
    return snapshotCost != null
      ? { costPerUnit: snapshotCost, unit: fallbackUnit, source: 'snapshot' }
      : { costPerUnit: null, unit: subIngredientUnit, source: 'unavailable' }
  }

  const costPerUnit = costs.totalCost / yieldInSubUnit
  return {
    costPerUnit,
    unit: subIngredientUnit,
    source: costs.incompleteCost ? 'live_incomplete' : 'live',
  }
}
