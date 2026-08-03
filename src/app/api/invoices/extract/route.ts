import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import Papa from 'papaparse'
import { autoDetectCsvColumns, resolveInvoiceQuantityEvidence } from '@/lib/invoices'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getEffectiveSubscriptionStatus } from '@/lib/tenant'
import { FREE_LIMITS, PRO_LIMITS } from '@/lib/subscription/limits'
import { logAIUsage } from '@/lib/ai/usage-logger'

export const runtime = 'nodejs'
export const maxDuration = 60

// ── Shared Anthropic client ────────────────────────────────────────────────

function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured')
  return new Anthropic({ apiKey: key })
}

// ── Date normalisation ──────────────────────────────────────────────────────

function normaliseDateForInput(date: string | null | undefined): string {
  if (!date) return new Date().toISOString().slice(0, 10)
  const ddmmyyyy = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parsed = new Date(date)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

// ── Claude extraction ──────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are an invoice data extraction system for food service businesses (bakeries, restaurants, cafés). Extract structured data from this invoice text.

Return ONLY valid JSON, no markdown, no backticks, no explanation. The JSON must follow this exact structure:

{
  "supplier_name": "string - the company ISSUING the invoice, not the buyer",
  "invoice_number": "string",
  "invoice_date": "DD/MM/YYYY",
  "vat_rate": number or null,
  "vat_amount": number or null,
  "subtotal": number or null,
  "total": number,
  "items": [
    {
      "description": "string",
      "product_code": "string or null",
      "brand": "string or null",
      "original_description": "string - exact original description",
      "quantity": number,
      "unit": "string",
      "package_size": number or null,
      "package_unit": "string or null",
      "unit_price": number,
      "total": number,
      "raw_cases_quantity": "number or null - literal value from CASES column",
      "raw_units_quantity": "number or null - literal value from UNITS column",
      "raw_quantity_columns": { "EXACT COLUMN HEADER": "number or null" },
      "quantity_source": "CASES, UNITS, QTY, EACH, KG, LTR, PACKS, OUTERS, ORDERED, DELIVERED, or UNKNOWN",
      "raw_size_text": "string or null - literal pack format, e.g. 12 X 1KG",
      "supplier_raw_text": "string or null - exact source row text"
    }
  ]
}

FIELD RULES:

RAW INVOICE TRUTH (do this before any normalization):
- Preserve every detected quantity column and its literal value in raw_quantity_columns.
- quantity_source must be the exact header containing the purchased quantity, normalized only to one of the allowed labels above.
- Never infer CASES from size text or from a pack multiplier.
- Keep raw_size_text, unit_price, and total exactly as printed.
- If the source column cannot be identified confidently, use quantity_source="UNKNOWN" and append " (verify)" to the description.
- A format such as "12 X 1KG" becomes 12kg only when quantity_source is CASES/OUTERS. For UNITS/EACH it represents a 1kg individual unit.

SUPPLIER NAME FALLBACK RULES:
If the supplier name is not obvious from a header line, look for it in:
  1. Email addresses in the invoice (e.g. "accounts@henderson.ie" →
     supplier is "Henderson")
  2. Website URLs in the footer (e.g. "www.hendersonwholesale.ie")
  3. VAT number registered name (if repeated near the address)
  4. Bank details ("Please make payment to: HENDERSON FOODSERVICE
     LTD")
  5. Return address at the top or bottom
  6. Footer copyright ("© Henderson Wholesale 2026")

Common Irish/EU foodservice suppliers to recognize by any hint:
  - Henderson Wholesale / Henderson Foodservice
  - Musgrave / Musgrave Cash & Carry
  - BWG Foods
  - Elliotts Cash & Carry
  - Sysco Ireland
  - Pallas Foods
  - La Rousse Foods
  - Keelings Farm Fresh
  - Total Produce
  - Kerry Foodservice
  - Brakes Ireland

DO NOT return "Unknown Supplier" unless you have exhausted ALL of
the above. If you still cannot determine a name, use the most
prominent proper noun on the invoice (usually the company at the
top of the page).

description:
- CRITICAL: Extract the description LITERALLY from the invoice. Do NOT interpret, translate, "clean up", or "improve" it. Copy the exact words in the exact order they appear.
- Preserve casing exactly as printed. Do NOT convert to Title Case. If the invoice says "MC DOUGALLS STD MUFFIN CASE 480S 90G", return exactly that. If the invoice says "Bottles of Egg White 1ltr (Ireland)", return exactly that.
- Read only the invoice's description/product-name column for this field. Do not concatenate fragments from adjacent Brand, Code, Pack, or Unit columns into the description.
- If a brand is printed inside the description itself, preserve it there and also return it in brand when clearly identifiable. If the invoice has a separate brand/manufacturer column, return that value only in brand.
- Do NOT remove weights or volumes printed inside the description. They stay in the description and ALSO go into package_size/package_unit.
- Do NOT substitute words. "Egg White" is NOT "White Egg" and is NOT "White Milk". "Butter" is NOT "Margarine". "Flour" is NOT "Bread". If you're tempted to change any word, DO NOT — return the exact source text.
- Do NOT combine or split lines. Each invoice line becomes exactly one items[] entry with the description as it appears.
- If the source text is genuinely unclear (poor scan, handwriting, partially obscured), append " (verify)" to the description AS-IS without guessing at the missing letters. Never "reconstruct" a name from context.
- The user will rename these in the review step. The system remembers the user's chosen names per supplier via the invoice_item_memory table, so this is a one-time job per unique line.

When to append " (verify)" to the description:
- The text on the invoice is illegible or partially obscured
- You cannot tell where one item's description ends and another begins (multi-line descriptions, wrapped text)
- The line has an obvious data quality issue (numbers where letters should be, etc)

When NOT to append " (verify)":
- You can read the description clearly, even if it looks unusual or long. "Bottles of Egg White 1ltr (Ireland)" is a valid description; do NOT flag it just because it isn't a "clean" product name.

product_code:
- The supplier's product code, SKU, item number, or article code for this line item
- Usually appears in a "Code", "Item No", "SKU", "Product Code", "Article", or "Ref" column
- Common formats: numeric (12345), alphanumeric (BUT-SAL-250), with dashes/slashes
- Return the EXACT code as printed, preserving case and formatting
- Return null if no product code is visible on this line
- Do NOT confuse with invoice number, batch number, or barcode

brand:
- Product manufacturer or brand shown on the line (e.g., "KTC", "Callebaut", "Newforge", "Lakeland")
- Return null when no product brand is visible; do not use the invoice supplier as the brand

quantity:
- The number of PURCHASE UNITS ordered (cases, bags, packs, boxes, etc.)
- This is the "Ordered" or "Qty" column on the invoice
- Example: if invoice says "Ordered: 4" for muffin cases → quantity = 4

unit:
- The PURCHASE unit — the discrete, countable container being ordered: case, bag, pack, box, tub, bottle, carton, tray, block, unit
- This is how the supplier sells it, NOT the individual items inside
- CRITICAL — "kg"/"g"/"L"/"ml" are ALMOST NEVER correct here. Only use a
  weight/volume word for "unit" when the invoice line has NO discrete
  package at all — e.g. a butcher/counter item sold literally by loose
  weight ("Chicken Breast, Qty: 4.5, Unit: kg, Price: 6.50") where the
  quantity column itself IS a weight, not a count of bags/boxes. If the
  quantity column is a whole-number COUNT of items (1, 2, 3, 4 bags/boxes/
  bottles), "unit" must be that container word, never the weight/volume
  unit — even if the only container word you can infer is "bag" or "unit".

package_size / package_unit:
- The NET WEIGHT or NET VOLUME contained in ONE purchase unit (one bag, one
  box, one bottle) — this is where a weight/volume figure printed in the
  product DESCRIPTION belongs. It never overrides or becomes the "unit" field.
- If the invoice shows "250G" and pack contains 40 blocks: package_size = 10 (40 × 250g = 10kg), package_unit = "kg"
- If the invoice shows "500ML" and pack contains 6 bottles: package_size = 3000 or 3, package_unit = "ml" or "L"
- If the invoice shows "10KG" for a single bag: package_size = 10, package_unit = "kg"
- For countable non-weight items (muffin cases, cups, lids): package_size = count per pack (e.g., 480), package_unit = "unit"
- package_unit is one of: kg, g, L, ml, or unit. Use "unit" for countable items without weight (cases, cups, napkins, etc.)

WEIGHT/VOLUME IN THE DESCRIPTION vs THE unit FIELD (a common mistake — read carefully):

A number+unit token in the product description (e.g. "2KG", "500ML", "10KG")
describes the SIZE of one purchased package. It is package_size +
package_unit. It must NEVER be copied into the "unit" field on its own,
even though "kg" or "ml" might look like a tempting one-word answer for
"unit". Before finalizing "unit", check: does the description contain a
number immediately followed by a weight/volume word? If yes, and the
quantity column is a small whole-number count (not itself a weight), that
number+word pair is package_size/package_unit — "unit" must instead be the
container being counted (bag, box, bottle, pack), inferred from context
(a bag of ice, a box of flour, a bottle of vanilla).

Examples:
  "Ice Bags 2KG"  | Qty: 3 | Price: 0.96 | Value: 2.88
    → unit="bag", package_size=2, package_unit="kg", quantity=3, unit_price=0.96
    (WRONG: unit="kg", package_size=null — this makes 0.96 look like the
    price per kg, when it is actually the price per 2kg bag, i.e. €0.48/kg)

  "Flour 10KG" | Qty: 1 | Price: 8.50
    → unit="bag", package_size=10, package_unit="kg", quantity=1, unit_price=8.50

  "Vanilla 500ML" | Qty: 2 | Price: 3.20
    → unit="bottle", package_size=500, package_unit="ml", quantity=2, unit_price=3.20

unit_price:
- CRITICAL: This is ALWAYS the price for ONE PURCHASE UNIT (one case, one bag, one pack)
- NEVER divide by the number of items inside the pack
- If invoice shows: "Muffin Case 480s, Qty: 4, Price: 15.00, Value: 60.00" → unit_price = 15.00 (price per pack), NOT 0.03125 (price per individual muffin case)
- If invoice shows: "Butter 250G, Pack: 40, Qty: 2, Price: 63.33, Value: 126.66" → unit_price = 63.33 (price per case of 40), NOT 1.58 (price per butter block)
- VERIFY: quantity × unit_price should approximately equal total (allowing for rounding)
- If the math doesn't work out and you're unsure which number is
  the price, return unit_price: null. Never guess.

total:
- Total cost for this line item
- Should equal quantity × unit_price (verify this)

VALIDATION:
- For each item, check that quantity × unit_price ≈ total (within rounding tolerance)
- If the math doesn't add up, re-examine which number is the quantity and which is the price
- Skip section headers ("FOODS", "NON FOODS"), dashed lines, page numbers, footer text
- Skip items with zero value unless they have a valid price

COMMON INVOICE FORMATS:
Cash & Carry invoices (Elliotts, Musgrave, BWG, etc.) have columns like:
Code | Description | Pack | Ordered | Supplied | Price | Value | VAT

CRITICAL COLUMN MAPPING:
- "Pack" column = items per pack (e.g., 480 muffin cases per pack) → this goes in package_size
- "Ordered" column = number of packs purchased → this goes in quantity
- "Price" column = price PER PACK → this goes in unit_price
- "Value" column = total cost (Ordered × Price) → this goes in total

Example from a real Elliotts invoice:
MC DOUGALLS STD MUFFIN CASE 480S 90G | Pack: 480 | Ordered: 4 | Price: 15.00 | Value: 60.00

CORRECT extraction:
- description: "MC DOUGALLS STD MUFFIN CASE 480S 90G" (literal — do not clean up or rename)
- quantity: 4 (from Ordered column)
- unit: "pack"
- package_size: 480 (from Pack column)
- package_unit: "unit"
- unit_price: 15.00 (from Price column — per pack, NOT per individual muffin case)
- total: 60.00 (from Value column — 4 × 15.00)

WRONG extraction:
- quantity: 480 ← NO, this is the Pack column, not quantity
- unit_price: 0.03125 ← NO, never divide Price by Pack
- total: 0.00 ← NO, this means the math was wrong

ANOTHER EXAMPLE:
COCONUT OIL PURE KTC 500ML | Pack: 12 | Ordered: 2 | Price: 39.67 | Value: 79.34
CORRECT: description="COCONUT OIL PURE KTC 500ML" (literal), quantity=2, unit="case", package_size=6000, package_unit="ml", unit_price=39.67, total=79.34

CASE + UNIT SPLIT COLUMNS (Henderson-style invoices):

PRESERVE SOURCE EVIDENCE:
- Copy the literal CASES column to raw_cases_quantity (null only when blank).
- Copy the literal UNITS column to raw_units_quantity (null only when blank).
- Copy the printed size/pack format to raw_size_text (for example "12 X 1KG").
- Never infer one quantity column from the other.
- Never default an unclear quantity source to "case".

Some invoices split the quantity across TWO columns: "Case" and
"Unit". Keep each column as documentary evidence. Do not combine them;
the costing interpretation depends on which source column was populated.

Rule:
- If Case > 0 AND Unit = 0: this is a full-case purchase.
  → quantity = Case
  → unit = "case"
  → package_size = items per case × individual pack size
- If Case = 0 AND Unit > 0: this is a loose/individual purchase.
  → quantity = Unit
  → unit = the individual purchase unit (bottle, bag, etc.)
  → package_size = individual pack size only
- If both Case > 0 AND Unit > 0: multi-part purchase, uncommon.
  Preserve both raw values, append " (verify)" to the description, and do
  not silently combine the quantities.

MULTI-PACK DESCRIPTION NOTATION:

Product descriptions often include a "count × size" notation
describing the pack contents, NOT the quantity being ordered:

  "Water 6x2L" — means the pack contains 6 bottles of 2L each.
                 Total pack size = 12L. This is package_size, NOT
                 quantity.
  "Cola 24x330ml" — pack of 24 cans of 330ml each. package_size =
                    7920ml or 7.92L.
  "Yogurt 12x125g" — pack of 12 tubs of 125g each. package_size =
                     1500g or 1.5kg.
  "Butter Salted 40x250g" — pack of 40 blocks of 250g each.
                            package_size = 10 (kg).

NEVER treat the first number in a "NxM" pattern as the quantity
being ordered. That number describes the pack contents. The
quantity comes from the Ordered / Case / Unit columns.

EXAMPLE — Henderson-style invoice line:
  Case: 0 | Unit: 1 | Description: "Water Still 6x2L" | Price: 8.00 | Total: 8.00
CORRECT extraction:
  - description: "Water Still 6x2L" (literal — do not strip the pack notation)
  - quantity: 1        (from Unit column)
  - unit: "unit"       (one loose unit from the case format)
  - package_size: 2    (individual unit size; do NOT multiply by 6)
  - package_unit: "L"
  - unit_price: 8.00
  - total: 8.00
WRONG extraction (this is the bug we're fixing):
  - quantity: 6        ← NO, that's the number of bottles in the pack, not the order quantity
  - This would make quantity × unit_price = 6 × 8 = 48, but total is 8 — the validation should catch this

UNCERTAINTY RULES (very important — reliability over completeness):

HENDERSON OVERRIDE (takes precedence over every earlier multi-pack example):
- CASES only: package_size = pack count x individual size.
  Example: CASES=1, UNITS blank, SIZE=12 X 1KG -> case, package_size=12kg.
- UNITS only: package_size = individual size only. Do NOT multiply by pack count.
  Example: CASES blank, UNITS=1, SIZE=12 X 1KG -> unit, package_size=1kg.
- Both CASES and UNITS: preserve both raw fields and append " (verify)".
- Unknown source: preserve null raw fields and append " (verify)". Never use case by default.

For every field, prefer NULL / empty over a guess. Do NOT invent
values. Specifically:

- unit_price: If you cannot clearly read or derive the price from
  the invoice (e.g. the Price column is smudged, the value is
  inconsistent with the totals, or there's ambiguity between two
  numbers), set unit_price to null. Do NOT compute it from
  total/quantity as a guess — that hides the uncertainty.

- total: Same rule. If you're not confident, return null. The user
  will fix it in the review step.

- package_size / package_unit: If the invoice doesn't clearly show
  the pack size (e.g. no "500ml" or "10kg" printed on the line),
  return null for both. Do NOT infer from the description text
  unless you're absolutely certain (i.e. multi-pack notation like
  "6x2L" is fine; something vague like "large" is not).

- When a field is uncertain, append " (verify)" to the description
  field so the user sees a visual signal in the review step. E.g.
  description: "Butter Salted (verify)" — this makes it obvious
  which rows need attention.

This is a shift from previous behavior. Do NOT try to fill every
field. Empty/null values in the review UI are FINE — the user can
edit them. What is NOT fine is a wrong value that looks correct.
When in doubt, leave it null.

FINAL VALIDATION RULE:
After extracting all items, verify: SUM of all item totals should approximately equal the invoice subtotal/total goods. If it doesn't, one or more items have wrong values — recheck them.

Invoice text:
`

type ClaudeUsage = { inputTokens: number; outputTokens: number }

const KNOWN_SUPPLIERS: Array<{ patterns: RegExp[]; name: string }> = [
  {
    patterns: [
      /\bhenderson\b/i,
      /\bhenderson\s+foodservice(?:\s+(?:ltd|limited))?\b/i,
      /\bhenderson\s+wholesale(?:\s+(?:ltd|limited))?\b/i,
      /\bHFL\b/i,
    ],
    name: 'Henderson Foodservice',
  },
  { patterns: [/musgrave/i, /musgrave\s*cash/i], name: 'Musgrave' },
  { patterns: [/sysco\s*ireland/i], name: 'Sysco Ireland' },
  { patterns: [/pallas\s*foods/i], name: 'Pallas Foods' },
  { patterns: [/la\s*rousse/i], name: 'La Rousse Foods' },
  { patterns: [/elliotts/i], name: 'Elliotts' },
  { patterns: [/bwg\s*foods/i], name: 'BWG Foods' },
  { patterns: [/keelings/i], name: 'Keelings' },
  { patterns: [/total\s*produce/i], name: 'Total Produce' },
  { patterns: [/kerry\s*food/i], name: 'Kerry Foodservice' },
  { patterns: [/brakes/i], name: 'Brakes Ireland' },
]

// ── Supplier name salvage ────────────────────────────────────────────────
// Runs against the ORIGINAL invoice text (not Claude's output) when the AI
// still returns "Unknown Supplier" — catches letterhead-as-logo invoices
// (e.g. Henderson) where the supplier name never appears as prominent text.
function inferSupplierFromRaw(rawText: string): string | null {
  if (!rawText) return null
  const t = rawText.toLowerCase()
  // Ordered by specificity — most specific patterns first
  if (t.includes('henderson wholesale') || t.includes('henderson foodservice')) return 'Henderson Foodservice'
  if (t.includes('musgrave')) return 'Musgrave'
  if (t.includes('bwg foods')) return 'BWG Foods'
  if (t.includes('elliotts cash')) return 'Elliotts Cash & Carry'
  if (t.includes('sysco')) return 'Sysco Ireland'
  if (t.includes('pallas foods')) return 'Pallas Foods'
  if (t.includes('la rousse')) return 'La Rousse Foods'
  if (t.includes('keelings')) return 'Keelings'
  if (t.includes('total produce')) return 'Total Produce'
  if (t.includes('kerry foodservice')) return 'Kerry Foodservice'
  if (t.includes('brakes ireland')) return 'Brakes Ireland'
  // Domain fallback: try to catch xxx@somesupplier.ie or www.somesupplier.ie
  const emailMatch = rawText.match(/@([a-z][a-z0-9-]{2,})\.(ie|eu|com)/i)
  if (emailMatch) {
    const domain = emailMatch[1]
    // Capitalize first letter
    return domain.charAt(0).toUpperCase() + domain.slice(1)
  }
  return null
}

function knownSuppliersIn(value: string) {
  return KNOWN_SUPPLIERS.filter((supplier) =>
    supplier.patterns.some((pattern) => pattern.test(value))
  )
}

function normalizeSupplierName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeProductCode(value: string | null | undefined) {
  return (value ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

async function resolveTenantSupplier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  tenantId: string,
  supplierName: string
): Promise<{ id: string; name: string } | null> {
  const { data } = await admin
    .from('suppliers')
    .select('id, name')
    .eq('tenant_id', tenantId)

  const suppliers = (data ?? []) as Array<{ id: string; name: string }>
  const normalizedCandidate = normalizeSupplierName(supplierName)
  const exact = suppliers.filter(
    (supplier) => normalizeSupplierName(supplier.name) === normalizedCandidate
  )
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null

  const knownCandidate = knownSuppliersIn(supplierName)
  if (knownCandidate.length !== 1) return null

  const aliasMatches = suppliers.filter((supplier) => {
    const knownStored = knownSuppliersIn(supplier.name)
    return knownStored.length === 1 && knownStored[0].name === knownCandidate[0].name
  })

  return aliasMatches.length === 1 ? aliasMatches[0] : null
}

function validateSupplierFromText(aiSupplierName: string, rawText?: string): string {
  const aiName = aiSupplierName?.trim()
  const rawMatches = rawText ? knownSuppliersIn(rawText) : []
  const aiMatches = aiName ? knownSuppliersIn(aiName) : []

  let finalSupplier = 'Unknown Supplier'
  let matchedAlias: string | null = null

  if (rawMatches.length === 1) {
    finalSupplier = rawMatches[0].name
    matchedAlias = rawMatches[0].name
  } else if (rawMatches.length > 1) {
    const aiConfirmed = aiMatches.find((candidate) =>
      rawMatches.some((rawCandidate) => rawCandidate.name === candidate.name)
    )
    finalSupplier = aiConfirmed?.name ?? 'Unknown Supplier'
    matchedAlias = aiConfirmed?.name ?? null
  } else if (aiMatches.length === 1) {
    finalSupplier = aiMatches[0].name
    matchedAlias = aiMatches[0].name
  } else if (aiName && aiName !== 'Unknown Supplier') {
    finalSupplier = aiName
  } else if (rawText) {
    finalSupplier = inferSupplierFromRaw(rawText) ?? 'Unknown Supplier'
  }

  if (process.env.NODE_ENV === 'development') {
    console.info('[supplier-validate]', {
      aiSupplierCandidate: aiName || 'Unknown Supplier',
      matchedSupplierAlias: matchedAlias,
      finalSupplier,
    })
  }

  return finalSupplier
}

// ── "(verify)" suffix → needs_verification flag ─────────────────────────────
// The prompt's UNCERTAINTY RULES instruct Claude to append " (verify)" to a
// description when it's uncertain. That text must never reach the database —
// convert it to a boolean here and strip it from the description before
// anything downstream (client draft, saved ingredient name) ever sees it.
const VERIFY_SUFFIX = /\s*\(verify\)\s*$/i

function parseAndValidateExtraction(rawText: string, usage: ClaudeUsage, sourceText = '') {
  const cleaned = rawText
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim()

  const parsed = JSON.parse(cleaned) as {
    supplier_name?: string
    invoice_number?: string | null
    invoice_date?: string | null
    vat_rate?: number | null
    vat_amount?: number | null
    subtotal?: number | null
    total?: number | null
    items?: Array<{
      description?: string
      original_description?: string | null
      product_code?: string | null
      brand?: string | null
      quantity?: number
      unit?: string
      package_size?: number | null
      package_unit?: string | null
      unit_price?: number | null
      total?: number | null
      needs_verification?: boolean
      raw_cases_quantity?: number | null
      raw_units_quantity?: number | null
      raw_size_text?: string | null
      raw_quantity_columns?: Record<string, number | null>
      supplier_raw_text?: string | null
      extracted_case_pack_count?: number | null
      extracted_unit_size?: number | null
      extracted_unit_measure?: string | null
      quantity_source?: string | null
      normalized_price_confidence?: 'high' | 'review'
      needs_review_reason?: string | null
    }>
  }

  const supplierName = validateSupplierFromText(parsed.supplier_name ?? '', sourceText)
  // Validate extracted evidence before returning. Documentary price/total
  // values are never rewritten here.
  // Skip entirely when the AI explicitly signaled uncertainty (null
  // unit_price/total, per UNCERTAINTY RULES) — forcing a computed value
  // here would silently reintroduce the very fabrication we're avoiding.
  if (Array.isArray(parsed.items)) {
    for (const item of parsed.items) {
      // Convert the "(verify)" text signal into a real flag, independent of
      // the price-validation block below (an item can be flagged with or
      // without a usable price).
      if (item.description && VERIFY_SUFFIX.test(item.description)) {
        item.needs_verification = true
        item.description = item.description.replace(VERIFY_SUFFIX, '').trim()
      } else {
        item.needs_verification = item.needs_verification ?? false
      }

      const rawQuantityColumns = item.raw_quantity_columns ?? {
        cases: item.raw_cases_quantity ?? null,
        units: item.raw_units_quantity ?? null,
      }
      Object.assign(item, resolveInvoiceQuantityEvidence({
          rawQuantityColumns,
          quantitySource: item.quantity_source,
          rawSizeText: item.raw_size_text,
          needsVerification: item.needs_verification,
      }))

      if (item.unit_price == null || item.total == null) continue

      const qty   = Number(item.quantity ?? 1) || 1
      const price = Number(item.unit_price ?? 0)
      const total = Number(item.total ?? 0)
      const calculatedTotal = qty * price

      // Price/value columns are documentary evidence for every supplier.
      // Arithmetic disagreement creates review work; it never rewrites them.
      if (total <= 0 || (total > 0 && Math.abs(calculatedTotal - total) / total > 0.1)) {
        item.needs_verification = true
        item.needs_review_reason ??= 'Invoice quantity, price, and line total do not reconcile. Confirm the source columns.'
      }
    }

    // Sum-of-items sanity check — observability only, never throws
    const sum = parsed.items.reduce((acc, item) => acc + Number(item.total ?? 0), 0)
    const invoiceTotal = parsed.subtotal ?? parsed.total ?? null
    if (invoiceTotal != null && invoiceTotal > 0 && Math.abs(sum - invoiceTotal) / invoiceTotal > 0.15) {
      console.warn(`[extract] Item totals sum (${sum}) diverges from invoice subtotal (${invoiceTotal}). Extraction may need manual review.`)
    }
  }

  return {
    usage,
    supplier_name:   supplierName,
    invoice_number:  parsed.invoice_number ?? null,
    invoice_date:    normaliseDateForInput(parsed.invoice_date),
    vat_rate:        parsed.vat_rate ?? null,
    vat_amount:      parsed.vat_amount ?? null,
    subtotal_amount: parsed.subtotal ?? null,
    total_amount:    parsed.total ?? null,
    items: (parsed.items ?? []).map((item) => ({
      description:  item.description ?? '',
      original_description: item.original_description?.trim() || item.description || '',
      product_code: item.product_code?.trim() || null,
      brand:        item.brand?.trim() || null,
      quantity:     Number(item.quantity ?? 1) || 1,
      unit:         item.unit ?? 'unit',
      package_size: item.package_size ?? null,
      package_unit: item.package_unit ?? null,
      unit_price:   item.unit_price == null ? null : (Number(item.unit_price) || 0),
      total:        item.total == null ? null : (Number(item.total) || 0),
      needs_verification: item.needs_verification ?? false,
      raw_cases_quantity: item.raw_cases_quantity ?? null,
      raw_units_quantity: item.raw_units_quantity ?? null,
      raw_size_text: item.raw_size_text?.trim() || null,
      raw_quantity_columns: item.raw_quantity_columns ?? {},
      supplier_raw_text: item.supplier_raw_text?.trim() || null,
      extracted_case_pack_count: item.extracted_case_pack_count ?? null,
      extracted_unit_size: item.extracted_unit_size ?? null,
      extracted_unit_measure: item.extracted_unit_measure ?? null,
      quantity_source: item.quantity_source ?? null,
      normalized_price_confidence: item.normalized_price_confidence ?? 'review',
      needs_review_reason: item.needs_review_reason ?? null,
    })),
  }
}

async function extractWithClaude(text: string) {
  const anthropic = getAnthropic()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: EXTRACTION_PROMPT + text }],
  })

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Claude returned no text content')

  return parseAndValidateExtraction(content.text, usage, text)
}

const VISION_INSTRUCTION =
  'Read the attached invoice image carefully. Some invoices have logos where the supplier name is not readable as text — in that case, use the fallback rules above (email domain, website, VAT registered name, footer). For handwritten or low-quality scans, extract your best interpretation and flag uncertain fields with a "?" suffix in the description. Do not skip line items. Return ONLY the JSON. CRITICAL: For each line item, extract the description text LITERALLY as you see it on the image. Do not clean, rename, or interpret product names. Copy exactly. If handwriting is unclear, append \' (verify)\' rather than guessing a full name.'

async function extractInvoiceWithVision(imageBase64: string, mimeType: string) {
  const anthropic = getAnthropic()
  const allowedMediaTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
  const mediaType = (allowedMediaTypes as readonly string[]).includes(mimeType)
    ? (mimeType as (typeof allowedMediaTypes)[number])
    : 'image/jpeg'

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: EXTRACTION_PROMPT.replace(/Invoice text:\s*$/, VISION_INSTRUCTION) },
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        ],
      },
    ],
  })

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Claude returned no text content')

  return parseAndValidateExtraction(content.text, usage)
}

async function extractPdfWithHeaderVision(text: string, firstPageImageBase64: string) {
  const anthropic = getAnthropic()
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `${EXTRACTION_PROMPT}${text}\n\n` +
              'The attached image is the first page of the same PDF. Use it only to read visual evidence that may be missing from the PDF text layer, especially the issuing supplier logo or header. Do not invent fields that are not visible in either source.',
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: firstPageImageBase64,
            },
          },
        ],
      },
    ],
  })

  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Claude returned no text content')

  // The original PDF text remains authoritative for deterministic alias
  // validation; the page image is only the fallback for graphical headers.
  return parseAndValidateExtraction(content.text, usage, text)
}

// ── Supplier-aware ingredient name memory ───────────────────────────────────
// Looks up (tenant, supplier, extracted description) memories recorded by
// previous saves (see /api/invoices/save) and attaches a suggested match to
// each item. Applied silently — the client pre-selects the match and shows
// the remembered ingredient name instead of the raw extraction. Best-effort:
// any failure here just returns the extraction unchanged, never blocks it.
async function applyItemMemory<
  T extends {
    supplier_name: string
    items: Array<{
      description: string
      product_code?: string | null
      needs_verification?: boolean
    }>
  }
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  tenantId: string,
  result: T
): Promise<T & { supplier_id?: string | null }> {
  try {
    const supplierName = result.supplier_name?.trim()
    if (!supplierName || supplierName === 'Unknown Supplier') {
      return { ...result, supplier_id: null }
    }

    const supplier = await resolveTenantSupplier(admin, tenantId, supplierName)
    if (!supplier) return { ...result, supplier_id: null }

    const [{ data: memories }, { data: supplierCodes }] = await Promise.all([
      admin
        .from('invoice_item_memory')
        .select('extracted_description_key, ingredient_id, ingredients(id, name)')
        .eq('tenant_id', tenantId)
        .eq('supplier_id', supplier.id),
      admin
        .from('ingredient_supplier_codes')
        .select('product_code, ingredient_id, ingredients(id, name)')
        .eq('tenant_id', tenantId)
        .eq('supplier_id', supplier.id),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memoryMap = new Map<string, any>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (memories ?? []).map((m: any) => [m.extracted_description_key, m])
    )

    // Product codes are compared through a normalized key so harmless case or
    // spacing differences do not defeat a learned mapping. A normalized code
    // that points to multiple ingredients is intentionally treated as unsafe.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const codeMap = new Map<string, any[]>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const codeRow of (supplierCodes ?? []) as any[]) {
      const key = normalizeProductCode(codeRow.product_code)
      if (!key) continue
      codeMap.set(key, [...(codeMap.get(key) ?? []), codeRow])
    }

    const itemsWithMemory = result.items.map((item) => {
      const codeKey = normalizeProductCode(item.product_code)
      if (codeKey) {
        const codeMatches = codeMap.get(codeKey) ?? []
        const ingredientIds = Array.from(
          new Set(codeMatches.map((match) => match.ingredient_id))
        )

        if (ingredientIds.length === 1) {
          const match = codeMatches[0]
          const ing = Array.isArray(match.ingredients) ? match.ingredients[0] : match.ingredients
          return {
            ...item,
            memory_ingredient_id: match.ingredient_id ?? null,
            memory_ingredient_name: ing?.name ?? null,
          }
        }

        if (ingredientIds.length > 1) {
          return {
            ...item,
            needs_verification: true,
            memory_ingredient_id: null,
            memory_ingredient_name: null,
          }
        }
      }

      const key = (item.description ?? '').toLowerCase().trim()
      const match = memoryMap.get(key)
      if (!match) return item

      const ing = Array.isArray(match.ingredients) ? match.ingredients[0] : match.ingredients
      return {
        ...item,
        memory_ingredient_id: match.ingredient_id ?? null,
        memory_ingredient_name: ing?.name ?? null,
      }
    })

    return { ...result, supplier_id: supplier.id, items: itemsWithMemory }
  } catch (err) {
    console.error('[extract] memory lookup failed:', err)
    return { ...result, supplier_id: null }
  }
}

// ── Supplier thousands-quantity convention correction ──────────────────────
// Some packaging suppliers (Atlas, Kingfisher, McKays, ...) express invoice
// quantity as thousands (0.250 = 250 units) and unit price per thousand
// (375.000 = €0.375/unit). Opt-in per supplier via
// suppliers.quantity_in_thousands — never inferred, never applied to CSV
// imports (callers only invoke this on the PDF/image AI-extraction path).
// Best-effort: any failure here just returns the extraction unchanged.
async function applyThousandsConvention<
  T extends {
    supplier_name: string
    items: Array<{
      description: string
      quantity: number
      unit_price: number | null
      total: number | null
    }>
  }
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  tenantId: string,
  result: T
): Promise<T & { thousands_correction_applied: boolean }> {
  try {
    const supplierName = result.supplier_name?.trim()
    if (!supplierName || supplierName === 'Unknown Supplier') {
      return { ...result, thousands_correction_applied: false }
    }

    const { data: supplier } = await admin
      .from('suppliers')
      .select('id, quantity_in_thousands')
      .eq('tenant_id', tenantId)
      .ilike('name', supplierName)
      .maybeSingle()

    if (!supplier?.quantity_in_thousands) {
      return { ...result, thousands_correction_applied: false }
    }

    const THOUSANDS = 1000
    let applied = false

    const correctedItems = result.items.map((item) => {
      const q = Number(item.quantity ?? 0)
      const p = Number(item.unit_price ?? 0)
      const t = Number(item.total ?? 0)

      if (q > 0 && q < 100 && p > 0) {
        const correctedQty = q * THOUSANDS
        const correctedUnitPrice = p / THOUSANDS
        const expectedTotal = correctedQty * correctedUnitPrice
        const totalOk = t === 0 || Math.abs(expectedTotal - t) / Math.max(t, 0.01) < 0.05

        if (totalOk) {
          applied = true
          console.info(
            `[extract] Applied thousands correction for "${item.description}": ` +
            `qty ${q} → ${correctedQty}, unit_price ${p} → ${correctedUnitPrice.toFixed(4)}`
          )
          return {
            ...item,
            quantity: correctedQty,
            unit_price: Number(correctedUnitPrice.toFixed(6)),
          }
        }

        console.warn(
          `[extract] Skipped thousands correction for "${item.description}": ` +
          `expected total ${expectedTotal.toFixed(2)} doesn't match extracted ${t}`
        )
      }

      return item
    })

    return { ...result, items: correctedItems, thousands_correction_applied: applied }
  } catch (err) {
    console.error('[extract] thousands correction failed:', err)
    return { ...result, thousands_correction_applied: false }
  }
}

