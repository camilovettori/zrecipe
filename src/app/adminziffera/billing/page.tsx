import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'

const SUPER_ADMIN_EMAIL = 'camilovettori@gmail.com'

interface Tenant {
  id: string
  name: string | null
  subscription_status: string
  stripe_customer_id: string | null
  is_comped?: boolean
  created_at: string
  updated_at: string
}

export default async function AdminBilling() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== SUPER_ADMIN_EMAIL) redirect('/')

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = adminClient as any

  const { data: rawTenants } = await admin.from('tenants').select('*').order('created_at', { ascending: false })

  const tenants = (rawTenants ?? []) as Tenant[]
  const active       = tenants.filter((t) => t.subscription_status === 'active')
  const payingActive = active.filter((t) => !t.is_comped)
  const compedActive = active.filter((t) => t.is_comped)
  const trialing     = tenants.filter((t) => t.subscription_status === 'trialing')
  const canceled     = tenants.filter((t) => t.subscription_status === 'canceled')
  const pastDue      = tenants.filter((t) => t.subscription_status === 'past_due')

  const mrr            = payingActive.length * 25
  const arr            = mrr * 12
  const total          = tenants.length
  const conversionRate = total > 0 ? ((payingActive.length / total) * 100).toFixed(1) : '0.0'

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Billing</h1>
        <p className="mt-1 text-sm text-slate-500">Revenue and subscription metrics</p>
      </div>

      {/* Revenue cards */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <div className="rounded-xl bg-emerald-600 p-5">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-200">MRR</p>
          <p className="text-3xl font-bold text-white">€{mrr.toLocaleString()}</p>
          {compedActive.length > 0 && (
            <p className="mt-1 text-xs text-emerald-200">{compedActive.length} comped account{compedActive.length > 1 ? 's' : ''} excluded</p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">ARR</p>
          <p className="text-3xl font-bold text-slate-900">€{arr.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Conversion Rate</p>
          <p className="text-3xl font-bold text-slate-900">{conversionRate}%</p>
          <p className="mt-1 text-xs text-slate-400">trial → paid</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Past Due</p>
          <p className="text-3xl font-bold text-red-600">{pastDue.length}</p>
        </div>
      </div>

      {/* Subscription breakdown */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        {/* Active */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-emerald-700">
              Active Subscribers ({payingActive.length} paying{compedActive.length > 0 ? ` · ${compedActive.length} comped` : ''})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {active.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">No active subscribers yet</p>
            ) : (
              active.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-slate-700">{t.name ?? 'Unnamed'}</span>
                  {t.is_comped ? (
                    <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">Comped</span>
                  ) : (
                    <span className="text-sm font-semibold text-emerald-600">€25/mo</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Trials */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-amber-700">
              Trials ({trialing.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {trialing.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">No active trials</p>
            ) : (
              trialing.map((t) => {
                const ends  = new Date(new Date(t.created_at).getTime() + 14 * 86_400_000)
                const dLeft = Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86_400_000))
                return (
                  <div key={t.id} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-slate-700">{t.name ?? 'Unnamed'}</span>
                    <span className={cn('text-sm font-semibold', dLeft <= 3 ? 'text-red-600' : 'text-amber-600')}>
                      {dLeft}d left
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Canceled */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-600">Cancelled ({canceled.length})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {canceled.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">None</p>
            ) : (
              canceled.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-slate-500">{t.name ?? 'Unnamed'}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(t.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Past due */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-red-700">Past Due ({pastDue.length})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {pastDue.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">None</p>
            ) : (
              pastDue.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-slate-700">{t.name ?? 'Unnamed'}</span>
                  {t.stripe_customer_id && (
                    <a
                      href={`https://dashboard.stripe.com/customers/${t.stripe_customer_id}`}
                      target="_blank"
                      className="text-sm text-emerald-600 hover:underline"
                    >
                      Stripe →
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
