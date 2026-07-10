import { convertUnit, isConvertible } from './unit-converter'

export type CostIngredientInput = {
  quantity: number
  unit: string
  name?: string
  yield_percent?: number | null
  current_price?: number | null
  price_unit?: string | null
  subRecipeId?: string | null
  subRecipeTotalCost?: number | null
  subRecipeYieldQuantity?: number | null
  subRecipeYieldUnit?: string | null
  subRecipeCostUnit?: string | null
}

export type CostInputs = {
  ingredients: CostIngredientInput[]
  laborMode?: 'fixed' | 'time'
  laborCostFixed?: number
  prepTimeMinutes?: number
  laborHourlyRate?: number
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function calculateIngredientCost(item: CostIngredientInput): { cost: number; warning?: string } {
  const currentPrice = Number(item.current_price ?? 0)
  const label = item.name ?? 'Ingredient'
  const yieldFactor = Math.max(0.01, Number(item.yield_percent ?? 100) / 100)
  const apQuantity = Number(item.quantity ?? 0) / yieldFactor
  const priceUnit = item.price_unit ?? item.unit
  const isSubRecipe = !!item.subRecipeId || isFiniteNumber(item.subRecipeTotalCost) || isFiniteNumber(item.subRecipeYieldQuantity)

  if (isSubRecipe) {
    const subRecipeCostUnit = item.subRecipeCostUnit ?? priceUnit
    const subRecipeYieldUnit = item.subRecipeYieldUnit ?? subRecipeCostUnit
    const subRecipeYieldQuantity = Number(item.subRecipeYieldQuantity ?? 0)
    const outputQuantityInCostUnit = subRecipeYieldQuantity > 0
      ? convertUnit(subRecipeYieldQuantity, subRecipeYieldUnit, subRecipeCostUnit)
      : 0
    const inferredTotalCost = currentPrice > 0 && outputQuantityInCostUnit > 0
      ? currentPrice * outputQuantityInCostUnit
      : 0
    const subRecipeTotalCost = Number(item.subRecipeTotalCost ?? inferredTotalCost)

    if (!isConvertible(item.unit, subRecipeCostUnit)) {
      return {
        cost: 0,
        warning: `${label}: usage unit (${item.unit}) is not compatible with sub-recipe cost unit (${subRecipeCostUnit}) — cost excluded`,
      }
    }

    const usedQuantityInCostUnit = convertUnit(apQuantity, item.unit, subRecipeCostUnit)

    if (!isConvertible(subRecipeYieldUnit, subRecipeCostUnit)) {
      // Yield is in a different unit family (e.g. 'unit' vs 'g') — use the stored per-unit rate directly
      if (currentPrice <= 0 || usedQuantityInCostUnit <= 0) {
        return { cost: 0, warning: `${label}: sub-recipe cost is unavailable — cost excluded` }
      }
      return { cost: money(usedQuantityInCostUnit * currentPrice) }
    }

    if (!subRecipeTotalCost || subRecipeTotalCost <= 0) {
      return {
        cost: 0,
        warning: `${label}: sub-recipe cost is unavailable, so this line was excluded`,
      }
    }

    if (usedQuantityInCostUnit <= 0 || outputQuantityInCostUnit <= 0) {
      return {
        cost: 0,
        warning: `${label}: sub-recipe output could not be converted safely — cost excluded`,
      }
    }

    return { cost: money(subRecipeTotalCost * (usedQuantityInCostUnit / outputQuantityInCostUnit)) }
  }

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

  const laborCost =
    inputs.laborMode === 'time'
      ? money(((inputs.prepTimeMinutes ?? 0) / 60) * (inputs.laborHourlyRate ?? 15))
      : money(inputs.laborCostFixed ?? 0)

  const overheadCost =
    inputs.overheadMode === 'percent'
      ? money(ingredientCost * ((inputs.overheadPercent ?? 0) / 100))
      : money(inputs.overheadCostFixed ?? 0)

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

