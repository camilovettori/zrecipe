// Regression guard for AI Import QA #4: a new ingredient created during AI
// recipe import must inherit its price_unit from the row's own unit, or
// resolveIngredientPrice has nothing to work with once a price is added.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const src = readFileSync(join(repoRoot, 'src/components/recipes/AiImportRecipeModal.tsx'), 'utf8')

function extractFunctionBody(source: string, startMarker: string): string {
  const startIdx = source.indexOf(startMarker)
  assert.ok(startIdx !== -1, `expected to find "${startMarker}" in source`)
  const braceStart = source.indexOf('{', startIdx)
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(startIdx, i + 1)
    }
  }
  throw new Error(`unbalanced braces starting from "${startMarker}"`)
}

const handleSave = extractFunctionBody(src, 'const handleSave = async () => {')

test('new-ingredient insert in handleSave sets price_unit from the row unit, not null', () => {
  const insertMatch = handleSave.match(/\.from\(['"]ingredients['"]\)\s*\.insert\(\{[\s\S]*?\}\)/)
  assert.ok(insertMatch, 'expected the ingredients insert call')
  assert.match(
    insertMatch![0],
    /price_unit:\s*normalizeUnit\(row\.unit\)\s*\|\|\s*null/,
    `expected price_unit to derive from normalizeUnit(row.unit), got:\n${insertMatch![0]}`
  )
})
