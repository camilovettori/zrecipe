import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'

const SUPER_ADMIN_EMAIL = 'camilovettori@gmail.com'

export default async function AdminDashboard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== SUPER_ADMIN_EMAIL) redirect('/')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [
    { data: tenants },
    { data: { users } },
    { data: tenantUsers },
    { data: recipeCounts },
    { data: ingredientCounts },
    { data: invoiceCounts },
  ] = await Promise.all([
    admin.from('tenants').select('*').order('created_at', { ascending: false }),
    admin.auth.admin.listUsers(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from('tenant_users') as any).select('tenant_id, user_id, role'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from('recipes') as any).select('tenant_id'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from('ingredients') as any).select('tenant_id'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from('invoices') as any).select('tenant_id'),
  ])

  const activeTenants   = tenants?.filter((t) => t.subscription_status === 'active').length   ?? 0
  const trialingTenants = tenants?.filter((t) => t.subscription_status === 'trialing').length ?? 0
  const canceledTenants = tenants?.filter((t) => t.subscription_status === 'canceled').length ?? 0
  const mrr = activeTenants * 25

  const today = new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">ZRecipe business overview · {today}</p>
      </div>

      {/* MRR hero */}
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 p-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-200">
          Monthly Recurring Revenue
        </p>
        <p className="text-4xl font-black text-white">€{mrr.toLocaleString()}</p>
        <p className="mt-1 text-sm text-emerald-200">
          {activeTenants} active subscription{activeTenants !== 1 ? 's' : ''} × €25/mo
        </p>
      </div>

      {/* Stats grid */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        {[
          { label: 'Total Tenants',   value: tenants?.length ?? 0, color: 'blue' },
          { label: 'Active (Paying)', value: activeTenants,          color: 'emerald' },
          { label: 'Trialing',        value: trialingTenants,        color: 'amber' },
          { label: 'Canceled',        value: canceledTenants,        color: 'red' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
            <p className={cn('text-3xl font-black', `text-${color}-400`)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Usage stats */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        {[
          { label: 'Total Users',       value: users?.length ?? 0 },
          { label: 'Total Recipes',     value: recipeCounts?.length ?? 0 },
          { label: 'Total Ingredients', value: ingredientCounts?.length ?? 0 },
          { label: 'Total Invoices',    value: invoiceCounts?.length ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-gray-300">{value}</p>
          </div>
        ))}
      </div>

      {/* Recent tenants */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="mb-4 text-sm font-bold text-white">Recent Tenants</h2>
        <div className="space-y-1">
          {tenants?.slice(0, 10).map((tenant) => {
            const userCount       = tenantUsers?.filter((tu: { tenant_id: string }) => tu.tenant_id === tenant.id).length ?? 0
            const recipeCount     = recipeCounts?.filter((r: { tenant_id: string }) => r.tenant_id === tenant.id).length ?? 0
            const ingredientCount = ingredientCounts?.filter((i: { tenant_id: string }) => i.tenant_id === tenant.id).length ?? 0
            const trialEnds       = new Date(new Date(tenant.created_at).getTime() + 14 * 86_400_000)
            const daysLeft        = Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86_400_000))

            return (
              <div key={tenant.id} className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-gray-800">
                <div className="flex items-center gap-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-700">
                    <span className="text-xs font-bold text-gray-300">
                      {(tenant.name ?? '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{tenant.name ?? 'Unnamed'}</p>
                    <p className="text-xs text-gray-500">
                      {tenant.business_type ?? 'N/A'} · {new Date(tenant.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <p className="text-xs text-gray-500">
                    {recipeCount} recipes · {ingredientCount} ingr · {userCount} user{userCount !== 1 ? 's' : ''}
                  </p>
                  <span className={cn(
                    'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
                    tenant.subscription_status === 'active'    ? 'bg-emerald-900/50 text-emerald-400'
                    : tenant.subscription_status === 'trialing' ? 'bg-amber-900/50 text-amber-400'
                    : tenant.subscription_status === 'past_due' ? 'bg-red-900/50 text-red-400'
                    : 'bg-gray-800 text-gray-500'
                  )}>
                    {tenant.subscription_status === 'trialing' ? `Trial · ${daysLeft}d` : (tenant.subscription_status ?? 'unknown')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
