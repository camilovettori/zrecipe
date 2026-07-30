import { expect, test } from 'playwright/test'
import { resolveInvoiceIngredientPricing } from '../src/lib/invoices'

test.describe('invoice ingredient price normalization', () => {
  test('normalizes package and direct-unit prices without changing families', () => {
    const cases = [
      {
        name: '2kg yogurt',
        input: {
          unitPrice: 6.5,
          invoiceUnit: 'pack',
          packageSize: 2,
          packageUnit: 'kg',
          targetUnit: 'kg',
        },
        price: 3.25,
        unit: 'kg',
      },
      {
        name: '1L syrup',
        input: { unitPrice: 8, invoiceUnit: 'L', targetUnit: 'L' },
        price: 8,
        unit: 'L',
      },
      {
        name: '5L oil',
        input: {
          unitPrice: 20,
          invoiceUnit: 'case',
          packageSize: 5,
          packageUnit: 'L',
          targetUnit: 'L',
        },
        price: 4,
        unit: 'L',
      },
      {
        name: 'dozen eggs',
        input: { unitPrice: 3.6, invoiceUnit: 'dozen', targetUnit: 'unit' },
        price: 0.3,
        unit: 'unit',
      },
      {
        name: 'single packaging item',
        input: { unitPrice: 0.28, invoiceUnit: 'unit', targetUnit: 'unit' },
        price: 0.28,
        unit: 'unit',
      },
    ] as const

    for (const example of cases) {
      const result = resolveInvoiceIngredientPricing(example.input)
      expect(result.valid, example.name).toBe(true)
      expect(result.normalizedPrice, example.name).toBe(example.price)
      expect(result.normalizedUnit, example.name).toBe(example.unit)
    }
  })

  test('requires review for volume-to-weight conversion', () => {
    const result = resolveInvoiceIngredientPricing({
      unitPrice: 8,
      invoiceUnit: 'L',
      targetUnit: 'kg',
    })

    expect(result.valid).toBe(false)
    expect(result.needsReview).toBe(true)
    expect(result.warning).toContain('without an explicit conversion factor')
  })

  test('requires a package unit when a package size is present', () => {
    const result = resolveInvoiceIngredientPricing({
      unitPrice: 8,
      invoiceUnit: 'case',
      packageSize: 5,
      packageUnit: null,
    })

    expect(result.valid).toBe(false)
    expect(result.needsReview).toBe(true)
    expect(result.warning).toContain('Select the package unit')
  })
})
