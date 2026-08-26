import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveIngredientPrice, type PriceHistoryEntry } from '../src/lib/ingredients/resolveIngredientPrice'
import { calculateCost } from '../src/lib/utils/cost-calculator'
import { computeLiveSubRecipeCost, type SubRecipeCostRow } from '../src/lib/recipes/subRecipeCost'

// refreshRecipes() (src/hooks/useRecipes.ts) now constrains every embedded
// price_history to exactly one row via
//   order=is_selected_price.desc,recorded_at.desc,id.desc & limit=1
// instead of transferring full history. These tests prove that constraint
// never changes what resolveIngredientPrice picks, and that a real recipe's
// cost is bit-for-bit identical whether it arrives via the full history or
// the constrained single row.

// (a) resolveIngredientPrice: full history vs the one row the constrained
// query would actually return.

test('resolveIngredientPrice: constrained row matches full history — a selected price wins over a more recent one', () => {
  const full: PriceHistoryEntry[] = [
    { id: 'a', price: 5.68, unit: 'kg', is_selected_price: false, recorded_at: '2026-07-06' },
    { id: 'b', price: 5.676, unit: 'kg', is_selected_price: true, recorded_at: '2026-08-04' },
    { id: 'c', price: 5.676, unit: 'kg', is_selected_price: false, recorded_at: '2026-08-18' }, // more recent, but not selected
  ]
  // order=is_selected_price.desc,recorded_at.desc,id.desc limit=1 -> row 'b'
  const constrained = [full[1]]

  assert.deepEqual(resolveIngredientPrice(full, null, null), resolveIngredientPrice(constrained, null, null))
  assert.equal(resolveIngredientPrice(constrained, null, null).price, 5.676)
  assert.equal(resolveIngredientPrice(constrained, null, null).source, 'selected')
})

test('resolveIngredientPrice: constrained row matches full history — most-recent wins when nothing is selected', () => {
  const full: PriceHistoryEntry[] = [
    { id: 'a', price: 1.1812, unit: 'kg', is_selected_price: false, recorded_at: '2026-04-24' },
    { id: 'b', price: 0.7844, unit: 'kg', is_selected_price: false, recorded_at: '2026-08-03' },
    { id: 'c', price: 1.4, unit: 'kg', is_selected_price: false, recorded_at: '2026-04-24' },
  ]
  // order=is_selected_price.desc,recorded_at.desc,id.desc limit=1 -> row 'b' (latest recorded_at)
  const constrained = [full[1]]

  assert.deepEqual(resolveIngredientPrice(full, null, null), resolveIngredientPrice(constrained, null, null))
  assert.equal(resolveIngredientPrice(constrained, null, null).price, 0.7844)
  assert.equal(resolveIngredientPrice(constrained, null, null).source, 'latest')
})

test('resolveIngredientPrice: constrained row matches full history on a recorded_at tie — id.desc tiebreak', () => {
  const full: PriceHistoryEntry[] = [
    { id: 'aaaa', price: 3.0, unit: 'kg', is_selected_price: false, recorded_at: '2026-07-02' },
    { id: 'zzzz', price: 3.5, unit: 'kg', is_selected_price: false, recorded_at: '2026-07-02' }, // same date, higher id
  ]
  // order=...,id.desc limit=1 -> row 'zzzz' (matches resolveIngredientPrice's own
  // "entry.id > newest.id" tiebreak — see resolveIngredientPrice.ts)
  const constrained = [full[1]]

  assert.deepEqual(resolveIngredientPrice(full, null, null), resolveIngredientPrice(constrained, null, null))
  assert.equal(resolveIngredientPrice(constrained, null, null).price, 3.5)
})

test('resolveIngredientPrice: no history rows at all falls back to the manual price identically', () => {
  assert.deepEqual(resolveIngredientPrice([], 2.5, 'g'), resolveIngredientPrice([], 2.5, 'g'))
  assert.equal(resolveIngredientPrice([], 2.5, 'g').source, 'manual')
})

