// Regression guard: two independent "price trend" implementations (list view
// badge vs ingredient detail banner) used to disagree on direction/magnitude
// whenever two ingredient_price_history rows shared the same recorded_at
// date, because neither query nor computePriceChange() had a deterministic
// tiebreaker. Confirmed against live production data for "Baking powder":
// two rows tied on recorded_at (2026-09-16); the list page (desc query,
// takes [0]/[1]) showed +43%, the detail banner (separate asc sort, takes
// [len-1]/[len-2]) showed -30%, for the exact same two rows.
//
// Fix: computePriceChange() now sorts by created_at (a real, precise
// timestamp) when present, falling back to resolveEntryDate() (recorded_at
// etc, always midnight UTC per IngredientForm.tsx's write path) and finally
// to `id` as a last-resort deterministic tiebreaker. The ingredients list
// page's separate, duplicated calculation was deleted entirely in favor of
// calling this one shared function.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computePriceChange, type PriceHistoryEntry } from '../src/lib/price-alerts'

const repoRoot = join(import.meta.dirname, '..')

// (a) Same recorded_at, different created_at -> ordered deterministically by
// created_at, regardless of the order the rows are passed in.
test('tie on recorded_at, different created_at: resolved by created_at, not input order', () => {
  const earlier: PriceHistoryEntry = {
    id: 'aaaa',
    ingredient_id: 'ing-1',
    price: 5.0,
    unit: 'kg',
    recorded_at: '2026-09-16',
    created_at: '2026-09-16T08:00:00Z',
  }
  const later: PriceHistoryEntry = {
    id: 'zzzz',
    ingredient_id: 'ing-1',
    price: 6.0,
    unit: 'kg',
    recorded_at: '2026-09-16',
    created_at: '2026-09-16T17:30:00Z',
  }

  const resultA = computePriceChange([earlier, later])
  const resultB = computePriceChange([later, earlier])

  assert.deepEqual(resultA, resultB)
  assert.equal(resultA?.previousPrice, 5.0)
  assert.equal(resultA?.currentPrice, 6.0)
  assert.equal(resultA?.direction, 'up')
})

// (b) Same recorded_at, no created_at at all (today's actual production
// shape) -> falls back to the id tiebreaker, deterministic regardless of
// input order.
test('tie on recorded_at with no created_at: falls back to id tiebreaker, deterministic both ways', () => {
  const rowLowerId: PriceHistoryEntry = {
    id: '53f72bdf-dac3-4cc3-8ae7-0fe31ff1135b',
    ingredient_id: 'baking-powder',
    price: 6.1543,
    unit: 'kg',
    recorded_at: '2026-09-16',
  }
  const rowHigherId: PriceHistoryEntry = {
    id: 'f475fae6-bac1-497f-97fe-de05ff927818',
    ingredient_id: 'baking-powder',
    price: 4.3080,
    unit: 'kg',
    recorded_at: '2026-09-16',
  }

  const resultOrderAB = computePriceChange([rowLowerId, rowHigherId])
  const resultOrderBA = computePriceChange([rowHigherId, rowLowerId])

  assert.deepEqual(resultOrderAB, resultOrderBA)
  // '53f7...' < 'f475...' lexically, so rowHigherId ("f475...") sorts last
  // (ascending sort) and is picked as `current`.
  assert.equal(resultOrderAB?.previousPrice, 6.1543)
  assert.equal(resultOrderAB?.currentPrice, 4.3080)
  assert.equal(resultOrderAB?.direction, 'down')
})

// (c) Direct regression test for the actual reported contradiction: given
// Baking powder's real three-row fixture, the list page's old descending
// query order and the detail banner's old ascending order now both resolve
// through the same function to the exact same result.
test('Baking powder fixture: list-order input and detail-order input agree (regression for -30% vs +43%)', () => {
  const rowAug: PriceHistoryEntry = {
    id: '8b3e07e9-0e97-441d-93ed-c62077bf6bac',
    ingredient_id: 'baking-powder',
    price: 9.3571,
    unit: 'kg',
    recorded_at: '2026-08-18',
  }
  const rowSepA: PriceHistoryEntry = {
    id: '53f72bdf-dac3-4cc3-8ae7-0fe31ff1135b',
    ingredient_id: 'baking-powder',
    price: 6.1543,
    unit: 'kg',
    recorded_at: '2026-09-16',
  }
  const rowSepB: PriceHistoryEntry = {
    id: 'f475fae6-bac1-497f-97fe-de05ff927818',
    ingredient_id: 'baking-powder',
    price: 4.3080,
    unit: 'kg',
    recorded_at: '2026-09-16',
  }

  // Old list page: .order('recorded_at', { ascending: false }) — most recent
  // first, undefined order within the 09-16 tie (both permutations checked).
  const listOrderA = computePriceChange([rowSepA, rowSepB, rowAug])
  const listOrderB = computePriceChange([rowSepB, rowSepA, rowAug])
  // Old detail/dashboard path: ascending-ish, any order — computePriceChange
  // sorts internally.
  const detailOrder = computePriceChange([rowAug, rowSepA, rowSepB])

  assert.deepEqual(listOrderA, listOrderB)
  assert.deepEqual(listOrderA, detailOrder)

  assert.equal(listOrderA?.direction, 'down')
  assert.equal(listOrderA?.previousPrice, 6.1543)
  assert.equal(listOrderA?.currentPrice, 4.3080)
  const expectedPct = ((4.308 - 6.1543) / 6.1543) * 100
  assert.ok(Math.abs((listOrderA?.percentChange ?? 0) - expectedPct) < 1e-9)
})

// (d) Structural guard: the ingredients list page must not reintroduce its
// own separate percent-change calculation.
test('ingredients list page has no separate percent-change calculation — delegates to computePriceChange', () => {
  const src = readFileSync(join(repoRoot, 'src/app/(dashboard)/ingredients/page.tsx'), 'utf8')

  assert.match(
    src,
    /import\s*\{[^}]*computePriceChange[^}]*\}\s*from\s*['"]@\/lib\/price-alerts['"]/,
    'expected an import of computePriceChange from @/lib/price-alerts'
  )
  assert.doesNotMatch(
    src,
    /\(\(latest\s*-\s*prev\)\s*\/\s*prev\)/,
    'found the old inline percent-change formula — trend calculation must not be reimplemented locally'
  )
  assert.doesNotMatch(
    src,
    /grouped\.get\(row\.ingredient_id\)/,
    'found remnants of the old duplicated grouping logic'
  )
})
