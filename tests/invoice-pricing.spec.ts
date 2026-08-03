import { expect, test } from 'playwright/test'
import { resolveInvoiceIngredientPricing, WEIGHT_VOLUME_IN_DESCRIPTION } from '../src/lib/invoices'

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

  test('"pack vs weight" bug: correct extraction (package_size set) derives the true per-kg price', () => {
    // "Ice Bags 2KG, Qty: 3, Price: 0.96, Value: 2.88" — correctly extracted
    // as unit="bag", package_size=2, package_unit="kg".
    const result = resolveInvoiceIngredientPricing({
      unitPrice: 0.96,
      invoiceUnit: 'bag',
      packageSize: 2,
      packageUnit: 'kg',
      targetUnit: 'kg',
    })

    expect(result.valid).toBe(true)
    expect(result.normalizedPrice).toBe(0.48) // 0.96 / 2kg, NOT 0.96/kg
    expect(result.normalizedUnit).toBe('kg')
  })

  test('"pack vs weight" bug: without package_size, the price is wrongly treated as per-kg directly', () => {
    // Same invoice line, but with the buggy extraction this ticket fixes
    // upstream: unit="kg", package_size=null. Documented here so the
    // normalization function's (correct) behavior given bad input is
    // understood — the fix belongs in the extraction prompt, not here.
    const result = resolveInvoiceIngredientPricing({
      unitPrice: 0.96,
      invoiceUnit: 'kg',
      packageSize: null,
      packageUnit: null,
      targetUnit: 'kg',
    })

    expect(result.valid).toBe(true)
    expect(result.normalizedPrice).toBe(0.96) // wrong: should have been 0.48
    expect(result.normalizedPrice).not.toBe(0.48)
  })
})

test.describe('weight/volume-in-description detection (editor hint)', () => {
  test('flags descriptions that mention a weight or volume', () => {
    const positives = [
      'Ice Bags 2KG',
      'Flour 10KG',
      'Vanilla 500ML',
      'Water Still 2L Bottle',
      'Butter Salted Block 250g',
      'Olive Oil 1L',
    ]
    for (const description of positives) {
      expect(WEIGHT_VOLUME_IN_DESCRIPTION.test(description), description).toBe(true)
    }
  })

  test('does not flag descriptions with no weight/volume token', () => {
    const negatives = [
      'MC DOUGALLS STD MUFFIN CASE 480S',
      'Muffin Cases',
      'Napkins White',
      'Coffee Cups 8oz Lids',
      // Known gap: the leading \b requires a boundary before the digit, so
      // "NxM" multi-pack notation glued directly to a count (no space) isn't
      // caught by this particular hint — that's a distinct detection (see
      // detectMultiPackNotation in the extraction route) and out of scope
      // for this regex as specified.
      'Water Still 6x2L',
    ]
    for (const description of negatives) {
      expect(WEIGHT_VOLUME_IN_DESCRIPTION.test(description), description).toBe(false)
    }
  })
})
