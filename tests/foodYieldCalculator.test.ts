import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateMeasuredYield, calculatePlannedYield } from '../src/lib/food-yield-calculator'

test('planned yield calculates AP quantity, waste and true edible cost', () => {
  assert.deepEqual(
    calculatePlannedYield({ yieldPercent: 80, edibleQuantity: 8, purchaseCostPerUnit: 2 }),
    {
      yieldPercent: 80,
      wastePercent: 20,
      asPurchasedQuantity: 10,
      edibleQuantity: 8,
      wasteQuantity: 2,
      estimatedPurchaseCost: 20,
      trueCostPerEdibleUnit: 2.5,
    }
  )
})

test('measured yield calculates yield and waste from AP and EP weights', () => {
  assert.deepEqual(
    calculateMeasuredYield({ asPurchasedWeight: 10, edibleWeight: 7.5, totalPurchaseCost: 30 }),
    {
      yieldPercent: 75,
      wastePercent: 25,
      asPurchasedWeight: 10,
      edibleWeight: 7.5,
      wasteWeight: 2.5,
      trueCostPerEdibleUnit: 4,
    }
  )
})

test('planned yield rejects zero and percentages over 100', () => {
  assert.throws(
    () => calculatePlannedYield({ yieldPercent: 0, edibleQuantity: 1, purchaseCostPerUnit: 1 }),
    /greater than 0/
  )
  assert.throws(
    () => calculatePlannedYield({ yieldPercent: 101, edibleQuantity: 1, purchaseCostPerUnit: 1 }),
    /no more than 100/
  )
})

test('measured yield rejects EP weight above AP weight', () => {
  assert.throws(
    () => calculateMeasuredYield({ asPurchasedWeight: 4, edibleWeight: 5, totalPurchaseCost: 10 }),
    /cannot be greater/
  )
})
