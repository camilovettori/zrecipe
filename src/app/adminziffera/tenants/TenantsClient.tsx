'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Search, X, Sparkles, AlertTriangle, Gift, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TenantRow {
  id: string
  name: string | null
  business_type: string | null
  subscription_status: string
  stripe_subscription_id: string | null
  created_at: string
  updated_at: string
  recipe_count: number
  ingredient_count: number
  ai_call_count: number
  owner_email: string | null
  is_new_subscriber: boolean
  is_comped: boolean
  unread_ticket_count: number
}

const AVATAR_COLORS = [
  { bg: 'bg-blue-100',   text: 'text-blue-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-emerald-100',text: 'text-emerald-700' },
  { bg: 'bg-amber-100',  text: 'text-amber-700' },
  { bg: 'bg-rose-100',   text: 'text-rose-700' },
]

type FilterTab = 'all' | 'trialing' | 'active' | 'suspended' | 'canceled'

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'trialing',  label: 'Trial' },
  { key: 'active',    label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'canceled',  label: 'Cancelled' },
]

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  trialing:  'bg-amber-50 text-amber-700 border border-amber-200',
  past_due:  'bg-red-50 text-red-700 border border-red-200',
  canceled:  'bg-slate-100 text-slate-500 border border-slate-200',
  suspended: 'bg-orange-50 text-orange-700 border border-orange-200',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Active', trialing: 'Trial', past_due: 'Past Due', canceled: 'Cancelled', suspended: 'Suspended',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_BADGE[status] ?? STATUS_BADGE.canceled)}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function PaymentCell({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600">
        <span className="text-[10px]">●</span>
        Up to date
      </span>
    )
  }
  if (status === 'past_due') {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        Declined
      </span>
    )
  }
  if (status === 'canceled') {
    return <span className="text-xs text-slate-400">Ended</span>
  }
  return <span className="text-xs text-slate-400">—</span>
}

function TrialRenewal({ tenant }: { tenant: TenantRow }) {
  if (tenant.subscription_status === 'suspended') {
    return <span className="text-xs font-medium text-orange-600">Suspended</span>
  }
  if (tenant.subscription_status === 'trialing') {
    const trialEnds = new Date(new Date(tenant.created_at).getTime() + 14 * 86_400_000)
    const dLeft = Math.ceil((trialEnds.getTime() - Date.now()) / 86_400_000)
    if (dLeft < 0)  return <span className="text-xs text-red-500">Expired</span>
    if (dLeft <= 2) return <span className="text-xs font-medium text-amber-600">{dLeft}d left</span>
    return <span className="text-xs text-slate-500">{dLeft}d left</span>
  }
  if (tenant.subscription_status === 'active') {
    const renewDate = new Date(new Date(tenant.updated_at).getTime() + 30 * 86_400_000)
    return (
      <span className="text-xs text-slate-500">
        Renews {renewDate.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}
      </span>
    )
  }
  return <span className="text-xs text-slate-400">—</span>
}

export default function TenantsClient({ tenants }: { tenants: TenantRow[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const newSubscribers = tenants.filter((t) => t.is_new_subscriber)

  const filtered = tenants
    .filter((t) => {
      if (tab === 'active')    return t.subscription_status === 'active'
      if (tab === 'trialing')  return t.subscription_status === 'trialing'
      if (tab === 'suspended') return t.subscription_status === 'suspended'
      if (tab === 'canceled')  return t.subscription_status === 'canceled' || t.subscription_status === 'past_due'
      return true
    })
    .filter((t) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (t.name ?? '').toLowerCase().includes(q) || (t.owner_email ?? '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (a.unread_ticket_count > 0 && b.unread_ticket_count === 0) return -1
      if (a.unread_ticket_count === 0 && b.unread_ticket_count > 0) return 1
      if (a.is_new_subscriber && !b.is_new_subscriber) return -1
      if (!a.is_new_subscriber && b.is_new_subscriber) return 1
      return (a.name ?? '').localeCompare(b.name ?? '')
    })

  return (
    <div>
      {/* New subscriber banner */}
      {!bannerDismissed && newSubscribers.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-sm text-amber-800">
              <span className="font-semibold">{newSubscribers.length} new subscriber{newSubscribers.length > 1 ? 's' : ''}</span>
              {' — '}
              {newSubscribers.map((t) => t.name ?? 'Unnamed').join(', ')} converted from trial recently
            </p>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="ml-4 text-amber-400 transition-colors hover:text-amber-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search + filter row */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business name or email..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                tab === key ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-900'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Column headers */}
        <div
          className="grid border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
          style={{ gridTemplateColumns: '2fr 100px 130px 1fr 1fr 40px' }}
        >
          <span>Business</span>
          <span>Status</span>
          <span>Payment</span>
          <span>Trial / Renewal</span>
          <span>Usage</span>
          <span />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            No tenants found
          </div>
        ) : (
          filtered.map((tenant, index) => {
            const { bg, text } = AVATAR_COLORS[index % AVATAR_COLORS.length]
            const usageText = [
              `${tenant.recipe_count} recipes`,
              `${tenant.ingredient_count} ingr`,
              tenant.ai_call_count > 0 ? `${tenant.ai_call_count} AI` : null,
            ].filter(Boolean).join(' · ')

            return (
              <div
                key={tenant.id}
                onClick={() => router.push(`/adminziffera/tenants/${tenant.id}`)}
                className={cn(
                  'grid cursor-pointer items-center border-b border-slate-100 px-4 py-3.5 transition-colors last:border-0 hover:bg-slate-50',
                  tenant.unread_ticket_count > 0 && 'border-l-4 border-l-amber-400 bg-amber-50/40'
                )}
                style={{ gridTemplateColumns: '2fr 100px 130px 1fr 1fr 40px' }}
              >
                {/* Business */}
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', bg, text)}>
                    {(tenant.name ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-slate-900">{tenant.name ?? 'Unnamed'}</span>
                      {tenant.is_new_subscriber && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                          NEW
                        </span>
                      )}
                      {tenant.unread_ticket_count > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <MessageCircle className="h-3 w-3" />
                          {tenant.unread_ticket_count} new
                        </span>
                      )}
                    </div>
                    {tenant.business_type && (
                      <p className="text-[11px] text-slate-400">{tenant.business_type}</p>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={tenant.subscription_status} />
                  {tenant.is_comped && tenant.subscription_status === 'active' && (
                    <span title="Comped — free plan">
                      <Gift className="h-3 w-3 text-purple-400" />
                    </span>
                  )}
                </div>

                {/* Payment */}
                <PaymentCell status={tenant.subscription_status} />

                {/* Trial / Renewal */}
                <TrialRenewal tenant={tenant} />

                {/* Usage */}
                <span className="text-xs text-slate-500">{usageText}</span>

                {/* Arrow */}
                <ChevronRight className="h-4 w-4 justify-self-end text-slate-300" />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
