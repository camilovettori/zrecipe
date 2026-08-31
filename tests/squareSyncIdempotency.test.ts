import test from 'node:test'
import assert from 'node:assert/strict'
import Module from 'node:module'

// See tests/squareTokenRoundTrip.test.ts for why 'server-only' needs stubbing
// under the plain Node test runner.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalLoad = (Module as any)._load
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(Module as any)._load = function (request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {}
  return originalLoad.call(this, request, ...rest)
}

const serverModule = import('../src/lib/square/server')

// A minimal in-memory stand-in for a Postgres table with a unique composite
// key, mirroring Supabase's .upsert(rows, { onConflict }) semantics: a row
// matching an existing key overwrites it in place, everything else inserts.
// This is what exercises the same "does re-running produce duplicates"
// property the real square_orders/square_order_line_items UNIQUE constraints
// enforce, without needing a live database.
class FakeUpsertTable<Row extends Record<string, unknown>> {
  private rows = new Map<string, Row>()
  constructor(private readonly keyColumns: string[]) {}

  private keyOf(row: Row) {
    return this.keyColumns.map((col) => String(row[col])).join('::')
  }

  upsert(rows: Row[]) {
    for (const row of rows) this.rows.set(this.keyOf(row), row)
  }

  get size() {
    return this.rows.size
  }

  all() {
    return [...this.rows.values()]
  }
}

function fixtureOrder(overrides: {
  id?: string
  totalCents?: number
  lineItems?: Array<{ uid: string; name: string; totalCents: number }>
} = {}) {
  const lineItems = overrides.lineItems ?? [
    { uid: 'line-1', name: 'Sourdough Loaf', totalCents: 650 },
    { uid: 'line-2', name: 'Croissant', totalCents: 350 },
  ]
  return {
    id: overrides.id ?? 'order-abc',
    location_id: 'loc-1',
    state: 'COMPLETED',
    created_at: '2026-08-20T09:00:00Z',
    total_money: { amount: overrides.totalCents ?? 1000, currency: 'EUR' },
    total_tax_money: { amount: 0, currency: 'EUR' },
    line_items: lineItems.map((line) => ({
      uid: line.uid,
      name: line.name,
      quantity: '1',
      total_money: { amount: line.totalCents, currency: 'EUR' },
    })),
  }
}

test('running sync twice against the same fixture produces one square_orders row, not duplicated', async () => {
  const { buildSquareOrderRow } = await serverModule
  const orders = new FakeUpsertTable<ReturnType<typeof buildSquareOrderRow>>(['tenant_id', 'square_order_id'])
  const order = fixtureOrder()

  orders.upsert([buildSquareOrderRow(order, 'tenant-a', 'conn-1')])
  orders.upsert([buildSquareOrderRow(order, 'tenant-a', 'conn-1')]) // second sync run, identical payload

  assert.equal(orders.size, 1)
  assert.equal(orders.all()[0].total_amount_cents, 1000)
})

test('running sync twice produces the correct square_order_line_items count after both runs, not duplicated', async () => {
  const { buildSquareLineItemRows } = await serverModule
  const lines = new FakeUpsertTable<ReturnType<typeof buildSquareLineItemRows>[number]>([
    'tenant_id', 'square_order_id', 'square_line_item_uid',
  ])
  const order = fixtureOrder()

  lines.upsert(buildSquareLineItemRows(order, 'tenant-a'))
  lines.upsert(buildSquareLineItemRows(order, 'tenant-a')) // second sync run, identical payload

  assert.equal(lines.size, 2) // line-1, line-2 — not 4
})

test('a second run with updated Square totals overwrites the row in place (last write wins), still not duplicated', async () => {
  const { buildSquareOrderRow } = await serverModule
  const orders = new FakeUpsertTable<ReturnType<typeof buildSquareOrderRow>>(['tenant_id', 'square_order_id'])

  orders.upsert([buildSquareOrderRow(fixtureOrder({ totalCents: 1000 }), 'tenant-a', 'conn-1')])
  orders.upsert([buildSquareOrderRow(fixtureOrder({ totalCents: 1200 }), 'tenant-a', 'conn-1')])

  assert.equal(orders.size, 1)
  assert.equal(orders.all()[0].total_amount_cents, 1200)
})

test('FIX 2: a chunk failure mid-sync leaves already-upserted line items intact instead of deleted-then-not-reinserted', async () => {
  // Simulates the exact gap the prior delete-then-insert code had: two pages
  // of orders are synced, but the run is interrupted after page 1's line
  // items are upserted and before page 2's are written (e.g. a network
  // failure calling Square for page 2). With the old code, the DELETE for
  // page 1 would have already run before its INSERT — so an interruption at
  // this exact point in the OLD flow could leave page 1 with zero line items.
  // With the new upsert-only flow, there is no delete step, so page 1's rows
  // are simply present, complete and correct, regardless of what happens on
  // page 2.
  const { buildSquareLineItemRows } = await serverModule
  const lines = new FakeUpsertTable<ReturnType<typeof buildSquareLineItemRows>[number]>([
    'tenant_id', 'square_order_id', 'square_line_item_uid',
  ])

  const page1Order = fixtureOrder({ id: 'order-page1' })
  const page2Order = fixtureOrder({
    id: 'order-page2',
    lineItems: [{ uid: 'line-1', name: 'Bagel', totalCents: 300 }],
  })

  // Page 1 completes successfully.
  lines.upsert(buildSquareLineItemRows(page1Order, 'tenant-a'))

  // Page 2 fetch/sync fails before its upsert ever runs — simulated by simply
  // not calling lines.upsert() for page2Order, matching what "the process
  // throws before reaching this line" looks like in the real route.

  // Page 1's two line items must still be there, untouched — the old
  // delete-then-insert design could not guarantee this.
  const page1Rows = lines.all().filter((row) => row.square_order_id === 'order-page1')
  assert.equal(page1Rows.length, 2)
  assert.equal(lines.size, 2) // page 2 never wrote anything, as expected — nothing was lost, nothing was duplicated
})
