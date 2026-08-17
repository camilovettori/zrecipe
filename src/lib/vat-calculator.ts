export type VatCalculationMode = 'add' | 'remove'

export interface VatCalculation {
  net: number
  vat: number
  gross: number
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculateVat(
  amount: number,
  rate: number,
  mode: VatCalculationMode
): VatCalculation {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || amount < 0 || rate < 0) {
    return { net: 0, vat: 0, gross: 0 }
  }

  if (mode === 'add') {
    const net = roundCurrency(amount)
    const vat = roundCurrency(net * (rate / 100))
    return { net, vat, gross: roundCurrency(net + vat) }
  }

  const gross = roundCurrency(amount)
  const net = roundCurrency(gross / (1 + rate / 100))
  return { net, vat: roundCurrency(gross - net), gross }
}

