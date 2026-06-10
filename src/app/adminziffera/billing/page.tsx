import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'

const SUPER_ADMIN_EMAIL = 'camilovettori@gmail.com'

export default async function AdminBilling() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== SUPER_ADMIN_EMAIL) redirect('/')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenants } = await (admin.from('tenants') as any)
    .select('*')
    .order('created_at', { ascending: false })

  const active   = (tenants ?? []).filter((t: { subscription_status: string }) => t.subscription_status === 'active')
  const trialing = (tenants ?? []).filter((t: { subscription_status: string }) => t.subscription_status === 'trialing')
  const canceled = (tenants ?? []).filter((t: { subscription_status: string }) => t.subscription_status === 'canceled')
  const pastDue  = (tenants ?? []).filter((t: { subscription_status: string }) => t.subscription_status === 'past_due')

  const mrr = active.length * 25
  const arr = mrr * 12
  const total = (tenants ?? []).length
  const conversionRate = total > 0 ? ((active.length / total) * 100).toFixed(1) : '0.0'

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="mt-1 text-sm text-gray-500">Revenue and subscription metrics</p>
      </div>

      {/* Revenue cards */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-500 p-5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-200">MRR</p>
          <p className="text-3xl font-black text-white">€{mrr.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">ARR</p>
          <p className="text-3xl font-black text-gray-300">€{arr.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Conversion Rate</p>
          <p className="text-3xl font-black text-gray-300">{conversionRate}%</p>
          <p className="mt-1 text-xs text-gray-600">trial → paid</p>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Past Due</p>
          <p className="text-3xl font-black text-red-400">{pastDue.length}</p>
        </div>
      </div>

      {/* Subscription breakdown */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        {/* Active subscribers */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-3 text-sm font-bold text-emerald-400">
            Active Subscribers ({active.length})
          </h2>
          <div className="space-y-2">
            {active.length === 0 ? (
              <p className="text-sm text-gray-600">No active subscribers yet</p>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              active.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-gray-300">{t.name ?? 'Unnamed'}</span>
                  <span className="text-sm font-semibold text-emerald-400">€25/mo</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Trials */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-3 text-sm font-bold text-amber-400">
            Trials ({trialing.length})
          </h2>
          <div className="space-y-2">
            {trialing.length === 0 ? (
              <p className="text-sm text-gray-600">No active trials</p>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              trialing.map((t: any) => {
                const ends  = new Date(new Date(t.created_at).getTime() + 14 * 86_400_000)
                const dLeft = Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86_400_000))
                return (
                  <div key={t.id} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-gray-300">{t.name ?? 'Unnamed'}</span>
                    <span className={cn('text-sm font-semibold', dLeft <= 3 ? 'text-red-400' : 'text-amber-400')}>
                      {dLeft}d left
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Canceled + Past due */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-3 text-sm font-bold text-gray-400">
            Canceled ({canceled.length})
          </h2>
          <div className="space-y-2">
            {canceled.length === 0 ? (
              <p className="text-sm text-gray-600">None</p>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              canceled.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-gray-400">{t.name ?? 'Unnamed'}</span>
                  <span className="text-xs text-gray-600">
                    {new Date(t.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-3 text-sm font-bold text-red-400">
            Past Due ({pastDue.length})
          </h2>
          <div className="space-y-2">
            {pastDue.length === 0 ? (
              <p className="text-sm text-gray-600">None</p>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              pastDue.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-gray-300">{t.name ?? 'Unnamed'}</span>
                  {t.stripe_customer_id && (
                    <a
                      href={`https://dashboard.stripe.com/customers/${t.stripe_customer_id}`}
                      target="_blank"
                      className="text-sm text-emerald-400 hover:underline"
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
