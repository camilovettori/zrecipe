import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import StatsCards from '@/components/dashboard/StatsCards'
import AIUsageCard from '@/components/dashboard/AIUsageCard'
import PriceAlerts from '@/components/dashboard/PriceAlerts'
import TrialBanner from '@/components/dashboard/TrialBanner'
import RecentActivity from '@/components/dashboard/RecentActivity'
import Link from 'next/link'
import { ChefHat, Upload, Plus, ArrowRight } from 'lucide-react'
import type { DashboardStats } from '@/components/dashboard/StatsCards'
import type { TrialInfo } from '@/components/dashboard/TrialBanner'
import { TRIAL_PERIOD_DAYS, getEffectiveSubscriptionStatus } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

// ── Data fetchers ────────────────────────────────────────────────────────────

async function getDisplayName() {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    const user = data.user
    if (!user) return 'Chef'
    return (
      (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ??
      user.email?.split('@')[0] ??
      'Chef'
    )
  } catch {
    return 'Chef'
  }
}

type TenantRow = {
  tenant_id: string
  tenants: {
    subscription_status: string | null
    created_at: string
  } | null
}

type PageContext = {
  tenantId: string | null
  stats: DashboardStats
  trialInfo: TrialInfo | null
}

async function getPageContext(): Promise<PageContext> {
  const fallback: DashboardStats = {
    totalRecipes: '--', totalIngredients: '--',
    invoicesThisMonth: '--', avgMargin: '--',
  }

  try {
    const supabase = createClient()
    const admin = createAdminClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { tenantId: null, stats: fallback, trialInfo: null }

    const { data: memberRow } = await admin
      .from('tenant_users')
      .select('tenant_id, tenants(subscription_status, created_at)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle() as { data: TenantRow | null }

    const tenantId = memberRow?.tenant_id ?? null
    if (!tenantId) return { tenantId: null, stats: fallback, trialInfo: null }

    const tenantMeta = memberRow?.tenants
    let trialInfo: TrialInfo | null = null
    if (tenantMeta) {
      const subStatus = getEffectiveSubscriptionStatus(
        tenantMeta.subscription_status,
        tenantMeta.created_at
      )
      if (subStatus !== 'active') {
        const trialEndMs = new Date(tenantMeta.created_at).getTime() + TRIAL_PERIOD_DAYS * 86_400_000
        const daysLeft = Math.max(0, Math.ceil((trialEndMs - Date.now()) / 86_400_000))
        trialInfo = { subscriptionStatus: subStatus as TrialInfo['subscriptionStatus'], daysLeft, daysTotal: TRIAL_PERIOD_DAYS }
      }
    }

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

    const [recipesRes, ingredientsRes, invoicesRes, marginsRes] = await Promise.all([
      admin.from('recipes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      admin.from('ingredients').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      admin.from('invoices').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', startOfMonth),
      admin.from('recipes').select('margin').eq('tenant_id', tenantId).not('margin', 'is', null),
    ])

    const marginValues = ((marginsRes.data ?? []) as Array<{ margin: number | string | null }>)
      .map((r) => Number(r.margin))
      .filter((v) => Number.isFinite(v))
    const avgMargin = marginValues.length === 0
      ? 'N/A'
      : `${(marginValues.reduce((s, v) => s + v, 0) / marginValues.length).toFixed(1)}%`

    return {
      tenantId,
      trialInfo,
      stats: {
        totalRecipes:     String(recipesRes.count ?? 0),
        totalIngredients: String(ingredientsRes.count ?? 0),
        invoicesThisMonth: String(invoicesRes.count ?? 0),
        avgMargin,
      },
    }
  } catch {
    return { tenantId: null, stats: fallback, trialInfo: null }
  }
}

// ── Components ────────────────────────────────────────────────────────────────

function QuickActions() {
  const actions = [
    {
      href:        '/invoices',
      icon:        Upload,
      iconBg:      'bg-blue-100 dark:bg-blue-900/30',
      iconColor:   'text-blue-600 dark:text-blue-400',
      title:       'Import Invoice',
      description: 'Upload a PDF or CSV to track ingredient costs',
    },
    {
      href:        '/ingredients/new',
      icon:        Plus,
      iconBg:      'bg-amber-100 dark:bg-amber-900/30',
      iconColor:   'text-amber-600 dark:text-amber-400',
      title:       'Add Ingredient',
      description: 'Catalogue a new ingredient and set its price',
    },
    {
      href:        '/recipes/new',
      icon:        ChefHat,
      iconBg:      'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor:   'text-emerald-600 dark:text-emerald-400',
      title:       'Create Recipe',
      description: 'Build a recipe and calculate its food cost',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {actions.map(({ href, icon: Icon, iconBg, iconColor, title, description }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-slate-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
        >
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900 transition-colors group-hover:text-emerald-600 dark:text-white">
              {title}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
          </div>
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-emerald-500 dark:text-slate-600" />
        </Link>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const [displayName, { tenantId, stats, trialInfo }] = await Promise.all([
    getDisplayName(),
    getPageContext(),
  ])

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Welcome back, {displayName}
        </h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Here&apos;s what&apos;s happening in your kitchen today.
        </p>
      </div>

      {/* Trial banner — hidden for active subscribers */}
      {trialInfo && <TrialBanner info={trialInfo} />}

      {/* Quick actions */}
      <QuickActions />

      {/* Stats */}
      <StatsCards stats={stats} />
      <AIUsageCard />

      {/* Price alerts — shown only when price changes exist */}
      <PriceAlerts />

      {/* Recent activity */}
      <RecentActivity tenantId={tenantId} />
    </div>
  )
}
