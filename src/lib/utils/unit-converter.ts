export const COMMON_UNITS = [
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'L',
  'unit',
  'dozen',
  'portion',
  'serving',
  'tbsp',
  'tsp',
  'cup',
] as const

type Unit = (typeof COMMON_UNITS)[number] | string

const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
}

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
}

const COUNT_TO_UNIT: Record<string, number> = {
  unit: 1,
  dozen: 12,
  portion: 1,
  serving: 1,
}

function normalizeUnit(unit: Unit) {
  return unit.trim().toLowerCase()
}

export function getUnitFamily(unit: string): 'weight' | 'volume' | 'count' | null {
  if (unit in WEIGHT_TO_GRAMS) return 'weight'
  if (unit in VOLUME_TO_ML) return 'volume'
  if (unit in COUNT_TO_UNIT) return 'count'
  return null
}

export function getConversionFactor(fromUnit: Unit, toUnit: Unit) {
  const from = normalizeUnit(fromUnit)
  const to = normalizeUnit(toUnit)

  if (from === to) {
    return 1
  }

  const fromFamily = getUnitFamily(from)
  const toFamily = getUnitFamily(to)

  if (!fromFamily || !toFamily || fromFamily !== toFamily) {
    return null
  }

  if (fromFamily === 'weight') {
    return WEIGHT_TO_GRAMS[from] / WEIGHT_TO_GRAMS[to]
  }

  if (fromFamily === 'volume') {
    return VOLUME_TO_ML[from] / VOLUME_TO_ML[to]
  }

  if (fromFamily === 'count') {
    const fromFactor = COUNT_TO_UNIT[from]
    const toFactor = COUNT_TO_UNIT[to]
    if (fromFactor == null || toFactor == null) return null
    return fromFactor / toFactor
  }

  return null
}

export function isConvertible(fromUnit: Unit, toUnit: Unit): boolean {
  return getConversionFactor(fromUnit, toUnit) !== null
}

export function convertUnit(value: number, fromUnit: Unit, toUnit: Unit) {
  const factor = getConversionFactor(fromUnit, toUnit)
  if (factor == null) {
    return value
  }
  return value * factor
}

export function normalizeToBaseUnit(value: number, unit: Unit) {
  const normalized = normalizeUnit(unit)
  if (normalized in WEIGHT_TO_GRAMS) {
    return { value: value * WEIGHT_TO_GRAMS[normalized], unit: 'g' }
  }
  if (normalized in VOLUME_TO_ML) {
    return { value: value * VOLUME_TO_ML[normalized], unit: 'ml' }
  }
  return { value, unit: normalized }
}
