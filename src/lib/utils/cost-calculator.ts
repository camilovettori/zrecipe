import { convertUnit, isConvertible, getUnitFamily } from './unit-converter'

export type CostIngredientInput = {
  id?: string
  quantity: number
  unit: string
  name?: string
  yield_percent?: number | null
  current_price?: number | null
  price_unit?: string | null
  /**
   * True when current_price came from a sub-recipe cost that could not be
   * fully recalculated live (e.g. fell back to its frozen
   * sub_ingredient_cost_per_unit snapshot, or its own live calc was itself
   * incomplete). The number is still used as-is — this only drives the
   * "may be out of date" warning, it does not zero the cost.
   */
  staleSubRecipeCost?: boolean
  /**
   * Total EP weight (grams) of a sub-recipe ingredient's own recipe, when
   * this line references a sub-recipe priced per count unit (e.g. yield =
   * 1 unit / batch). Lets a parent line that uses weight (g/kg) bridge to
   * that per-unit price via (quantityInG / subRecipeWeightG) * current_price,
   * instead of hitting a unit_mismatch. Never used to bridge weight against
   * a volume-priced price_unit — that would require an unstated density.
   */
  subRecipeWeightG?: number | null
}

export type CostInputs = {
  ingredients: CostIngredientInput[]
  laborEnabled?: boolean
  laborMode?: 'fixed' | 'time'
  laborCostFixed?: number
  prepTimeMinutes?: number
  laborHourlyRate?: number
  overheadEnabled?: boolean
  overheadMode?: 'fixed' | 'percent'
  overheadCostFixed?: number
  overheadPercent?: number
  wastePercent?: number
  sellingPrice?: number
  yieldQty?: number
  yieldUnit?: string
  vatEnabled?: boolean
  vatRate?: number
}

export type IngredientCostStatus = 'ok' | 'missing_price' | 'unit_mismatch'

export type IngredientCostLine = {
  id?: string
  name?: string
  cost: number
  status: IngredientCostStatus
  /** false for missing_price / unit_mismatch — this line's cost is not a
   *  trustworthy number and must not be presented as if it were. */
  isCostComplete: boolean
  /** Short, user-facing label: "Needs price" / "Unit mismatch". Absent when ok. */
  message?: string
  /** Longer explanation, used in the aggregated warnings[] list. */
  warning?: string
  /** current_price was explicitly recorded as exactly 0 (a real, deliberate
   *  free ingredient) rather than never priced. Rare for food — worth a
   *  soft, non-alarming UI hint, but NOT an incomplete-cost condition. */
  isZeroPrice?: boolean
  /** True when this line's cost came from the weight→unit sub-recipe bridge
   *  (see subRecipeWeightG) rather than a direct unit conversion. */
  usedWeightBridge?: boolean
}

export type CostResult = {
  ingredientCost: number
  laborCost: number
  overheadCost: number
  wasteCost: number
  subtotal: number
  totalCost: number
  costPerUnit: number
  isBatch: boolean
  sellingPrice: number
  profitPerUnit: number
  margin: number
  foodCostPercent: number
  vatAmount: number
  incVatSellingPrice: number
  warnings: string[]
  /** At least one ingredient has no price recorded at all (never priced). */
  hasMissingPrices: boolean
  /** At least one ingredient's unit can't convert to its price's unit. */
  hasUnitMismatches: boolean
  /** At least one sub-recipe ingredient is priced from a fallback snapshot
   *  rather than a live recalculation of its current ingredients. */
  hasStaleSubRecipeCosts: boolean
  /** True whenever hasMissingPrices or hasUnitMismatches — the totals below
   *  should be presented as "not fully accurate" rather than a real number. */
  incompleteCost: boolean
  /** At least one ingredient has an explicit price of exactly €0. Not an
   *  incomplete-cost condition (it's real data) — just unusual for food. */
  hasZeroPricedIngredients: boolean
  /** The specific ingredient lines that are missing a price or unit-mismatched. */
  affectedLines: IngredientCostLine[]
}

function money(value: number) {
  return Number(value.toFixed(2))
}

