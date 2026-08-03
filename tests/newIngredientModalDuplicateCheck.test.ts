// Regression guard for Ingredients QA #9: the recipe-page quick-add modal
// (NewIngredientModal.tsx) must warn before creating an ingredient whose name
// already exists, matching the check IngredientForm.tsx already has.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const src = readFileSync(join(repoRoot, 'src/components/recipes/NewIngredientModal.tsx'), 'utf8')

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

const handleSubmit = extractFunctionBody(src, 'const handleSubmit = async (event: FormEvent) => {')

test('handleSubmit queries for an existing ingredient with the same name, scoped to the tenant', () => {
  assert.match(handleSubmit, /\.from\(['"]ingredients['"]\)/)
  assert.match(handleSubmit, /\.ilike\(['"]name['"],\s*trimmedName\)/)
  assert.match(handleSubmit, /\.eq\(['"]tenant_id['"],/)
})

test('handleSubmit asks for confirmation before creating a duplicate, and bails out on cancel', () => {
  const idxLookup = handleSubmit.search(/\.ilike\(['"]name['"],\s*trimmedName\)/)
  const idxConfirm = handleSubmit.indexOf('window.confirm(')
  const idxOnSave = handleSubmit.indexOf('await onSave({')

  assert.notEqual(idxLookup, -1)
  assert.notEqual(idxConfirm, -1, 'expected a window.confirm prompt when a duplicate is found')
  assert.notEqual(idxOnSave, -1)

  assert.ok(idxLookup < idxConfirm, 'the lookup must happen before the confirm prompt')
  assert.ok(idxConfirm < idxOnSave, 'the confirm prompt must happen before onSave is called')
  assert.match(handleSubmit, /if\s*\(!confirmed\)\s*return/, 'expected an early return when the user declines')
})
