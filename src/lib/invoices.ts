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
  invoiceUnit,
  packageSize,
  packageUnit,
  targetUnit,
}: {
  unitPrice: number
  invoiceUnit: string | null | undefined
  packageSize?: number | null
  packageUnit?: string | null
  targetUnit?: string | null
}): InvoiceIngredientPricing {
  const price = Number(unitPrice)
  const parsedPackageSize = Number(packageSize)
  const hasPackageSize = Number.isFinite(parsedPackageSize) && parsedPackageSize > 0
  const normalizedPackageUnit = normalizePackageUnit(packageUnit)

  if (!Number.isFinite(price) || price < 0) {
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

export function autoDetectCsvColumns(headers: string[]) {
  const normalized = headers.map((h) => ({
    original: h,
    normalized: normalizeText(h).replace(/\s/g, ''),
  }))

  const map: Record<string, string> = {}
  for (const field of ['description', 'quantity', 'unit', 'unitPrice', 'total'] as const) {
    const match = normalized.find(({ normalized: h }) => {
      if (field === 'description') return /description|item|product|article|name/.test(h)
      if (field === 'quantity')    return /qty|quantity|amount|count/.test(h)
      if (field === 'unit')        return /unit|uom|measure/.test(h)
      if (field === 'unitPrice')   return /unitprice|priceeach|priceperunit|price/.test(h)
      return /total|amount|lineitemtotal|subtotal/.test(h)
    })
    if (match) map[field] = match.original
  }
  return map
}