// (b) Tahini Granola fixture: totalCost is unchanged whether ingredient
// price_history arrives full or constrained. Since price_history is already
// resolved down to a single current_price by the time it reaches
// calculateCost/computeLiveSubRecipeCost, this really proves the constrained
// shape (a). Real production numbers: ingredient cost 27.06, 5% waste,
// totalCost 28.41. yield 44 portions (> 1, per CLAUDE.md costing rule 4).

test('Tahini Granola fixture: totalCost is 28.41 regardless of price_history array size', () => {
  const lineDefs = [
    { quantity: 960, unit: 'g', cost: 6.14 },
    { quantity: 800, unit: 'g', cost: 3.97 },
    { quantity: 40, unit: 'ml', cost: 0.45 },
    { quantity: 16, unit: 'g', cost: 0.02 },
    { quantity: 240, unit: 'g', cost: 2.16 },
    { quantity: 240, unit: 'g', cost: 7.92 },
    { quantity: 1280, unit: 'g', cost: 6.40 },
  ]

  const buildIngredients = (historyRowCount: 'full' | 'constrained') =>
    lineDefs.map((line, i) => {
      const pricePerUnit = line.cost / line.quantity
      const fullHistory: PriceHistoryEntry[] = [
        { id: `${i}-old`, price: pricePerUnit * 1.3, unit: line.unit, is_selected_price: false, recorded_at: '2026-01-01' },
        { id: `${i}-selected`, price: pricePerUnit, unit: line.unit, is_selected_price: true, recorded_at: '2026-06-01' },
      ]
      const priceHistory = historyRowCount === 'full' ? fullHistory : [fullHistory[1]]
      const resolved = resolveIngredientPrice(priceHistory, null, null)
      return { quantity: line.quantity, unit: line.unit, current_price: resolved.price, price_unit: resolved.unit }
    })

  const costFull = calculateCost({ ingredients: buildIngredients('full'), wastePercent: 5, yieldQty: 44, yieldUnit: 'portion' })
  const costConstrained = calculateCost({ ingredients: buildIngredients('constrained'), wastePercent: 5, yieldQty: 44, yieldUnit: 'portion' })

  assert.equal(costFull.ingredientCost, 27.06)
  assert.equal(costFull.totalCost, 28.41)
  assert.equal(costConstrained.ingredientCost, costFull.ingredientCost)
  assert.equal(costConstrained.totalCost, costFull.totalCost)
})

// (c) sub-recipe costPerGram still resolves correctly when every ingredient
// line's price_history is already constrained to one row, matching exactly
// what the slimmed list query now returns (see refreshRecipes()).

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
    recipe_ingredients: lineDefs.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      unit: line.unit,
      // Exactly one constrained row per ingredient — what the slimmed list
      // query returns, never the full history.
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

test('sub-recipe costPerGram resolves correctly from constrained (1-row) price_history — manual batch weight', () => {
  const result = computeLiveSubRecipeCost(tahiniGranolaRow({ sub_ingredient_weight_manual_g: 3600 }))
  assert.equal(result.source, 'live')
  assert.equal(result.weightSource, 'manual')
  assert.equal(result.hasSkippedVolumeLines, true) // the 40ml vanilla line
  assert.ok(Math.abs((result.costPerGram ?? 0) - 28.41 / 3600) < 1e-9)
  assert.equal(result.costPerUnit, 28.41 / 44)
})

test('sub-recipe costPerGram resolves correctly from constrained (1-row) price_history — computed weight (no volume lines)', () => {
  const row = tahiniGranolaRow()
  // Drop the volume line so the computed weight sum is trusted (see
  // CLAUDE.md costing rule 4 / subRecipeCost.ts weightSource precedence).
  row.recipe_ingredients = Array.isArray(row.recipe_ingredients)
    ? row.recipe_ingredients.filter((line) => line.unit !== 'ml')
    : row.recipe_ingredients
  const result = computeLiveSubRecipeCost(row)
  assert.equal(result.weightSource, 'computed')
  assert.equal(result.weightG, 960 + 800 + 16 + 240 + 240 + 1280)
  assert.ok(result.costPerGram != null && result.costPerGram > 0)
})
