// Regression guard for a data-corruption bug: matching an extracted invoice
// item to an existing ingredient silently overwrote a correct AI-extracted
// line total. Root cause was updateItem() in InvoiceEditor.tsx recalculating
// total = quantity x unitPrice on EVERY patch, unconditionally — including
// patches from selectIngredient() that only touch
// description/ingredientId/ingredientMatch and never touch quantity or
// unitPrice at all. For a package_size line (e.g. "2 bags x 24kg x
// €7.40/kg = €355.20"), that recalculation collapses a correct €355.20 down
// to qty x unitPrice = €14.80, silently dropping the package_size context.
//
// Fix: only recalculate total when the patch actually changes quantity or
// unitPrice — matching CLAUDE.md's costing rule that invoice line data is
// documentary evidence, and this repo's convention (parseAndValidateExtraction
// in route.ts) of never silently rewriting extracted price/total fields.
//
// There's no jsdom/component test runner in this repo (see other tests in
// this directory), so this checks the actual source of updateItem() and
// selectIngredient() rather than rendering the component.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const src = readFileSync(join(repoRoot, 'src/components/invoices/InvoiceEditor.tsx'), 'utf8')

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

test('selectIngredient never includes quantity, unitPrice, or total in its patch', () => {
  const body = extractFunctionBody(src, 'const selectIngredient = (ing: IngredientLookup) => {')
  assert.doesNotMatch(body, /\bquantity:/)
  assert.doesNotMatch(body, /\bunitPrice:/)
  assert.doesNotMatch(body, /\btotal:/)
  assert.doesNotMatch(body, /\bpackageSize:/)
  assert.doesNotMatch(body, /\bpackageUnit:/)
})

test('updateItem only recalculates total when quantity or unitPrice are in the patch', () => {
  const body = extractFunctionBody(src, 'const updateItem = (itemId: string, patch: Partial<InvoiceLineItem>) => {')

  // The recalculation line must not run unconditionally.
  const lines = body.split('\n')
  const recalcLineIndex = lines.findIndex((line) => /next\.total = recalculateItemTotal\(next\)/.test(line))
  assert.notEqual(recalcLineIndex, -1, 'expected to find the recalculateItemTotal call')

  // Walk backwards to the nearest enclosing `if (` and confirm it gates on
  // quantity/unitPrice — i.e. the recalculation is NOT the unconditional
  // last statement in the map callback.
  let guardFound = false
  for (let i = recalcLineIndex; i >= 0; i--) {
    if (/^\s*if\s*\(/.test(lines[i])) {
      const guardBlock = lines.slice(i, recalcLineIndex + 1).join('\n')
      guardFound = /'quantity' in patch/.test(guardBlock) && /'unitPrice' in patch/.test(guardBlock)
      break
    }
    // If we hit the merge line (`const next = { ...item, ...patch }`)
    // before finding an `if (`, there's no guard at all — bug reproduced.
    if (/const next = \{ \.\.\.item, \.\.\.patch \}/.test(lines[i])) break
  }
  assert.ok(
    guardFound,
    'expected next.total = recalculateItemTotal(next) to be gated behind ' +
      "an `if ('quantity' in patch || 'unitPrice' in patch)` check (or equivalent), " +
      'not run unconditionally on every patch'
  )
})
