import type { IngredientAllergen } from '@/lib/allergens'

export type InvoiceFileType = 'pdf' | 'csv' | 'image'

// Catches a weight/volume figure anywhere in a product description (e.g.
// "2KG", "500ml", "10 L") — used to hint that package_size/package_unit may
// have been missed (by AI extraction or manual entry) even when unit itself
// looks fine, since the description weight should normally end up there.
export const WEIGHT_VOLUME_IN_DESCRIPTION = /\b\d+\.?\d*\s*(kg|g|ml|l|ltr|litre|liter)\b/i

export type InvoiceLineItem = {
  id: string
  description: string
  product_code?: string | null
  quantity: number
  unit: string
  packageSize: number | null
  packageUnit: string | null
  unitPrice: number
  total: number
  ingredientId: string | null
  ingredientMatch?:
    | { type: 'existing'; id: string; name: string }
    | { type: 'create'; name: string }
    | null
  ingredientQuery?: string
  createIngredient?: boolean
  newIngredientName?: string
  newIngredientBrand?: string
  newIngredientCategory?: string
  newIngredientUnit?: string
  newIngredientAllergens?: number[]
  reviewAllergens?: IngredientAllergen[]
  allergensChanged?: boolean
  /** Immutable snapshot of the AI-extracted description, captured when the
   *  extraction result is normalized into the draft. Used as the lookup key
   *  for supplier-aware ingredient name memory — never touched by later
   *  edits to `description`. */
  extractedDescriptionOriginal?: string
  /** True when AI extraction flagged this line as uncertain (the "(verify)"
   *  signal, converted server-side into a real flag — see
   *  /api/invoices/extract). Drives the amber review-row treatment and, on
   *  save, becomes ingredients.needs_verification for newly-created rows. */
  needs_verification?: boolean
  /** Raw invoice evidence. Review-only, not persisted. */
  rawQuantityColumns?: Record<string, number | null>
  rawCasesQuantity?: number | null
  rawUnitsQuantity?: number | null
  rawSizeText?: string | null
  extractedCasePackCount?: number | null
  extractedUnitSize?: number | null
  extractedUnitMeasure?: string | null
  quantitySource?: InvoiceQuantitySource
  normalizedPriceConfidence?: 'high' | 'review'
  needsReviewReason?: string | null
  supplierRawText?: string | null
  quantityInterpretationConfirmed?: boolean
  /** Post-extraction validation warnings (price/qty/total mismatch, price
   *  sanity, possible duplicates) — advisory only, never persisted. */
  warnings?: string[]
}

export type InvoiceQuantitySource =
  | 'CASES'
  | 'UNITS'
  | 'QTY'
  | 'EACH'
  | 'KG'
  | 'LTR'
  | 'PACKS'
  | 'OUTERS'
  | 'ORDERED'
  | 'DELIVERED'
  | 'MULTIPLE'
  | 'UNKNOWN'

export type HendersonQuantityPatch = {
  quantity?: number
  unit?: string
  package_size?: number | null
  package_unit?: string | null
  needs_verification: boolean
  raw_cases_quantity: number | null
  raw_units_quantity: number | null
  raw_size_text: string | null
  extracted_case_pack_count: number | null
  extracted_unit_size: number | null
  extracted_unit_measure: string | null
  quantity_source: InvoiceQuantitySource
  raw_quantity_columns: Record<string, number | null>
  normalized_price_confidence: 'high' | 'review'
  needs_review_reason: string | null
}

