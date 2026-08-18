// Bug: a sub-recipe costed by count (e.g. "1 unit" / 600g batch) returned
// €0.00 when a parent recipe used it by weight (e.g. "200g"), because g and
// unit are different unit families and calculateIngredientCost correctly
// refuses to fake a conversion between them.
//
// Fix: recipes now store sub_ingredient_weight_g — the sub-recipe's own
// total EP weight in grams — which lets a weight-family parent quantity
// (g/kg/oz/lb) be expressed as a fraction of that batch and priced
// proportionally. This is the ONLY cross-family bridge allowed: weight vs.
// volume is never bridged this way, since that would require an unstated
// ingredient density (CLAUDE.md costing rule #3) — that must stay a genuine
// "Needs Review" unit mismatch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { computeLiveSubRecipeCost, type SubRecipeCostRow } from '../src/lib/recipes/subRecipeCost'
import { calculateLineCost, calculateLineCostDetailed, type RecipeIngredientDraft } from '../src/hooks/useRecipes'

const repoRoot = join(import.meta.dirname, '..')

function draft(overrides: Partial<RecipeIngredientDraft>): RecipeIngredientDraft {
  return {
    id: 'line-1',
    ingredientName: 'Cream Cheese Frost',
    subRecipeId: 'sub-1',
    quantity: 0,
    unit: 'g',
    lineCost: 0,
    ...overrides,
  }
}

// ── computeLiveSubRecipeCost: weightG ───────────────────────────────────────

test('computeLiveSubRecipeCost sums weight-family ingredient lines (mixed g/kg) into weightG', () => {
  const row: SubRecipeCostRow = {
    id: 'sub-1',
    sub_ingredient_unit: 'unit',
    yield_quantity: 1,
    yield_unit: 'unit',
    recipe_ingredients: [
      { id: 'a', quantity: 400, unit: 'g', ingredient: { current_price: 0.0075, price_unit: 'g' } },
      { id: 'b', quantity: 0.2, unit: 'kg', ingredient: { current_price: 0.00515, price_unit: 'g' } },
    ],
  }
  const result = computeLiveSubRecipeCost(row)
  assert.equal(result.weightG, 600)
})

test('computeLiveSubRecipeCost excludes count-family ingredient lines from the live weight sum', () => {
  const row: SubRecipeCostRow = {
    id: 'sub-1',
    sub_ingredient_unit: 'unit',
    yield_quantity: 1,
    yield_unit: 'unit',
    recipe_ingredients: [
      { id: 'a', quantity: 600, unit: 'g', ingredient: { current_price: 0.005, price_unit: 'g' } },
      { id: 'b', quantity: 1, unit: 'unit', ingredient: { current_price: 2, price_unit: 'unit' } },
    ],
  }
  const result = computeLiveSubRecipeCost(row)
  assert.equal(result.weightG, 600)
})

test('computeLiveSubRecipeCost falls back to the stored snapshot weight when there are no ingredient rows', () => {
  const row: SubRecipeCostRow = {
    id: 'sub-1',
    sub_ingredient_unit: 'unit',
    sub_ingredient_cost_per_unit: 4.03,
    sub_ingredient_weight_g: 600,
    yield_quantity: 1,
    yield_unit: 'unit',
    recipe_ingredients: [],
  }
  const result = computeLiveSubRecipeCost(row)
  assert.equal(result.weightG, 600)
  assert.equal(result.source, 'snapshot')
})

test('computeLiveSubRecipeCost returns null weightG when neither live ingredients nor a snapshot exist', () => {
  const row: SubRecipeCostRow = {
    id: 'sub-1',
    sub_ingredient_unit: 'unit',
    yield_quantity: 1,
    yield_unit: 'unit',
    recipe_ingredients: [],
  }
  const result = computeLiveSubRecipeCost(row)
  assert.equal(result.weightG, null)
})

// ── ingredientCostInput weight-bridge (via calculateLineCost) ──────────────