// Sub-recipe ingredient lines are NOT special-cased here. A sub-recipe used
// as an ingredient is priced exactly like a regular ingredient: its per-unit
// rate and unit are the sub-recipe's own `sub_ingredient_cost_per_unit` /
// `sub_ingredient_unit` (or, preferably, a live recalculation of it — see
// src/lib/recipes/subRecipeCost.ts), already resolved into `current_price` /
// `price_unit` by the caller (see mapRecipeRow / addSubRecipe / onSubstitute).
// Cost is always quantityUsed (converted to price_unit) × current_price — one
// shared formula, no parallel reconstruction.
//
// A missing price (current_price == null — no price has ever been recorded)
// and an unconvertible unit are NEVER treated as a real €0 cost: both return
// cost: 0 *and* a status the caller must surface, so the recipe's totals can
// be marked incomplete instead of silently understated. An explicit price of
// exactly 0 (current_price === 0) is treated as a genuinely free ingredient —
// that distinction only exists because current_price is `null` until a price
// is actually set.
export function calculateIngredientCost(item: CostIngredientInput): IngredientCostLine {
  if (item.subRecipeWeightG != null) {
    console.log('[bridge-debug] calculateIngredientCost called with:', {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      current_price: item.current_price,
      price_unit: item.price_unit,
      subRecipeWeightG: item.subRecipeWeightG,
    })
  }
  const label = item.name ?? 'Ingredient'
  const hasPrice = item.current_price != null
  const currentPrice = Number(item.current_price ?? 0)
  const yieldFactor = Math.max(0.01, Number(item.yield_percent ?? 100) / 100)
  const apQuantity = Number(item.quantity ?? 0) / yieldFactor
  const priceUnit = item.price_unit ?? item.unit

  if (!hasPrice) {
    return {
      id: item.id,
      name: label,
      cost: 0,
      status: 'missing_price',
      isCostComplete: false,
      message: 'Needs price',
      warning: `${label}: no price set — cost excluded, needs a price`,
    }
  }

  if (!isConvertible(item.unit, priceUnit)) {
    // Weight→unit bridge: a parent line using weight (g/kg) against a
    // sub-recipe priced per count unit (e.g. yield = 1 unit / 600g batch)
    // can still be costed via the sub-recipe's own total EP weight, instead
    // of being excluded as a unit mismatch. Restricted to weight→count only
    // — never bridges weight against a volume-priced unit, which would need
    // an unstated ingredient density (see CLAUDE.md costing rule 3).
    const bridgeWeightG = item.subRecipeWeightG
    if (
      bridgeWeightG != null &&
      bridgeWeightG > 0 &&
      getUnitFamily(item.unit) === 'weight' &&
      getUnitFamily(priceUnit) === 'count'
    ) {
      const apQuantityInG = convertUnit(apQuantity, item.unit, 'g')
      const fraction = apQuantityInG / bridgeWeightG
      return {
        id: item.id,
        name: label,
        cost: money(fraction * currentPrice),
        status: 'ok',
        isCostComplete: true,
        isZeroPrice: currentPrice === 0,
        usedWeightBridge: true,
      }
    }

    return {
      id: item.id,
      name: label,
      cost: 0,
      status: 'unit_mismatch',
      isCostComplete: false,
      message: 'Unit mismatch',
      warning: `${label}: recipe uses ${item.unit} but price is per ${priceUnit} — cost excluded, needs review`,
    }
  }

  const quantityInPriceUnit = convertUnit(apQuantity, item.unit, priceUnit)
  return {
    id: item.id,
    name: label,
    cost: money(quantityInPriceUnit * currentPrice),
    status: 'ok',
    isCostComplete: true,
    isZeroPrice: currentPrice === 0,
  }
}

export function calculateCost(inputs: CostInputs): CostResult {
  const lines = inputs.ingredients.map(calculateIngredientCost)
  const ingredientCost = money(lines.reduce((sum, l) => sum + l.cost, 0))

  const missingPriceLines = lines.filter((l) => l.status === 'missing_price')
  const unitMismatchLines = lines.filter((l) => l.status === 'unit_mismatch')
  const affectedLines = [...missingPriceLines, ...unitMismatchLines]
  const hasMissingPrices = missingPriceLines.length > 0
  const hasUnitMismatches = unitMismatchLines.length > 0
  const incompleteCost = hasMissingPrices || hasUnitMismatches
  const hasZeroPricedIngredients = lines.some((l) => l.isZeroPrice)

  const staleSubRecipeLines = inputs.ingredients.filter((ing) => ing.staleSubRecipeCost)
  const hasStaleSubRecipeCosts = staleSubRecipeLines.length > 0

  const warnings = [
    ...lines.flatMap((l) => (l.warning ? [l.warning] : [])),
    ...staleSubRecipeLines.map((ing) =>
      `${ing.name ?? 'Sub-recipe ingredient'}: sub-recipe cost could not be fully recalculated live — using a fallback value that may be out of date`
    ),
  ]

  const laborCost = inputs.laborEnabled
    ? (inputs.laborMode === 'time'
        ? money(((inputs.prepTimeMinutes ?? 0) / 60) * (inputs.laborHourlyRate ?? 0))
        : money(inputs.laborCostFixed ?? 0))
    : 0

  const overheadCost = inputs.overheadEnabled
    ? (inputs.overheadMode === 'percent'
        ? money(ingredientCost * ((inputs.overheadPercent ?? 0) / 100))
        : money(inputs.overheadCostFixed ?? 0))
    : 0

  const subtotal = money(ingredientCost + laborCost + overheadCost)
  const wasteCost = money(subtotal * ((inputs.wastePercent ?? 0) / 100))
  const totalCost = money(subtotal + wasteCost)
  const isBatch = (inputs.yieldUnit ?? '').toLowerCase() === 'batch'
  const yieldQty = (inputs.yieldQty ?? 0) > 0 ? inputs.yieldQty! : 1
  const costPerUnit = Number((totalCost / yieldQty).toFixed(4))
  const sellingPrice = money(inputs.sellingPrice ?? 0)
  const profitPerUnit = money(sellingPrice - costPerUnit)
  const margin = sellingPrice > 0
    ? Number((((sellingPrice - costPerUnit) / sellingPrice) * 100).toFixed(1))
    : 0
  const foodCostPercent = sellingPrice > 0
    ? Number(((costPerUnit / sellingPrice) * 100).toFixed(1))
    : 0
  const vatAmount = inputs.vatEnabled ? money(sellingPrice * ((inputs.vatRate ?? 0) / 100)) : 0

  return {
    ingredientCost,
    laborCost,
    overheadCost,
    wasteCost,
    subtotal,
    totalCost,
    costPerUnit,
    isBatch,
    sellingPrice,
    profitPerUnit,
    margin,
    foodCostPercent,
    vatAmount,
    incVatSellingPrice: money(sellingPrice + vatAmount),
    warnings,
    hasMissingPrices,
    hasUnitMismatches,
    hasStaleSubRecipeCosts,
    incompleteCost,
    hasZeroPricedIngredients,
    affectedLines,
  }
}