function positiveNumber(value: number | null | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function finiteNumber(value: number | null | undefined) {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function canonicalQuantitySource(source: string | null | undefined): InvoiceQuantitySource {
  const key = (source ?? '').trim().toUpperCase().replace(/[\s_-]+/g, ' ')
  if (['CASE', 'CASES', 'CASE QTY'].includes(key)) return 'CASES'
  if (['UNIT', 'UNITS', 'UNIT QTY'].includes(key)) return 'UNITS'
  if (['EACH', 'EA'].includes(key)) return 'EACH'
  if (['OUTER', 'OUTERS'].includes(key)) return 'OUTERS'
  if (['PACK', 'PACKS'].includes(key)) return 'PACKS'
  if (['KG', 'KGS'].includes(key)) return 'KG'
  if (['LTR', 'LITRE', 'LITER', 'L'].includes(key)) return 'LTR'
  if (key === 'QTY' || key === 'QUANTITY') return 'QTY'
  if (key === 'ORDERED') return 'ORDERED'
  if (key === 'DELIVERED' || key === 'SUPPLIED') return 'DELIVERED'
  if (key === 'MULTIPLE' || key === 'BOTH') return 'MULTIPLE'
  return 'UNKNOWN'
}

function sourceFromColumnName(column: string) {
  return canonicalQuantitySource(column)
}

/**
 * Preserves quantity-column truth first, then derives package costing fields.
 * It never changes invoice unit price or line total.
 */
export function resolveInvoiceQuantityEvidence({
  rawQuantityColumns = {},
  quantitySource,
  rawSizeText,
  needsVerification = false,
}: {
  rawQuantityColumns?: Record<string, number | null>
  quantitySource?: string | null
  rawSizeText?: string | null
  needsVerification?: boolean
}): HendersonQuantityPatch {
  const preservedColumns = Object.fromEntries(
    Object.entries(rawQuantityColumns).map(([key, value]) => [key, finiteNumber(value)])
  )
  const activeColumns = Object.entries(preservedColumns)
    .map(([key, value]) => ({ key, value: positiveNumber(value), source: sourceFromColumnName(key) }))
    .filter((entry) => entry.value != null)
  const distinctActiveSources = Array.from(new Set(activeColumns.map((entry) => entry.source)))
  let source = canonicalQuantitySource(quantitySource)
  if (activeColumns.length > 1 || distinctActiveSources.length > 1) source = 'MULTIPLE'
  else if (source === 'UNKNOWN' && activeColumns.length === 1) source = activeColumns[0].source

  const sourceEntry = activeColumns.find((entry) => entry.source === source) ?? activeColumns[0]
  const sourceQuantity = sourceEntry?.value ?? null
  const sizeText = rawSizeText?.trim() || null
  const sizeMatch = sizeText?.match(
    /(\d+(?:\.\d+)?)\s*[xX\u00d7]\s*(\d+(?:\.\d+)?)\s*(litres|litre|liters|liter|ltr|lt|kg|ml|l|g)?\b/i
  )
  const packCount = sizeMatch ? positiveNumber(Number(sizeMatch[1])) : null
  const unitSize = sizeMatch ? positiveNumber(Number(sizeMatch[2])) : null
  const rawMeasure = sizeMatch?.[3]?.toLowerCase() ?? null
  const unitMeasure = rawMeasure
    ? ['l', 'lt', 'ltr', 'litre', 'litres', 'liter', 'liters'].includes(rawMeasure)
      ? 'L'
      : rawMeasure
    : sizeMatch
      ? 'unit'
      : null
  const evidence = {
    raw_cases_quantity: preservedColumns.cases ?? preservedColumns.CASES ?? null,
    raw_units_quantity: preservedColumns.units ?? preservedColumns.UNITS ?? null,
    raw_quantity_columns: preservedColumns,
    raw_size_text: sizeText,
    extracted_case_pack_count: packCount,
    extracted_unit_size: unitSize,
    extracted_unit_measure: unitMeasure,
    quantity_source: source,
  }

  if (source === 'MULTIPLE') {
    return {
      ...evidence,
      package_size: null,
      package_unit: null,
      needs_verification: true,
      normalized_price_confidence: 'review',
      needs_review_reason: 'Multiple quantity columns contain values. Confirm how the supplier calculated this line.',
    }
  }

  if (source === 'UNKNOWN') {
    return {
      ...evidence,
      package_size: null,
      package_unit: null,
      needs_verification: true,
      normalized_price_confidence: 'review',
      needs_review_reason: sizeMatch
        ? 'Quantity source is unknown. Pack count will not be applied until the source column is confirmed.'
        : 'Quantity source could not be identified from the invoice.',
    }
  }

  if (source === 'KG' || source === 'LTR') {
    return {
      ...evidence,
      ...(sourceQuantity ? { quantity: sourceQuantity } : {}),
      unit: source === 'KG' ? 'kg' : 'L',
      package_size: 1,
      package_unit: source === 'KG' ? 'kg' : 'L',
      needs_verification: needsVerification || !sourceQuantity,
      normalized_price_confidence: sourceQuantity ? 'high' : 'review',
      needs_review_reason: sourceQuantity ? null : 'The quantity value for this source column is missing.',
    }
  }

  if (source === 'CASES' || source === 'OUTERS') {
    if (!packCount || !unitSize || !unitMeasure || !sourceQuantity) {
      return {
        ...evidence,
        needs_verification: true,
        normalized_price_confidence: 'review',
        needs_review_reason: 'Case quantity needs a readable pack format before ingredient cost can be normalized.',
      }
    }
    return {
      ...evidence,
      quantity: sourceQuantity,
      unit: 'case',
      package_size: packCount * unitSize,
      package_unit: unitMeasure,
      needs_verification: needsVerification,
      normalized_price_confidence: needsVerification ? 'review' : 'high',
      needs_review_reason: needsVerification ? 'This invoice row was flagged for review during extraction.' : null,
    }
  }

  if (source === 'UNITS' || source === 'EACH') {
    if (!unitSize || !unitMeasure || !sourceQuantity) {
      return {
        ...evidence,
        needs_verification: true,
        normalized_price_confidence: 'review',
        needs_review_reason: 'Unit quantity needs a readable individual size before ingredient cost can be normalized.',
      }
    }
    return {
      ...evidence,
      quantity: sourceQuantity,
      unit: 'unit',
      package_size: unitSize,
      package_unit: unitMeasure,
      needs_verification: needsVerification,
      normalized_price_confidence: needsVerification ? 'review' : 'high',
      needs_review_reason: needsVerification ? 'This invoice row was flagged for review during extraction.' : null,
    }
  }

  // QTY, PACKS, ORDERED and DELIVERED do not prove case-vs-unit semantics.
  return {
    ...evidence,
    ...(sourceQuantity ? { quantity: sourceQuantity } : {}),
    ...(sizeMatch ? { package_size: null, package_unit: null } : {}),
    needs_verification: needsVerification || Boolean(sizeMatch),
    normalized_price_confidence: sizeMatch || needsVerification ? 'review' : 'high',
    needs_review_reason: sizeMatch
      ? `${source} does not prove whether the pack multiplier should be applied. Confirm the purchase unit.`
      : needsVerification
        ? 'This invoice row was flagged for review during extraction.'
        : null,
  }
}

/** Backward-compatible Henderson adapter; core logic is supplier-agnostic. */
export function resolveHendersonQuantity({
  rawCasesQuantity,
  rawUnitsQuantity,
  rawSizeText,
  needsVerification = false,
}: {
  rawCasesQuantity?: number | null
  rawUnitsQuantity?: number | null
  rawSizeText?: string | null
  needsVerification?: boolean
}) {
  return resolveInvoiceQuantityEvidence({
    rawQuantityColumns: { cases: rawCasesQuantity ?? null, units: rawUnitsQuantity ?? null },
    rawSizeText,
    needsVerification,
  })
}

export type InvoiceFormState = {
  supplierName: string
  supplierId: string | null
  supplierMatch?:
    | { type: 'existing'; id: string; name: string }
    | { type: 'create'; name: string }
    | null
  invoiceNumber: string
  invoiceDate: string
  currency: string
  notes: string
  totalAmount: number
  subtotalAmount?: number | null
  vatAmount?: number | null
  vatRate?: number | null
  fileUrl: string | null
  fileType: InvoiceFileType | null
  items: InvoiceLineItem[]
}

export const INVOICE_UNITS = [
  'kg', 'g', 'L', 'ml', 'unit', 'dozen',
  'box', 'bag', 'pack', 'block', 'carton', 'tray', 'tub', 'bottle', 'case',
]

export const PACKAGE_UNIT_OPTIONS = ['kg', 'g', 'L', 'ml', 'unit', 'dozen'] as const

export function createEmptyInvoiceItem(): InvoiceLineItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    product_code: null,
    quantity: 1,
    unit: 'unit',
    packageSize: null,
    packageUnit: null,
    unitPrice: 0,
    total: 0,
    ingredientId: null,
    ingredientMatch: null,
    ingredientQuery: '',
    createIngredient: false,
    newIngredientName: '',
    newIngredientCategory: 'Other',
    newIngredientUnit: 'unit',
    newIngredientAllergens: [],
    reviewAllergens: [],
    allergensChanged: false,
  }
}

