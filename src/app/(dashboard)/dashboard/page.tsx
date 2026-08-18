import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import StatsCards from '@/components/dashboard/StatsCards'
import AIUsageCard from '@/components/dashboard/AIUsageCard'
import PriceAlerts from '@/components/dashboard/PriceAlerts'
import TrialBanner from '@/components/dashboard/TrialBanner'
import RecentActivity from '@/components/dashboard/RecentActivity'
import Link from 'next/link'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import type { DashboardStats } from '@/components/dashboard/StatsCards'
import type { TrialInfo } from '@/components/dashboard/TrialBanner'
import { TRIAL_PERIOD_DAYS, getEffectiveSubscriptionStatus } from '@/lib/tenant'
import { calculateCost, type CostIngredientInput } from '@/lib/utils/cost-calculator'
import { resolveIngredientPrice, type PriceHistoryEntry } from '@/lib/ingredients/resolveIngredientPrice'

export const dynamic = 'force-dynamic'

// ── Data fetchers ────────────────────────────────────────────────────────────

async function getDisplayName() {
  try {
    const supabase = await createClient()
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

type NeedsAttentionExample = { id: string; name: string }
type NeedsAttentionState = {
  recipesWithoutPrice: { count: number; examples: NeedsAttentionExample[] }
  ingredientsWithoutPrice: { count: number; examples: NeedsAttentionExample[] }
  unlinkedInvoiceItems: number
}

type PageContext = {
  tenantId: string | null
  stats: DashboardStats
  trialInfo: TrialInfo | null
  attention: NeedsAttentionState | null
}

// ── Avg margin ───────────────────────────────────────────────────────────────
// recipes has no stored total_cost/margin column — cost is always derived
// live from ingredient prices via the shared costing engine (see
// src/lib/utils/cost-calculator.ts), the same one the recipe detail page and
// src/lib/recipes/subRecipeCost.ts use. Sub-recipe lines are priced from
// their stored sub_ingredient_cost_per_unit snapshot rather than a live
// recursive recompute, matching subRecipeCost.ts's own one-level-deep
// convention — going further would require unbounded query nesting.

type MarginIngredientRel = { current_price: number | null; price_unit: string | null; price_history: PriceHistoryEntry[] | null }
type MarginSubRecipeRel = { sub_ingredient_cost_per_unit: number | null; sub_ingredient_unit: string | null }
type MarginIngredientRow = {
  id: string
  quantity: number
  unit: string
  yield_percent: number | null
  ingredient: MarginIngredientRel | MarginIngredientRel[] | null
  sub_recipe: MarginSubRecipeRel | MarginSubRecipeRel[] | null
}
type MarginRecipeRow = {
  id: string
  selling_price: number | null
  labor_enabled: boolean | null
  labor_cost: number | null
  labor_mode: string | null
  labor_hourly_rate: number | null
  prep_time_minutes: number | null
  overhead_enabled: boolean | null
  overhead_cost: number | null
  overhead_mode: string | null
  overhead_percent: number | null
  waste_percent: number | null
  yield_quantity: number | null
  yield_unit: string | null
  recipe_ingredients: MarginIngredientRow[] | MarginIngredientRow | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function recipeMargin(row: MarginRecipeRow): { margin: number; incomplete: boolean } | null {
  const sellingPrice = Number(row.selling_price ?? 0)
  if (!(sellingPrice > 0)) return null

  const lines = Array.isArray(row.recipe_ingredients)
    ? row.recipe_ingredients
    : row.recipe_ingredients
      ? [row.recipe_ingredients]
      : []

  const lineInputs: CostIngredientInput[] = lines.map((line) => {
    const ing = one(line.ingredient)
    const sub = one(line.sub_recipe)
    const resolved = ing
      ? resolveIngredientPrice(ing.price_history ?? [], ing.current_price ?? null, ing.price_unit ?? null)
      : null
    const currentPrice = resolved?.price ?? sub?.sub_ingredient_cost_per_unit ?? null
    const priceUnit = resolved?.unit ?? sub?.sub_ingredient_unit ?? line.unit
    return {
      id: line.id,
      quantity: Number(line.quantity),
      unit: line.unit,
      yield_percent: line.yield_percent != null ? Number(line.yield_percent) : 100,
      current_price: currentPrice,
      price_unit: priceUnit,
    }
  })

  const costs = calculateCost({
    ingredients: lineInputs,
    laborEnabled: row.labor_enabled ?? false,
    laborMode: row.labor_mode === 'time' ? 'time' : 'fixed',
    laborCostFixed: Number(row.labor_cost ?? 0),
    prepTimeMinutes: Number(row.prep_time_minutes ?? 0),
    laborHourlyRate: Number(row.labor_hourly_rate ?? 0),
    overheadEnabled: row.overhead_enabled ?? false,
    overheadMode: row.overhead_mode === 'percent' ? 'percent' : 'fixed',
    overheadCostFixed: Number(row.overhead_cost ?? 0),
    overheadPercent: Number(row.overhead_percent ?? 0),
    wastePercent: Number(row.waste_percent ?? 0),
    sellingPrice,
    yieldQty: row.yield_quantity ?? 1,
    yieldUnit: row.yield_unit ?? 'unit',
  })

  return { margin: costs.margin, incomplete: costs.incompleteCost }
}

async function getAvgMargin(tenantId: string): Promise<{ included: number; avg: number | null }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('recipes')
    .select(`
      id, selling_price,
      labor_enabled, labor_cost, labor_mode, labor_hourly_rate, prep_time_minutes,
      overhead_enabled, overhead_cost, overhead_mode, overhead_percent,
      waste_percent, yield_quantity, yield_unit,
      recipe_ingredients!recipe_ingredients_recipe_id_fkey (
        id, quantity, unit, yield_percent,
        ingredient:ingredients ( current_price, price_unit, price_history:ingredient_price_history ( id, price, unit, is_selected_price, recorded_at ) ),
        sub_recipe:recipes!sub_recipe_id ( sub_ingredient_cost_per_unit, sub_ingredient_unit )
      )
    `)
    .eq('tenant_id', tenantId)
    .gt('selling_price', 0)

  const margins = ((data ?? []) as unknown as MarginRecipeRow[])
    .map(recipeMargin)
    .filter((r): r is { margin: number; incomplete: boolean } => r !== null && !r.incomplete)
    .map((r) => r.margin)

  return {
    included: margins.length,
    avg: margins.length === 0 ? null : margins.reduce((s, v) => s + v, 0) / margins.length,
  }
}

// ── Needs attention ──────────────────────────────────────────────────────────

async function getNeedsAttention(tenantId: string): Promise<NeedsAttentionState> {
  const admin = createAdminClient()
  const [recipesWithoutPrice, ingredientsWithoutPrice, invoicesUnlinked] = await Promise.all([
    admin.from('recipes')
      .select('id, name', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .or('selling_price.is.null,selling_price.eq.0')
      .limit(3),
    admin.from('ingredients')
      .select('id, name', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .or('current_price.is.null,current_price.eq.0')
      .limit(3),
    admin.from('invoice_items')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('ingredient_id', null),
  ])

  return {
    recipesWithoutPrice: {
      count: recipesWithoutPrice.count ?? 0,
      examples: (recipesWithoutPrice.data ?? []) as NeedsAttentionExample[],
    },
    ingredientsWithoutPrice: {
      count: ingredientsWithoutPrice.count ?? 0,
      examples: (ingredientsWithoutPrice.data ?? []) as NeedsAttentionExample[],
    },
    unlinkedInvoiceItems: invoicesUnlinked.count ?? 0,
  }
}

async function getPageContext(): Promise<PageContext> {
  const fallback: DashboardStats = {
    totalRecipes: '--', totalIngredients: '--',
    invoicesThisMonth: '--', avgMargin: '--',
    avgMarginBasis: { included: 0, total: 0 }, monthlySpend: '--',
  }

  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { tenantId: null, stats: fallback, trialInfo: null, attention: null }

    const { data: memberRow } = await admin
      .from('tenant_users')
      .select('tenant_id, tenants(subscription_status, created_at)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle() as { data: TenantRow | null }

    const tenantId = memberRow?.tenant_id ?? null
    if (!tenantId) return { tenantId: null, stats: fallback, trialInfo: null, attention: null }

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

    const [recipesRes, ingredientsRes, invoicesRes, monthlyInvoicesRes, marginResult, attention] = await Promise.all([
      admin.from('recipes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      admin.from('ingredients').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      admin.from('invoices').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', startOfMonth),
      admin.from('invoices').select('total_amount').eq('tenant_id', tenantId).gte('created_at', startOfMonth),
      getAvgMargin(tenantId),
      getNeedsAttention(tenantId),
    ])

    const monthlySpendTotal = ((monthlyInvoicesRes.data ?? []) as Array<{ total_amount: number | null }>)
      .reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0)

    const totalRecipes = recipesRes.count ?? 0
    const avgMargin = marginResult.avg === null ? 'N/A' : `${marginResult.avg.toFixed(1)}%`

    return {
      tenantId,
      trialInfo,
      attention,
      stats: {
        totalRecipes:     String(totalRecipes),
        totalIngredients: String(ingredientsRes.count ?? 0),
        invoicesThisMonth: String(invoicesRes.count ?? 0),
        avgMargin,
        avgMarginBasis: { included: marginResult.included, total: totalRecipes },
        monthlySpend: `€${monthlySpendTotal.toFixed(2)}`,
      },
    }
  } catch {
    return { tenantId: null, stats: fallback, trialInfo: null, attention: null }
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

function NeedsAttention({ attention }: { attention: NeedsAttentionState }) {
  const issues = [
    attention.recipesWithoutPrice.count > 0 && (
      <div
        key="recipes"
        className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-900/10"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {attention.recipesWithoutPrice.count} recipe{attention.recipesWithoutPrice.count !== 1 ? 's' : ''} have no selling price
          </p>
          <p className="truncate text-xs text-amber-600 dark:text-amber-400/80">
            {attention.recipesWithoutPrice.examples.map((r) => r.name).join(', ')}
            {attention.recipesWithoutPrice.count > 3 ? ` +${attention.recipesWithoutPrice.count - 3} more` : ''}
          </p>
        </div>
        <Link href="/recipes" className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300">
          Fix →
        </Link>
      </div>
    ),
    attention.ingredientsWithoutPrice.count > 0 && (
      <div
        key="ingredients"
        className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-900/10"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {attention.ingredientsWithoutPrice.count} ingredient{attention.ingredientsWithoutPrice.count !== 1 ? 's' : ''} have no price
          </p>
          <p className="truncate text-xs text-amber-600 dark:text-amber-400/80">
            {attention.ingredientsWithoutPrice.examples.map((i) => i.name).join(', ')}
            {attention.ingredientsWithoutPrice.count > 3 ? ` +${attention.ingredientsWithoutPrice.count - 3} more` : ''}
          </p>
        </div>
        <Link href="/ingredients" className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300">
          Fix →
        </Link>
      </div>
    ),
    attention.unlinkedInvoiceItems > 0 && (
      <div
        key="invoice-items"
        className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-900/10"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {attention.unlinkedInvoiceItems} invoice line{attention.unlinkedInvoiceItems !== 1 ? 's' : ''} not linked to an ingredient
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400/80">Needs review before it can affect recipe costs</p>
        </div>
        <Link href="/invoices" className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300">
          Fix →
        </Link>
      </div>
    ),
  ].filter(Boolean)

  if (issues.length === 0) {
    return (
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Needs Attention</h2>
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900/40 dark:bg-emerald-900/10">
          <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Everything looks good!</p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Needs Attention</h2>
      <div className="space-y-3">{issues}</div>
    </section>
  )
}

export default async function DashboardPage() {
  const [displayName, { tenantId, stats, trialInfo, attention }] = await Promise.all([
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

      {/* Stats */}
      <StatsCards stats={stats} />

      {/* Needs attention — only when there's a tenant to evaluate */}
      {attention && <NeedsAttention attention={attention} />}

      {/* Price alerts — shown only when price changes exist */}
      <PriceAlerts />

      {/* Recent activity */}
      <RecentActivity tenantId={tenantId} />

      {/* AI usage — informational, not primary */}
      <AIUsageCard />
    </div>
  )
}
