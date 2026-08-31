import test from 'node:test'
import assert from 'node:assert/strict'
import { computeMarginRow, computeMarginRows, type LinkedRecipeForMargin, type SquareItemSales } from '../src/lib/square/margin'

// Real production-shaped fixture: yield > 1 (CLAUDE.md core costing rule 4's
// test fixture rule — at yield 1 a correct and an incorrectly-scaled formula
// coincide, so a yield-1 fixture can't catch a scale-mixing bug). 44
// portions, totalCost €28.41 -> costPerUnit €0.6457 (rounded to 4dp, matches
// cost-calculator.ts's own rounding).
const sourdoughLoaf: LinkedRecipeForMargin = {
  id: 'recipe-sourdough',
  name: 'Sourdough Loaf',
  isSubIngredient: false,
  cost: { costPerUnit: 0.6457 },
}

const pastryCreamSubRecipe: LinkedRecipeForMargin = {
  id: 'recipe-pastry-cream',
  name: 'Pastry Cream',
  isSubIngredient: true,
  cost: { costPerUnit: 0.32 },
}

function fixtureItem(overrides: Partial<SquareItemSales> = {}): SquareItemSales {
  return {
    itemName: 'Sourdough Loaf',
    unitsSold: 40,
    revenueCents: 26000, // €260.00
    currency: 'EUR',
    linkedRecipeId: 'recipe-sourdough',
    ...overrides,
  }
}

test('margin: 40 units sold x €0.6457 cost/unit produces the expected cost, margin € and margin %', () => {
  const row = computeMarginRow(fixtureItem(), sourdoughLoaf)

  // costCents = round(0.6457 * 40 * 100) = round(2582.8) = 2583 (€25.83)
  assert.equal(row.costCents, 2583)
  // marginCents = 26000 - 2583 = 23417 (€234.17)
  assert.equal(row.marginCents, 23417)
  // marginPercent = 23417 / 26000 * 100 = 90.065...%
  assert.ok(row.marginPercent != null)
  assert.equal(Number(row.marginPercent!.toFixed(2)), 90.07)
  assert.equal(row.isSubRecipe, false)
  assert.equal(row.linkedRecipeName, 'Sourdough Loaf')
})

test('margin: revenue below cost produces a negative margin, not clamped to zero', () => {
  const row = computeMarginRow(
    fixtureItem({ unitsSold: 500, revenueCents: 26000 }), // 500 units at real cost far exceeds €260 revenue
    sourdoughLoaf
  )
  assert.ok(row.marginCents != null && row.marginCents < 0)
  assert.ok(row.marginPercent != null && row.marginPercent < 0)
})

test('unlinked items never produce a margin value — explicit null state, not a zero masquerading as real', () => {
  const row = computeMarginRow(fixtureItem({ linkedRecipeId: null }), null)
  assert.equal(row.linkedRecipeName, null)
  assert.equal(row.costCents, null)
  assert.equal(row.marginCents, null)
  assert.equal(row.marginPercent, null)
  // Specifically not zero — zero would be indistinguishable from a real
  // €0.00 margin on a correctly-linked item.
  assert.notEqual(row.marginCents, 0)
})

test('computeMarginRows resolves each item independently — an unlinked item next to a linked one stays unlinked', () => {
  const rows = computeMarginRows(
    [fixtureItem({ itemName: 'Sourdough Loaf' }), fixtureItem({ itemName: 'Mystery Item', linkedRecipeId: null })],
    new Map([['recipe-sourdough', sourdoughLoaf]])
  )
  const linked = rows.find((r) => r.itemName === 'Sourdough Loaf')!
  const unlinked = rows.find((r) => r.itemName === 'Mystery Item')!
  assert.ok(linked.marginCents != null)
  assert.equal(unlinked.marginCents, null)
})

test('CLAUDE.md core costing rule 7: a linked sub-recipe shows cost but never margin €/%', () => {
  const row = computeMarginRow(
    fixtureItem({ itemName: 'Pastry Cream Cup', linkedRecipeId: 'recipe-pastry-cream', unitsSold: 10, revenueCents: 4000 }),
    pastryCreamSubRecipe
  )
  assert.equal(row.isSubRecipe, true)
  assert.equal(row.linkedRecipeName, 'Pastry Cream')
  // Cost is still shown (internal cost only, per rule 7) ...
  assert.equal(row.costCents, Math.round(0.32 * 10 * 100))
  // ... but margin is never computed for a sub-recipe.
  assert.equal(row.marginCents, null)
  assert.equal(row.marginPercent, null)
})

// ── square_item_recipe_links: upsert semantics + cross-tenant isolation ────
// Mirrors the FakeUpsertTable pattern from tests/squareSyncIdempotency.test.ts
// and the FakeQuery pattern from tests/squareCrossTenantAccess.test.ts.

type LinkRow = { tenant_id: string; square_item_name: string; recipe_id: string }

class FakeLinksTable {
  private rows = new Map<string, LinkRow>()
  private keyOf(row: Pick<LinkRow, 'tenant_id' | 'square_item_name'>) {
    return `${row.tenant_id}::${row.square_item_name}`
  }
  upsert(row: LinkRow) {
    this.rows.set(this.keyOf(row), row)
  }
  all() {
    return [...this.rows.values()]
  }
  findByTenantAndItem(tenantId: string, squareItemName: string) {
    return this.rows.get(this.keyOf({ tenant_id: tenantId, square_item_name: squareItemName })) ?? null
  }
}

test('relinking an item upserts in place — never duplicates a square_item_recipe_links row', () => {
  const table = new FakeLinksTable()
  table.upsert({ tenant_id: 'tenant-a', square_item_name: 'Sourdough Loaf', recipe_id: 'recipe-sourdough' })
  // Relink to a different recipe — same (tenant_id, square_item_name) key.
  table.upsert({ tenant_id: 'tenant-a', square_item_name: 'Sourdough Loaf', recipe_id: 'recipe-alternate' })

  assert.equal(table.all().length, 1)
  assert.equal(table.findByTenantAndItem('tenant-a', 'Sourdough Loaf')?.recipe_id, 'recipe-alternate')
})

test('cross-tenant: a mapping created by tenant A is never visible to tenant B', () => {
  const table = new FakeLinksTable()
  table.upsert({ tenant_id: 'tenant-a', square_item_name: 'Sourdough Loaf', recipe_id: 'recipe-sourdough' })

  assert.equal(table.findByTenantAndItem('tenant-b', 'Sourdough Loaf'), null)
  // Sanity check the fixture itself is real, not just always returning null.
  assert.notEqual(table.findByTenantAndItem('tenant-a', 'Sourdough Loaf'), null)
})
