export interface PlannedYieldInput {
  yieldPercent: number
  edibleQuantity: number
  purchaseCostPerUnit: number
}

export interface MeasuredYieldInput {
  asPurchasedWeight: number
  edibleWeight: number
  totalPurchaseCost: number
}

function assertFiniteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite, non-negative number`)
  }
}

function round(value: number, places = 4) {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function calculatePlannedYield(input: PlannedYieldInput) {
  assertFiniteNonNegative(input.edibleQuantity, 'Edible quantity')
  assertFiniteNonNegative(input.purchaseCostPerUnit, 'Purchase cost per unit')

  if (!Number.isFinite(input.yieldPercent) || input.yieldPercent <= 0 || input.yieldPercent > 100) {
    throw new RangeError('Yield percentage must be greater than 0 and no more than 100')
  }

  const yieldDecimal = input.yieldPercent / 100
  const asPurchasedQuantity = input.edibleQuantity / yieldDecimal
  const wasteQuantity = asPurchasedQuantity - input.edibleQuantity

  return {
    yieldPercent: round(input.yieldPercent, 2),
    wastePercent: round(100 - input.yieldPercent, 2),
    asPurchasedQuantity: round(asPurchasedQuantity),
    edibleQuantity: round(input.edibleQuantity),
    wasteQuantity: round(wasteQuantity),
    estimatedPurchaseCost: round(asPurchasedQuantity * input.purchaseCostPerUnit, 2),
    trueCostPerEdibleUnit: round(input.purchaseCostPerUnit / yieldDecimal, 2),
  }
}

export function calculateMeasuredYield(input: MeasuredYieldInput) {
  assertFiniteNonNegative(input.asPurchasedWeight, 'As-purchased weight')
  assertFiniteNonNegative(input.edibleWeight, 'Edible weight')
  assertFiniteNonNegative(input.totalPurchaseCost, 'Total purchase cost')

  if (input.asPurchasedWeight === 0) {
    throw new RangeError('As-purchased weight must be greater than 0')
  }
  if (input.edibleWeight > input.asPurchasedWeight) {
    throw new RangeError('Edible weight cannot be greater than as-purchased weight')
  }

  const yieldPercent = (input.edibleWeight / input.asPurchasedWeight) * 100
  const wasteWeight = input.asPurchasedWeight - input.edibleWeight

  return {
    yieldPercent: round(yieldPercent, 2),
    wastePercent: round(100 - yieldPercent, 2),
    asPurchasedWeight: round(input.asPurchasedWeight),
    edibleWeight: round(input.edibleWeight),
    wasteWeight: round(wasteWeight),
    trueCostPerEdibleUnit:
      input.edibleWeight > 0 ? round(input.totalPurchaseCost / input.edibleWeight, 2) : null,
  }
}
