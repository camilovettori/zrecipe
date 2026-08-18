import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateIngredientCost } from '../src/lib/utils/cost-calculator'

// Cream Cheese Frost: yield = 1 unit, total EP weight = 600g, cost = €4.03/unit
const SUB_RECIPE_COST_PER_UNIT = 4.03
const SUB_RECIPE_WEIGHT_G = 600

test('weight bridge: parent uses 200g of a per-unit sub-recipe', () => {
  const line = calculateIngredientCost({
    quantity: 200,
    unit: 'g',
    current_price: SUB_RECIPE_COST_PER_UNIT,
    price_unit: 'unit',
    subRecipeWeightG: SUB_RECIPE_WEIGHT_G,
  })
  assert.equal(line.status, 'ok')
  assert.equal(line.isCostComplete, true)
  assert.equal(line.usedWeightBridge, true)
  assert.equal(line.cost, 1.34) // (200/600) * 4.03
})

test('weight bridge: parent uses 0.5kg of a per-unit sub-recipe', () => {
  const line = calculateIngredientCost({
    quantity: 0.5,
    unit: 'kg',
    current_price: SUB_RECIPE_COST_PER_UNIT,
    price_unit: 'unit',
    subRecipeWeightG: SUB_RECIPE_WEIGHT_G,
  })
  assert.equal(line.status, 'ok')
  assert.equal(line.usedWeightBridge, true)
  assert.equal(line.cost, 3.36) // (500/600) * 4.03
})

test('weight bridge: parent uses 1 unit — unchanged direct match, no bridge', () => {
  const line = calculateIngredientCost({
    quantity: 1,
    unit: 'unit',
    current_price: SUB_RECIPE_COST_PER_UNIT,
    price_unit: 'unit',
    subRecipeWeightG: SUB_RECIPE_WEIGHT_G,
  })
  assert.equal(line.status, 'ok')
  assert.equal(line.usedWeightBridge, undefined)
  assert.equal(line.cost, 4.03)
})

test('weight bridge: no sub-recipe weight stored — falls back to unit_mismatch', () => {
  const line = calculateIngredientCost({
    quantity: 200,
    unit: 'g',
    current_price: SUB_RECIPE_COST_PER_UNIT,
    price_unit: 'unit',
    subRecipeWeightG: null,
  })
  assert.equal(line.status, 'unit_mismatch')
  assert.equal(line.isCostComplete, false)
  assert.equal(line.cost, 0)
})

test('weight bridge: never bridges weight against a volume-priced unit', () => {
  const line = calculateIngredientCost({
    quantity: 200,
    unit: 'g',
    current_price: 4.03,
    price_unit: 'ml',
    subRecipeWeightG: SUB_RECIPE_WEIGHT_G,
  })
  assert.equal(line.status, 'unit_mismatch')
  assert.equal(line.cost, 0)
})
