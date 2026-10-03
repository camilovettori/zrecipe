import test from 'node:test'
import assert from 'node:assert/strict'
import { getQuantityStep } from '../src/lib/utils/unit-converter'

test('base and count units step by whole numbers', () => {
  for (const unit of ['g', 'ml', 'unit', 'portion', 'serving', 'dozen']) {
    assert.equal(getQuantityStep(unit), 1, unit)
  }
})

test('large weight/volume units step by 0.01', () => {
  for (const unit of ['kg', 'L', 'lb']) {
    assert.equal(getQuantityStep(unit), 0.01, unit)
  }
})

test('spoon/cup/oz units step by 0.25', () => {
  for (const unit of ['oz', 'tbsp', 'tsp', 'cup']) {
    assert.equal(getQuantityStep(unit), 0.25, unit)
  }
})

test('unit lookup is case- and whitespace-insensitive', () => {
  assert.equal(getQuantityStep('KG'), 0.01)
  assert.equal(getQuantityStep(' l '), 0.01)
  assert.equal(getQuantityStep('G'), 1)
})

test('unrecognized units fall back to 1', () => {
  assert.equal(getQuantityStep('pinch'), 1)
  assert.equal(getQuantityStep(''), 1)
})
