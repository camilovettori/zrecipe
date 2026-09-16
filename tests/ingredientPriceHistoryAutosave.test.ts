// Regression guard: a silent autosave tick in IngredientForm.tsx must never
// insert an ingredient_price_history row — only an explicit Save may.
//
// Bug: the old code gated the insert on `hasMeaningfulPriceChange(ingredient
// .current_price, payload.current_price)` plus a second check against
// `lastSavedRef.current.current_price`. Both baselines are reassigned after
// EVERY save, silent included (onSaved -> setIngredient in the parent page,
// and lastSavedRef.current = ... at the end of performSave). So typing an
// intermediate price, pausing (silent autosave inserts row #1, moves both
// baselines forward), then correcting to the real value and pausing again
// (silent autosave sees a second "change" from the now-moved baseline,
// inserts row #2) produced two permanent, spurious price_history rows for
// one intended edit.
//
// Fix: move the insert behind `if (!silent)`, and anchor the "did price
// change" comparison to priceHistoryBaselineRef — a ref that only updates on
// ingredient id change or a successful explicit save, never on a silent
// autosave's onSaved-driven prop update.
//
// No jsdom/testing-library runner is set up in this repo (see
// priceHistoryBrandFix.test.ts), so this verifies the source structure
// directly rather than rendering the component.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const src = readFileSync(join(repoRoot, 'src/components/ingredients/IngredientForm.tsx'), 'utf8')

function extractBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `could not find start marker: ${startMarker}`)
  const end = source.indexOf(endMarker, start)
  assert.notEqual(end, -1, `could not find end marker: ${endMarker}`)
  return source.slice(start, end)
}

test('priceHistoryBaselineRef is initialized from the ingredient prop', () => {
  assert.match(
    src,
    /const priceHistoryBaselineRef = useRef<number \| null>\(ingredient\?\.current_price \?\? null\)/,
    'expected priceHistoryBaselineRef initialized from ingredient?.current_price'
  )
})

test('priceHistoryBaselineRef resets only on ingredient id change, not on every prop update', () => {
  // A dependency array of [ingredient] (object identity) would re-fire, and
  // re-baseline, on every silent-autosave-driven onSaved -> setIngredient
  // call in the parent — reproducing the original bug. It must be
  // [ingredient?.id] so switching ingredients resets it, but a same-
  // ingredient autosave tick does not.
  assert.match(
    src,
    /priceHistoryBaselineRef\.current = ingredient\?\.current_price \?\? null[\s\S]{0,300}\}, \[ingredient\?\.id\]\)/,
    'expected the baseline-resetting useEffect to depend on [ingredient?.id], not [ingredient]'
  )
})

test('existing-ingredient (update) path: price_history insert only runs when !silent', () => {
  const updateBranch = extractBetween(src, 'if (ingredient) {', '} else {')

  const silentGateIndex = updateBranch.indexOf('if (!silent) {')
  const insertIndex = updateBranch.indexOf("ingredient_price_history').insert(")
  assert.notEqual(silentGateIndex, -1, 'expected an `if (!silent)` gate in the update branch')
  assert.notEqual(insertIndex, -1, 'expected an ingredient_price_history insert in the update branch')
  assert.ok(
    insertIndex > silentGateIndex,
    'the price_history insert must be nested inside the `if (!silent)` block'
  )
})

test('existing-ingredient (update) path: comparison is anchored to priceHistoryBaselineRef, not moving baselines', () => {
  const updateBranch = extractBetween(src, 'if (ingredient) {', '} else {')

  assert.doesNotMatch(
    updateBranch,
    /hasMeaningfulPriceChange\(ingredient\.current_price,/,
    'must not compare against ingredient.current_price — silent autosave moves it forward via onSaved'
  )
  assert.doesNotMatch(
    updateBranch,
    /hasMeaningfulPriceChange\(lastSavedPrice,/,
    'must not compare against lastSavedRef — it is also moved forward by every save, silent included'
  )
  assert.match(
    updateBranch,
    /hasMeaningfulPriceChange\(priceHistoryBaselineRef\.current, payload\.current_price\)/,
    'expected the comparison anchored to priceHistoryBaselineRef'
  )
  assert.match(
    updateBranch,
    /priceHistoryBaselineRef\.current = payload\.current_price/,
    'expected the baseline to advance after a confirmed explicit save'
  )
})

test('existing-ingredient (update) path: ingredients.update() is NOT gated by silent', () => {
  const updateBranch = extractBetween(src, 'if (ingredient) {', '} else {')
  const updateCallIndex = updateBranch.indexOf('.update(updatePayload)')
  const silentGateIndex = updateBranch.indexOf('if (!silent) {')
  assert.notEqual(updateCallIndex, -1)
  assert.ok(
    updateCallIndex < silentGateIndex,
    'ingredients.update() must run outside the !silent gate — silent autosave must still persist current_price as draft state'
  )
})

test('new-ingredient (create) path: price_history insert remains unconditional', () => {
  const createBranch = src.slice(src.indexOf('} else {'), src.indexOf('router.push(`/ingredients/${newId}`)'))
  assert.match(createBranch, /ingredient_price_history'\)\s*\.insert\(/)
  assert.doesNotMatch(
    createBranch,
    /if \(!silent\)/,
    'creation insert must stay unconditional — this branch is only reached via explicit submit anyway'
  )
})

test('autosave effect still guards against firing for a new (unsaved) ingredient', () => {
  assert.match(src, /if \(!isExisting\) return/)
})
