// Regression guard for allergenCacheRef invalidation in RecipeBuilder.tsx.
//
// allergenCacheRef (added in commit 971efaf as a perf fix — see
// subRecipeExpansionDedup.test.ts / subRecipeCostMapHardening.test.ts for the
// sibling sub-recipe caching work) assumes an ingredient's allergens are a
// pure function of its id. That's only true while the ingredient is
// unchanged: allergens are directly editable, and a brand change is itself
// an allergen-review trigger. Without invalidation, a user who edits an
// ingredient's allergens in another tab (or substitutes to a
// previously-cached ingredient) would keep seeing stale data in the EU
// 1169/2011 panel.
//
// hydrateIngredientAllergens / allergenCacheRef are private to the
// RecipeBuilder component (not exported), so — matching this codebase's
// existing convention for such wiring (see e.g. "InvoiceEditor.tsx renders
// per-item warnings" in invoiceExtractionWarnings.test.ts) — these are
// source-inspection tests asserting the invalidation is actually wired in,
// not a re-implementation of the caching logic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const src = readFileSync(join(repoRoot, 'src/components/recipes/RecipeBuilder.tsx'), 'utf8')

// ── Substitute ingredient: must invalidate before re-fetching ─────────────

test('substituting to an ingredient deletes its cache entry before fetching — never shows a value cached earlier this session', () => {
  const onSubstituteBlock = src.slice(
    src.indexOf('onSubstitute={(replacement: SubstituteReplacement'),
    src.indexOf('onClose={() => setSubstituteIngredientId(null)}')
  )
  assert.ok(onSubstituteBlock.length > 0, 'onSubstitute handler not found')

  const ingredientBranch = onSubstituteBlock.slice(
    onSubstituteBlock.indexOf("if (replacement.kind === 'ingredient') {")
  )
  const invalidateIdx = ingredientBranch.indexOf('allergenCacheRef.current.delete(replacement.data.id)')
  const fetchIdx = ingredientBranch.indexOf('fetchAllergensCached([replacement.data.id])')

  assert.notEqual(invalidateIdx, -1, 'substitute-ingredient branch does not invalidate the cache entry')
  assert.notEqual(fetchIdx, -1, 'substitute-ingredient branch does not re-fetch allergens')
  assert.ok(invalidateIdx < fetchIdx, 'cache must be invalidated BEFORE the fetch, not after')
})

// ── New ingredient creation: cache must reflect what was actually persisted ─

test('creating a new ingredient with allergens sets the cache to the persisted value, only on a successful insert', () => {
  const createIngredientBlock = src.slice(
    src.indexOf('const createIngredient = async (formData: NewIngredientFormData) => {'),
    src.indexOf('const removeIngredient = (id: string) => {')
  )
  assert.ok(createIngredientBlock.length > 0, 'createIngredient not found')

  const allergenInsertBlock = createIngredientBlock.slice(
    createIngredientBlock.indexOf('if (formData.allergens?.length) {')
  )
  const errorIdx = allergenInsertBlock.indexOf('if (allergenInsert.error) {')
  const elseIdx = allergenInsertBlock.indexOf('} else {')
  const setIdx = allergenInsertBlock.indexOf('allergenCacheRef.current.set(data.id, formData.allergens)')

  assert.notEqual(setIdx, -1, 'createIngredient never populates allergenCacheRef for the new ingredient id')
  // Must be set in the success (`else`) branch of the insert, not unconditionally —
  // otherwise a failed DB insert would leave the cache claiming allergens exist
  // that were never actually persisted.
  assert.ok(errorIdx !== -1 && elseIdx !== -1 && errorIdx < elseIdx && elseIdx < setIdx,
    'cache must only be set in the else-branch of a successful allergen insert')
})

// ── Refocus: drop the whole allergen cache and re-hydrate, but cheaply ────

test('visibilitychange to visible clears allergenCacheRef and re-hydrates current ingredients once', () => {
  assert.match(src, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/)
  const handlerBlock = src.slice(
    src.indexOf('function handleVisibilityChange()'),
    src.indexOf("document.addEventListener('visibilitychange'")
  )
  assert.match(handlerBlock, /document\.visibilityState !== 'visible'/)
  assert.match(handlerBlock, /allergenCacheRef\.current\.clear\(\)/)
  assert.match(handlerBlock, /hydrateIngredientAllergens\(currentIngredients\)/)
  // Must not touch the sub-recipe fetch cache — that caches a sub-recipe's
  // ingredient *list*, not allergen data, so clearing it on every refocus
  // would reintroduce the per-branch full-recipe re-fetch fan-out that
  // commit 971efaf removed.
  assert.doesNotMatch(handlerBlock, /subRecipeFetchCacheRef\.current\.clear\(\)/)
})

test('the refocus handler is gated on hasLoaded and never fires during an active AI import', () => {
  const handlerBlock = src.slice(
    src.indexOf('function handleVisibilityChange()'),
    src.indexOf("document.addEventListener('visibilitychange'")
  )
  assert.match(handlerBlock, /!hasLoaded\.current \|\| aiImportActiveRef\.current/)
})

test('the refocus refresh suppresses the dirty/autosave trigger — a background refresh is not a user edit', () => {
  const handlerBlock = src.slice(
    src.indexOf('function handleVisibilityChange()'),
    src.indexOf("document.addEventListener('visibilitychange'")
  )
  const suppressIdx = handlerBlock.indexOf('suppressNextDirtyRef.current = true')
  const setRecipeIdx = handlerBlock.indexOf('setRecipe((c) => ({')
  assert.notEqual(suppressIdx, -1, 'refocus refresh does not suppress the dirty flag')
  assert.ok(suppressIdx < setRecipeIdx, 'must suppress dirty tracking BEFORE calling setRecipe')
})

test('the refocus effect only depends on hydrateIngredientAllergens — not on `recipe`, so it never re-registers or fires per keystroke/edit', () => {
  const effectStart = src.indexOf('// ── Refresh allergens on tab refocus')
  const nextSectionStart = src.indexOf('// ── State updaters', effectStart)
  assert.ok(effectStart !== -1 && nextSectionStart !== -1 && nextSectionStart > effectStart,
    'could not bound the refocus effect')
  const effectSlice = src.slice(effectStart, nextSectionStart)
  const depsMatch = effectSlice.match(/},\s*\[([^\]]*)\]\)/)
  assert.ok(depsMatch, 'could not locate the refocus effect dependency array')
  assert.equal(depsMatch![1].trim(), 'hydrateIngredientAllergens')
})

// ── Merge safety: refocus refresh must not clobber concurrent edits ───────

test('the refocus refresh merges allergens by id into current state rather than replacing the whole ingredients array', () => {
  const handlerBlock = src.slice(
    src.indexOf('function handleVisibilityChange()'),
    src.indexOf("document.addEventListener('visibilitychange'")
  )
  // Must read c.ingredients (the LATEST state at merge time) and map onto it,
  // not assign `hydrated` (a snapshot taken when the async refresh started)
  // directly as the new ingredients array.
  assert.match(handlerBlock, /ingredients: c\.ingredients\.map\(/)
  assert.doesNotMatch(handlerBlock, /ingredients: hydrated\s*[,}]/)
})
