// Regression guard for BUG A/B: IngredientForm.tsx and RecipeBuilder.tsx must
// send `brand` on every ingredient_price_history insert, or a manually-set
// price silently loses its brand (see 20260803 fix). There's no component
// test runner (jsdom/testing-library) set up in this repo, so this checks
// the actual source text of each insert call rather than rendering the
// component — cheap, and fails loudly if the brand field is ever removed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')

function findInsertBlocks(source: string): string[] {
  return Array.from(
    source.matchAll(/\.from\('ingredient_price_history'\)\s*\.insert\(\{[\s\S]*?\}\)/g),
    (m) => m[0]
  )
}

test('IngredientForm.tsx: both price_history insert paths include brand', () => {
  const src = readFileSync(
    join(repoRoot, 'src/components/ingredients/IngredientForm.tsx'),
    'utf8'
  )
  const blocks = findInsertBlocks(src)

  assert.equal(
    blocks.length,
    2,
    `expected exactly 2 ingredient_price_history insert calls (update path + create path), found ${blocks.length}`
  )
  for (const block of blocks) {
    assert.match(
      block,
      /brand:\s*normalizeBrand\(data\.brand\)/,
      `expected "brand: normalizeBrand(data.brand)" in insert block:\n${block}`
    )
  }
})

test('RecipeBuilder.tsx: createIngredient price_history insert includes brand', () => {
  const src = readFileSync(join(repoRoot, 'src/components/recipes/RecipeBuilder.tsx'), 'utf8')
  const blocks = findInsertBlocks(src)

  assert.equal(blocks.length, 1, `expected exactly 1 ingredient_price_history insert call, found ${blocks.length}`)
  assert.match(
    blocks[0],
    /brand:\s*normalizeBrand\(formData\.brand\)/,
    `expected "brand: normalizeBrand(formData.brand)" in insert block:\n${blocks[0]}`
  )
})
