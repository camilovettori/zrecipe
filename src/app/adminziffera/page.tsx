import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const SUPER_ADMIN_EMAIL = 'camilovettori@gmail.com'

interface Tenant {
  id: string
  name: string | null
  business_type: string | null
  subscription_status: string
  created_at: string
}

const STATUS_BADGE: Record<string, string> = {
  active:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
  trialing: 'bg-amber-50 text-amber-700 border border-amber-200',
  past_due: 'bg-red-50 text-red-700 border border-red-200',
  canceled: 'bg-slate-100 text-slate-500 border border-slate-200',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Active', trialing: 'Trial', past_due: 'Past Due', canceled: 'Cancelled',
}

export default async function AdminDashboard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== SUPER_ADMIN_EMAIL) redirect('/')

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = adminClient as any

  const { data: tenants }          = await admin.from('tenants').select('*').order('created_at', { ascending: false })
  const { data: tenantUsers }      = await admin.from('tenant_users').select('tenant_id, user_id, role')
  const { data: recipeCounts }     = await admin.from('recipes').select('tenant_id')
  const { data: ingredientCounts } = await admin.from('ingredients').select('tenant_id')
  const { data: invoiceCounts }    = await admin.from('invoices').select('tenant_id')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let users: any[] = []
  try {
    const { data: userData } = await adminClient.auth.admin.listUsers()
    users = userData?.users ?? []
  } catch { /* auth admin unavailable */ }

  // AI usage (30 days) — table may not exist yet
  let aiCalls30d = 0
  let aiCost30d  = 0
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const { data: aiData } = await admin.from('ai_usage_logs')
      .select('cost_usd')
      .gte('created_at', thirtyDaysAgo)
    if (aiData) {
      aiCalls30d = aiData.length
      aiCost30d  = (aiData as { cost_usd: number }[]).reduce((s, r) => s + (r.cost_usd ?? 0), 0)
    }
  } catch { /* table may not exist */ }

  const tenantList        = (tenants as Tenant[] | null) ?? []
  const activeTenants     = tenantList.filter((t) => t.subscription_status === 'active').length
  const trialingTenants   = tenantList.filter((t) => t.subscription_status === 'trialing').length
  const canceledTenants   = tenantList.filter((t) => t.subscription_status === 'canceled').length
  const suspendedTenants  = tenantList.filter((t) => t.subscription_status === 'suspended').length
  const mrr               = activeTenants * 25

  const today = new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">ZRecipe business overview · {today}</p>
      </div>

      {/* MRR hero */}
      <div className="mb-6 rounded-xl bg-emerald-600 p-6">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-200">
          Monthly Recurring Revenue
        </p>
        <p className="text-4xl font-bold text-white">€{mrr.toLocaleString()}</p>
        <p className="mt-1 text-sm text-emerald-200">
          {activeTenants} active subscription{activeTenants !== 1 ? 's' : ''} × €25/mo
        </p>
      </div>

      {/* Subscription stats */}
      <div className="mb-4 grid grid-cols-5 gap-4">
        {[
          { label: 'Total Tenants',   value: tenantList.length,  color: '' },
          { label: 'Active (Paying)', value: activeTenants,       color: 'text-emerald-700' },
          { label: 'Trialing',        value: trialingTenants,     color: 'text-amber-600' },
          { label: 'Suspended',       value: suspendedTenants,    color: 'text-orange-600' },
          { label: 'Cancelled',       value: canceledTenants,     color: 'text-slate-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className={cn('text-2xl font-semibold', color || 'text-slate-900')}>{value}</p>
          </div>
        ))}
      </div>

      {/* Usage stats + AI */}
      <div className="mb-8 grid grid-cols-5 gap-4">
        {[
          { label: 'Total Users',       value: users.length },
          { label: 'Total Recipes',     value: recipeCounts?.length ?? 0 },
          { label: 'Total Ingredients', value: ingredientCounts?.length ?? 0 },
          { label: 'Total Invoices',    value: invoiceCounts?.length ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="text-2xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">AI Calls (30d)</p>
          <p className="text-2xl font-semibold text-slate-900">{aiCalls30d.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-400">~${aiCost30d.toFixed(3)} est. cost</p>
        </div>
      </div>

      {/* Recent tenants */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Recent Tenants</h2>
        </div>
        {/* Column headers */}
        <div className="grid border-b border-slate-100 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
          style={{ gridTemplateColumns: '1fr 120px 80px 100px' }}>
          <span>Business</span>
          <span>Usage</span>
          <span>Users</span>
          <span>Status</span>
        </div>
        {tenantList.slice(0, 10).map((tenant) => {
          const userCount       = tenantUsers?.filter((tu: { tenant_id: string }) => tu.tenant_id === tenant.id).length ?? 0
          const recipeCount     = recipeCounts?.filter((r: { tenant_id: string }) => r.tenant_id === tenant.id).length ?? 0
          const ingredientCount = ingredientCounts?.filter((i: { tenant_id: string }) => i.tenant_id === tenant.id).length ?? 0
          const trialEnds       = new Date(new Date(tenant.created_at).getTime() + 14 * 86_400_000)
          const daysLeft        = Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86_400_000))

          return (
            <Link
              key={tenant.id}
              href={`/adminziffera/tenants/${tenant.id}`}
              className="grid items-center border-b border-slate-100 px-5 py-3 transition-colors last:border-0 hover:bg-slate-50"
              style={{ gridTemplateColumns: '1fr 120px 80px 100px' }}
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{tenant.name ?? 'Unnamed'}</p>
                <p className="text-xs text-slate-400">
                  {tenant.business_type ?? 'N/A'} · {new Date(tenant.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <p className="text-xs text-slate-500">{recipeCount} recipes · {ingredientCount} ingr</p>
              <p className="text-xs text-slate-500">{userCount}</p>
              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS_BADGE[tenant.subscription_status] ?? STATUS_BADGE.canceled)}>
                {tenant.subscription_status === 'trialing' ? `Trial · ${daysLeft}d` : (STATUS_LABEL[tenant.subscription_status] ?? tenant.subscription_status)}
              </span>
            </Link>
          )
        })}
        {tenantList.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-400">No tenants yet</p>
        )}
      </div>
    </div>
  )
}
