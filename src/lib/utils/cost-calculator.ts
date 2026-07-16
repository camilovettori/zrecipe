import { convertUnit, isConvertible } from './unit-converter'

export type CostIngredientInput = {
  quantity: number
  unit: string
  name?: string
  yield_percent?: number | null
  current_price?: number | null
  price_unit?: string | null
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
}

function money(value: number) {
  return Number(value.toFixed(2))
}

// Sub-recipe ingredient lines are NOT special-cased here. A sub-recipe used
// as an ingredient is priced exactly like a regular ingredient: its per-unit
// rate and unit are the sub-recipe's own `sub_ingredient_cost_per_unit` /
// `sub_ingredient_unit`, already resolved into `current_price` / `price_unit`
// by the caller (see mapRecipeRow / addSubRecipe / onSubstitute). Cost is
// always quantityUsed (converted to price_unit) × current_price — one shared
// formula, no parallel reconstruction.
export function calculateIngredientCost(item: CostIngredientInput): { cost: number; warning?: string } {
  const currentPrice = Number(item.current_price ?? 0)
  const label = item.name ?? 'Ingredient'
  const yieldFactor = Math.max(0.01, Number(item.yield_percent ?? 100) / 100)
  const apQuantity = Number(item.quantity ?? 0) / yieldFactor
  const priceUnit = item.price_unit ?? item.unit

  if (!currentPrice) return { cost: 0 }

  if (!isConvertible(item.unit, priceUnit)) {
    return {
      cost: 0,
      warning: `${label}: recipe uses ${item.unit} but price is per ${priceUnit} — cost excluded`,
    }
  }

  const quantityInPriceUnit = convertUnit(apQuantity, item.unit, priceUnit)
  return { cost: money(quantityInPriceUnit * currentPrice) }
}

export function calculateCost(inputs: CostInputs): CostResult {
  const lines = inputs.ingredients.map(calculateIngredientCost)
  const ingredientCost = money(lines.reduce((sum, l) => sum + l.cost, 0))
  const warnings = lines.flatMap((l) => (l.warning ? [l.warning] : []))

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
  }
}

