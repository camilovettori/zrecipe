import { convertUnit, isConvertible } from '@/lib/utils/unit-converter'

export type IngredientPriceUnit = 'kg' | 'g' | 'L' | 'ml' | 'unit' | 'dozen' | string

export interface IngredientPricingInput {
  packagePrice?: number | null
  packageQuantity?: number | null
  packageUnit?: IngredientPriceUnit | null
  priceUnit?: IngredientPriceUnit | null
}

export interface IngredientPricingResult {
  packagePrice: number | null
  packageQuantity: number | null
  packageUnit: string | null
  normalizedUnit: string
  normalizedPrice: number | null
  packageQuantityInNormalizedUnit: number | null
  conversionUsed: string | null
  warnings: string[]
  isValid: boolean
}

const NORMALIZED_DEFAULTS: Record<string, string> = {
  g: 'kg',
  kg: 'kg',
  ml: 'L',
  l: 'L',
  unit: 'unit',
  dozen: 'unit',
}

function normalizeUnit(unit: IngredientPriceUnit | null | undefined) {
  if (!unit) return null
  const value = unit.trim()
  if (!value) return null
  const lower = value.toLowerCase()
  if (lower === 'l' || lower === 'liter' || lower === 'litre') return 'L'
  if (lower === 'kg') return 'kg'
  if (lower === 'g') return 'g'
  if (lower === 'ml') return 'ml'
  if (lower === 'unit' || lower === 'units' || lower === 'each') return 'unit'
  if (lower === 'dozen') return 'dozen'
  return value
}

function defaultPriceUnitFor(packageUnit: string | null) {
  if (!packageUnit) return 'kg'
  const lower = packageUnit.toLowerCase()
  return NORMALIZED_DEFAULTS[lower] ?? packageUnit
}

export function formatIngredientMoney(value: number | null | undefined, options?: { maxFractionDigits?: number }) {
  if (value == null || !Number.isFinite(value)) return '—'
  const maxFractionDigits = options?.maxFractionDigits ?? 6
  const fractionDigits =
    Math.abs(value) >= 100
      ? 2
      : Math.abs(value) >= 10
        ? 2
        : Math.abs(value) >= 1
          ? 2
          : Math.abs(value) >= 0.1
            ? 3
            : Math.abs(value) >= 0.01
              ? 4
              : maxFractionDigits

  return `€${value.toLocaleString('en-IE', {
    minimumFractionDigits: Math.min(2, fractionDigits),
    maximumFractionDigits: Math.max(fractionDigits, 2),
  })}`
}