// ── Shared empty-form response (manual entry fallback) ─────────────────────

function emptyForm(error?: string, extra?: Record<string, unknown>) {
  return {
    ...(error ? { error } : {}),
    ...extra,
    supplier_name:  '',
    invoice_number: null,
    invoice_date:   new Date().toISOString().slice(0, 10),
    total_amount:   null,
    items:          [],
  }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const kind = typeof body?.kind === 'string' ? body.kind : ''

    // ── CSV path — no AI, no auth required ───────────────────────────────────
    if (kind === 'csv') {
      const csv = typeof body?.csv === 'string' ? body.csv : ''
      if (!csv.trim()) {
        return NextResponse.json({ error: 'Missing CSV content' }, { status: 400 })
      }

      const parsed = Papa.parse<Record<string, string>>(csv, {
        header: true,
        skipEmptyLines: true,
      })

      const rows    = (parsed.data ?? []).filter((row) => Object.keys(row).length > 0)
      const headers = parsed.meta.fields ?? Object.keys(rows[0] ?? {})
      const columnMap = autoDetectCsvColumns(headers)

      const items = rows.map((row) => {
        const description = row[columnMap.description] ?? row.Description ?? row.Item ?? ''
        const quantity    = Number.parseFloat(row[columnMap.quantity] ?? row.Quantity ?? '1') || 1
        const unit        = row[columnMap.unit] ?? row.Unit ?? 'unit'
        const unitPrice   = Number.parseFloat(row[columnMap.unitPrice] ?? row['Unit Price'] ?? '0') || 0
        const total       = Number.parseFloat(row[columnMap.total] ?? row.Total ?? `${quantity * unitPrice}`) || quantity * unitPrice
        return { description, quantity, unit, unit_price: unitPrice, total }
      })

      return NextResponse.json({
        supplier_name:  typeof body?.fileName === 'string' ? body.fileName : 'CSV import',
        invoice_number: null,
        invoice_date:   new Date().toISOString().slice(0, 10),
        total_amount:   items.reduce((sum, item) => sum + item.total, 0),
        items,
        column_map:     columnMap,
        headers,
        rows:           rows.slice(0, 5),
      })
    }

    // ── PDF / text / image path — requires auth + AI usage limit ─────────────
    let runExtraction: () => ReturnType<typeof extractWithClaude>

    if (kind === 'image') {
      const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : ''
      const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/jpeg'
      if (!imageBase64.trim()) {
        return NextResponse.json({ error: 'Missing image content' }, { status: 400 })
      }
      runExtraction = () => extractInvoiceWithVision(imageBase64, mimeType)
    } else {
      const text = typeof body?.text === 'string' ? body.text : ''
      const firstPageImageBase64 =
        typeof body?.firstPageImageBase64 === 'string' ? body.firstPageImageBase64 : ''
      if (!text.trim() && !firstPageImageBase64.trim()) {
        return NextResponse.json({ error: 'Missing PDF content' }, { status: 400 })
      }
      runExtraction = firstPageImageBase64.trim()
        ? () => extractPdfWithHeaderVision(text, firstPageImageBase64)
        : () => extractWithClaude(text)
    }

    // Auth
    const supabase = createRequestSupabaseClient(request)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Tenant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (admin.from('tenant_users') as any)
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    const tenantId = member?.tenant_id as string | undefined

    // Subscription + usage limit (only enforce if we have a tenant)
    if (tenantId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tenantInfo } = await (admin.from('tenants') as any)
        .select('subscription_status, created_at')
        .eq('id', tenantId)
        .single()

      const subStatus = getEffectiveSubscriptionStatus(
        tenantInfo?.subscription_status,
        tenantInfo?.created_at ?? new Date().toISOString()
      )
      const isPro = subStatus === 'active' || subStatus === 'trialing'
      const monthlyLimit = isPro
        ? PRO_LIMITS.aiInvoiceExtractsPerMonth
        : FREE_LIMITS.aiInvoiceExtractsPerMonth

      if (monthlyLimit !== Infinity) {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count: usedCount } = await (admin.from('ai_usage') as any)
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('feature', 'invoice_extract')
          .gte('used_at', startOfMonth)

        const used = usedCount ?? 0
        if (used >= monthlyLimit) {
          return NextResponse.json(
            emptyForm(
              'AI extraction limit reached. You can still enter invoices manually.',
              { limitReached: true }
            )
          )
        }
      }

      try {
        const result = await runExtraction()
        // Record rate-limit usage
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin.from('ai_usage') as any).insert({ tenant_id: tenantId, feature: 'invoice_extract' })
        // Log detailed token usage for analytics
        await logAIUsage({
          tenantId,
          userId: user.id,
          feature: 'invoice_extract',
          inputTokens:  result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          model: 'claude-sonnet-4-6',
        })
        const enrichedResult = await applyItemMemory(admin, tenantId, result)
        const correctedResult = await applyThousandsConvention(admin, tenantId, enrichedResult)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { usage: _u, ...responseData } = correctedResult
        return NextResponse.json(responseData)
      } catch (claudeErr) {
        const message = claudeErr instanceof Error ? claudeErr.message : 'AI extraction failed'
        console.error('[extract] Claude error:', message)
        return NextResponse.json(emptyForm(message))
      }
    }

    // No tenant found — still allow extraction but don't track usage
    try {
      const result = await runExtraction()
      return NextResponse.json(result)
    } catch (claudeErr) {
      const message = claudeErr instanceof Error ? claudeErr.message : 'AI extraction failed'
      console.error('[extract] Claude error:', message)
      return NextResponse.json(emptyForm(message))
    }
  } catch (error) {
    console.error('[extract] Unhandled error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to extract invoice data' },
      { status: 500 }
    )
  }
}
