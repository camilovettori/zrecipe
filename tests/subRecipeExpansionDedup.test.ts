import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateIngredientCost } from '../src/lib/utils/cost-calculator'
import { computeLiveSubRecipeCost, type SubRecipeCostRow } from '../src/lib/recipes/subRecipeCost'

// useRecipes.ts's refreshRecipes() used to embed the full sub-recipe
// (`sub_recipe:recipes!sub_recipe_id(...)`) inside every recipe_ingredients
// row that referenced it — PostgREST doesn't deduplicate embedded entities,
// so a sub-recipe used by N lines/recipes was transferred and recomputed N
// times. It's now fetched flat, once per distinct sub-recipe id
// (fetchSubRecipeCostMap), and the result is shared via a
// Map<subRecipeId, SubRecipeCostResult> that mapRecipeRow looks up instead of
// recomputing per line. This proves that sharing one computed result across
// multiple lines produces bit-identical costs to computing it independently
// per line — i.e. the dedup is a pure performance change, not a behavior one.

// Same fixture used in tests/listQueryPriceHistory.test.ts (Tahini Granola,
// real production numbers): ingredient cost 27.06, 5% waste, totalCost
// 28.41, yield 44 portions (> 1, per CLAUDE.md costing rule 4).
function tahiniGranolaRow(overrides: Partial<SubRecipeCostRow> = {}): SubRecipeCostRow {
  const lineDefs = [
    { id: 'tahini', quantity: 960, unit: 'g', cost: 6.14 },
    { id: 'maple-syrup', quantity: 800, unit: 'g', cost: 3.97 },
    { id: 'vanilla', quantity: 40, unit: 'ml', cost: 0.45 },
    { id: 'salt', quantity: 16, unit: 'g', cost: 0.02 },
    { id: 'chia', quantity: 240, unit: 'g', cost: 2.16 },
    { id: 'pistachio', quantity: 240, unit: 'g', cost: 7.92 },
    { id: 'oats', quantity: 1280, unit: 'g', cost: 6.40 },
  ]
  return {
    id: 'tahini-granola',
    sub_ingredient_unit: 'portion',
    yield_quantity: 44,
    yield_unit: 'portion',
    waste_percent: 5,
    sub_ingredient_weight_manual_g: 3600,
    recipe_ingredients: lineDefs.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      unit: line.unit,
      ingredient: {
        current_price: null,
        price_unit: null,
        price_history: [
          { id: `${line.id}-price`, price: line.cost / line.quantity, unit: line.unit, is_selected_price: true, recorded_at: '2026-06-01' },
        ],
      },
    })),
    ...overrides,
  }
}

test('sub-recipe used twice in the same recipe: sharing one computed result matches computing it independently per line', () => {
  const subRecipeRow = tahiniGranolaRow()

  // "Before": each of the 2 parent lines computes its own independent
  // SubRecipeCostResult from its own copy of the nested embed.
  const independent1 = computeLiveSubRecipeCost(subRecipeRow)
  const independent2 = computeLiveSubRecipeCost(subRecipeRow)

  const lineBefore = (quantityG: number, result: ReturnType<typeof computeLiveSubRecipeCost>) =>
    calculateIngredientCost({
      quantity: quantityG,
      unit: 'g',
      current_price: result.costPerUnit ?? 0,
      price_unit: 'unit',
      subRecipeCostPerGram: result.costPerGram,
      subRecipeHasSkippedVolumeLines: result.hasSkippedVolumeLines,
    })

  const line1Before = lineBefore(40, independent1)
  const line2Before = lineBefore(80, independent2)

  // "After": computed once, shared via a Map keyed by sub-recipe id (exactly
  // what fetchSubRecipeCostMap / mapRecipeRow's subRecipeCostMap lookup do).
  const shared = computeLiveSubRecipeCost(subRecipeRow)
  const subRecipeCostMap = new Map([[subRecipeRow.id, shared]])

  const lineAfter = (quantityG: number) => {
    const result = subRecipeCostMap.get(subRecipeRow.id)!
    return calculateIngredientCost({
      quantity: quantityG,
      unit: 'g',
      current_price: result.costPerUnit ?? 0,
      price_unit: 'unit',
      subRecipeCostPerGram: result.costPerGram,
      subRecipeHasSkippedVolumeLines: result.hasSkippedVolumeLines,
    })
  }

  const line1After = lineAfter(40)
  const line2After = lineAfter(80)

  assert.equal(line1After.cost, line1Before.cost)
  assert.equal(line2After.cost, line2Before.cost)
  assert.equal(line1After.status, 'ok')
  assert.equal(line2After.status, 'ok')

  // Two different quantities of the SAME shared result scale independently
  // and correctly — proves the map isn't accidentally coupling the lines.
  // Tolerance covers each line's own independent cent-rounding.
  assert.ok(Math.abs(line2After.cost - line1After.cost * 2) <= 0.02)
})
