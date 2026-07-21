import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTicketNumber } from '@/lib/support/formatTicketNumber'
import SubscriptionSection from './SubscriptionSection'
import TenantActions from './TenantActions'

const SUPER_ADMIN_EMAIL = 'camilovettori@gmail.com'

interface TeamMember {
  user_id: string
  email: string
  display_name: string
  last_sign_in_at: string | null
  role: string
  joined_at: string
}

interface AiFeatureRow {
  feature: string
  calls: number
  tokens: number
  cost: number
}

interface SupportTicketRow {
  id: string
  number: number
  channel: 'email' | 'internal'
  status: 'open' | 'closed'
  subject: string
  last_message_at: string
}

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  trialing:  'bg-amber-50 text-amber-700 border border-amber-200',
  past_due:  'bg-red-50 text-red-700 border border-red-200',
  canceled:  'bg-slate-100 text-slate-500 border border-slate-200',
  suspended: 'bg-amber-50 text-amber-700 border border-amber-200',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Active', trialing: 'Trial', past_due: 'Past Due', canceled: 'Cancelled', suspended: 'Suspended',
}
const FEATURE_LABEL: Record<string, string> = {
  invoice_extract:    'Invoice Extract',
  recipe_ideas:       'Recipe Ideas',
  recipe_suggestions: 'Recipe Suggestions',
  other:              'Other',
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default async function TenantDetail({ params }: { params: { id: string } }) {
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

  const { id } = params

  const { data: tenant } = await admin.from('tenants').select('*').eq('id', id).single()
  if (!tenant) notFound()

  const { data: allRecipes }    = await admin.from('recipes').select('id').eq('tenant_id', id)
  const { data: ingredients }   = await admin.from('ingredients').select('id').eq('tenant_id', id)
  const { data: invoices }      = await admin.from('invoices').select('id').eq('tenant_id', id)
  const { data: tenantUsers }   = await admin.from('tenant_users').select('user_id, role, created_at').eq('tenant_id', id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authUsers: any[] = []
  try {
    const { data: userData } = await adminClient.auth.admin.listUsers()
    authUsers = userData?.users ?? []
  } catch { /* auth admin may be unavailable */ }

  // AI usage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aiLogs: any[] = []
  try {
    const { data: aiData } = await admin.from('ai_usage_logs')
      .select('feature, total_tokens, cost_usd, created_at')
      .eq('tenant_id', id)
    aiLogs = aiData ?? []
  } catch { /* table may not exist */ }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)
  const aiLogs30d     = aiLogs.filter((r) => new Date(r.created_at) >= thirtyDaysAgo)
  const totalCalls    = aiLogs30d.length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalTokens   = aiLogs30d.reduce((s: number, r: any) => s + (r.total_tokens ?? 0), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalCost     = aiLogs30d.reduce((s: number, r: any) => s + (r.cost_usd ?? 0), 0)

  const featureMap: Record<string, AiFeatureRow> = {}
  for (const row of aiLogs30d) {
    const f = row.feature as string
    if (!featureMap[f]) featureMap[f] = { feature: f, calls: 0, tokens: 0, cost: 0 }
    featureMap[f].calls  += 1
    featureMap[f].tokens += (row.total_tokens ?? 0) as number
    featureMap[f].cost   += (row.cost_usd    ?? 0) as number
  }
  const featureRows = Object.values(featureMap)

  const recipeCount     = allRecipes?.length  ?? 0
  const ingredientCount = ingredients?.length ?? 0
  const invoiceCount    = invoices?.length    ?? 0

  // Build team with display_name from user_metadata
  const teamMembers: TeamMember[] = (tenantUsers ?? []).map((tu: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const authUser = authUsers.find((u: any) => u.id === tu.user_id) // eslint-disable-line @typescript-eslint/no-explicit-any
    const meta = authUser?.user_metadata ?? {}
    const displayName: string =
      meta.full_name || meta.name || authUser?.email?.split('@')[0] || 'Unknown'
    return {
      user_id:         tu.user_id as string,
      email:           (authUser?.email ?? 'Unknown') as string,
      display_name:    displayName,
      last_sign_in_at: (authUser?.last_sign_in_at ?? null) as string | null,
      role:            tu.role as string,
      joined_at:       tu.created_at as string,
    }
  })

  const owner       = teamMembers.find((m) => m.role === 'owner') ?? null
  const isComped    = (tenant.is_comped ?? false) as boolean

  // Support tickets opened by this tenant's owner
  let supportTickets: SupportTicketRow[] = []
  let supportTicketCount = 0
  if (owner?.email && owner.email !== 'Unknown') {
    const [{ data: ticketRows }, { count: ticketCount }] = await Promise.all([
      admin
        .from('support_tickets')
        .select('id, number, channel, status, subject, last_message_at')
        .eq('requester_email', owner.email)
        .order('last_message_at', { ascending: false })
        .limit(10),
      admin
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('requester_email', owner.email),
    ])
    supportTickets = (ticketRows ?? []) as SupportTicketRow[]
    supportTicketCount = ticketCount ?? 0
  }

  // Subscription display values (serializable for client component)
  const trialEnds          = new Date(new Date(tenant.created_at).getTime() + 14 * 86_400_000)
  const daysLeft           = Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86_400_000))
  const trialPct           = Math.min(100, ((14 - daysLeft) / 14) * 100)
  const trialEndsFormatted = trialEnds.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })
  const updatedAtFormatted = new Date(tenant.updated_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="max-w-4xl">
      {/* Back */}
      <Link
        href="/adminziffera/tenants"
        className="mb-6 flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Tenants
      </Link>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
            <span className="text-xl font-bold text-slate-600">
              {(tenant.name ?? '?').charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold text-slate-900">{tenant.name ?? 'Unnamed'}</h1>
              {tenant.business_type && (
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {tenant.business_type}
                </span>
              )}
            </div>
            {owner && (
              <>
                <p className="mt-0.5 text-sm font-medium text-slate-700">{owner.display_name}</p>
                <p className="text-sm text-slate-500">{owner.email}</p>
              </>
            )}
            <p className="mt-1 font-mono text-[11px] text-slate-400">{tenant.id}</p>
            <p className="text-[11px] text-slate-400">
              Created {new Date(tenant.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={cn('rounded-full px-3 py-1 text-xs font-medium', STATUS_BADGE[tenant.subscription_status] ?? STATUS_BADGE.canceled)}>
            {STATUS_LABEL[tenant.subscription_status] ?? tenant.subscription_status}
          </span>
          <TenantActions
            tenantId={tenant.id}
            tenantName={tenant.name}
            status={tenant.subscription_status}
            isComped={isComped}
            stripeCustomerId={tenant.stripe_customer_id ?? null}
            stripeSubscriptionId={tenant.stripe_subscription_id ?? null}
            trialDaysLeft={daysLeft}
            recipeCount={recipeCount}
            ingredientCount={ingredientCount}
            invoiceCount={invoiceCount}
            teamCount={teamMembers.length}
          />
        </div>
      </div>

      {/* Metric cards */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { label: 'Recipes',     value: recipeCount },
          { label: 'Ingredients', value: ingredientCount },
          { label: 'Invoices',    value: invoiceCount },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="text-2xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Team */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">Team members</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2.5 text-left">Member</th>
              <th className="px-5 py-2.5 text-left">Role</th>
              <th className="px-5 py-2.5 text-left">Last login</th>
              <th className="px-5 py-2.5 text-left">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {teamMembers.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-6 text-sm text-slate-400">No team members</td></tr>
            ) : (
              teamMembers.map((m) => (
                <tr key={m.user_id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                        {m.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">{m.display_name}</p>
                        <p className="text-xs text-slate-400">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      m.role === 'owner'
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border border-slate-200 bg-slate-100 text-slate-500'
                    )}>
                      {m.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-500">
                    {m.last_sign_in_at
                      ? new Date(m.last_sign_in_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Never'}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-500">
                    {new Date(m.joined_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Subscription — client component for buttons + modal */}
      <SubscriptionSection
        tenantId={tenant.id}
        tenantName={tenant.name}
        status={tenant.subscription_status}
        isComped={isComped}
        daysLeft={daysLeft}
        trialPct={trialPct}
        trialEndsFormatted={trialEndsFormatted}
        updatedAtFormatted={updatedAtFormatted}
        stripeCustomerId={tenant.stripe_customer_id ?? null}
        stripeSubscriptionId={tenant.stripe_subscription_id ?? null}
        cancelAt={tenant.subscription_cancel_at ?? null}
      />

      {/* AI Usage */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">AI Usage</h2>
          <span className="text-xs text-slate-400">Last 30 days</span>
        </div>
        {totalCalls === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">No AI usage recorded</p>
        ) : (
          <div className="p-5">
            <div className="mb-5 grid grid-cols-3 gap-3">
              {[
                { label: 'API Calls', value: totalCalls },
                { label: 'Tokens',   value: formatTokens(totalTokens) },
                { label: 'Est. Cost',value: `$${totalCost.toFixed(3)}` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className="text-xl font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="pb-2 text-left">Feature</th>
                  <th className="pb-2 text-right">Calls</th>
                  <th className="pb-2 text-right">Tokens</th>
                  <th className="pb-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {featureRows.map((row) => (
                  <tr key={row.feature}>
                    <td className="py-2 text-sm text-slate-700">{FEATURE_LABEL[row.feature] ?? row.feature}</td>
                    <td className="py-2 text-right text-sm text-slate-600">{row.calls}</td>
                    <td className="py-2 text-right text-sm text-slate-600">{formatTokens(row.tokens)}</td>
                    <td className="py-2 text-right text-sm text-slate-600">${row.cost.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Support tickets */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">Support tickets</h2>
          <span className="text-xs text-slate-400">{supportTicketCount} total</span>
        </div>
        {supportTickets.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">
            {owner?.email ? 'No support tickets from this tenant' : 'No owner on record'}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {supportTickets.map((t) => (
              <Link
                key={t.id}
                href={`/adminziffera/inbox/${t.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                      t.channel === 'email'
                        ? 'border border-blue-200 bg-blue-50 text-blue-600'
                        : 'border border-amber-200 bg-amber-50 text-amber-600'
                    )}
                  >
                    {t.channel === 'email' ? 'Email' : 'Internal'}
                  </span>
                  <span className="truncate text-sm text-slate-700">
                    <span className="text-slate-400">{formatTicketNumber(t.number)} · </span>
                    {t.subject}
                  </span>
                  {t.status === 'closed' && (
                    <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      Closed
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {new Date(t.last_message_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