export function normalizePackageUnit(unit: string | null | undefined) {
  if (!unit) return null
  const n = unit.trim().toLowerCase()
  if (n === 'kg') return 'kg'
  if (n === 'g') return 'g'
  if (n === 'l' || n === 'liter' || n === 'litre') return 'L'
  if (n === 'ml') return 'ml'
  if (n === 'unit' || n === 'units' || n === 'each') return 'unit'
  if (n === 'dozen' || n === 'dozens' || n === 'dz') return 'dozen'
  return null
}

export type InvoiceUnitFamily = 'weight' | 'volume' | 'count'

export function getInvoiceUnitFamily(
  unit: string | null | undefined
): InvoiceUnitFamily | null {
  const normalized = normalizePackageUnit(unit)
  if (normalized === 'kg' || normalized === 'g') return 'weight'
  if (normalized === 'L' || normalized === 'ml') return 'volume'
  if (normalized === 'unit' || normalized === 'dozen') return 'count'
  return null
}

export function getDefaultIngredientPriceUnit(unit: string | null | undefined) {
  const family = getInvoiceUnitFamily(unit)
  if (family === 'weight') return 'kg'
  if (family === 'volume') return 'L'
  if (family === 'count') return 'unit'
  return null
}

const UNIT_TO_FAMILY_BASE: Record<string, number> = {
  kg: 1000,
  g: 1,
  L: 1000,
  ml: 1,
  unit: 1,
  dozen: 12,
}

