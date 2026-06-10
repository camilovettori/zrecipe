'use client'

import { useEffect, useMemo, useState, type ComponentType } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import {
  AlertTriangle,
  Building2,
  Check,
  CreditCard,
  KeyRound,
  Loader2,
  Mail,
  Package,
  Receipt,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { clearTenantCache, resolveTenantContext } from '@/hooks/useTenant'
import { TRIAL_PERIOD_DAYS, getEffectiveSubscriptionStatus } from '@/lib/tenant'
import { FREE_LIMITS } from '@/lib/subscription/limits'
import { cn } from '@/lib/utils'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { format } from 'date-fns'

type TenantSettings = {
  id: string
  name: string
  business_type: string | null
  owner_email: string | null
  plan: string | null
  subscription_status: string | null
  stripe_customer_id: string | null
  subscription_current_period_end: string | null
  subscription_trial_end: string | null
  subscription_cancel_at: string | null
  created_at: string
}

type UsageStats = { recipes: number; ingredients: number; invoices: number }

type AIUsageStats = {
  recipe_ideas:    { used: number; limit: number | null }
  invoice_extracts: { used: number; limit: number | null }
} | null

const TABS = ['account', 'billing'] as const
type SettingsTab = (typeof TABS)[number]

function fmt(value?: string | null) {
  if (!value) return 'â€"'
  return new Intl.DateTimeFormat('en-IE', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(value))
}

// â"€â"€ Subscription status card â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function TrialingCard({
  tenant,
  onSubscribe,
  busy,
}: {
  tenant: TenantSettings
  onSubscribe: () => void
  busy: boolean
}) {
  const trialStart  = new Date(tenant.created_at).getTime()
  const trialEnd    = trialStart + TRIAL_PERIOD_DAYS * 86_400_000
  const now         = Date.now()
  const daysUsed    = Math.min(TRIAL_PERIOD_DAYS, Math.floor((now - trialStart) / 86_400_000))
  const daysLeft    = Math.max(0, TRIAL_PERIOD_DAYS - daysUsed)
  const pct         = Math.round((daysUsed / TRIAL_PERIOD_DAYS) * 100)

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 p-6 text-white shadow-lg shadow-emerald-200">
      <div className="flex items-start justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <Zap className="h-3.5 w-3.5" />
            Free Trial
          </div>
          <h2 className="mt-3 text-2xl font-bold">You&apos;re on your free trial</h2>
          <p className="mt-1 text-sm text-emerald-100">
            Full Pro access until {fmt(new Date(trialEnd).toISOString())}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold">{daysLeft}</p>
          <p className="text-sm text-emerald-100">days left</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-emerald-100">
          <span>Day {daysUsed}</span>
          <span>Day {TRIAL_PERIOD_DAYS}</span>
        </div>
        <div className="h-2 rounded-full bg-white/25">
          <div
            className="h-2 rounded-full bg-white transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <button
        onClick={onSubscribe}
        disabled={busy}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Subscribe now to keep full access
      </button>
    </div>
  )
}

// â"€â"€ Usage stat card â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function UsageStat({
  label, value, max, icon: Icon,
}: {
  label: string
  value: number
  max?: number
  icon: ComponentType<{ className?: string }>
}) {
  const showBar = max !== undefined && max !== Infinity
  const pct     = showBar ? Math.min(100, Math.round((value / max) * 100)) : 0
  const atLimit = showBar && value >= max

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-900">
            {value}
            {max !== undefined && max !== Infinity && (
              <span className="text-base font-normal text-slate-400"> / {max}</span>
            )}
          </p>
        </div>
      </div>
      {showBar && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn('h-1.5 rounded-full transition-all', atLimit ? 'bg-red-500' : 'bg-emerald-500')}
              style={{ width: `${pct}%` }}
            />
          </div>
          {atLimit && (
            <p className="mt-1 text-xs text-red-600 font-medium">Limit reached &mdash; upgrade to add more</p>
          )}
        </div>
      )}
    </div>
  )
}

