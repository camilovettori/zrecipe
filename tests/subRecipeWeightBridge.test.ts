import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateIngredientCost } from '../src/lib/utils/cost-calculator'
import { computeLiveSubRecipeCost, type SubRecipeCostRow } from '../src/lib/recipes/subRecipeCost'

// Tahini Granola sub-recipe (Lovin From the Oven, production data):
// ingredient cost €27.06 + 5% waste -> totalCost €28.41
// yield 44 portions (80g/portion), live EP weight 3576g
const SUB_TOTAL_COST = 28.41
const SUB_WEIGHT_G = 3576
const SUB_YIELD_PORTIONS = 44
const SUB_COST_PER_PORTION = SUB_TOTAL_COST / SUB_YIELD_PORTIONS // 0.6457 — a per-yield-unit rate, wrong basis for weight lines
const SUB_COST_PER_GRAM = SUB_TOTAL_COST / SUB_WEIGHT_G // 0.007945/g — the only correct rate for weight-based usage

test('40g of the Tahini Granola sub-recipe costs €0.32, not €0.01', () => {
  const line = calculateIngredientCost({
    quantity: 40,
    unit: 'g',
    current_price: SUB_COST_PER_PORTION,
    price_unit: 'unit',
    subRecipeWeightG: SUB_WEIGHT_G,
    subRecipeCostPerGram: SUB_COST_PER_GRAM,
  })
  assert.equal(line.status, 'ok')
  assert.equal(line.isCostComplete, true)
  assert.equal(line.usedWeightBridge, true)
  assert.equal(line.cost, 0.32)
})

test('40g costs half of one 80g portion (cross-check within 1 cent)', () => {
  const fortyG = calculateIngredientCost({
    quantity: 40,
    unit: 'g',
    current_price: SUB_COST_PER_PORTION,
    price_unit: 'unit',
    subRecipeWeightG: SUB_WEIGHT_G,
    subRecipeCostPerGram: SUB_COST_PER_GRAM,
  })
  const eightyG = calculateIngredientCost({
    quantity: 80,
    unit: 'g',
    current_price: SUB_COST_PER_PORTION,
    price_unit: 'unit',
    subRecipeWeightG: SUB_WEIGHT_G,
    subRecipeCostPerGram: SUB_COST_PER_GRAM,
  })
  assert.ok(Math.abs(fortyG.cost - eightyG.cost / 2) <= 0.01)
})

test('bridging the full batch weight equals the sub-recipe total cost', () => {
  const line = calculateIngredientCost({
    quantity: SUB_WEIGHT_G,
    unit: 'g',
    current_price: SUB_COST_PER_PORTION,
    price_unit: 'unit',
    subRecipeWeightG: SUB_WEIGHT_G,
    subRecipeCostPerGram: SUB_COST_PER_GRAM,
  })
  assert.ok(Math.abs(line.cost - SUB_TOTAL_COST) <= 0.01)
})

test('unit independence: 0.04kg costs the same as 40g', () => {
  const grams = calculateIngredientCost({
    quantity: 40,
    unit: 'g',
    current_price: SUB_COST_PER_PORTION,
    price_unit: 'unit',
    subRecipeCostPerGram: SUB_COST_PER_GRAM,
  })
  const kilos = calculateIngredientCost({
    quantity: 0.04,
    unit: 'kg',
    current_price: SUB_COST_PER_PORTION,
    price_unit: 'unit',
    subRecipeCostPerGram: SUB_COST_PER_GRAM,
  })
  assert.equal(grams.cost, kilos.cost)
})

test('regression: does not reproduce the totalCost-as-per-gram-rate bug (€995 incident)', () => {
  const line = calculateIngredientCost({
    quantity: 40,
    unit: 'g',
    current_price: SUB_COST_PER_PORTION,
    price_unit: 'unit',
    subRecipeCostPerGram: SUB_COST_PER_GRAM,
  })
  assert.notEqual(line.cost, 40 * SUB_TOTAL_COST)
})

test('regression: does not reproduce the batch-weight-fraction-times-per-portion-cost bug (€0.01 incident)', () => {
  const line = calculateIngredientCost({
    quantity: 40,
    unit: 'g',
    current_price: SUB_COST_PER_PORTION,
    price_unit: 'unit',
    subRecipeWeightG: SUB_WEIGHT_G,
    subRecipeCostPerGram: SUB_COST_PER_GRAM,
  })
  const oldBuggyValue = Number(((40 / SUB_WEIGHT_G) * SUB_COST_PER_PORTION).toFixed(2))
  assert.notEqual(line.cost, oldBuggyValue)
})

