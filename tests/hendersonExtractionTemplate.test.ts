// Regression guard for the Henderson supplier-specific extraction template.
// Consolidates the old scattered "CASE + UNIT SPLIT COLUMNS (Henderson-style
// invoices)" / "HENDERSON OVERRIDE" prompt sections into one HENDERSON_TEMPLATE
// block, appended unconditionally (self-gated: "IF this is a Henderson
// invoice...") per the chosen single-pass approach.
//
// Critically: for a UNITS-sourced row, package_size must be the INDIVIDUAL
// item size, never multiplied by the pack count. This matches the existing,
// already-fixed rule in resolveInvoiceQuantityEvidence (src/lib/invoices.ts,
// untouched by this change) — multiplying would make price-per-kg read
// ~6-12x too cheap for every Henderson UNITS-sourced ingredient. There's no
// live-Claude test infra in this repo, so this checks the prompt's source
// text rather than an actual extraction call.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const src = readFileSync(join(repoRoot, 'src/app/api/invoices/extract/route.ts'), 'utf8')

test('HENDERSON_TEMPLATE exists and is self-gated (does not run for other suppliers)', () => {
  assert.match(src, /const HENDERSON_TEMPLATE = `/)
  assert.match(src, /IF this is a Henderson Foodservice invoice, follow the rules below/)
})

test('HENDERSON_TEMPLATE is wired into EXTRACTION_PROMPT', () => {
  assert.match(src, /\$\{HENDERSON_TEMPLATE\}/)
})

test('old scattered Henderson prompt sections are removed', () => {
  assert.doesNotMatch(src, /HENDERSON OVERRIDE/)
  assert.doesNotMatch(src, /CASE \+ UNIT SPLIT COLUMNS \(Henderson-style invoices\)/)
  assert.doesNotMatch(src, /EXAMPLE — Henderson-style invoice line/)
})

test('the general (non-Henderson-labeled) CASES/UNITS package_size rule survives the cleanup', () => {
  // This rule applies to any supplier with split quantity columns, not just
  // Henderson — removing the Henderson-labeled sections must not delete it.
  assert.match(src, /package_size = items per case × individual pack size/)
  assert.match(src, /do NOT multiply by the pack count/)
})

test('UNITS-sourced package_size in the worked examples is the individual size, not the pack total', () => {
  // Cannellini: 6 X 800G at UNITS=1 -> 800g, NOT 4800g (would read as
  // implausibly cheap: €1.67 for 800g is ~€2/kg; €1.67 for 4.8kg is ~€0.35/kg)
  assert.match(src, /"6 X 800G"[\s\S]{0,80}package_size=800/)
  assert.doesNotMatch(src, /package_size=4800/)

  // Coconut Milk: 12 X 400ML at UNITS=2 -> 400ml individual, NOT 4800ml
  assert.match(src, /"12 X 400ML"[\s\S]{0,80}package_size=400/)
})

test('CASES-sourced package_size in the worked examples is still multiplied by pack count', () => {
  // Coca Cola: 24 X 330ML at CASES=1 -> full case = 7920ml
  assert.match(src, /"24 X 330ML"[\s\S]{0,80}package_size=7920/)
})

test('deposit return scheme lines are excluded from items', () => {
  assert.match(src, /Deposit Return Scheme/)
  assert.match(src, /Do not include them in items/)
})

test('resolveInvoiceQuantityEvidence (the deterministic package-size backstop) is untouched by this task', () => {
  const invoicesSrc = readFileSync(join(repoRoot, 'src/lib/invoices.ts'), 'utf8')
  // UNITS branch: package_size must still be unitSize alone, never packCount * unitSize
  assert.match(
    invoicesSrc,
    /if \(source === 'UNITS' \|\| source === 'EACH'\) \{[\s\S]{0,400}package_size: unitSize,/
  )
})
