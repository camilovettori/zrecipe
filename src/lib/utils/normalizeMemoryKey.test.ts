import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMemoryKey } from './normalizeMemoryKey'

test('normalizeMemoryKey lowercases the description', () => {
  assert.equal(normalizeMemoryKey('Butter Salted'), 'butter salted')
})

test('normalizeMemoryKey collapses internal whitespace runs (OCR double-spacing)', () => {
  assert.equal(normalizeMemoryKey('Egg   White'), 'egg white')
})

test('normalizeMemoryKey trims leading/trailing whitespace', () => {
  assert.equal(normalizeMemoryKey('  Flour  '), 'flour')
})

test('normalizeMemoryKey makes OCR case/whitespace variants match', () => {
  assert.equal(
    normalizeMemoryKey('  Butter   Salted '),
    normalizeMemoryKey('butter salted')
  )
})