export function formatIngredientUnitPrice(value: number | null | undefined, unit?: string | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${formatIngredientMoney(value)} / ${unit ?? 'unit'}`
}

export function calculateNormalizedIngredientPrice({
  packagePrice,
  packageQuantity,
  packageUnit,
  priceUnit,
}: IngredientPricingInput): IngredientPricingResult {
  const normalizedPackagePrice = Number(packagePrice)
  const normalizedPackageQuantity = Number(packageQuantity)
  const normalizedPackageUnit = normalizeUnit(packageUnit)
  const normalizedPriceUnit = normalizeUnit(priceUnit) ?? defaultPriceUnitFor(normalizedPackageUnit)
  const warnings: string[] = []

  if (!Number.isFinite(normalizedPackagePrice) || normalizedPackagePrice <= 0) {
    warnings.push('Enter a valid package price.')
  }
  if (!Number.isFinite(normalizedPackageQuantity) || normalizedPackageQuantity <= 0) {
    warnings.push('Enter a valid package quantity.')
  }
  if (!normalizedPackageUnit) {
    warnings.push('Choose a package unit.')
  }
  if (!normalizedPriceUnit) {
    warnings.push('Choose a normalized price unit.')
  }

  if (warnings.length > 0) {
    return {
      packagePrice: Number.isFinite(normalizedPackagePrice) ? normalizedPackagePrice : null,
      packageQuantity: Number.isFinite(normalizedPackageQuantity) ? normalizedPackageQuantity : null,
      packageUnit: normalizedPackageUnit,
      normalizedUnit: normalizedPriceUnit ?? defaultPriceUnitFor(normalizedPackageUnit),
      normalizedPrice: null,
      packageQuantityInNormalizedUnit: null,
      conversionUsed: null,
      warnings,
      isValid: false,
    }
  }

  if (!normalizedPackageUnit || !normalizedPriceUnit || !isConvertible(normalizedPackageUnit, normalizedPriceUnit)) {
    warnings.push(`Unsupported conversion from ${normalizedPackageUnit} to ${normalizedPriceUnit}.`)
    return {
      packagePrice: normalizedPackagePrice,
      packageQuantity: normalizedPackageQuantity,
      packageUnit: normalizedPackageUnit,
      normalizedUnit: normalizedPriceUnit,
      normalizedPrice: null,
      packageQuantityInNormalizedUnit: null,
      conversionUsed: null,
      warnings,
      isValid: false,
    }
  }

  const quantityInTargetUnit = convertUnit(normalizedPackageQuantity, normalizedPackageUnit, normalizedPriceUnit)
  if (!Number.isFinite(quantityInTargetUnit) || quantityInTargetUnit <= 0) {
    warnings.push('Unable to convert package quantity to the selected unit.')
    return {
      packagePrice: normalizedPackagePrice,
      packageQuantity: normalizedPackageQuantity,
      packageUnit: normalizedPackageUnit,
      normalizedUnit: normalizedPriceUnit,
      normalizedPrice: null,
      packageQuantityInNormalizedUnit: null,
      conversionUsed: null,
      warnings,
      isValid: false,
    }
  }

  const normalizedPrice = normalizedPackagePrice / quantityInTargetUnit

  return {
    packagePrice: normalizedPackagePrice,
    packageQuantity: normalizedPackageQuantity,
    packageUnit: normalizedPackageUnit,
    normalizedUnit: normalizedPriceUnit,
    normalizedPrice,
    packageQuantityInNormalizedUnit: quantityInTargetUnit,
    conversionUsed: `${normalizedPackageQuantity} ${normalizedPackageUnit} → ${quantityInTargetUnit} ${normalizedPriceUnit}`,
    warnings,
    isValid: true,
  }
}

export function getDefaultIngredientPriceUnit(packageUnit?: string | null) {
  const normalized = normalizeUnit(packageUnit)
  return defaultPriceUnitFor(normalized)
}

export function calculatePackagePriceFromUnitPrice(
  unitPrice: number | null | undefined,
  packageQuantity: number | null | undefined,
  packageUnit: IngredientPriceUnit | null | undefined,
  priceUnit: IngredientPriceUnit | null | undefined
) {
  const normalizedUnitPrice = Number(unitPrice)
  const normalizedPackageQuantity = Number(packageQuantity)
  const normalizedPackageUnit = normalizeUnit(packageUnit)
  const normalizedPriceUnit = normalizeUnit(priceUnit)

  if (
    !Number.isFinite(normalizedUnitPrice) ||
    normalizedUnitPrice <= 0 ||
    !Number.isFinite(normalizedPackageQuantity) ||
    normalizedPackageQuantity <= 0 ||
    !normalizedPackageUnit ||
    !normalizedPriceUnit ||
    !isConvertible(normalizedPackageUnit, normalizedPriceUnit)
  ) {
    return null
  }

  const quantityInTargetUnit = convertUnit(normalizedPackageQuantity, normalizedPackageUnit, normalizedPriceUnit)
  if (!Number.isFinite(quantityInTargetUnit) || quantityInTargetUnit <= 0) return null

  return normalizedUnitPrice * quantityInTargetUnit
}

export function getPriceChangePercent(previous: number | null | undefined, current: number | null | undefined) {
  const prev = Number(previous)
  const curr = Number(current)
  if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= 0) return null
  return ((curr - prev) / prev) * 100
}

export function hasMeaningfulPriceChange(
  previous: number | null | undefined,
  current: number | null | undefined,
  epsilon = 0.0001
) {
  const prev = Number(previous)
  const curr = Number(current)
  if (!Number.isFinite(prev) || !Number.isFinite(curr)) return false
  return Math.abs(curr - prev) > epsilon
}

export function buildCostExamples(normalizedPrice: number | null | undefined, normalizedUnit: string | null | undefined) {
  if (normalizedPrice == null || !Number.isFinite(normalizedPrice) || !normalizedUnit) return []

  const unit = normalizedUnit.toLowerCase()
  if (unit === 'kg') {
    return [
      `100g costs ${formatIngredientMoney(normalizedPrice / 10)}`,
      `1kg costs ${formatIngredientMoney(normalizedPrice)}`,
    ]
  }

  if (unit === 'l') {
    return [
      `100ml costs ${formatIngredientMoney(normalizedPrice / 10)}`,
      `1L costs ${formatIngredientMoney(normalizedPrice)}`,
    ]
  }

  if (unit === 'unit' || unit === 'dozen') {
    return [
      `1 unit costs ${formatIngredientMoney(normalizedPrice)}`,
      `12 units cost ${formatIngredientMoney(normalizedPrice * 12)}`,
    ]
  }

  return [`1 ${normalizedUnit} costs ${formatIngredientMoney(normalizedPrice)}`]
}
