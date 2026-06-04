export type InvoiceFileType = 'pdf' | 'csv' | 'image'

export type InvoiceLineItem = {
  id: string
  description: string
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

export const PACKAGE_UNIT_OPTIONS = ['kg', 'g', 'L', 'ml', 'unit'] as const

export function createEmptyInvoiceItem(): InvoiceLineItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    quantity: 1,
    unit: 'unit',
    packageSize: null,
    packageUnit: 'kg',
    unitPrice: 0,
    total: 0,
    ingredientId: null,
    ingredientMatch: null,
    ingredientQuery: '',
    createIngredient: false,
    newIngredientName: '',
    newIngredientCategory: 'Other',
    newIngredientUnit: 'unit',
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
  return null
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
  return { baseUnit: 'unit' as const, baseQuantity: size }
}

export function calculateCostPerBaseUnit(
  unitPrice: number,
  packageSize: number | null | undefined,
  packageUnit: string | null | undefined
) {
  const basis = getPackagePricingBasis(packageSize, packageUnit)
  if (!basis || !Number.isFinite(unitPrice) || basis.baseQuantity <= 0) return null
  return {
    baseUnit: basis.baseUnit,
    costPerBaseUnit: unitPrice / basis.baseQuantity,
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