// â"€â"€ Page â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tenant, setTenant]           = useState<TenantSettings | null>(null)
  const [usage, setUsage]             = useState<UsageStats>({ recipes: 0, ingredients: 0, invoices: 0 })
  const [aiUsage, setAiUsage]         = useState<AIUsageStats>(null)
  const [loading, setLoading]         = useState(true)
  const [savingAccount, setSavingAccount] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [checkoutState, setCheckoutState] = useState<'idle' | 'polling' | 'confirmed' | 'timeout'>('idle')
  const [accountName, setAccountName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [tab, setTab]                 = useState<SettingsTab>('account')

  // Team members state
  type TeamMember = { id: string; user_id: string; role: string; created_at: string; email: string; full_name: string | null }
  type PendingInvite = { id: string; email: string; role: string; invited_at: string; status: string }
  const [members, setMembers]               = useState<TeamMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<string>('owner')
  const [currentTenantId, setCurrentTenantId] = useState<string>('')
  const [inviteEmail, setInviteEmail]         = useState('')
  const [inviteRole, setInviteRole]           = useState('staff')
  const [isSending, setIsSending]             = useState(false)

  const isCheckoutSuccess =
    searchParams.get('tab') === 'billing' && searchParams.get('success') === 'true'

  const subStatus = useMemo(() => {
    if (!tenant) return 'inactive'
    return getEffectiveSubscriptionStatus(tenant.subscription_status, tenant.created_at)
  }, [tenant])

  const hasFullAccess = subStatus === 'active' || subStatus === 'trialing'

  // â"€â"€ URL params: tab + notice toasts â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const queryTab = params.get('tab')
    if (queryTab && TABS.includes(queryTab as SettingsTab)) {
      setTab(queryTab as SettingsTab)
    }
    const notice = params.get('notice')
    if (notice === 'checkout_canceled') toast('Checkout canceled')
    if (notice)  {
      params.delete('notice')
      router.replace(`/settings?${params.toString()}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isCheckoutSuccess) return

    let cancelled = false
    let timeoutId: number | undefined
    const startedAt = Date.now()

    const pollTenantStatus = async () => {
      if (cancelled) return

      try {
        const response = await fetch('/api/auth/tenant', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Tenant lookup failed')
        }

        const payload = (await response.json()) as {
          tenant?: {
            subscriptionStatus?: string | null
            stripeCustomerId?: string | null
            subscriptionCurrentPeriodEnd?: string | null
            subscriptionTrialEnd?: string | null
            plan?: string | null
          }
        }

        if (payload.tenant?.subscriptionStatus === 'active') {
          clearTenantCache()
          setTenant((current) =>
            current
              ? {
                  ...current,
                  subscription_status: 'active',
                  stripe_customer_id:
                    payload.tenant?.stripeCustomerId ?? current.stripe_customer_id,
                  subscription_current_period_end:
                    payload.tenant?.subscriptionCurrentPeriodEnd ??
                    current.subscription_current_period_end,
                  subscription_trial_end:
                    payload.tenant?.subscriptionTrialEnd ?? current.subscription_trial_end,
                  plan: payload.tenant?.plan ?? current.plan,
                }
              : current
          )
          setCheckoutState('confirmed')
          router.replace('/settings?tab=billing')
          return
        }
      } catch {
        // Keep polling until the webhook lands or the timeout is reached.
      }

      if (cancelled) return

      if (Date.now() - startedAt >= 30_000) {
        setCheckoutState('timeout')
        router.replace('/settings?tab=billing')
        return
      }

      timeoutId = window.setTimeout(pollTenantStatus, 2000)
    }

    setCheckoutState('polling')
    pollTenantStatus()

    return () => {
      cancelled = true
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [isCheckoutSuccess, router])

  // â"€â"€ Data load â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const supabase = createClient()

        // Use resolveTenantContext() â€" calls /api/auth/tenant which uses the
        // service-role client, bypassing any RLS that blocks direct queries.
        // This avoids the anon-client tenants query that may fail due to RLS.
        const [{ data: authData }, ctx] = await Promise.all([
          supabase.auth.getUser(),
          resolveTenantContext(),
        ])

        setCurrentUserEmail(authData.user?.email ?? '')

        // Map camelCase TenantContext to the snake_case TenantSettings shape
        const tenantRow: TenantSettings = {
          id:                             ctx.tenantId,
          name:                           ctx.tenant.name,
          business_type:                  ctx.tenant.businessType ?? null,
          owner_email:                    ctx.tenant.ownerEmail ?? null,
          plan:                           ctx.tenant.plan ?? null,
          subscription_status:            ctx.tenant.subscriptionStatus ?? null,
          stripe_customer_id:             ctx.tenant.stripeCustomerId ?? null,
          subscription_current_period_end: ctx.tenant.subscriptionCurrentPeriodEnd ?? null,
          subscription_trial_end:         ctx.tenant.subscriptionTrialEnd ?? null,
          subscription_cancel_at:         ctx.tenant.subscriptionCancelAt ?? null,
          created_at:                     ctx.tenant.createdAt,
        }

        setTenant(tenantRow)
        setAccountName(tenantRow.name)
        setBusinessType(tenantRow.business_type ?? '')
        setCurrentTenantId(ctx.tenantId)

        // Fetch team data (non-fatal if it fails)
        try {
          const [{ data: tuRow }, { data: membersData }, { data: invitesData }] = await Promise.all([
            supabase.from('tenant_users').select('role').eq('tenant_id', ctx.tenantId).eq('user_id', authData.user?.id ?? '').maybeSingle(),
            supabase.rpc('get_tenant_user_profiles', { p_tenant_id: ctx.tenantId }),
            supabase.from('tenant_invites').select('id, email, role, invited_at, status').eq('tenant_id', ctx.tenantId).eq('status', 'pending'),
          ])
          setCurrentUserRole((tuRow as { role: string } | null)?.role ?? 'owner')
          setMembers((membersData as TeamMember[] | null) ?? [])
          setPendingInvites((invitesData as PendingInvite[] | null) ?? [])
        } catch {
          // non-fatal — card will show empty state
        }

        // Usage counts â€" these are simple row counts on other tables.
        // Errors here are non-fatal; we just show 0.
        const [{ count: rc }, { count: ic }, { count: inv }, aiUsageRes] = await Promise.all([
          supabase.from('recipes').select('id', { count: 'exact', head: true }).eq('tenant_id', ctx.tenantId),
          supabase.from('ingredients').select('id', { count: 'exact', head: true }).eq('tenant_id', ctx.tenantId),
          supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('tenant_id', ctx.tenantId),
          fetch('/api/ai/usage').then((r) => r.json()).catch(() => null) as Promise<AIUsageStats | null>,
        ])

        setUsage({ recipes: rc ?? 0, ingredients: ic ?? 0, invoices: inv ?? 0 })
        if (aiUsageRes?.recipe_ideas) setAiUsage(aiUsageRes)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to load settings')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // â"€â"€ Handlers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const handleAccountSave = async () => {
    if (!tenant) return
    try {
      setSavingAccount(true)
      // Use the server-side API so the update runs with the service-role
      // client and isn't blocked by RLS.
      const res = await fetch('/api/auth/tenant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: accountName, businessType: businessType || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Unable to update account')
      }
      setTenant((t) => t ? { ...t, name: accountName, business_type: businessType || null } : t)
      toast.success('Account updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update account')
    } finally {
      setSavingAccount(false)
    }
  }

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return }
    try {
      setSavingPassword(true)
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword(''); setConfirmPassword('')
      toast.success('Password updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to change password')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleBillingAction = async (forceCheckout = false) => {
    try {
      setBillingBusy(true)
      const isManage = !forceCheckout && !!tenant?.stripe_customer_id && subStatus === 'active'
      const endpoint = isManage ? '/api/billing/portal' : '/api/billing/checkout'

      const res = await fetch(endpoint, { method: 'POST' })
      let payload: { url?: string; message?: string }
      try {
        payload = await res.json()
      } catch {
        throw new Error('Server returned an invalid response. Check the terminal logs.')
      }

      if (!res.ok) throw new Error(payload.message ?? 'Unable to open billing page')
      if (!payload.url) throw new Error('No redirect URL returned')

      window.location.assign(payload.url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open billing page')
    } finally {
      setBillingBusy(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (!showCancelConfirm) {
      setShowCancelConfirm(true)
      return
    }
    setIsCancelling(true)
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' })
      const data = await res.json() as { error?: string; cancel_at?: string }
      if (!res.ok) throw new Error(data.error)
      const cancelDate = data.cancel_at
        ? new Date(data.cancel_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })
        : ''
      toast.success(`Subscription cancelled. Access continues until ${cancelDate}.`)
      setShowCancelConfirm(false)
      setTenant((t) => t ? { ...t, subscription_cancel_at: data.cancel_at ?? null } : t)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel subscription')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleReactivate = async () => {
    setBillingBusy(true)
    try {
      const res = await fetch('/api/billing/reactivate', { method: 'POST' })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error)
      toast.success('Subscription reactivated!')
      setTenant((t) => t ? { ...t, subscription_cancel_at: null } : t)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reactivate subscription')
    } finally {
      setBillingBusy(false)
    }
  }

  // ── Team handlers ─────────────────────────────────────────────────────────

  const refetchTeam = async (tenantId?: string) => {
    const id = tenantId ?? currentTenantId
    if (!id) return
    const supabase = createClient()
    const [{ data: membersData }, { data: invitesData }] = await Promise.all([
      supabase.rpc('get_tenant_user_profiles', { p_tenant_id: id }),
      supabase.from('tenant_invites').select('id, email, role, invited_at, status').eq('tenant_id', id).eq('status', 'pending'),
    ])
    setMembers((membersData as TeamMember[] | null) ?? [])
    setPendingInvites((invitesData as PendingInvite[] | null) ?? [])
  }

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return
    setIsSending(true)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, tenantId: currentTenantId }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to send invite')
      toast.success(`Invite sent to ${inviteEmail.trim()}`)
      setInviteEmail('')
      refetchTeam()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setIsSending(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm('Remove this team member?')) return
    const supabase = createClient()
    await supabase.from('tenant_users').delete().eq('tenant_id', currentTenantId).eq('user_id', userId)
    toast.success('Member removed')
    refetchTeam()
  }

  const handleCancelInvite = async (inviteId: string) => {
    const supabase = createClient()
    await supabase.from('tenant_invites').update({ status: 'expired' }).eq('id', inviteId)
    refetchTeam()
  }

  // â"€â"€ Loading skeleton â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-56 animate-pulse rounded-full bg-slate-100" />
        <div className="h-12 w-48 animate-pulse rounded-full bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
          <Shield className="h-3.5 w-3.5" />
          Settings
        </div>
        <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-2 text-sm text-slate-500">Manage your account and subscription.</p>
      </div>

      <Tabs.Root
        value={tab}
        onValueChange={(v) => {
          const next = v as SettingsTab
          setTab(next)
          router.replace(`/settings?tab=${next}`)
        }}
      >
        <Tabs.List className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          <Tabs.Trigger
            value="account"
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            Account
          </Tabs.Trigger>
          <Tabs.Trigger
            value="billing"
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            Billing
          </Tabs.Trigger>
        </Tabs.List>

        {/* â"€â"€ Account tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        <Tabs.Content value="account" className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]" id="account-grid">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Business Details</h2>
                  <p className="text-sm text-slate-500">Update your workspace information.</p>
                </div>
              </div>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Business name</span>
                  <input
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Business type</span>
                  <input
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    placeholder="restaurant, cafe, bakeryâ€¦"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Owner email</span>
                  <input
                    value={currentUserEmail || tenant?.owner_email || ''}
                    readOnly
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 outline-none"
                  />
                </label>
                <button
                  onClick={handleAccountSave}
                  disabled={savingAccount}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                >
                  {savingAccount && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
                  <p className="text-sm text-slate-500">Set a new password for your account.</p>
                </div>
              </div>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">New password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Confirm password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>
                <button
                  onClick={handlePasswordChange}
                  disabled={savingPassword}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update Password
                </button>
              </div>
            </section>
          </div>

          {/* Team Members card */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Team Members</h2>
                  <p className="text-sm text-slate-500">Invite your team to access the workspace.</p>
                </div>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                {members.length} member{members.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Current members */}
            <div className="mb-5 space-y-2">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                      <span className="text-xs font-semibold text-emerald-700">
                        {(member.full_name ?? member.email ?? '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{member.full_name ?? member.email}</p>
                      {member.full_name && <p className="text-xs text-gray-400">{member.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      member.role === 'owner' ? 'bg-emerald-100 text-emerald-700'
                        : member.role === 'manager' ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    )}>
                      {member.role}
                    </span>
                    {member.role !== 'owner' && currentUserRole === 'owner' && (
                      <button
                        onClick={() => handleRemoveMember(member.user_id)}
                        className="p-1 text-gray-300 transition-colors hover:text-red-400"
                        title="Remove member"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pending invites */}
            {pendingInvites.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Pending invites</p>
                <div className="space-y-2">
                  {pendingInvites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between rounded-xl border border-dashed border-gray-200 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
                          <Mail className="h-3.5 w-3.5 text-gray-400" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">{invite.email}</p>
                          <p className="text-xs text-gray-400">
                            Invited {format(new Date(invite.invited_at), 'MMM d, yyyy')} · {invite.role}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
                          Pending
                        </span>
                        <button
                          onClick={() => { setInviteEmail(invite.email); setInviteRole(invite.role); handleSendInvite() }}
                          className="p-1 text-gray-300 transition-colors hover:text-emerald-500"
                          title="Resend invite"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleCancelInvite(invite.id)}
                          className="p-1 text-gray-300 transition-colors hover:text-red-400"
                          title="Cancel invite"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 pt-5">
              {currentUserRole === 'owner' ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">Invite a team member</p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendInvite()}
                      placeholder="colleague@restaurant.com"
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                    />
                    <CustomSelect
                      value={inviteRole}
                      onChange={setInviteRole}
                      className="w-36"
                      options={[
                        { value: 'manager', label: 'Manager', description: 'Edit recipes, view costs' },
                        { value: 'staff', label: 'Chef / Staff', description: 'View recipes only' },
                      ]}
                    />
                    <button
                      onClick={handleSendInvite}
                      disabled={!inviteEmail.trim() || isSending}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Send className="h-4 w-4" />}
                      Send Invite
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-blue-50 p-2.5">
                      <p className="mb-1 text-xs font-semibold text-blue-700">Manager</p>
                      <p className="text-xs text-blue-600">Can create and edit recipes, view ingredient costs. Cannot access billing.</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-2.5">
                      <p className="mb-1 text-xs font-semibold text-gray-600">Chef / Staff</p>
                      <p className="text-xs text-gray-500">Can view recipes and ingredients. No access to costs, prices, or settings.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="py-2 text-center text-sm text-slate-400">Only the workspace owner can invite team members.</p>
              )}
            </div>
          </section>
        </Tabs.Content>

        {/* â"€â"€ Billing tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <Tabs.Content value="billing" className="mt-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {checkoutState !== 'idle' && (
            <div
              className={cn(
                'rounded-2xl border px-4 py-3 text-sm',
                checkoutState === 'confirmed'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : checkoutState === 'timeout'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
              )}
            >
              {checkoutState === 'polling'
                ? 'Processing your subscription...'
                : checkoutState === 'confirmed'
                  ? 'Subscription active!'
                  : 'Processing is taking longer than expected. Please refresh in a moment.'}
            </div>
          )}

            {/* Trialing banner */}
            {tenant && subStatus === 'trialing' && (
              <TrialingCard tenant={tenant} onSubscribe={() => handleBillingAction(true)} busy={billingBusy} />
            )}

            {/* Cancellation scheduled banner */}
            {tenant?.subscription_cancel_at && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Subscription cancellation scheduled</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Your access continues until{' '}
                    <strong>
                      {new Date(tenant.subscription_cancel_at).toLocaleDateString('en-IE', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </strong>
                    . After that, your account will switch to the free plan.
                  </p>
                  <button
                    onClick={handleReactivate}
                    disabled={billingBusy}
                    className="text-xs text-emerald-600 font-medium mt-1 hover:underline disabled:opacity-50"
                  >
                    Reactivate subscription →
                  </button>
                </div>
              </div>
            )}

            {/* Plan comparison */}
            <div className="grid grid-cols-2 gap-4">

              {/* FREE card */}
              <div className="border border-gray-200 rounded-2xl p-6 bg-gray-50">
                <div className="mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Free</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-bold text-gray-800">€0</span>
                    <span className="text-gray-400 text-sm">/month</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">After your trial ends</p>
                </div>
                <ul className="space-y-2.5">
                  {[
                    { text: '5 recipes maximum',       ok: false },
                    { text: '20 ingredients',          ok: true  },
                    { text: 'Basic recipe costing',    ok: true  },
                    { text: 'Supplier tracking',       ok: true  },
                    { text: 'Invoice import',          ok: false },
                    { text: 'Yield factor calculator', ok: false },
                    { text: 'Batch costing',           ok: false },
                    { text: 'Label printing',          ok: false },
                    { text: 'AI insights & reports',   ok: false },
                    { text: 'PDF export',              ok: false },
                    { text: 'Team members',            ok: false },
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2.5">
                      {item.ok
                        ? <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        : <X className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                      <span className={cn('text-sm', item.ok ? 'text-gray-700' : 'text-gray-400')}>
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* PRO card */}
              <div className="border-2 border-emerald-400 rounded-2xl p-6 bg-white relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className={cn(
                    'text-xs font-semibold px-3 py-1 rounded-full',
                    subStatus === 'active'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-emerald-100 text-emerald-700'
                  )}>
                    {subStatus === 'active' ? '✓ Your current plan' : 'Recommended'}
                  </span>
                </div>

                <div className="mb-4 mt-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Pro</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-bold text-gray-900">€25</span>
                    <span className="text-gray-400 text-sm">/month</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Complete recipe costing, label printing &amp; AI insights</p>
                </div>

                <ul className="space-y-2.5 mb-6">
                  {[
                    'Unlimited recipes',
                    'Unlimited ingredients',
                    'Invoice import (PDF & CSV) with AI extraction',
                    'Full recipe costing with batch support',
                    'Yield factor calculator (USDA reference)',
                    'VAT calculator + waste & overhead tracking',
                    'Product label printing (Brother, Dymo, A4)',
                    'EU allergen compliance (Reg. 1169/2011)',
                    'AI-powered business insights',
                    'Reports & analytics dashboard',
                    'PDF export — kitchen card & cost report',
                    '50 AI recipe ideas / month',
                    'Team members (up to 5)',
                    'Priority support',
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>

                {subStatus === 'trialing' && (
                  <button
                    onClick={() => handleBillingAction(true)}
                    disabled={billingBusy}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    {billingBusy ? 'Redirecting…' : 'Subscribe — €25/month'}
                  </button>
                )}

                {subStatus === 'active' && !tenant?.subscription_cancel_at && (
                  <>
                    {showCancelConfirm ? (
                      <div className="border border-red-200 rounded-xl p-4 bg-red-50">
                        <p className="text-sm font-medium text-red-700 mb-1">Cancel your subscription?</p>
                        <p className="text-xs text-red-500 mb-3">
                          You&apos;ll keep full access until the end of your current billing period. No refunds for partial months.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowCancelConfirm(false)}
                            className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50"
                          >
                            Keep subscription
                          </button>
                          <button
                            onClick={handleCancelSubscription}
                            disabled={isCancelling}
                            className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                          >
                            {isCancelling ? 'Cancelling...' : 'Yes, cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={handleCancelSubscription}
                          className="w-full border border-red-200 text-red-500 hover:bg-red-50 py-3 rounded-xl font-medium text-sm transition-colors"
                        >
                          Cancel subscription
                        </button>
                        <p className="text-xs text-gray-400 text-center mt-2">
                          Access continues until end of billing period
                        </p>
                      </>
                    )}
                  </>
                )}

                {subStatus === 'active' && tenant?.subscription_cancel_at && (
                  <button
                    onClick={handleReactivate}
                    disabled={billingBusy}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    {billingBusy ? 'Reactivating…' : 'Reactivate subscription'}
                  </button>
                )}

                {subStatus === 'past_due' && (
                  <button
                    onClick={() => handleBillingAction(false)}
                    disabled={billingBusy}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    {billingBusy ? 'Redirecting…' : 'Update payment method'}
                  </button>
                )}

                {(subStatus === 'canceled' || subStatus === 'inactive') && (
                  <button
                    onClick={() => handleBillingAction(true)}
                    disabled={billingBusy}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    {billingBusy ? 'Redirecting…' : 'Reactivate — €25/month'}
                  </button>
                )}
              </div>
            </div>

            {/* Section 3 â€" Usage stats */}
            <section>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-400">
                Your Usage
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <UsageStat
                  label="Recipes"
                  value={usage.recipes}
                  max={hasFullAccess ? undefined : FREE_LIMITS.maxRecipes}
                  icon={TrendingUp}
                />
                <UsageStat label="Ingredients" value={usage.ingredients} icon={Package} />
                <UsageStat label="Invoices" value={usage.invoices} icon={Receipt} />
              </div>
              {aiUsage && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <UsageStat
                    label="AI Recipe Ideas (this month)"
                    value={aiUsage.recipe_ideas.used}
                    max={aiUsage.recipe_ideas.limit ?? undefined}
                    icon={Sparkles}
                  />
                  <UsageStat
                    label="AI Invoice Extractions (this month)"
                    value={aiUsage.invoice_extracts.used}
                    max={aiUsage.invoice_extracts.limit ?? undefined}
                    icon={Receipt}
                  />
                </div>
              )}
            </section>

            {/* Section 4 â€" Billing history placeholder */}
            <section>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-400">
                Billing History
              </h3>
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
                <CreditCard className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">
                  Billing history will appear here once you subscribe
                </p>
              </div>
            </section>

          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}

