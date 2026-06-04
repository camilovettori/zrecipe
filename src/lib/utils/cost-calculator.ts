import { convertUnit } from './unit-converter'

export type CostIngredientInput = {
  quantity: number
  unit: string
  yield_percent?: number | null
  current_price?: number | null
  price_unit?: string | null
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
}

function money(value: number) {
  return Number(value.toFixed(2))
}

function costLine(item: CostIngredientInput) {
  const currentPrice = Number(item.current_price ?? 0)
  if (!currentPrice) return 0

  const yieldFactor = Math.max(0.01, Number(item.yield_percent ?? 100) / 100)
  const apQuantity = Number(item.quantity ?? 0) / yieldFactor
  const priceUnit = item.price_unit ?? item.unit
  const quantityInPriceUnit = convertUnit(apQuantity, item.unit, priceUnit)
  return money(quantityInPriceUnit * currentPrice)
}

export function calculateCost(inputs: CostInputs): CostResult {
  const ingredientCost = money(
    inputs.ingredients.reduce((sum, item) => sum + costLine(item), 0)
  )

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
  const yieldQty = isBatch && (inputs.yieldQty ?? 0) > 0 ? inputs.yieldQty ?? 1 : 1
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
  }
}
