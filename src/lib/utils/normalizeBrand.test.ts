import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBrand } from './normalizeBrand'

test('normalizeBrand trims a brand string', () => {
  assert.equal(normalizeBrand('  Heinz  '), 'Heinz')
})

test('normalizeBrand turns blank/whitespace-only into null', () => {
  assert.equal(normalizeBrand(''), null)
  assert.equal(normalizeBrand('   '), null)
})

test('normalizeBrand turns undefined/null into null', () => {
  assert.equal(normalizeBrand(undefined), null)
  assert.equal(normalizeBrand(null), null)
})
