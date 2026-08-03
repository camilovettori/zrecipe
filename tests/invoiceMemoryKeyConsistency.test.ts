// Regression guard for Invoice QA #7: the invoice_item_memory write path
// (save/route.ts) and read/matching path (extract/route.ts) must normalize
// the description key with the SAME function, or OCR variance like extra
// spaces / mixed case silently breaks remembered ingredient matches.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const saveSrc = readFileSync(join(repoRoot, 'src/app/api/invoices/save/route.ts'), 'utf8')
const extractSrc = readFileSync(join(repoRoot, 'src/app/api/invoices/extract/route.ts'), 'utf8')

test('save route imports and uses the shared normalizeMemoryKey when writing the memory key', () => {
  assert.match(saveSrc, /import\s*\{\s*normalizeMemoryKey\s*\}\s*from\s*['"]@\/lib\/utils\/normalizeMemoryKey['"]/)
  assert.match(saveSrc, /const key = normalizeMemoryKey\(original\)/)
})

test('extract route imports and uses the shared normalizeMemoryKey when matching against remembered keys', () => {
  assert.match(extractSrc, /import\s*\{\s*normalizeMemoryKey\s*\}\s*from\s*['"]@\/lib\/utils\/normalizeMemoryKey['"]/)
  assert.match(extractSrc, /const key = normalizeMemoryKey\(item\.description/)
})

test('neither route derives the memory key with an ad-hoc .toLowerCase() instead of the shared helper', () => {
  assert.doesNotMatch(saveSrc, /const key = original\.toLowerCase\(\)/)
  assert.doesNotMatch(extractSrc, /const key = \(item\.description[\s\S]{0,40}\.toLowerCase\(\)\.trim\(\)/)
})