test('regression: cost is never silently zero when a valid rate is available (€0.00 incident)', () => {
  const line = calculateIngredientCost({
    quantity: 40,
    unit: 'g',
    current_price: SUB_COST_PER_PORTION,
    price_unit: 'unit',
    subRecipeCostPerGram: SUB_COST_PER_GRAM,
  })
  assert.ok(line.cost > 0)
})

test('missing costPerGram: status unit_mismatch, cost 0 — never falls back to the old reconstruction', () => {
  const line = calculateIngredientCost({
    quantity: 40,
    unit: 'g',
    current_price: SUB_COST_PER_PORTION,
    price_unit: 'unit',
    subRecipeWeightG: SUB_WEIGHT_G,
    subRecipeCostPerGram: null,
  })
  assert.equal(line.status, 'unit_mismatch')
  assert.equal(line.cost, 0)
  assert.equal(line.isCostComplete, false)
})

test('yield-1 fixtures cannot detect the scale-mixing bug — fixture guard', () => {
  // (a) At yield = 1, costPerPortion === totalCost, so the correct rate
  // (totalCost / weightG) and the old buggy rate ((quantity / weightG) * costPerPortion)
  // collapse onto the same arithmetic: costPerPortion cancels out to be totalCost itself.
  // This is why Cream Cheese Frost (yield = 1) let the €0.01 bug ship three times —
  // the test fixture could not distinguish correct code from buggy code.
  const YIELD_1_TOTAL_COST = 12.5
  const YIELD_1_WEIGHT_G = 500
  const YIELD_1_QUANTITY_G = 40
  const yield1CostPerPortion = YIELD_1_TOTAL_COST / 1 // yield = 1 unit

  const correctFormula = YIELD_1_QUANTITY_G * (YIELD_1_TOTAL_COST / YIELD_1_WEIGHT_G)
  const oldBuggyFormula = (YIELD_1_QUANTITY_G / YIELD_1_WEIGHT_G) * yield1CostPerPortion
  assert.equal(correctFormula, oldBuggyFormula)

  // (b) At yield = 44 (Tahini Granola), the per-portion rate is 44x smaller than
  // totalCost, so the buggy formula understates the line by exactly that factor.
  // This is the divergence a yield-1 fixture can never exercise.
  const correctFormula44 = 40 * SUB_COST_PER_GRAM
  const oldBuggyFormula44 = (40 / SUB_WEIGHT_G) * SUB_COST_PER_PORTION
  assert.ok(Math.abs(correctFormula44 / oldBuggyFormula44 - SUB_YIELD_PORTIONS) < 1e-9)
})

test('weight-to-volume is still refused — no density assumption is invented', () => {
  const line = calculateIngredientCost({
    quantity: 200,
    unit: 'ml',
    current_price: SUB_COST_PER_PORTION,
    price_unit: 'unit',
    subRecipeCostPerGram: SUB_COST_PER_GRAM,
  })
  assert.equal(line.status, 'unit_mismatch')
  assert.equal(line.cost, 0)
})

// ── Manual batch weight (computeLiveSubRecipeCost) ─────────────────────────
// All fixtures below use yield_quantity: 10 (never 1) per CLAUDE.md's TEST
// FIXTURE RULE — at yield 1 this bug class is invisible.

function weightOnlyRow(overrides: Partial<SubRecipeCostRow> = {}): SubRecipeCostRow {
  return {
    id: 'sub-weight-only',
    sub_ingredient_unit: 'unit',
    yield_quantity: 10,
    yield_unit: 'unit',
    recipe_ingredients: [
      { id: 'i1', quantity: 500, unit: 'g', ingredient: { current_price: 0.01, price_unit: 'g' } },
      { id: 'i2', quantity: 500, unit: 'g', ingredient: { current_price: 0.01, price_unit: 'g' } },
    ],
    ...overrides,
  }
}