test('200g of a 600g/€4.03-per-unit sub-recipe costs a proportional €1.34, not €0', () => {
  const line = draft({ quantity: 200, unit: 'g', currentPrice: 4.03, priceUnit: 'unit', subRecipeWeightG: 600 })
  const detailed = calculateLineCostDetailed(line)
  assert.equal(detailed.status, 'ok')
  assert.equal(detailed.isCostComplete, true)
  const expected = Number(((200 / 600) * 4.03).toFixed(2))
  assert.equal(calculateLineCost(line), expected)
  assert.equal(calculateLineCost(line), 1.34)
})

test('0.3kg of the same sub-recipe converts through the weight bridge too', () => {
  const line = draft({ quantity: 0.3, unit: 'kg', currentPrice: 4.03, priceUnit: 'unit', subRecipeWeightG: 600 })
  const expected = Number(((300 / 600) * 4.03).toFixed(2))
  assert.equal(calculateLineCost(line), expected)
})

test('0.5kg matches the documented €3.36 example', () => {
  const line = draft({ quantity: 0.5, unit: 'kg', currentPrice: 4.03, priceUnit: 'unit', subRecipeWeightG: 600 })
  assert.equal(calculateLineCost(line), 3.36)
})

test('used as 1 unit still costs the full €4.03 — bridge does not fire when families already match', () => {
  const line = draft({ quantity: 1, unit: 'unit', currentPrice: 4.03, priceUnit: 'unit', subRecipeWeightG: 600 })
  assert.equal(calculateLineCost(line), 4.03)
})

test('other weight-family units (lb) bridge correctly too', () => {
  const line = draft({ quantity: 1, unit: 'lb', currentPrice: 4.03, priceUnit: 'unit', subRecipeWeightG: 600 })
  const expected = Number(((453.59237 / 600) * 4.03).toFixed(2))
  assert.equal(calculateLineCost(line), expected)
})

test('without a stored weight bridge, a weight-vs-count mismatch is still flagged (existing behavior unchanged)', () => {
  const line = draft({ quantity: 200, unit: 'g', currentPrice: 4.03, priceUnit: 'unit' })
  const detailed = calculateLineCostDetailed(line)
  assert.equal(detailed.status, 'unit_mismatch')
  assert.equal(detailed.cost, 0)
  assert.equal(detailed.isCostComplete, false)
})

test('a zero stored weight is treated as missing — no divide-by-zero bridge', () => {
  const line = draft({ quantity: 200, unit: 'g', currentPrice: 4.03, priceUnit: 'unit', subRecipeWeightG: 0 })
  const detailed = calculateLineCostDetailed(line)
  assert.equal(detailed.status, 'unit_mismatch')
})

test('the bridge only applies weight-parent-uses-count-priced-sub-recipe, never the reverse', () => {
  const line = draft({ quantity: 2, unit: 'unit', currentPrice: 0.01, priceUnit: 'g', subRecipeWeightG: 600 })
  const detailed = calculateLineCostDetailed(line)
  assert.equal(detailed.status, 'unit_mismatch')
})

test('the bridge never engages for volume-family parent units — no unstated density', () => {
  const line = draft({ quantity: 200, unit: 'ml', currentPrice: 4.03, priceUnit: 'unit', subRecipeWeightG: 600 })
  const detailed = calculateLineCostDetailed(line)
  assert.equal(detailed.status, 'unit_mismatch')
})

// ── Persistence (no live Supabase in this repo — check source text) ────────

test('a migration adds recipes.sub_ingredient_weight_g', () => {
  const migrationsDir = join(repoRoot, 'supabase/migrations')
  const files: string[] = readdirSync(migrationsDir)
  const match = files.find((f) => {
    const sql = readFileSync(join(migrationsDir, f), 'utf8')
    return /ADD COLUMN IF NOT EXISTS\s+sub_ingredient_weight_g/i.test(sql)
  })
  assert.ok(match, 'expected a migration adding recipes.sub_ingredient_weight_g')
})

test('recipe save route persists sub_ingredient_weight_g from the request body', () => {
  const src = readFileSync(join(repoRoot, 'src/app/api/recipes/save/route.ts'), 'utf8')
  assert.match(
    src,
    /sub_ingredient_weight_g:\s*body\.subIngredientWeightG/,
    'expected save/route.ts to persist sub_ingredient_weight_g from body.subIngredientWeightG'
  )
})