export type InvoiceIngredientPricing = {
  valid: boolean
  needsReview: boolean
  normalizedPrice: number | null
  normalizedUnit: string | null
  packageSize: number | null
  packageUnit: string | null
  warning: string | null
}

/**
 * Converts the price paid for one invoice purchase unit into the ingredient's
 * recipe price. It never crosses weight, volume, and count families.
 */
export function resolveInvoiceIngredientPricing({
  unitPrice,
  lineTotal,
  quantity,
  invoiceUnit,
  packageSize,
  packageUnit,
  targetUnit,
}: {
  unitPrice: number
  lineTotal?: number | null
  quantity?: number | null
  invoiceUnit: string | null | undefined
  packageSize?: number | null
  packageUnit?: string | null
  targetUnit?: string | null
}): InvoiceIngredientPricing {
  const invoicePrice = Number(unitPrice)
  const parsedLineTotal = Number(lineTotal)
  const parsedQuantity = Number(quantity)
  const hasLineTotalBasis =
    lineTotal != null &&
    Number.isFinite(parsedLineTotal) &&
    parsedLineTotal >= 0 &&
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0
  // The normalized cost derives from the preserved line total when present;
  // invoice unit price itself remains untouched in the review model/database.
  const price = hasLineTotalBasis ? parsedLineTotal / parsedQuantity : invoicePrice
  const parsedPackageSize = Number(packageSize)
  const hasPackageSize = Number.isFinite(parsedPackageSize) && parsedPackageSize > 0
  const normalizedPackageUnit = normalizePackageUnit(packageUnit)

  if (!Number.isFinite(invoicePrice) || invoicePrice < 0 || !Number.isFinite(price) || price < 0) {
    return {
      valid: false,
      needsReview: true,
      normalizedPrice: null,
      normalizedUnit: null,
      packageSize: hasPackageSize ? parsedPackageSize : null,
      packageUnit: normalizedPackageUnit,
      warning: 'Enter a valid invoice price before updating the ingredient.',
    }
  }

  if (hasPackageSize && !normalizedPackageUnit) {
    return {
      valid: false,
      needsReview: true,
      normalizedPrice: null,
      normalizedUnit: null,
      packageSize: parsedPackageSize,
      packageUnit: null,
      warning: 'Select the package unit to calculate the ingredient price safely.',
    }
  }

  const sourceUnit = hasPackageSize
    ? normalizedPackageUnit
    : normalizePackageUnit(invoiceUnit)
  const sourceFamily = getInvoiceUnitFamily(sourceUnit)

  if (!sourceUnit || !sourceFamily) {
    return {
      valid: false,
      needsReview: true,
      normalizedPrice: null,
      normalizedUnit: null,
      packageSize: hasPackageSize ? parsedPackageSize : null,
      packageUnit: normalizedPackageUnit,
      warning: 'This purchase unit cannot be normalized. Add a package size and unit.',
    }
  }

  const requestedTarget = normalizePackageUnit(targetUnit)
  const targetFamily = getInvoiceUnitFamily(requestedTarget)
  if (requestedTarget && targetFamily && targetFamily !== sourceFamily) {
    return {
      valid: false,
      needsReview: true,
      normalizedPrice: null,
      normalizedUnit: requestedTarget,
      packageSize: hasPackageSize ? parsedPackageSize : null,
      packageUnit: normalizedPackageUnit,
      warning: `Cannot convert ${sourceFamily} (${sourceUnit}) to ${targetFamily} (${requestedTarget}) without an explicit conversion factor.`,
    }
  }

  const normalizedUnit =
    requestedTarget && targetFamily === sourceFamily
      ? requestedTarget
      : getDefaultIngredientPriceUnit(sourceUnit)
  if (!normalizedUnit) {
    return {
      valid: false,
      needsReview: true,
      normalizedPrice: null,
      normalizedUnit: null,
      packageSize: hasPackageSize ? parsedPackageSize : null,
      packageUnit: normalizedPackageUnit,
      warning: 'Unable to determine a safe ingredient price unit.',
    }
  }

  const sourceQuantity = hasPackageSize ? parsedPackageSize : 1
  const quantityInTarget =
    sourceQuantity *
    (UNIT_TO_FAMILY_BASE[sourceUnit] / UNIT_TO_FAMILY_BASE[normalizedUnit])

  if (!Number.isFinite(quantityInTarget) || quantityInTarget <= 0) {
    return {
      valid: false,
      needsReview: true,
      normalizedPrice: null,
      normalizedUnit,
      packageSize: hasPackageSize ? parsedPackageSize : null,
      packageUnit: normalizedPackageUnit,
      warning: 'Unable to calculate a safe normalized ingredient price.',
    }
  }

  return {
    valid: true,
    needsReview: false,
    normalizedPrice: Number((price / quantityInTarget).toFixed(6)),
    normalizedUnit,
    packageSize: hasPackageSize ? parsedPackageSize : null,
    packageUnit: normalizedPackageUnit,
    warning: null,
  }
}