function halfVolumeRow(overrides: Partial<SubRecipeCostRow> = {}): SubRecipeCostRow {
  return {
    id: 'sub-half-volume',
    sub_ingredient_unit: 'unit',
    yield_quantity: 10,
    yield_unit: 'unit',
    recipe_ingredients: [
      { id: 'i1', quantity: 500, unit: 'g', ingredient: { current_price: 0.01, price_unit: 'g' } },
      { id: 'i2', quantity: 500, unit: 'g', ingredient: { current_price: 0.01, price_unit: 'g' } },
      { id: 'i3', quantity: 200, unit: 'ml', ingredient: { current_price: 0.005, price_unit: 'ml' } },
    ],
    ...overrides,
  }
}

test('manual batch weight: manual wins over the computed sum', () => {
  const result = computeLiveSubRecipeCost(weightOnlyRow({ sub_ingredient_weight_manual_g: 1200 }))
  assert.equal(result.weightSource, 'manual')
  assert.equal(result.weightG, 1200)
  assert.equal(result.hasSkippedVolumeLines, false)
  assert.ok(Math.abs((result.costPerGram ?? 0) - 10 / 1200) < 1e-9)
})

test('manual batch weight: no volume lines, no manual -> computed sum used, costPerGram correct', () => {
  const result = computeLiveSubRecipeCost(weightOnlyRow())
  assert.equal(result.weightSource, 'computed')
  assert.equal(result.weightG, 1000)
  assert.equal(result.hasSkippedVolumeLines, false)
  assert.equal(result.costPerGram, 0.01) // totalCost 10 / weightG 1000
})

test('manual batch weight: volume lines present, no manual -> costPerGram null, parent line is unit_mismatch', () => {
  const result = computeLiveSubRecipeCost(halfVolumeRow())
  assert.equal(result.weightSource, 'unavailable')
  assert.equal(result.hasSkippedVolumeLines, true)
  assert.equal(result.weightG, null)
  assert.equal(result.costPerGram, null)

  const line = calculateIngredientCost({
    quantity: 100,
    unit: 'g',
    current_price: result.costPerUnit ?? 0,
    price_unit: 'unit',
    subRecipeCostPerGram: result.costPerGram,
    subRecipeHasSkippedVolumeLines: result.hasSkippedVolumeLines,
  })
  assert.equal(line.status, 'unit_mismatch')
  assert.equal(line.cost, 0)
  assert.equal(line.message, "Set this sub-recipe's batch weight")
})

test('manual batch weight: volume lines present + manual set -> costs correctly off the manual weight', () => {
  const result = computeLiveSubRecipeCost(halfVolumeRow({ sub_ingredient_weight_manual_g: 1500 }))
  assert.equal(result.weightSource, 'manual')
  assert.equal(result.weightG, 1500)
  assert.ok(Math.abs((result.costPerGram ?? 0) - 11 / 1500) < 1e-9) // totalCost 11 (5+5+1) / manual 1500

  const line = calculateIngredientCost({
    quantity: 100,
    unit: 'g',
    current_price: result.costPerUnit ?? 0,
    price_unit: 'unit',
    subRecipeCostPerGram: result.costPerGram,
    subRecipeHasSkippedVolumeLines: result.hasSkippedVolumeLines,
  })
  assert.equal(line.status, 'ok')
  assert.ok(line.cost > 0)
})

test('regression: a half-volume sub-recipe does not produce a rate computed off the partial weight sum', () => {
  // Bug: liveWeightG summed only weight-family lines (1000g here) while
  // totalCost included every line's cost (including the volume line), so
  // costPerGram = totalCost / partialWeightSum silently inflated the rate
  // instead of flagging Needs Review. This is the inverse of the bug fixed
  // in 0145509 — same class, an incomplete denominator.
  const result = computeLiveSubRecipeCost(halfVolumeRow())
  const partialSumRate = 11 / 1000 // what the bug would have produced
  assert.notEqual(result.costPerGram, partialSumRate)
  assert.equal(result.costPerGram, null)
})

test('manual batch weight: 0 or negative is treated as unset, not as a divisor', () => {
  const zero = computeLiveSubRecipeCost(weightOnlyRow({ sub_ingredient_weight_manual_g: 0 }))
  assert.equal(zero.weightSource, 'computed')
  assert.equal(zero.weightG, 1000)
  assert.equal(zero.costPerGram, 0.01)
  assert.ok(Number.isFinite(zero.costPerGram ?? NaN))

  const negative = computeLiveSubRecipeCost(weightOnlyRow({ sub_ingredient_weight_manual_g: -50 }))
  assert.equal(negative.weightSource, 'computed')
  assert.equal(negative.weightG, 1000)
  assert.equal(negative.costPerGram, 0.01)
})
