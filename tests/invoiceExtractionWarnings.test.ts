// Regression guard for the post-extraction validation layer (Validations
// 1-5 in the invoice-extraction-warnings task). These are pure functions in
// src/lib/invoices.ts, not the AI-facing route.ts, so they can be unit
// tested directly against real logic instead of source-inspection.
//
// Deliberately does NOT test silent auto-correction: per an explicit product
// decision, mismatched price/quantity/total is surfaced as a *suggestion* in
// warnings[], never written back into unit_price/quantity — the codebase
// already had two comments establishing "documentary evidence, never
// rewritten" for exactly this reason (parseAndValidateExtraction in
// route.ts), and reversing that for auto-applied corrections risks silently
// baking in a wrong number when the AI misread a different field.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checkPriceSanity,
  suggestReconciledValue,
  detectDuplicateItems,
  reconcileInvoiceTotal,
  applyExtractionWarnings,
} from '../src/lib/invoices'

const repoRoot = join(import.meta.dirname, '..')

// ── Validation 1: line total reconciliation (suggest, never auto-apply) ────

test('suggestReconciledValue returns null when quantity x price already matches total', () => {
  assert.equal(suggestReconciledValue(2, 39.67, 79.34), null)
})

test('suggestReconciledValue returns null within 2% rounding tolerance', () => {
  // 2 x 10.00 = 20.00, total 20.30 -> 1.5% off, should be treated as rounding
  assert.equal(suggestReconciledValue(2, 10.0, 20.3), null)
})

test('suggestReconciledValue suggests a derived unit price without mutating input', () => {
  const msg = suggestReconciledValue(4, 999, 60.0)
  assert.ok(msg, 'expected a suggestion for a wildly wrong unit_price')
  assert.match(msg!, /15\.00/) // 60 / 4 = 15.00
  assert.match(msg!, /unit price/i)
})

test('suggestReconciledValue never returns an "apply" instruction — advisory wording only', () => {
  const msg = suggestReconciledValue(4, 999, 60.0)
  assert.doesNotMatch(msg ?? '', /\bapplied\b/i)
})

