// Regression guard for BUG C: AiImportRecipeModal.tsx handleSave() must not
// insert a duplicate ingredient when the same unmatched name (by tokenKey)
// appears on multiple rows in a single save — e.g. "Butter" showing up in
// two sections of an imported recipe should create exactly one ingredient.
//
// There's no component test runner (jsdom/testing-library) or supabase-mock
// infra set up in this repo (see tests/priceHistoryBrandFix.test.ts), and
// handleSave calls the real supabase client directly, so this checks the
// actual source of handleSave rather than rendering the component.
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

test('handleSave declares a createdDuringSave map keyed by tokenKey', () => {
  assert.match(
    handleSave,
    /const createdDuringSave = new Map<string,/,
    'expected a createdDuringSave Map tracking ingredients created earlier in this save'
  )
})

test('handleSave checks createdDuringSave before inserting a new ingredient, and populates it after', () => {
  const idxGet = handleSave.search(/createdDuringSave\.get\(/)
  const idxInsert = handleSave.search(/\.from\(['"]ingredients['"]\)\s*\.insert\(\{/)
  const idxSet = handleSave.search(/createdDuringSave\.set\(/)

  assert.notEqual(idxGet, -1, 'expected a createdDuringSave.get(key) lookup')
  assert.notEqual(idxInsert, -1, 'expected the ingredients insert call')
  assert.notEqual(idxSet, -1, 'expected a createdDuringSave.set(key, ingredient) after creating')

  assert.ok(idxGet < idxInsert, 'the map must be checked BEFORE inserting a new ingredient')
  assert.ok(idxInsert < idxSet, 'the map must be populated AFTER inserting a new ingredient')
})

test('handleSave keys the map by tokenKey(row.name), matching the ambiguous-match logic', () => {
  assert.match(
    handleSave,
    /const key = tokenKey\(row\.name\)/,
    'expected the dedup key to be derived from tokenKey(row.name)'
  )
  assert.match(
    handleSave,
    /createdDuringSave\.get\(key\)/,
    'expected the lookup to use that key'
  )
})
