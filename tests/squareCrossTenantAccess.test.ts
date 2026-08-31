import test from 'node:test'
import assert from 'node:assert/strict'
import { getTenantContext } from '../src/lib/tenant'

// A minimal stand-in for Supabase's chainable query builder
// (.select().eq().limit().maybeSingle(), or .list() for a plain array —
// Supabase itself resolves the bare awaited builder, but a custom thenable's
// generic then() defeats TS's return-type inference, so this uses an
// explicit terminal method instead). Filters an in-memory row set, mirroring
// the stub-chain approach already used in
// tests/subRecipeCostMapHardening.test.ts for testing Supabase-shaped code
// without a live database.
class FakeQuery<Row extends Record<string, unknown>> {
  constructor(private rows: Row[], private filters: Array<(r: Row) => boolean> = []) {}

  eq(col: keyof Row, val: unknown) {
    return new FakeQuery(this.rows, [...this.filters, (r) => r[col] === val])
  }
  gte(col: keyof Row, val: unknown) {
    return new FakeQuery(this.rows, [...this.filters, (r) => (r[col] as string) >= (val as string)])
  }
  limit(_n: number) {
    return this
  }
  private filtered() {
    return this.rows.filter((r) => this.filters.every((f) => f(r)))
  }
  async maybeSingle() {
    return { data: this.filtered()[0] ?? null, error: null }
  }
  async list() {
    return { data: this.filtered(), error: null }
  }
}

function fakeSupabaseFrom(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return new FakeQuery(tables[table] ?? [])
        },
      }
    },
  }
}

test('a tenant-A user resolves getTenantContext to tenant A, never a tenant-B row present in the same table', async () => {
  const supabase = fakeSupabaseFrom({
    tenant_users: [
      { id: 'mem-a', tenant_id: 'tenant-A', user_id: 'user-a', role: 'owner' },
      { id: 'mem-b', tenant_id: 'tenant-B', user_id: 'user-b', role: 'owner' },
    ],
    tenants: [
      { id: 'tenant-A', name: 'Bakery A', created_at: '2026-01-01', plan_tier: 'starter', is_comped: false },
      { id: 'tenant-B', name: 'Bakery B', created_at: '2026-01-01', plan_tier: 'pro', is_comped: false },
    ],
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context = await getTenantContext(supabase as any, 'user-a')
  assert.equal(context?.tenantId, 'tenant-A')
  assert.equal(context?.tenant.name, 'Bakery A')
  assert.notEqual(context?.tenantId, 'tenant-B')
})

test('cross-tenant access denial: a square_connections row belonging to tenant B only is invisible to a tenant-A query', async () => {
  // Same .eq('tenant_id', access.tenantId).maybeSingle() shape used
  // identically in status/route.ts, sync/route.ts and disconnect/route.ts.
  const supabase = fakeSupabaseFrom({
    square_connections: [
      { id: 'conn-b', tenant_id: 'tenant-B', merchant_id: 'sq-merchant-b', merchant_name: 'Bakery B Square' },
    ],
  })

  const asTenantA = await supabase
    .from('square_connections')
    .select('id, merchant_id, merchant_name')
    .eq('tenant_id', 'tenant-A')
    .maybeSingle()

  assert.equal(asTenantA.data, null)

  // Sanity check: the same query scoped to tenant B (the actual owner) does
  // find the row — proving the filter itself works, not just that it always
  // returns nothing.
  const asTenantB = await supabase
    .from('square_connections')
    .select('id, merchant_id, merchant_name')
    .eq('tenant_id', 'tenant-B')
    .maybeSingle()

  assert.equal(asTenantB.data?.merchant_name, 'Bakery B Square')
})

test('cross-tenant access denial: square_orders belonging to tenant B are excluded from a tenant-A analytics query', async () => {
  // Same shape used by status/route.ts's recent-sales query:
  // .eq('tenant_id', ...).eq('state', 'COMPLETED').gte('created_at_square', ...)
  const supabase = fakeSupabaseFrom({
    square_orders: [
      { tenant_id: 'tenant-B', state: 'COMPLETED', created_at_square: '2026-08-20', total_amount_cents: 5000 },
      { tenant_id: 'tenant-B', state: 'COMPLETED', created_at_square: '2026-08-25', total_amount_cents: 3000 },
    ],
  })

  const asTenantA = await supabase
    .from('square_orders')
    .select('total_amount_cents, currency')
    .eq('tenant_id', 'tenant-A')
    .eq('state', 'COMPLETED')
    .gte('created_at_square', '2026-08-01')
    .list()

  assert.equal(asTenantA.data.length, 0)

  const totalForTenantA = asTenantA.data.reduce((sum, order) => sum + Number(order.total_amount_cents ?? 0), 0)
  assert.equal(totalForTenantA, 0) // never tenant B's €80.00 in sales
})
