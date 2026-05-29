'use client'

import { useEffect, useMemo, useState, type ComponentType } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import {
  Building2,
  CheckCircle2,
  CreditCard,
  AlertTriangle,
  KeyRound,
  Loader2,
  Package,
  Receipt,
  Shield,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { clearTenantCache, resolveTenantContext } from '@/hooks/useTenant'
import { TRIAL_PERIOD_DAYS, getEffectiveSubscriptionStatus } from '@/lib/tenant'
import { FREE_LIMITS, PRO_LIMITS } from '@/lib/subscription/limits'
import { cn } from '@/lib/utils'

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
  if (!value) return 'â€”'
  return new Intl.DateTimeFormat('en-IE', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(value))
}

// â”€â”€ Subscription status card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

function ActiveCard({
  tenant,
  onManage,
  busy,
}: {
  tenant: TenantSettings
  onManage: () => void
  busy: boolean
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Active
          </div>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">ZRecipe Pro â€” Active</h2>
          <p className="mt-1 text-sm text-slate-500">
            {tenant.subscription_current_period_end
              ? `Next billing date: ${fmt(tenant.subscription_current_period_end)}`
              : 'Your subscription is active and all features are unlocked.'}
          </p>
        </div>
        <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-500" />
      </div>
      <button
        onClick={onManage}
        disabled={busy}
        className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Manage Subscription
      </button>
    </div>
  )
}

function InactiveCard({
  status,
  onReactivate,
  busy,
}: {
  status: string
  onReactivate: () => void
  busy: boolean
}) {
  const isPastDue = status === 'past_due'
  return (
    <div className={cn(
      'overflow-hidden rounded-2xl border p-6 shadow-sm',
      isPastDue
        ? 'border-amber-200 bg-amber-50'
        : 'border-red-200 bg-red-50'
    )}>
      <div className="flex items-start justify-between">
        <div>
          <div className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider',
            isPastDue ? 'bg-amber-600 text-white' : 'bg-red-600 text-white'
          )}>
            <X className="h-3.5 w-3.5" />
            {isPastDue ? 'Payment Failed' : 'Subscription Ended'}
          </div>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">
            {isPastDue ? 'Your payment failed' : 'Your subscription has ended'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isPastDue
              ? 'Update your payment method to restore full access.'
              : 'Reactivate your plan to unlock all features again.'}
          </p>
        </div>
      </div>
      <button
        onClick={onReactivate}
        disabled={busy}
        className={cn(
          'mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60',
          isPastDue ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isPastDue ? 'Update Payment Method' : 'Reactivate Subscription'}
      </button>
    </div>
  )
}

// â”€â”€ Plan comparison â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FREE_FEATURES = [
  { text: `${FREE_LIMITS.maxRecipes} recipes maximum`, included: false },
  { text: 'No invoice import', included: false },
  { text: 'Cannot delete recipes', included: false },
  { text: `${FREE_LIMITS.aiRecipeIdeasPerMonth} AI recipe ideas / month`, included: false },
  { text: `${FREE_LIMITS.aiInvoiceExtractsPerMonth} AI invoice extractions / month`, included: false },
  { text: 'No PDF export with costs', included: false },
  { text: 'Basic recipe costing', included: true },
  { text: 'Ingredient management', included: true },
  { text: 'Supplier tracking', included: true },
]

const PRO_FEATURES = [
  { text: 'Unlimited recipes', included: true },
  { text: 'Invoice import (PDF, CSV) with AI extraction', included: true },
  { text: 'Full recipe management (create, edit, delete)', included: true },
  { text: `${PRO_LIMITS.aiRecipeIdeasPerMonth} AI recipe ideas / month`, included: true },
  { text: 'Unlimited AI invoice extractions', included: true },
  { text: 'PDF export (full report & kitchen card)', included: true },
  { text: 'Price history tracking', included: true },
  { text: 'Sub-recipe support', included: true },
  { text: 'Priority support', included: true },
]

function FeatureRow({
  text,
  included,
  variant,
}: {
  text: string
  included: boolean
  variant: 'current-free' | 'trial-free' | 'pro'
}) {
  const warningOnly = variant === 'trial-free' && !included

  return (
    <li className="flex items-center gap-2.5 py-2 text-sm">
      {included ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
      ) : warningOnly ? (
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
      ) : (
        <X className="h-4 w-4 shrink-0 text-slate-300" />
      )}
      <span
        className={
          included
            ? 'text-slate-700'
            : warningOnly
              ? 'text-slate-600'
              : 'text-slate-400 line-through'
        }
      >
        {text}
      </span>
    </li>
  )
}

