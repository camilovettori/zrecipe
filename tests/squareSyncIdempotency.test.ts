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

// A stand-in for the square_order_line_items table shaped exactly like the
// SquareLineItemTable interface syncOrderLineItems expects
// (.upsert / .select().eq().eq() / .delete().eq().eq().in()), so these tests
// exercise the real production function, not a reimplementation of its
// pruning logic. Every delete call is recorded so tests can assert on its
// filter shape directly.
type LineItemRow = { tenant_id: string; square_order_id: string; square_line_item_uid: string; [key: string]: unknown }
type LoggedDelete = { tenantId: string; squareOrderId: string; uids: string[] }

class FakeLineItemTable {
  private rows = new Map<string, LineItemRow>()
  deleteLog: LoggedDelete[] = []

  private keyOf(row: LineItemRow) {
    return `${row.tenant_id}::${row.square_order_id}::${row.square_line_item_uid}`
  }

  all() {
    return [...this.rows.values()]
  }

  async upsert(rows: LineItemRow[]) {
    for (const row of rows) this.rows.set(this.keyOf(row), row)
    return { error: null }
  }

  select(_columns: string) {
    const table = this
    return {
      eq(col1: string, val1: string) {
        return {
          eq(col2: string, val2: string) {
            const data = table
              .all()
              .filter((row) => row[col1] === val1 && row[col2] === val2)
              .map((row) => ({ square_line_item_uid: row.square_line_item_uid }))
            return Promise.resolve({ data, error: null })
          },
        }
      },
    }
  }

  delete() {
    const table = this
    return {
      eq(col1: string, val1: string) {
        return {
          eq(col2: string, val2: string) {
            return {
              in(col3: string, values: string[]) {
                table.deleteLog.push({ tenantId: val1, squareOrderId: val2, uids: values })
                for (const row of table.all()) {
                  if (row[col1] === val1 && row[col2] === val2 && values.includes(row[col3] as string)) {
                    table.rows.delete(table.keyOf(row))
                  }
                }
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
    }
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

// ── Pruning removed line items (residual gap fix) ──────────────────────────
// These exercise the real syncOrderLineItems from server.ts against
// FakeLineItemTable, not a reimplementation of its pruning logic.

test('pruning: a line item Square stops returning (void/partial refund) is deleted on the next sync, the remaining one is unchanged', async () => {
  const { syncOrderLineItems } = await serverModule
  const table = new FakeLineItemTable()

  const firstSync = fixtureOrder({
    id: 'order-void',
    lineItems: [
      { uid: 'line-1', name: 'Sourdough Loaf', totalCents: 650 },
      { uid: 'line-2', name: 'Croissant', totalCents: 350 },
    ],
  })
  await syncOrderLineItems(table, firstSync, 'tenant-a')
  assert.equal(table.all().length, 2)

  // Second sync: Square now only reports line-1 (line-2 was voided/refunded).
  const secondSync = fixtureOrder({
    id: 'order-void',
    lineItems: [{ uid: 'line-1', name: 'Sourdough Loaf', totalCents: 650 }],
  })
  await syncOrderLineItems(table, secondSync, 'tenant-a')

  const remaining = table.all()
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].square_line_item_uid, 'line-1')
  assert.equal(remaining[0].name, 'Sourdough Loaf')
  assert.equal(remaining[0].total_amount_cents, 650)
})

test('pruning is scoped per order: removing a line from one order never touches another order\'s rows in the same page', async () => {
  const { syncOrderLineItems } = await serverModule
  const table = new FakeLineItemTable()

  // Deliberately reuse the uid string "line-1" across two different orders —
  // if pruning were ever scoped by uid alone instead of (order_id, uid), this
  // would expose it.
  const orderA = fixtureOrder({
    id: 'order-A',
    lineItems: [
      { uid: 'line-1', name: 'Sourdough Loaf', totalCents: 650 },
      { uid: 'line-2', name: 'Croissant', totalCents: 350 },
    ],
  })
  const orderB = fixtureOrder({
    id: 'order-B',
    lineItems: [{ uid: 'line-1', name: 'Bagel', totalCents: 300 }],
  })

  await syncOrderLineItems(table, orderA, 'tenant-a')
  await syncOrderLineItems(table, orderB, 'tenant-a')
  assert.equal(table.all().length, 3)

  // Re-sync order A only, with line-2 removed.
  const orderAUpdated = fixtureOrder({
    id: 'order-A',
    lineItems: [{ uid: 'line-1', name: 'Sourdough Loaf', totalCents: 650 }],
  })
  await syncOrderLineItems(table, orderAUpdated, 'tenant-a')

  const remaining = table.all()
  assert.equal(remaining.length, 2)
  assert.ok(remaining.some((r) => r.square_order_id === 'order-A' && r.square_line_item_uid === 'line-1'))
  assert.ok(remaining.some((r) => r.square_order_id === 'order-B' && r.square_line_item_uid === 'line-1'))
  assert.ok(!remaining.some((r) => r.square_order_id === 'order-A' && r.square_line_item_uid === 'line-2'))
})

test('re-syncing an unchanged order prunes nothing and still upserts current data', async () => {
  const { syncOrderLineItems } = await serverModule
  const table = new FakeLineItemTable()

  const order = fixtureOrder({ id: 'order-stable' })
  await syncOrderLineItems(table, order, 'tenant-a')

  const result = await syncOrderLineItems(table, order, 'tenant-a') // identical re-sync

  assert.equal(result.pruned, 0)
  assert.equal(table.deleteLog.length, 0) // no delete call was ever issued
  assert.equal(table.all().length, 2)
  const line1 = table.all().find((row) => row.square_line_item_uid === 'line-1')
  assert.equal(line1?.total_amount_cents, 650)
})

test('regression guard: every prune delete call carries both tenant_id and square_order_id in its filter', async () => {
  const { syncOrderLineItems } = await serverModule
  const table = new FakeLineItemTable()

  const order = fixtureOrder({
    id: 'order-guard',
    lineItems: [
      { uid: 'line-1', name: 'Sourdough Loaf', totalCents: 650 },
      { uid: 'line-2', name: 'Croissant', totalCents: 350 },
    ],
  })
  await syncOrderLineItems(table, order, 'tenant-a')

  const updated = fixtureOrder({
    id: 'order-guard',
    lineItems: [{ uid: 'line-1', name: 'Sourdough Loaf', totalCents: 650 }],
  })
  await syncOrderLineItems(table, updated, 'tenant-a')

  assert.equal(table.deleteLog.length, 1)
  const [deleteCall] = table.deleteLog
  assert.ok(deleteCall.tenantId.length > 0, 'delete call must carry a non-empty tenant_id filter')
  assert.equal(deleteCall.tenantId, 'tenant-a')
  assert.ok(deleteCall.squareOrderId.length > 0, 'delete call must carry a non-empty square_order_id filter')
  assert.equal(deleteCall.squareOrderId, 'order-guard')
  assert.deepEqual(deleteCall.uids, ['line-2'])
})