export function getPackagePricingBasis(
  packageSize: number | null | undefined,
  packageUnit: string | null | undefined
) {
  const unit = normalizePackageUnit(packageUnit)
  const size = Number(packageSize)
  if (!unit || !Number.isFinite(size) || size <= 0) return null

  if (unit === 'kg') return { baseUnit: 'kg' as const, baseQuantity: size }
  if (unit === 'g')  return { baseUnit: 'kg' as const, baseQuantity: size / 1000 }
  if (unit === 'L')  return { baseUnit: 'L' as const,  baseQuantity: size }
  if (unit === 'ml') return { baseUnit: 'L' as const,  baseQuantity: size / 1000 }
  if (unit === 'dozen') return { baseUnit: 'unit' as const, baseQuantity: size * 12 }
  return { baseUnit: 'unit' as const, baseQuantity: size }
}

export function calculateCostPerBaseUnit(
  unitPrice: number,
  packageSize: number | null | undefined,
  packageUnit: string | null | undefined
) {
  const pricing = resolveInvoiceIngredientPricing({
    unitPrice,
    invoiceUnit: packageUnit,
    packageSize,
    packageUnit,
  })
  if (!pricing.valid || pricing.normalizedPrice == null || !pricing.normalizedUnit) return null
  return {
    baseUnit: pricing.normalizedUnit,
    costPerBaseUnit: pricing.normalizedPrice,
  }
}

