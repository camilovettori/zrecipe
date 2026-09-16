// Regression guard for the "Current unit cost" panel never reflecting a
// fresh price_history selection: panelPriceValue used to be
// `costPreview?.normalizedPrice ?? currentPriceValue`, and costPreview is
// non-null from mount for any existing ingredient with purchase-cost fields
// already filled in — so the resolved/selected price (currentPriceValue,
// via resolveIngredientPrice) was effectively unreachable.
//
// Fix: panelPriceValue only prefers the live costPreview while the user is
// actively mid-edit on a purchase-cost field (purchaseCostTouched), tracked
// by dedicated onChange/onClick hooks in IngredientForm.tsx rather than
// react-hook-form's formState.isDirty — isDirty was traced to already be
// true on load in the common case (a pre-existing effect programmatically
// marks `current_price` dirty via a lossy package-price round-trip), which
// would have reproduced the exact same bug through a different signal.
//
// No jsdom/testing-library runner exists in this repo, so the wiring is
// verified structurally against the source, and the actual precedence
// formula is exercised directly as pure logic (it's a one-line expression,
// mirrored here and cross-checked against the source text so the two can't
// silently drift apart).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const pageSrc = readFileSync(join(repoRoot, 'src/app/(dashboard)/ingredients/[id]/page.tsx'), 'utf8')
const formSrc = readFileSync(join(repoRoot, 'src/components/ingredients/IngredientForm.tsx'), 'utf8')

// Mirrors page.tsx's `panelPriceValue` expression exactly (asserted below).
function resolvePanelPrice(
  purchaseCostTouched: boolean,
  costPreviewPrice: number | null | undefined,
  currentPriceValue: number | null
): number | null {
  return (purchaseCostTouched ? costPreviewPrice : null) ?? currentPriceValue
}

test('the actual source uses this exact precedence formula (guards against silent drift)', () => {
  assert.match(
    pageSrc,
    /const panelPriceValue = \(purchaseCostTouched \? costPreview\?\.normalizedPrice : null\) \?\? currentPriceValue/
  )
  assert.match(
    pageSrc,
    /const panelPriceUnit = \(purchaseCostTouched \? costPreview\?\.normalizedUnit : null\) \?\? currentPriceUnit/
  )
})

// (a) Untouched/settled purchase-cost fields: a fresh price_history
// selection (which changes currentPriceValue via resolveIngredientPrice)
// shows immediately, regardless of whatever costPreview currently holds.
test('(a) settled form: panel shows the resolved/selected price, not the stale live preview', () => {
  const liveDraftPreview = 9.99 // whatever the raw purchase-cost fields currently compute to
  const newlySelectedPrice = 4.308 // resolveIngredientPrice's result after flipping is_selected_price

  const result = resolvePanelPrice(false, liveDraftPreview, newlySelectedPrice)
  assert.equal(result, newlySelectedPrice)
})

// (b) Actively editing: the live preview wins regardless of the currently
// selected/resolved price.
test('(b) actively editing: panel shows the live costPreview value, unaffected by price_history selection', () => {
  const liveDraftPreview = 12.5
  const currentlySelectedPrice = 4.308

  const result = resolvePanelPrice(true, liveDraftPreview, currentlySelectedPrice)
  assert.equal(result, liveDraftPreview)
})

// (c) After a save: the form settles again (purchaseCostTouched resets to
// false, per the [ingredient] effect below), and the panel reflects the
// newly-saved current_price the same way (a) does.
test('(c) after save: settled form shows the freshly saved price like any other settled state', () => {
  const freshlySavedPrice = 8.42
  const result = resolvePanelPrice(false, /* stale costPreview, irrelevant once settled */ 1.0, freshlySavedPrice)
  assert.equal(result, freshlySavedPrice)
})

// (d) Switching selection, then starting a fresh edit: once touched flips
// true again, the live preview wins even though a selection was just made.
test('(d) fresh edit after a selection switch: live preview wins, not the just-selected historical price', () => {
  const justSelectedHistoricalPrice = 6.1543
  const newLiveEditValue = 7.0

  const beforeEdit = resolvePanelPrice(false, null, justSelectedHistoricalPrice)
  assert.equal(beforeEdit, justSelectedHistoricalPrice)

  const duringEdit = resolvePanelPrice(true, newLiveEditValue, justSelectedHistoricalPrice)
  assert.equal(duringEdit, newLiveEditValue)
})

// Structural guards: purchaseCostTouched is wired from every purchase-cost
// interaction point, and reset only where the form actually settles.

test('IngredientForm: purchaseCostTouched is set true from all purchase-cost interaction points', () => {
  const trueCount = (formSrc.match(/setPurchaseCostTouched\(true\)/g) ?? []).length
  // package price input, package_size, package_unit, base_unit,
  // override-toggle button, manual current_price input.
  assert.equal(trueCount, 6, `expected 6 setPurchaseCostTouched(true) call sites, found ${trueCount}`)
})

test('IngredientForm: purchaseCostTouched resets to false only in the ingredient-settle effect', () => {
  const falseCount = (formSrc.match(/setPurchaseCostTouched\(false\)/g) ?? []).length
  assert.equal(falseCount, 2, `expected 2 setPurchaseCostTouched(false) call sites (both branches of the [ingredient] effect), found ${falseCount}`)

  // Both resets must live inside the effect keyed on [ingredient] (the one
  // that already resets packagePriceInput/overrideUnitPrice on load and
  // after every save), not some new, separately-triggered effect.
  const effectStart = formSrc.indexOf('const derived = calculatePackagePriceFromUnitPrice')
  const effectDepsIndex = formSrc.indexOf('}, [ingredient])')
  assert.notEqual(effectStart, -1)
  assert.notEqual(effectDepsIndex, -1)
  const settleEffectBlock = formSrc.slice(formSrc.lastIndexOf('useEffect(() => {', effectStart), effectDepsIndex)
  assert.match(settleEffectBlock, /setPurchaseCostTouched\(false\)/)
})

test('IngredientForm: not derived from react-hook-form formState.isDirty', () => {
  // Regression guard for the specific wrong-fix this bug report warned
  // against: isDirty is already true on load in the common case (see the
  // module docstring above), so gating on it would silently reproduce the
  // exact same bug through a different signal.
  assert.doesNotMatch(formSrc, /purchaseCostTouched = formState\.isDirty/)
  assert.doesNotMatch(pageSrc, /purchaseCostTouched.*formState\.isDirty/)
})

test('IngredientForm reports purchaseCostTouched up via onPurchaseCostTouchedChange, and the page wires it to gate the panel', () => {
  assert.match(formSrc, /onPurchaseCostTouchedChange\?\.\(purchaseCostTouched\)/)
  assert.match(pageSrc, /onPurchaseCostTouchedChange=\{setPurchaseCostTouched\}/)
})
