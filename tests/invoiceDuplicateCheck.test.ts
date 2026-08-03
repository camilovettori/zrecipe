// Regression guard for Invoice QA #5: re-uploading the same invoice (same
// tenant + supplier + invoice_number) must be rejected with 409 instead of
// silently creating a duplicate invoice row.
//
// The save route talks directly to the real supabase admin client with no
// DI/mocking seam (same constraint as tests/priceHistoryBrandFix.test.ts), so
// this checks the route's source rather than invoking it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const src = readFileSync(join(repoRoot, 'src/app/api/invoices/save/route.ts'), 'utf8')

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

const postFn = extractFunctionBody(src, 'export async function POST(request: NextRequest) {')

test('duplicate-invoice check queries by tenant_id + supplier_id + invoice_number', () => {
  assert.match(postFn, /\.from\(['"]invoices['"]\)/, 'expected a query against the invoices table')
  assert.match(postFn, /\.eq\(['"]tenant_id['"],\s*tenantId\)/)
  assert.match(postFn, /\.eq\(['"]supplier_id['"],\s*supplierId\)/)
  assert.match(postFn, /\.eq\(['"]invoice_number['"],\s*invoiceNumber\)/)
})

test('duplicate-invoice check excludes the invoice being updated (edit flow must not false-positive)', () => {
  assert.match(
    postFn,
    /\.neq\(['"]id['"],\s*invoiceId\)/,
    'expected the duplicate check to exclude the current invoiceId, otherwise re-saving an existing invoice unchanged would 409'
  )
})

test('duplicate-invoice check returns 409 with a clear message, and runs before the invoice upsert', () => {
  const idxCheck = postFn.search(/\.from\(['"]invoices['"]\)[\s\S]*?maybeSingle\(\)/)
  const idx409 = postFn.indexOf('{ status: 409 }')
  const idxUpsert = postFn.indexOf(".from('invoices')\n      .upsert(invoicePayload")

  assert.notEqual(idxCheck, -1)
  assert.notEqual(idx409, -1, 'expected a 409 response for the duplicate case')
  assert.notEqual(idxUpsert, -1, 'expected the invoice upsert call')
  assert.ok(idxCheck < idxUpsert, 'the duplicate check must run before the invoice is written')
  assert.ok(idx409 < idxUpsert, 'the 409 response must be returned before the invoice is written')

  const around409 = postFn.slice(Math.max(0, idx409 - 300), idx409)
  assert.match(around409, /already exists/i, 'expected a clear "already exists" message near the 409')
})