function normalisePackageSizePart(
  size: number,
  unit: string
): { packageSize: number; packageUnit: string } | null {
  const n = unit.trim().toLowerCase()
  if (n === 'kg' || n === 'g' || n === 'ml') return { packageSize: size, packageUnit: n }
  if (n === 'l' || n === 'liter' || n === 'litre') return { packageSize: size, packageUnit: 'L' }
  if (n === 'oz') return { packageSize: Number((size * 28.349523125).toFixed(3)), packageUnit: 'g' }
  if (n === 'lb') return { packageSize: Number((size * 453.59237).toFixed(3)), packageUnit: 'g' }
  return null
}

export function extractPackageDetails(description: string) {
  let cleaned = description.trim()
  let packageSize: number | null = null
  let packageUnit: string | null = null

  const countMatch = cleaned.match(/\((\d+)\)\s*$/)
  if (countMatch?.[1]) {
    packageSize = Number.parseFloat(countMatch[1])
    packageUnit = 'unit'
    cleaned = cleaned.replace(countMatch[0], ' ')
  } else {
    const sizeMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litre|liter|oz|lb)\s*$/i)
    if (sizeMatch?.[1] && sizeMatch[2]) {
      const norm = normalisePackageSizePart(Number.parseFloat(sizeMatch[1]), sizeMatch[2])
      if (norm) {
        packageSize = norm.packageSize
        packageUnit = norm.packageUnit
        cleaned = cleaned.replace(sizeMatch[0], ' ')
      }
    }
  }

  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()
  return { description: cleaned || description.trim(), packageSize, packageUnit }
}

export function recalculateItemTotal(item: InvoiceLineItem) {
  const qty   = Number.isFinite(item.quantity)  ? item.quantity  : 0
  const price = Number.isFinite(item.unitPrice) ? item.unitPrice : 0
  return Number((qty * price).toFixed(2))
}

export function recalculateInvoiceSubtotal(items: InvoiceLineItem[]) {
  return Number(items.reduce((sum, item) => sum + Number(item.total || 0), 0).toFixed(2))
}

export function recalculateInvoiceTotals(items: InvoiceLineItem[], totalAmount?: number | null) {
  const subtotal = recalculateInvoiceSubtotal(items)
  return {
    subtotal,
    totalAmount: Number((totalAmount ?? subtotal).toFixed(2)),
    itemCount: items.length,
  }
}