function PlanComparison({
  onUpgrade,
  busy,
  isTrial,
}: {
  onUpgrade: () => void
  busy: boolean
  isTrial: boolean
}) {
  const freeTitle = isTrial ? 'After trial ends' : 'Your current plan'
  const freeLabel = isTrial ? "What you'll lose when trial ends" : 'Free plan'
  const freeCardClass = isTrial
    ? 'border-amber-200 bg-amber-50/70'
    : 'border-emerald-200 bg-emerald-50'
  const proCardClass = isTrial
    ? 'border-emerald-500 bg-white shadow-md shadow-emerald-100'
    : 'border-slate-200 bg-slate-50'
  const proBadge = isTrial ? 'Your current plan' : 'Recommended'
  const ctaLabel = isTrial ? 'Subscribe to keep Pro access' : 'Upgrade to Pro'

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className={cn('rounded-2xl p-5 shadow-sm', freeCardClass)}>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {freeLabel}
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
          {isTrial ? (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          )}
          {freeTitle}
        </div>
        <p className={cn('mt-2 text-2xl font-bold', isTrial ? 'text-slate-700' : 'text-emerald-700')}>
          €0
        </p>
        <p className="text-sm text-slate-500">/month</p>
        {isTrial && (
          <p className="mt-3 text-xs font-medium uppercase tracking-widest text-amber-700">
            What you&apos;ll lose when trial ends
          </p>
        )}
        <ul className="mt-4 divide-y divide-slate-200">
          {FREE_FEATURES.map((f) => (
            <FeatureRow
              key={f.text}
              {...f}
              variant={isTrial ? 'trial-free' : 'current-free'}
            />
          ))}
        </ul>
      </div>

      <div className={cn('rounded-2xl border-2 p-5', proCardClass)}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Pro</p>
          <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
            {proBadge}
          </span>
        </div>
        <p className="mt-1 text-2xl font-bold text-slate-900">€25</p>
        <p className="text-sm text-slate-500">/month</p>
        <ul className="mt-4 divide-y divide-slate-100">
          {PRO_FEATURES.map((f) => (
            <FeatureRow key={f.text} {...f} variant="pro" />
          ))}
        </ul>
        <button
          onClick={onUpgrade}
          disabled={busy}
          className="mt-5 w-full rounded-full bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          {busy ? 'Redirecting…' : ctaLabel}
        </button>
      </div>
    </div>
  )
}
// â”€â”€ Usage stat card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
            <p className="mt-1 text-xs text-red-600 font-medium">Limit reached â€” upgrade to add more</p>
          )}
        </div>
      )}
    </div>
  )
}

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const [checkoutState, setCheckoutState] = useState<'idle' | 'polling' | 'confirmed' | 'timeout'>('idle')
  const [accountName, setAccountName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [tab, setTab]                 = useState<SettingsTab>('account')

  const isCheckoutSuccess =
    searchParams.get('tab') === 'billing' && searchParams.get('success') === 'true'

  const subStatus = useMemo(() => {
    if (!tenant) return 'inactive'
    return getEffectiveSubscriptionStatus(tenant.subscription_status, tenant.created_at)
  }, [tenant])

  const isTrial = subStatus === 'trialing'
  const hasFullAccess = subStatus === 'active' || subStatus === 'trialing'

  // â”€â”€ URL params: tab + notice toasts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Data load â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const supabase = createClient()

        // Use resolveTenantContext() â€” calls /api/auth/tenant which uses the
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
          created_at:                     ctx.tenant.createdAt,
        }

        setTenant(tenantRow)
        setAccountName(tenantRow.name)
        setBusinessType(tenantRow.business_type ?? '')

        // Usage counts â€” these are simple row counts on other tables.
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

  // â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Loading skeleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        {/* â”€â”€ Account tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <Tabs.Content value="account" className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
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
        </Tabs.Content>

        {/* â”€â”€ Billing tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

            {/* Section 1 â€” Subscription status */}
            {tenant && (
              <>
                {subStatus === 'trialing' && (
                  <TrialingCard tenant={tenant} onSubscribe={() => handleBillingAction(true)} busy={billingBusy} />
                )}
                {subStatus === 'active' && (
                  <ActiveCard tenant={tenant} onManage={() => handleBillingAction()} busy={billingBusy} />
                )}
                {(subStatus === 'canceled' || subStatus === 'past_due' || subStatus === 'inactive') && (
                  <InactiveCard status={subStatus} onReactivate={() => handleBillingAction(true)} busy={billingBusy} />
                )}
              </>
            )}

            {/* Section 2 â€” Plan comparison (only for non-active) */}
            {subStatus !== 'active' && (
              <section>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-400">
                  Compare Plans
                </h3>
                <PlanComparison
                  onUpgrade={() => handleBillingAction(true)}
                  busy={billingBusy}
                  isTrial={isTrial}
                />
              </section>
            )}

            {/* Section 3 â€” Usage stats */}
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

            {/* Section 4 â€” Billing history placeholder */}
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

