import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateVat } from '../src/lib/vat-calculator'

test('adds 23% VAT to a net amount', () => {
  assert.deepEqual(calculateVat(100, 23, 'add'), {
    net: 100,
    vat: 23,
    gross: 123,
  })
})

test('removes 23% VAT from a gross amount', () => {
  assert.deepEqual(calculateVat(123, 23, 'remove'), {
    net: 100,
    vat: 23,
    gross: 123,
  })
})

test('supports reduced Irish VAT rates and currency rounding', () => {
  assert.deepEqual(calculateVat(19.99, 13.5, 'add'), {
    net: 19.99,
    vat: 2.7,
    gross: 22.69,
  })
})

test('supports zero-rated calculations', () => {
  assert.deepEqual(calculateVat(42.5, 0, 'remove'), {
    net: 42.5,
    vat: 0,
    gross: 42.5,
  })
})

test('returns a safe empty result for invalid values', () => {
  assert.deepEqual(calculateVat(-10, 23, 'add'), { net: 0, vat: 0, gross: 0 })
  assert.deepEqual(calculateVat(100, Number.NaN, 'remove'), { net: 0, vat: 0, gross: 0 })
})