export function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function scoreIngredientMatch(query: string, target: string) {
  const q = normalizeText(query)
  const t = normalizeText(target)
  if (!q || !t) return 0
  if (t === q) return 100
  if (t.includes(q)) return 85

  const qTokens = q.split(' ')
  const tTokens = t.split(' ')
  let score = 0
  for (const token of qTokens) {
    if (!token) continue
    if (tTokens.includes(token)) { score += 20; continue }
    if (tTokens.some((c) => c.startsWith(token))) score += 10
  }
  return Math.min(score, 80)
}

// ── Post-extraction validation (AI extraction review layer) ────────────────
// These run on AI-extracted (vision/text) invoice data only, after Claude
// returns its JSON — never on CSV rows, which have no OCR/vision risk.
// They only ever SUGGEST — see resolveInvoiceIngredientPricing and
// parseAndValidateExtraction in route.ts, both of which treat invoice price/
// total as documentary evidence that is never silently rewritten. Baking in
// an auto-corrected price risks fixing the wrong field when the AI misread
// a different one, which is worse than asking the user to confirm.

/**
 * Flags a price-per-kg/L that's outside a plausible foodservice range, using
 * the same unit-family-safe conversion as resolveInvoiceIngredientPricing —
 * never a fresh ad-hoc kg/L conversion. Count-based packaging (package_unit
 * "unit"/"dozen") has no meaningful price-per-kg, so it's skipped.
 */
export function checkPriceSanity(
  unitPrice: number | null | undefined,
  packageSize: number | null | undefined,
  packageUnit: string | null | undefined
): string | null {
  if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice < 0) return null
  const basis = getPackagePricingBasis(packageSize, packageUnit)
  if (!basis || basis.baseUnit === 'unit') return null

  const pricePerBase = unitPrice / basis.baseQuantity
  if (!Number.isFinite(pricePerBase)) return null

  if (pricePerBase > 200) return `Price seems very high: €${pricePerBase.toFixed(2)}/${basis.baseUnit}`
  if (pricePerBase < 0.05) return `Price seems very low: €${pricePerBase.toFixed(2)}/${basis.baseUnit}`
  return null
}

/**
 * Checks quantity x unit_price against the extracted line total. Within 2%
 * (rounding) it's silent. Beyond that it suggests — never applies — a
 * corrected price or quantity, whichever derives to a plausible number.
 */
export function suggestReconciledValue(
  quantity: number | null | undefined,
  unitPrice: number | null | undefined,
  total: number | null | undefined
): string | null {
  if (unitPrice == null || total == null || total <= 0) return null
  const qty = Number(quantity) || 0
  const price = Number(unitPrice) || 0
  const calculatedTotal = qty * price
  const diff = Math.abs(calculatedTotal - total) / total
  if (diff <= 0.02) return null

  const derivedPrice = qty > 0 ? total / qty : null
  if (derivedPrice != null && Number.isFinite(derivedPrice) && derivedPrice > 0.01 && derivedPrice < 10000) {
    return `Price and quantity don't reconcile with the line total (€${total.toFixed(2)}) — line total ÷ quantity suggests unit price €${derivedPrice.toFixed(2)}. Confirm before applying.`
  }

  const derivedQty = price > 0 ? total / price : null
  if (derivedQty != null && Number.isFinite(derivedQty) && derivedQty > 0.01 && derivedQty < 100000) {
    return `Price and quantity don't reconcile with the line total (€${total.toFixed(2)}) — line total ÷ unit price suggests quantity ${derivedQty.toFixed(2)}. Confirm before applying.`
  }

  return null
}

/**
 * Flags items sharing a product_code, or an identical description once
 * normalized (case/punctuation/whitespace-insensitive) — the same
 * normalization already used for ingredient-name matching.
 */