// ── Validation 3 regression: CASES vs UNITS must stay distinct ─────────────
// This is NOT re-implemented — resolveInvoiceQuantityEvidence in this same
// file already parses "24 X 330ML" and correctly distinguishes CASES
// (package_size = count x unitSize) from UNITS (package_size = unitSize
// only). We only assert here that route.ts didn't grow a second, competing
// parser that would regress this distinction.
test('route.ts does not define a competing package-size parser', () => {
  const routeSrc = readFileSync(
    join(repoRoot, 'src/app/api/invoices/extract/route.ts'),
    'utf8'
  )
  assert.doesNotMatch(
    routeSrc,
    /function\s+normalizePackageSize\s*\(/,
    'found a new normalizePackageSize function in route.ts — this would duplicate ' +
      'resolveInvoiceQuantityEvidence (src/lib/invoices.ts) and, unlike it, does not ' +
      'distinguish CASES (multiply) from UNITS (do not multiply) semantics'
  )
})

// ── Validation 4: price sanity ──────────────────────────────────────────────

test('checkPriceSanity flags an implausibly high price per kg', () => {
  // 1 case @ €500, package_size 2kg -> €250/kg
  const msg = checkPriceSanity(500, 2, 'kg')
  assert.ok(msg)
  assert.match(msg!, /250\.00\/kg/)
})

test('checkPriceSanity flags an implausibly low price per kg', () => {
  const msg = checkPriceSanity(0.02, 1, 'kg')
  assert.ok(msg)
  assert.match(msg!, /low/i)
})

test('checkPriceSanity is silent for a normal price', () => {
  assert.equal(checkPriceSanity(8.5, 2, 'kg'), null)
})

test('checkPriceSanity correctly converts grams to kg before judging (not a raw-number check)', () => {
  // 250g at €2 -> €8/kg, perfectly normal, would look "very high" if treated as €2/250=... nonsense
  assert.equal(checkPriceSanity(2, 250, 'g'), null)
})

test('checkPriceSanity skips count-based packaging (no weight/volume basis)', () => {
  assert.equal(checkPriceSanity(500, 24, 'unit'), null)
})

// ── Validation 5: duplicate detection ───────────────────────────────────────

test('detectDuplicateItems flags identical product codes', () => {
  const flags = detectDuplicateItems([
    { description: 'Coca Cola 330ml', product_code: 'CC330' },
    { description: 'Coca-Cola Cans', product_code: 'cc330' }, // case/punctuation-insensitive
  ])
  assert.match(flags[0] ?? '', /item 2/)
  assert.match(flags[1] ?? '', /item 1/)
})

test('detectDuplicateItems flags identical normalized descriptions when no code present', () => {
  const flags = detectDuplicateItems([
    { description: 'Cannellini Beans 400g', product_code: null },
    { description: '  cannellini   beans 400g!! ', product_code: null },
  ])
  assert.ok(flags[0])
  assert.ok(flags[1])
})

test('detectDuplicateItems does not flag genuinely different items', () => {
  const flags = detectDuplicateItems([
    { description: 'Coconut Milk 400ml', product_code: '265590' },
    { description: 'Arborio Rice 1kg', product_code: '402002' },
  ])
  assert.deepEqual(flags, [null, null])
})

// ── Validation 2: invoice total reconciliation ──────────────────────────────

test('reconcileInvoiceTotal is silent when null/zero invoice total', () => {
  assert.equal(reconcileInvoiceTotal([{ total: 10 }], null), null)
  assert.equal(reconcileInvoiceTotal([{ total: 10 }], 0), null)
})

test('reconcileInvoiceTotal is silent within 5% tolerance', () => {
  assert.equal(reconcileInvoiceTotal([{ total: 96 }], 100), null)
})

test('reconcileInvoiceTotal flags a shortfall as "items may be missing"', () => {
  const msg = reconcileInvoiceTotal([{ total: 50 }], 100)
  assert.ok(msg)
  assert.match(msg!, /missing/)
})

test('reconcileInvoiceTotal flags an excess as "duplicates or wrong prices"', () => {
  const msg = reconcileInvoiceTotal([{ total: 150 }], 100)
  assert.ok(msg)
  assert.match(msg!, /duplicates or wrong prices/)
})

// ── Orchestrator: attaches warnings[] and invoice_total_warning ────────────

test('applyExtractionWarnings attaches warnings to items and an invoice-level banner', () => {
  const result = applyExtractionWarnings({
    subtotal_amount: 100,
    total_amount: 100,
    items: [
      { description: 'Coconut Milk 400ml', product_code: 'A1', quantity: 2, unit_price: 5, total: 10, package_size: null, package_unit: null },
      { description: 'Arborio Rice 1kg', product_code: 'A2', quantity: 1, unit_price: 20, total: 20, package_size: null, package_unit: null },
    ],
  })
  assert.ok(Array.isArray(result.items[0].warnings))
  assert.ok(Array.isArray(result.items[1].warnings))
  // sum = 30, invoice total = 100 -> way under, should flag missing items
  assert.match(result.invoice_total_warning ?? '', /missing/)
})

test('applyExtractionWarnings produces no item warnings for clean, reconciled items', () => {
  const result = applyExtractionWarnings({
    subtotal_amount: 30,
    total_amount: 30,
    items: [
      { description: 'Coconut Milk 400ml', product_code: 'A1', quantity: 2, unit_price: 5, total: 10, package_size: 400, package_unit: 'ml' },
      { description: 'Arborio Rice 1kg', product_code: 'A2', quantity: 1, unit_price: 20, total: 20, package_size: 1, package_unit: 'kg' },
    ],
  })
  assert.deepEqual(result.items[0].warnings, [])
  assert.deepEqual(result.items[1].warnings, [])
  assert.equal(result.invoice_total_warning, null)
})

// ── Wiring: route.ts, InvoiceEditor.tsx, import/page.tsx ───────────────────

test('route.ts wires applyExtractionWarnings into the extraction response', () => {
  const routeSrc = readFileSync(
    join(repoRoot, 'src/app/api/invoices/extract/route.ts'),
    'utf8'
  )
  assert.match(routeSrc, /applyExtractionWarnings/)
})

test('InvoiceEditor.tsx renders per-item warnings', () => {
  const editorSrc = readFileSync(
    join(repoRoot, 'src/components/invoices/InvoiceEditor.tsx'),
    'utf8'
  )
  assert.match(editorSrc, /item\.warnings/)
})

test('import/page.tsx surfaces invoice_total_warning as page state', () => {
  const importPageSrc = readFileSync(
    join(repoRoot, 'src/app/(dashboard)/invoices/import/page.tsx'),
    'utf8'
  )
  assert.match(importPageSrc, /invoice_total_warning/)
  assert.match(importPageSrc, /invoiceTotalWarning/)
})
