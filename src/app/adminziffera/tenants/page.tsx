import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const SUPER_ADMIN_EMAIL = 'camilovettori@gmail.com'

export default async function AdminTenants() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== SUPER_ADMIN_EMAIL) redirect('/')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any

  const [
    { data: tenants },
    listUsersResult,
    { data: tenantUsers },
    { data: recipes },
    { data: ingredients },
    { data: invoices },
    { data: invites },
  ] = await Promise.all([
    a.from('tenants').select('*').order('created_at', { ascending: false }),
    admin.auth.admin.listUsers().catch(() => ({ data: { users: [] }, error: null })),
    a.from('tenant_users').select('*'),
    a.from('recipes').select('id, tenant_id, name'),
    a.from('ingredients').select('id, tenant_id'),
    a.from('invoices').select('id, tenant_id, total_amount, created_at'),
    a.from('tenant_invites').select('*').catch(() => ({ data: [] })),
  ])

  const users = (listUsersResult as { data: { users: { id: string; email?: string; last_sign_in_at?: string }[] } }).data?.users ?? []

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Tenants</h1>
        <p className="mt-1 text-sm text-gray-500">{tenants?.length ?? 0} registered businesses</p>
      </div>

      <div className="space-y-4">
        {tenants?.map((tenant) => {
          type TenantUser = { tenant_id: string; user_id: string; role: string }
          const tUsers: TenantUser[] = tenantUsers?.filter((tu: TenantUser) => tu.tenant_id === tenant.id) ?? []
          const tUserDetails = tUsers.map((tu) => {
            const authUser = users?.find((u) => u.id === tu.user_id)
            return { ...tu, email: authUser?.email, lastSignIn: authUser?.last_sign_in_at }
          })

          type RecipeRow = { id: string; tenant_id: string; name: string }
          type IngRow    = { id: string; tenant_id: string }
          type InvRow    = { id: string; tenant_id: string; total_amount: number | null }
          type InviteRow = { tenant_id: string; status: string }

          const recipeList     = recipes?.filter((r: RecipeRow) => r.tenant_id === tenant.id) ?? []
          const ingredientCount = ingredients?.filter((i: IngRow) => i.tenant_id === tenant.id).length ?? 0
          const tenantInvoices = invoices?.filter((i: InvRow) => i.tenant_id === tenant.id) ?? []
          const totalSpend     = tenantInvoices.reduce((s: number, i: InvRow) => s + (i.total_amount ?? 0), 0)
          const pendingInvites = invites?.filter((i: InviteRow) => i.tenant_id === tenant.id && i.status === 'pending') ?? []

          const trialEnds  = new Date(new Date(tenant.created_at).getTime() + 14 * 86_400_000)
          const daysLeft   = Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86_400_000))
          const trialPct   = Math.min(100, ((14 - daysLeft) / 14) * 100)

          return (
            <div key={tenant.id} className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-700">
                    <span className="text-lg font-bold text-gray-300">
                      {(tenant.name ?? '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{tenant.name ?? 'Unnamed'}</h3>
                    <p className="text-xs text-gray-500">
                      {tenant.business_type ?? 'N/A'} · ID: {tenant.id.slice(0, 8)}… · {new Date(tenant.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <span className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider',
                  tenant.subscription_status === 'active'    ? 'border-emerald-800 bg-emerald-900/50 text-emerald-400'
                  : tenant.subscription_status === 'trialing' ? 'border-amber-800 bg-amber-900/50 text-amber-400'
                  : tenant.subscription_status === 'past_due' ? 'border-red-800 bg-red-900/50 text-red-400'
                  : 'border-gray-700 bg-gray-800 text-gray-500'
                )}>
                  {tenant.subscription_status ?? 'unknown'}
                </span>
              </div>

              {/* 3-column body */}
              <div className="grid grid-cols-3 divide-x divide-gray-800">
                {/* Users */}
                <div className="p-5">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    Team ({tUserDetails.length})
                  </p>
                  <div className="space-y-2">
                    {tUserDetails.map((u) => (
                      <div key={u.user_id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-300">{u.email ?? 'Unknown'}</p>
                          <p className="text-[10px] text-gray-600">
                            Last login: {u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) : 'Never'}
                          </p>
                        </div>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          u.role === 'owner' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-gray-800 text-gray-400'
                        )}>
                          {u.role}
                        </span>
                      </div>
                    ))}
                    {pendingInvites.length > 0 && (
                      <p className="border-t border-gray-800 pt-2 text-[10px] text-amber-500">
                        {pendingInvites.length} pending invite{pendingInvites.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>

                {/* Usage */}
                <div className="p-5">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Usage</p>
                  <div className="space-y-2">
                    {[
                      { l: 'Recipes',     v: recipeList.length },
                      { l: 'Ingredients', v: ingredientCount },
                      { l: 'Invoices',    v: tenantInvoices.length },
                      { l: 'Spend',       v: `€${totalSpend.toFixed(0)}` },
                    ].map(({ l, v }) => (
                      <div key={l} className="flex justify-between">
                        <span className="text-sm text-gray-400">{l}</span>
                        <span className="text-sm font-semibold text-gray-300">{v}</span>
                      </div>
                    ))}
                    {recipeList.length > 0 && (
                      <div className="border-t border-gray-800 pt-2">
                        <p className="mb-1 text-[10px] text-gray-500">Recipes:</p>
                        <p className="text-xs text-gray-400">
                          {recipeList.slice(0, 5).map((r: RecipeRow) => r.name).join(', ')}
                          {recipeList.length > 5 ? ` +${recipeList.length - 5} more` : ''}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Subscription */}
                <div className="p-5">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Subscription</p>

                  {tenant.subscription_status === 'trialing' && (
                    <div className="mb-3">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-gray-500">Trial progress</span>
                        <span className="font-semibold text-amber-400">{daysLeft}d left</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
                        <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${trialPct}%` }} />
                      </div>
                      <p className="mt-1 text-[10px] text-gray-600">
                        Ends: {trialEnds.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-400">Status</span>
                      <span className="text-sm font-semibold text-gray-300">{tenant.subscription_status ?? '—'}</span>
                    </div>
                    {tenant.stripe_customer_id && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-400">Stripe</span>
                        <Link
                          href={`https://dashboard.stripe.com/customers/${tenant.stripe_customer_id}`}
                          target="_blank"
                          className="text-sm text-emerald-400 hover:underline"
                        >
                          View →
                        </Link>
                      </div>
                    )}
                    {tenant.subscription_cancel_at && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-400">Cancels</span>
                        <span className="text-sm text-red-400">
                          {new Date(tenant.subscription_cancel_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
