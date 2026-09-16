// Coverage for the new "delete a single price_history entry" feature
// (deletePriceHistoryEntry.ts, PriceHistoryChart.tsx's row delete button,
// and the ingredient detail page's handleDeleteEntryConfirm).
//
// No jsdom/testing-library runner exists in this repo, so (a) the DELETE
// scoping and (d) the stopPropagation wiring are verified structurally
// against the source, matching the convention already established by
// priceHistoryBrandFix.test.ts / ingredientPriceHistoryAutosave.test.ts /
// priceAlertsTiebreak.test.ts. (b) and (c) exercise the real, pure
// resolveIngredientPrice() against before/after arrays, since that function
// is what the UI relies on to "just work" once a row disappears — no
// special-casing was added for the deleted-selected-row case, so these
// tests prove that reliance is actually justified.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveIngredientPrice, type PriceHistoryEntry } from '../src/lib/ingredients/resolveIngredientPrice'

const repoRoot = join(import.meta.dirname, '..')

function extractBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `could not find start marker: ${startMarker}`)
  const end = source.indexOf(endMarker, start)
  assert.notEqual(end, -1, `could not find end marker: ${endMarker}`)
  return source.slice(start, end)
}

// (a) DELETE is scoped by both id and ingredient_id.
test('deletePriceHistoryEntry: DELETE is scoped by both id and ingredient_id', () => {
  const src = readFileSync(join(repoRoot, 'src/lib/ingredients/deletePriceHistoryEntry.ts'), 'utf8')
  const deleteBlock = extractBetween(src, ".from('ingredient_price_history')", 'if (error)')

  assert.match(deleteBlock, /\.delete\(\)/, 'expected a .delete() call')
  assert.match(deleteBlock, /\.eq\('id', historyId\)/, 'expected the delete scoped by id')
  assert.match(
    deleteBlock,
    /\.eq\('ingredient_id', ingredientId\)/,
    'expected the delete additionally scoped by ingredient_id as defense-in-depth'
  )
})

// (b) Deleting the currently-selected entry: the remaining array has no
// is_selected_price row, and resolveIngredientPrice's existing
// "no selection -> most recent" fallback correctly picks up the slack with
// no special-casing required in the delete path.
test('deleting the selected entry: resolveIngredientPrice falls back to the most recent remaining row', () => {
  const before: PriceHistoryEntry[] = [
    { id: 'a', price: 5.0, unit: 'kg', is_selected_price: false, recorded_at: '2026-07-01' },
    { id: 'b', price: 6.0, unit: 'kg', is_selected_price: true, recorded_at: '2026-08-01' }, // selected, but not latest
    { id: 'c', price: 7.0, unit: 'kg', is_selected_price: false, recorded_at: '2026-09-01' }, // latest, not selected
  ]
  const beforeResult = resolveIngredientPrice(before, null, null)
  assert.equal(beforeResult.source, 'selected')
  assert.equal(beforeResult.historyId, 'b')

  // Simulate deleting row 'b' (the selected one) exactly as
  // handleDeleteEntryConfirm's optimistic filter does.
  const after = before.filter((r) => r.id !== 'b')
  const afterResult = resolveIngredientPrice(after, null, null)

  assert.equal(afterResult.source, 'latest')
  assert.equal(afterResult.historyId, 'c')
  assert.equal(afterResult.price, 7.0)
})

// (c) Deleting a non-selected entry: the selected row's is_selected_price
// is untouched and still wins.
test('deleting a non-selected entry: the selected row is untouched and still resolves', () => {
  const before: PriceHistoryEntry[] = [
    { id: 'a', price: 5.0, unit: 'kg', is_selected_price: false, recorded_at: '2026-07-01' },
    { id: 'b', price: 6.0, unit: 'kg', is_selected_price: true, recorded_at: '2026-08-01' },
    { id: 'c', price: 7.0, unit: 'kg', is_selected_price: false, recorded_at: '2026-09-01' },
  ]

  // Delete row 'a' (unrelated, unselected).
  const after = before.filter((r) => r.id !== 'a')
  const afterResult = resolveIngredientPrice(after, null, null)

  assert.equal(afterResult.source, 'selected')
  assert.equal(afterResult.historyId, 'b')
  assert.equal(afterResult.price, 6.0)
  assert.equal(after.find((r) => r.id === 'b')?.is_selected_price, true)
})

// Empty-history edge case (last remaining row deleted): resolveIngredientPrice
// must not throw and must fall back to manual price / 'none', matching the
// judgment call in the PR report (soft warning added to the confirm copy,
// not a hard block).
test('deleting the only remaining entry: resolveIngredientPrice falls back to manual price, then to none', () => {
  const withManual = resolveIngredientPrice([], 4.5, 'kg')
  assert.deepEqual(withManual, { price: 4.5, unit: 'kg', source: 'manual', historyId: null })

  const withoutManual = resolveIngredientPrice([], null, null)
  assert.deepEqual(withoutManual, { price: null, unit: null, source: 'none', historyId: null })
})

// (d) The delete button's click handler stops propagation before invoking
// onDeleteRequest, so it can never trigger the row's invoice-navigation
// button even if they ever end up sharing a clickable ancestor.
test('PriceHistoryChart: the delete button stops propagation before calling onDeleteRequest', () => {
  const src = readFileSync(join(repoRoot, 'src/components/ingredients/PriceHistoryChart.tsx'), 'utf8')
  const deleteButtonBlock = extractBetween(src, 'onDeleteRequest && (', '<Trash2')

  const stopPropIndex = deleteButtonBlock.indexOf('e.stopPropagation()')
  const callIndex = deleteButtonBlock.indexOf('onDeleteRequest(point)')
  assert.notEqual(stopPropIndex, -1, 'expected e.stopPropagation() in the delete button handler')
  assert.notEqual(callIndex, -1, 'expected onDeleteRequest(point) to be called')
  assert.ok(stopPropIndex < callIndex, 'stopPropagation must run before onDeleteRequest is invoked')
})

// (e) A failed delete reverts the optimistic removal via a server refetch
// and surfaces a toast — it must not leave the row missing from local state.
test('ingredient detail page: a failed entry delete reverts via refetch and toasts an error', () => {
  const src = readFileSync(join(repoRoot, 'src/app/(dashboard)/ingredients/[id]/page.tsx'), 'utf8')
  const handlerBlock = extractBetween(
    src,
    'const handleDeleteEntryConfirm = useCallback(async () => {',
    '}, [ingredient, deleteEntryTarget])'
  )

  assert.match(
    handlerBlock,
    /setPriceHistory\(\(prev\) => prev\.filter\(\(p\) => p\.id !== target\.id\)\)/,
    'expected an optimistic removal of the target row'
  )

  const failureBranchStart = handlerBlock.indexOf('if (!result.ok) {')
  assert.notEqual(failureBranchStart, -1, 'expected an `if (!result.ok)` failure branch')
  const failureBranch = handlerBlock.slice(failureBranchStart)
  assert.match(failureBranch, /toast\.error\(/, 'expected an error toast on failure')
  assert.match(
    failureBranch,
    /setPriceHistory\(\(data \?\? \[\]\) as PricePoint\[\]\)/,
    'expected the optimistic removal to be reverted via a fresh server fetch on failure'
  )
})
