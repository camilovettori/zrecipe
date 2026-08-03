import { expect, test } from 'playwright/test'
import {
  resolveHendersonQuantity,
  resolveInvoiceQuantityEvidence,
  resolveInvoiceIngredientPricing,
  WEIGHT_VOLUME_IN_DESCRIPTION,
} from '../src/lib/invoices'

test.describe('Henderson CASES / UNITS extraction', () => {
  const examples = [
    {
      name: 'full case: 12 x 1kg',
      rawCasesQuantity: 1,
      rawUnitsQuantity: null,
      rawSizeText: '12 X 1KG',
      value: 132,
      expectedUnit: 'case',
      expectedPackageSize: 12,
      expectedPrice: 11,
    },
    {
      name: 'loose unit: 12 x 1kg',
      rawCasesQuantity: null,
      rawUnitsQuantity: 1,
      rawSizeText: '12 X 1KG',
      value: 11.09,
      expectedUnit: 'unit',
      expectedPackageSize: 1,
      expectedPrice: 11.09,
    },
    {
      name: 'loose unit: 4 x 2.5kg',
      rawCasesQuantity: null,
      rawUnitsQuantity: 1,
      rawSizeText: '4 X 2.5KG',
      value: 18.5,
      expectedUnit: 'unit',
      expectedPackageSize: 2.5,
      expectedPrice: 7.4,
    },
  ] as const

  for (const example of examples) {
    test(example.name, () => {
      const patch = resolveHendersonQuantity(example)
      expect(patch.unit).toBe(example.expectedUnit)
      expect(patch.package_size).toBe(example.expectedPackageSize)
      expect(patch.package_unit).toBe('kg')

      const pricing = resolveInvoiceIngredientPricing({
        unitPrice: example.value,
        invoiceUnit: patch.unit,
        packageSize: patch.package_size,
        packageUnit: patch.package_unit,
        targetUnit: 'kg',
      })
      expect(pricing.normalizedPrice).toBe(example.expectedPrice)
    })
  }

  test('both columns present remains Needs review', () => {
    const patch = resolveHendersonQuantity({
      rawCasesQuantity: 1,
      rawUnitsQuantity: 1,
      rawSizeText: '12 X 1KG',
    })

    expect(patch.quantity_source).toBe('MULTIPLE')
    expect(patch.needs_verification).toBe(true)
    expect(patch.unit).toBeUndefined()
  })

  test('parses litre and count-only Henderson pack formats', () => {
    const litres = resolveHendersonQuantity({
      rawCasesQuantity: 0,
      rawUnitsQuantity: 1,
      rawSizeText: '2 X 2LTR',
    })
    const countOnly = resolveHendersonQuantity({
      rawCasesQuantity: 1,
      rawUnitsQuantity: null,
      rawSizeText: '17 X 6',
    })

    expect(litres.raw_cases_quantity).toBe(0)
    expect(litres.package_size).toBe(2)
    expect(litres.package_unit).toBe('L')
    expect(countOnly.package_size).toBe(102)
    expect(countOnly.package_unit).toBe('unit')
  })
})

test.describe('generic invoice quantity source preservation', () => {
  const resolvedExamples = [
    {
      name: 'CASES uses the complete case size',
      columns: { CASES: 1, UNITS: null },
      source: 'CASES',
      size: '12 X 1KG',
      total: 132,
      expectedUnit: 'case',
      expectedSize: 12,
      expectedPrice: 11,
    },
    {
      name: 'UNITS uses only the individual unit size',
      columns: { CASES: null, UNITS: 1 },
      source: 'UNITS',
      size: '12 X 1KG',
      total: 11.09,
      expectedUnit: 'unit',
      expectedSize: 1,
      expectedPrice: 11.09,
    },
    {
      name: 'UNITS preserves 4 x 2.5kg without applying four',
      columns: { UNITS: 1 },
      source: 'UNITS',
      size: '4 X 2.5KG',
      total: 18.5,
      expectedUnit: 'unit',
      expectedSize: 2.5,
      expectedPrice: 7.4,
    },
    {
      name: 'CASES applies 4 x 2.5kg to the full case',
      columns: { CASES: 1 },
      source: 'CASES',
      size: '4 X 2.5KG',
      total: 74,
      expectedUnit: 'case',
      expectedSize: 10,
      expectedPrice: 7.4,
    },
  ] as const

  for (const example of resolvedExamples) {
    test(example.name, () => {
      const patch = resolveInvoiceQuantityEvidence({
        rawQuantityColumns: example.columns,
        quantitySource: example.source,
        rawSizeText: example.size,
      })
      const pricing = resolveInvoiceIngredientPricing({
        unitPrice: 999,
        lineTotal: example.total,
        quantity: patch.quantity,
        invoiceUnit: patch.unit,
        packageSize: patch.package_size,
        packageUnit: patch.package_unit,
        targetUnit: 'kg',
      })

      expect(patch.unit).toBe(example.expectedUnit)
      expect(patch.package_size).toBe(example.expectedSize)
      expect(pricing.normalizedPrice).toBe(example.expectedPrice)
    })
  }

  test('generic QTY with a multiplier is not silently treated as a case', () => {
    const patch = resolveInvoiceQuantityEvidence({
      rawQuantityColumns: { QTY: 1 },
      quantitySource: 'QTY',
      rawSizeText: '12 X 1KG',
    })

    expect(patch.quantity_source).toBe('QTY')
    expect(patch.needs_verification).toBe(true)
    expect(patch.package_size).toBeNull()
  })

  test('multiple populated columns preserve both and require review', () => {
    const patch = resolveInvoiceQuantityEvidence({
      rawQuantityColumns: { CASES: 1, UNITS: 2 },
      quantitySource: 'CASES',
      rawSizeText: '12 X 1KG',
    })

    expect(patch.raw_quantity_columns).toEqual({ CASES: 1, UNITS: 2 })
    expect(patch.quantity_source).toBe('MULTIPLE')
    expect(patch.needs_verification).toBe(true)
  })

  const readableLitreFormats = [
    { source: 'UNITS', size: '6 X 2LT', total: 11.41, packageSize: 2 },
    { source: 'CASES', size: '6 X 2LT', total: 68.46, packageSize: 12 },
    { source: 'UNITS', size: '6 X 2LTR', total: 11.41, packageSize: 2 },
    { source: 'UNITS', size: '6 X 2L', total: 11.41, packageSize: 2 },
  ] as const

  for (const example of readableLitreFormats) {
    test(`${example.source} parses ${example.size} without a size warning`, () => {
      const patch = resolveInvoiceQuantityEvidence({
        rawQuantityColumns: { [example.source]: 1 },
        quantitySource: example.source,
        rawSizeText: example.size,
      })
      const pricing = resolveInvoiceIngredientPricing({
        unitPrice: example.total,
        lineTotal: example.total,
        quantity: patch.quantity,
        invoiceUnit: patch.unit,
        packageSize: patch.package_size,
        packageUnit: patch.package_unit,
        targetUnit: 'L',
      })

      expect(patch.extracted_case_pack_count).toBe(6)
      expect(patch.extracted_unit_size).toBe(2)
      expect(patch.extracted_unit_measure).toBe('L')
      expect(patch.package_size).toBe(example.packageSize)
      expect(patch.package_unit).toBe('L')
      expect(patch.needs_verification).toBe(false)
      expect(patch.normalized_price_confidence).toBe('high')
      expect(patch.needs_review_reason).toBeNull()
      expect(pricing.normalizedPrice).toBe(5.705)
    })
  }
})

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
