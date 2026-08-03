// Regression guard for Recipe QA #3: a recipe selling below cost must show
// its real negative margin (e.g. "-37.5%") in red with a "Loss" label,
// instead of being floored at "0.0%" for display.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getMarginBand } from '../src/components/recipes/CostBreakdown'

test('margin < 0 is the Loss band', () => {
  assert.deepEqual(getMarginBand(-37.5), { band: 'loss', label: 'Loss', colorClass: 'text-red-500' })
})

test('margin 0-15 (inclusive of 0) is the Low band', () => {
  assert.equal(getMarginBand(0).band, 'low')
  assert.equal(getMarginBand(14.9).band, 'low')
})

test('margin 15-30 (inclusive of 15) is the Good band', () => {
  assert.equal(getMarginBand(15).band, 'good')
  assert.equal(getMarginBand(29.9).band, 'good')
})

test('margin >= 30 is the Excellent band', () => {
  assert.equal(getMarginBand(30).band, 'excellent')
  assert.equal(getMarginBand(75).band, 'excellent')
})

test('non-finite margin does not crash and falls back to a sane band', () => {
  assert.doesNotThrow(() => getMarginBand(NaN))
  assert.doesNotThrow(() => getMarginBand(Infinity))
})