export function detectDuplicateItems(
  items: Array<{ description: string; product_code?: string | null }>
): (string | null)[] {
  return items.map((item, idx) => {
    const code = item.product_code?.trim().toLowerCase() || null
    const normalizedDescription = normalizeText(item.description)

    for (let j = 0; j < items.length; j++) {
      if (j === idx) continue
      const other = items[j]
      const otherCode = other.product_code?.trim().toLowerCase() || null
      const sameCode = Boolean(code && otherCode && code === otherCode)
      const sameDescription =
        !sameCode &&
        normalizedDescription.length > 0 &&
        normalizedDescription === normalizeText(other.description)

      if (sameCode || sameDescription) {
        return `Possible duplicate of item ${j + 1}`
      }
    }
    return null
  })
}

/**
 * Compares the sum of extracted line totals against the invoice's stated
 * total/subtotal. Observability for the user, not a fabrication risk — it
 * never touches any item's data, only returns a banner message.
 */
export function reconcileInvoiceTotal(
  items: Array<{ total?: number | null }>,
  invoiceTotal: number | null | undefined
): string | null {
  if (!invoiceTotal || invoiceTotal <= 0) return null
  const sum = items.reduce((acc, item) => acc + Number(item.total ?? 0), 0)
  const diff = Math.abs(sum - invoiceTotal) / invoiceTotal
  if (diff > 0.05) {
    return `Extracted items total €${sum.toFixed(2)} vs invoice total €${invoiceTotal.toFixed(2)} — ${
      sum < invoiceTotal ? 'some items may be missing' : 'check for duplicates or wrong prices'
    }`
  }
  return null
}

/**
 * Runs all post-extraction validations and attaches their results:
 * warnings[] per item, plus an invoice-level total-mismatch banner. Called
 * after supplier-aware memory and thousands-convention correction so
 * warnings reflect the final values shown to the user, not intermediate
 * extraction state.
 */
export function applyExtractionWarnings<
  I extends {
    description: string
    product_code?: string | null
    quantity: number
    unit_price?: number | null
    total?: number | null
    package_size?: number | null
    package_unit?: string | null
  },
  T extends {
    subtotal_amount?: number | null
    total_amount?: number | null
    items: I[]
  }
>(
  result: T
): Omit<T, 'items'> & { items: Array<I & { warnings: string[] }>; invoice_total_warning: string | null } {
  const duplicateFlags = detectDuplicateItems(result.items)

  const items = result.items.map((item, idx) => {
    const warnings: string[] = []

    const reconciliation = suggestReconciledValue(item.quantity, item.unit_price, item.total)
    if (reconciliation) warnings.push(reconciliation)

    const sanity = checkPriceSanity(item.unit_price, item.package_size, item.package_unit)
    if (sanity) warnings.push(sanity)

    const duplicate = duplicateFlags[idx]
    if (duplicate) warnings.push(duplicate)

    return { ...item, warnings }
  })

  const invoiceTotal = result.subtotal_amount ?? result.total_amount ?? null
  const invoice_total_warning = reconcileInvoiceTotal(items, invoiceTotal)

  return { ...result, items, invoice_total_warning }
}

export function autoDetectCsvColumns(headers: string[]) {
  const normalized = headers.map((h) => ({
    original: h,
    normalized: normalizeText(h).replace(/\s/g, ''),
  }))

  const map: Record<string, string> = {}
  for (const field of ['description', 'quantity', 'unit', 'unitPrice', 'productCode', 'packSize', 'total'] as const) {
    const match = normalized.find(({ normalized: h }) => {
      if (field === 'description') return /description|item|product|article|name/.test(h)
      if (field === 'quantity')    return /qty|quantity|amount|count/.test(h)
      if (field === 'unit')        return /unit|uom|measure/.test(h)
      if (field === 'unitPrice')   return /unitprice|priceeach|priceperunit|price/.test(h)
      if (field === 'productCode') return /code|sku|itemno|itemnumber|articleno|partno/.test(h)
      if (field === 'packSize')    return /packsize|packagesize|packing|package|pack|size/.test(h)
      return /total|amount|lineitemtotal|subtotal/.test(h)
    })
    if (match) map[field] = match.original
  }
  return map
}
