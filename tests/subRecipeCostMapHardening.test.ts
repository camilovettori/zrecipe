import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateLineCostDetailed, mapRecipeRow, fetchSubRecipeCostMap, type DBRecipeRow } from '../src/hooks/useRecipes'
import { computeLiveSubRecipeCost, type SubRecipeCostRow, type SubRecipeCostResult } from '../src/lib/recipes/subRecipeCost'

// Commit cdb4234 replaced the nested sub_recipe embed in refreshRecipes()'s
// list query with fetchSubRecipeCostMap() + a Map<subRecipeId,
// SubRecipeCostResult> that mapRecipeRow looks up. On the list path
// subRecipeRef is now ALWAYS null (no nested embed fetched at all), so if
// the map is missing an entry — an incomplete map, or a sub-recipe that
// failed to fetch — there is nothing left to fall back to. These tests prove
// that gap can never render as a settled €0, and that a failed sub-recipe
// fetch surfaces the list page's existing error state instead of silently
// zeroing every affected recipe's cost.

// Real production numbers (Tahini Granola): ingredient cost 27.06, 5% waste,
// totalCost 28.41, yield 44 portions (> 1 — CLAUDE.md costing rule 4).
function tahiniGranolaSubRecipeRow(overrides: Partial<SubRecipeCostRow> = {}): SubRecipeCostRow {
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

// A parent recipe row shaped exactly like the SLIMMED list query returns —
// yield 2 (> 1), one ordinary ingredient and one sub-recipe reference line
// with no nested `sub_recipe` embed (the list query never fetches it).
function parentRecipeRow(overrides: Partial<DBRecipeRow> = {}): DBRecipeRow {
  return {
    id: 'granola-sundae',
    tenant_id: 'tenant-1',
    name: 'Granola Sundae',
    yield_quantity: 2,
    yield_unit: 'portion',
    is_sub_ingredient: false,
    recipe_ingredients: [
      {
        id: 'line-yoghurt',
        recipe_id: 'granola-sundae',
        quantity: 40,
        unit: 'g',
        ingredient: { id: 'yoghurt', name: 'Yoghurt', current_price: 0.01, price_unit: 'g' },
      },
      {
        id: 'line-tahini-granola',
        recipe_id: 'granola-sundae',
        sub_recipe_id: 'tahini-granola',
        quantity: 40,
        unit: 'g',
        ingredient: null,
        sub_recipe: null, // list path: no nested embed, ever
      },
    ],
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  }
}

test('empty cost map + no nested embed: the sub-recipe line is flagged incomplete, never a silent ok €0', () => {
  const emptyMap = new Map<string, SubRecipeCostResult>()
  const recipe = mapRecipeRow(parentRecipeRow(), 15, {}, emptyMap)

  const subRecipeLine = recipe.ingredients.find((i) => i.id === 'line-tahini-granola')!
  const detailed = calculateLineCostDetailed(subRecipeLine)

  assert.notEqual(detailed.status, 'ok')
  assert.equal(detailed.isCostComplete, false)
  assert.equal(detailed.cost, 0)
  // The purpose-built "sub-recipe cost couldn't be trusted" signal must fire
  // for "we have nothing at all", not just for a stale snapshot fallback.
  assert.equal(subRecipeLine.subRecipeCostStale, true)
  assert.equal(recipe.cost.incompleteCost, true)
  assert.equal(recipe.cost.hasStaleSubRecipeCosts, true)
})

test('missing map entry behaves the same as an empty map (map present but this id absent)', () => {
  const mapMissingThisId = new Map<string, SubRecipeCostResult>([
    ['some-other-sub-recipe', computeLiveSubRecipeCost(tahiniGranolaSubRecipeRow({ id: 'some-other-sub-recipe' }))],
  ])
  const recipe = mapRecipeRow(parentRecipeRow(), 15, {}, mapMissingThisId)
  const subRecipeLine = recipe.ingredients.find((i) => i.id === 'line-tahini-granola')!

  assert.equal(subRecipeLine.subRecipeCostStale, true)
  const detailed = calculateLineCostDetailed(subRecipeLine)
  assert.notEqual(detailed.status, 'ok')
  assert.equal(detailed.cost, 0)
})

test('a failed sub-recipe fetch throws — refreshRecipes\' existing catch surfaces error state, never an empty map', async () => {
  // Minimal thenable stub matching the .from().select().in().order()x3.limit()
  // chain fetchSubRecipeCostMap uses, resolving like a failed Supabase call.
  const failingSupabaseStub = {
    from() { return this },
    select() { return this },
    in() { return this },
    order() { return this },
    limit() { return this },
    then(resolve: (v: { data: null; error: { message: string; code: string; details: null; hint: null } }) => void) {
      resolve({ data: null, error: { message: 'connection reset', code: 'PGRST000', details: null, hint: null } })
    },
  }

  // fetchSubRecipeCostMap throws the raw Supabase error object (matching the
  // existing `throw fetchError` pattern for the main recipes query below it),
  // not a native Error — assert on its shape directly rather than a message
  // regex, which only matches Error instances' .toString().
  await assert.rejects(
    () => fetchSubRecipeCostMap(failingSupabaseStub as never, ['tahini-granola']),
    (err: unknown) => {
      assert.equal((err as { message?: string }).message, 'connection reset')
      return true
    }
  )
})

test('happy path unchanged: a populated map still costs the Tahini Granola line at €0.32 for 40g (total €28.41)', () => {
  const subRecipeRow = tahiniGranolaSubRecipeRow()
  const result = computeLiveSubRecipeCost(subRecipeRow)
  assert.equal(result.costPerUnit != null ? Number(result.costPerUnit.toFixed(2)) : null, 0.65)

  const populatedMap = new Map<string, SubRecipeCostResult>([[subRecipeRow.id, result]])
  const recipe = mapRecipeRow(parentRecipeRow(), 15, {}, populatedMap)
  const subRecipeLine = recipe.ingredients.find((i) => i.id === 'line-tahini-granola')!

  assert.equal(subRecipeLine.subRecipeCostStale, false)
  assert.equal(subRecipeLine.lineCost, 0.32)
  assert.equal(recipe.cost.hasStaleSubRecipeCosts, false)
})
