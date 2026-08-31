'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3, ChefHat, TrendingUp, Receipt, FileText,
  AlertTriangle, Sparkles, Printer, Apple, Truck, Loader2, Lock,
  ArrowUpRight, ArrowDownRight, X,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { calculateCost, type CostResult } from '@/lib/utils/cost-calculator'
import { resolveIngredientPrice, type PriceHistoryEntry } from '@/lib/ingredients/resolveIngredientPrice'
import { cn } from '@/lib/utils'
import { useSubscription } from '@/hooks/useSubscription'
import EmptyState from '@/components/shared/EmptyState'
import SquareAnalyticsPanel from '@/components/dashboard/SquareAnalyticsPanel'

// ── Types ────────────────────────────────────────────────────────────────────

type RecipeRow = {
  id: string
  name: string
  category: string
  yield_quantity: number
  yield_unit: string
  prep_time_minutes: number
  labor_enabled: boolean
  labor_cost: number
  labor_mode: string
  labor_hourly_rate: number | null
  overhead_enabled: boolean
  overhead_cost: number
  overhead_mode: string
  overhead_percent: number
  waste_percent: number
  selling_price: number
  recipe_ingredients: Array<{
    quantity: number
    unit: string
    yield_percent: number | null
    ingredient: {
      current_price: number | null
      price_unit: string | null
      price_history: PriceHistoryEntry[] | null
    } | null
  }>
}

type RecipeWithCost = RecipeRow & { cost: CostResult }

type InvoiceRow = {
  id: string
  total_amount: number | null
  supplier_id: string | null
  invoice_date: string | null
  supplier: { name: string } | null
}

type PriceHistoryRow = {
  ingredient_id: string
  price: number
  unit: string
  recorded_at: string
  ingredient: { id: string; name: string } | null
}

type IngredientPriceHistoryRow = PriceHistoryEntry & { brand?: string | null }

type IngredientRow = {
  id: string
  name: string
  category: string | null
  brand: string | null
  current_price: number | null
  price_unit: string | null
  updated_at: string | null
  price_history: IngredientPriceHistoryRow[] | null
}

type PriceMover = {
  id: string
  name: string
  currentPrice: number
  previousPrice: number
  unit: string
  changePct: number
}

type SupplierSummary = {
  name: string
  total: number
  count: number
}

type Insight = {
  type: 'positive' | 'warning' | 'tip'
  title: string
  description: string
}

type SortMode = 'name' | 'margin-high' | 'margin-low' | 'cost-high' | 'profit-high'

// ── Main page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { limits, loading: subscriptionLoading } = useSubscription()
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'print'>('overview')
  const [loading, setLoading] = useState(true)
  const [tenantName, setTenantName] = useState('')
  const [recipes, setRecipes] = useState<RecipeWithCost[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [priceHistory, setPriceHistory] = useState<PriceHistoryRow[]>([])
  const [ingredients, setIngredients] = useState<IngredientRow[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('margin-high')
  const [showSupplierDateModal, setShowSupplierDateModal] = useState(false)
  const [supplierDateFrom, setSupplierDateFrom] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  )
  const [supplierDateTo, setSupplierDateTo] = useState(
    new Date().toISOString().split('T')[0]
  )

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: memberRow } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      const tid = (memberRow as { tenant_id: string } | null)?.tenant_id
      if (!tid) return

      const [tenantRes, recipesRes, invoicesRes, priceHistRes, ingredientsRes] = await Promise.all([
        supabase.from('tenants').select('name, labor_hourly_rate').eq('id', tid).single(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('recipes') as any).select(`
          id, name, category, yield_quantity, yield_unit,
          prep_time_minutes, labor_enabled, labor_cost, labor_mode, labor_hourly_rate,
          overhead_enabled, overhead_cost, overhead_mode, overhead_percent,
          waste_percent, selling_price,
          recipe_ingredients!recipe_ingredients_recipe_id_fkey (
            quantity, unit, yield_percent,
            ingredient:ingredients (
              current_price, price_unit,
              price_history:ingredient_price_history (
                id, price, unit, is_selected_price, recorded_at
              )
            )
          )
        `).eq('tenant_id', tid).eq('is_active', true),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('invoices') as any)
          .select('id, total_amount, supplier_id, invoice_date, supplier:suppliers(name)')
          .eq('tenant_id', tid),
        supabase
          .from('ingredient_price_history')
          .select('ingredient_id, price, unit, recorded_at, ingredient:ingredients(id, name)')
          .eq('tenant_id', tid)
          .order('recorded_at', { ascending: false }),
        supabase
          .from('ingredients')
          .select(`
            id, name, category, brand, current_price, price_unit, updated_at,
            price_history:ingredient_price_history (
              id, price, unit, brand, is_selected_price, recorded_at
            )
          `)
          .eq('tenant_id', tid)
          .order('name'),
      ])

      const lhr = Number((tenantRes.data as { labor_hourly_rate?: number } | null)?.labor_hourly_rate ?? 15)
      setTenantName((tenantRes.data as { name?: string } | null)?.name ?? '')

      const rawRecipes = (recipesRes.data ?? []) as unknown as RecipeRow[]
      const withCosts: RecipeWithCost[] = rawRecipes.map((r) => ({
        ...r,
        cost: calculateCost({
          ingredients: (r.recipe_ingredients ?? []).map((ri) => {
            const resolved = resolveIngredientPrice(
              ri.ingredient?.price_history ?? [],
              ri.ingredient?.current_price ?? null,
              ri.ingredient?.price_unit ?? null
            )
            return {
              quantity: ri.quantity,
              unit: ri.unit,
              yield_percent: ri.yield_percent ?? 100,
              current_price: resolved.price,
              price_unit: resolved.unit,
            }
          }),
          laborEnabled: r.labor_enabled,
          laborMode: r.labor_mode as 'fixed' | 'time',
          laborCostFixed: r.labor_cost,
          prepTimeMinutes: r.prep_time_minutes,
          laborHourlyRate: r.labor_hourly_rate ?? lhr,
          overheadEnabled: r.overhead_enabled,
          overheadMode: r.overhead_mode as 'fixed' | 'percent',
          overheadCostFixed: r.overhead_cost,
          overheadPercent: r.overhead_percent,
          wastePercent: r.waste_percent,
          sellingPrice: r.selling_price,
          yieldQty: r.yield_quantity,
          yieldUnit: r.yield_unit,
        }),
      }))

      setRecipes(withCosts)
      setInvoices((invoicesRes.data ?? []) as unknown as InvoiceRow[])
      setPriceHistory((priceHistRes.data ?? []) as unknown as PriceHistoryRow[])
      setIngredients((ingredientsRes.data ?? []) as unknown as IngredientRow[])
      setLoading(false)
    }

    load().catch(console.error)
  }, [])

  // ── Computed ──────────────────────────────────────────────────────────────

  const totalInvoiceSpend = invoices.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0)
  const pricedRecipes = recipes.filter((r) => r.cost.sellingPrice > 0)
  const avgMargin = pricedRecipes.length > 0
    ? pricedRecipes.reduce((sum, r) => sum + r.cost.margin, 0) / pricedRecipes.length
    : 0
  const avgFoodCost = pricedRecipes.length > 0
    ? pricedRecipes.reduce((sum, r) => sum + r.cost.foodCostPercent, 0) / pricedRecipes.length
    : 0

  const topPerformers = [...pricedRecipes]
    .filter((r) => r.cost.margin > 30)
    .sort((a, b) => b.cost.margin - a.cost.margin)
    .slice(0, 5)

  const needsAttention = [...pricedRecipes]
    .filter((r) => r.cost.margin <= 30)
    .sort((a, b) => a.cost.margin - b.cost.margin)
    .slice(0, 5)

  const categoryData = Object.entries(
    recipes.reduce((acc, r) => {
      const cat = r.category || 'Other'
      acc[cat] = (acc[cat] ?? 0) + r.cost.ingredientCost
      return acc
    }, {} as Record<string, number>)
  )
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const priceMovers: PriceMover[] = (() => {
    const grouped: Record<string, PriceHistoryRow[]> = {}
    for (const row of priceHistory) {
      if (!grouped[row.ingredient_id]) grouped[row.ingredient_id] = []
      if (grouped[row.ingredient_id].length < 2) grouped[row.ingredient_id].push(row)
    }
    return Object.values(grouped)
      .filter((rows) => rows.length === 2)
      .map(([current, previous]) => ({
        id: current.ingredient?.id ?? current.ingredient_id,
        name: current.ingredient?.name ?? 'Unknown',
        currentPrice: current.price,
        previousPrice: previous.price,
        unit: current.unit,
        changePct: ((current.price - previous.price) / previous.price) * 100,
      }))
      .filter((m) => m.changePct !== 0)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 10)
  })()

  const supplierBreakdown: SupplierSummary[] = (() => {
    const grouped: Record<string, { name: string; total: number; count: number }> = {}
    for (const inv of invoices) {
      const key = inv.supplier_id ?? '__unknown__'
      const name = Array.isArray(inv.supplier)
        ? (inv.supplier[0] as { name: string } | undefined)?.name ?? 'Unknown'
        : inv.supplier?.name ?? 'Unknown'
      if (!grouped[key]) grouped[key] = { name, total: 0, count: 0 }
      grouped[key].total += inv.total_amount ?? 0
      grouped[key].count++
    }
    return Object.values(grouped).sort((a, b) => b.total - a.total)
  })()

  // ── AI Insights ───────────────────────────────────────────────────────────

  const generateInsights = async () => {
    setInsightsLoading(true)
    try {
      const res = await fetch('/api/reports/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipes: recipes.map((r) => ({
            name: r.name,
            totalCost: r.cost.totalCost,
            sellingPrice: r.cost.sellingPrice,
            margin: r.cost.margin,
            foodCostPct: r.cost.foodCostPercent,
          })),
          ingredientCount: ingredients.length,
          invoiceCount: invoices.length,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const { insights: data } = await res.json() as { insights: Insight[] }
      setInsights(data)
    } catch {
      // non-fatal
    } finally {
      setInsightsLoading(false)
    }
  }

  // ── Print reports ─────────────────────────────────────────────────────────

  const printRecipeCostReport = () => {
    const sorted = [...recipes].sort((a, b) => {
      switch (sortMode) {
        case 'name': return a.name.localeCompare(b.name)
        case 'margin-low': return a.cost.margin - b.cost.margin
        case 'cost-high': return b.cost.totalCost - a.cost.totalCost
        case 'profit-high': return b.cost.profitPerUnit - a.cost.profitPerUnit
        default: return b.cost.margin - a.cost.margin
      }
    })
    const today = new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })
    const rows = sorted.map((r) => {
      const hasSP = r.cost.sellingPrice > 0
      return `<tr>
        <td>${r.name}</td>
        <td>${r.category || 'Other'}</td>
        <td>€${r.cost.totalCost.toFixed(2)}</td>
        <td>${hasSP ? '€' + r.cost.sellingPrice.toFixed(2) : '—'}</td>
        <td class="${r.cost.profitPerUnit >= 0 ? 'profit' : 'loss'}">${hasSP ? (r.cost.profitPerUnit >= 0 ? '+' : '') + '€' + r.cost.profitPerUnit.toFixed(2) : '—'}</td>
        <td class="${r.cost.margin >= 50 ? 'good' : r.cost.margin >= 30 ? 'ok' : 'bad'}">${hasSP ? r.cost.margin.toFixed(1) + '%' : '—'}</td>
        <td>${hasSP ? r.cost.foodCostPercent.toFixed(1) + '%' : '—'}</td>
      </tr>`
    }).join('')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>Recipe Cost Report</title><style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;color:#1e293b;padding:40px;max-width:960px;margin:0 auto}
      @media print{.no-print{display:none}@page{margin:15mm}}
      h1{font-size:24px;font-weight:800;margin-bottom:4px}.meta{font-size:13px;color:#6b7280;margin-bottom:24px}
      table{width:100%;border-collapse:collapse}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;padding:8px 12px;border-bottom:2px solid #e5e7eb}
      td{padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px}
      .profit{color:#059669;font-weight:600}.loss{color:#ef4444;font-weight:600}
      .good{color:#059669;font-weight:600}.ok{color:#d97706;font-weight:600}.bad{color:#ef4444;font-weight:600}
      .footer{margin-top:32px;text-align:center;font-size:11px;color:#9ca3af}
      .print-btn{position:fixed;bottom:20px;right:20px;background:#059669;color:white;border:none;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer}
    </style></head><body>
      <h1>Recipe Cost Report</h1>
      <p class="meta">${tenantName} · ${today} · ${sorted.length} recipes · Avg margin: ${avgMargin.toFixed(1)}% · Avg food cost: ${avgFoodCost.toFixed(1)}%</p>
      <table><thead><tr><th>Recipe</th><th>Category</th><th>Cost</th><th>Price</th><th>Profit</th><th>Margin</th><th>Food Cost</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="footer">Generated by ZRecipe</div>
      <button class="print-btn no-print" onclick="window.print()">🖨 Print</button>
    </body></html>`)
    win.document.close()
  }

  const printIngredientList = () => {
    const today = new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })
    const rows = ingredients.map((ing) => {
      const resolved = resolveIngredientPrice(ing.price_history ?? [], ing.current_price, ing.price_unit)
      const effectiveBrand = ing.price_history?.find((h) => h.id === resolved.historyId)
      return `<tr>
      <td>${ing.name}</td>
      <td>${ing.category ?? '—'}</td>
      <td>${effectiveBrand?.brand ?? ing.brand ?? '—'}</td>
      <td>${resolved.price != null ? '€' + resolved.price.toFixed(2) : '—'}</td>
      <td>${resolved.unit ?? '—'}</td>
      <td>${ing.updated_at ? new Date(ing.updated_at).toLocaleDateString('en-IE') : '—'}</td>
    </tr>`
    }).join('')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>Ingredient Price List</title><style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;color:#1e293b;padding:40px;max-width:960px;margin:0 auto}
      @media print{.no-print{display:none}@page{margin:15mm}}
      h1{font-size:24px;font-weight:800;margin-bottom:4px}.meta{font-size:13px;color:#6b7280;margin-bottom:24px}
      table{width:100%;border-collapse:collapse}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;padding:8px 12px;border-bottom:2px solid #e5e7eb}
      td{padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px}
      .footer{margin-top:32px;text-align:center;font-size:11px;color:#9ca3af}
      .print-btn{position:fixed;bottom:20px;right:20px;background:#d97706;color:white;border:none;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer}
    </style></head><body>
      <h1>Ingredient Price List</h1>
      <p class="meta">${tenantName} · ${today} · ${ingredients.length} ingredients</p>
      <table><thead><tr><th>Ingredient</th><th>Category</th><th>Brand</th><th>Price</th><th>Unit</th><th>Last Updated</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="footer">Generated by ZRecipe</div>
      <button class="print-btn no-print" onclick="window.print()">🖨 Print</button>
    </body></html>`)
    win.document.close()
  }

  const printSupplierReport = (dateFrom: string, dateTo: string) => {
    // Filter in-memory invoices by the selected date range
    const filtered = invoices.filter((inv) => {
      if (!inv.invoice_date) return false
      return inv.invoice_date >= dateFrom && inv.invoice_date <= dateTo
    })

    const grouped: Record<string, { name: string; invs: InvoiceRow[] }> = {}
    for (const inv of filtered) {
      const key = inv.supplier_id ?? '__unknown__'
      const name = Array.isArray(inv.supplier)
        ? (inv.supplier[0] as { name: string } | undefined)?.name ?? 'Unknown'
        : inv.supplier?.name ?? 'Unknown Supplier'
      if (!grouped[key]) grouped[key] = { name, invs: [] }
      grouped[key].invs.push(inv)
    }

    const sortedSuppliers = Object.values(grouped).sort((a, b) => {
      const ta = a.invs.reduce((s, i) => s + (i.total_amount ?? 0), 0)
      const tb = b.invs.reduce((s, i) => s + (i.total_amount ?? 0), 0)
      return tb - ta
    })
    const grandTotal = sortedSuppliers.reduce(
      (s, sup) => s + sup.invs.reduce((ss, i) => ss + (i.total_amount ?? 0), 0), 0
    )

    const fromDisplay = new Date(dateFrom + 'T12:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })
    const toDisplay = new Date(dateTo + 'T12:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })

    const sections = sortedSuppliers.map(({ name, invs }) => {
      const total = invs.reduce((s, i) => s + (i.total_amount ?? 0), 0)
      const invRows = invs
        .sort((a, b) => (b.invoice_date ?? '').localeCompare(a.invoice_date ?? ''))
        .map((inv) => `<tr>
          <td>${inv.invoice_date ? new Date(inv.invoice_date + 'T12:00:00').toLocaleDateString('en-IE') : '—'}</td>
          <td>€${(inv.total_amount ?? 0).toFixed(2)}</td>
        </tr>`).join('')
      return `<h3 style="font-size:16px;font-weight:700;margin:24px 0 8px;">${name}</h3>
        <table><thead><tr><th>Date</th><th>Amount</th></tr></thead>
        <tbody>${invRows}
          <tr style="font-weight:700;border-top:2px solid #e5e7eb;">
            <td>${invs.length} invoice${invs.length !== 1 ? 's' : ''}</td>
            <td>€${total.toFixed(2)}</td>
          </tr>
        </tbody></table>`
    }).join('')

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>Supplier Report</title><style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;color:#1e293b;padding:40px;max-width:760px;margin:0 auto}
      @media print{.no-print{display:none}@page{margin:15mm}}
      h1{font-size:24px;font-weight:800;margin-bottom:4px}.meta{font-size:13px;color:#6b7280;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;margin-bottom:8px}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;padding:8px 12px;border-bottom:2px solid #e5e7eb}
      td{padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px}
      .footer{margin-top:32px;text-align:center;font-size:11px;color:#9ca3af}
      .print-btn{position:fixed;bottom:20px;right:20px;background:#3b82f6;color:white;border:none;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer}
    </style></head><body>
      <h1>Supplier Report</h1>
      <p class="meta">${tenantName} · ${fromDisplay} to ${toDisplay} · ${sortedSuppliers.length} supplier${sortedSuppliers.length !== 1 ? 's' : ''} · Grand total: €${grandTotal.toFixed(2)}</p>
      ${sections || '<p style="color:#9ca3af;font-size:13px;margin-top:16px;">No invoices found in this date range.</p>'}
      <div class="footer">Generated by ZRecipe</div>
      <button class="print-btn no-print" onclick="window.print()">🖨 Print</button>
    </body></html>`)
    win.document.close()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading || subscriptionLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  if (!limits.canUseReports) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <EmptyState
          icon={Lock}
          title="Reports are a Pro feature"
          description="Upgrade to Pro for analytics, printable reports and AI-powered business insights."
          action={{ label: 'View plans', onClick: () => window.location.assign('/settings/billing') }}
        />
      </div>
    )
  }

  const TABS = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'trends' as const, label: 'Price Trends' },
    { id: 'print' as const, label: 'Print Reports' },
  ]

  return (
    <div className="space-y-6 pb-12">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
          <BarChart3 className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Business analytics and insights</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex w-fit gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          recipes={recipes}
          pricedRecipesCount={pricedRecipes.length}
          invoiceCount={invoices.length}
          avgMargin={avgMargin}
          avgFoodCost={avgFoodCost}
          totalInvoiceSpend={totalInvoiceSpend}
          topPerformers={topPerformers}
          needsAttention={needsAttention}
          categoryData={categoryData}
          insights={insights}
          insightsLoading={insightsLoading}
          onGenerateInsights={generateInsights}
        />
      )}
      {activeTab === 'trends' && (
        <TrendsTab priceMovers={priceMovers} supplierBreakdown={supplierBreakdown} />
      )}
      {activeTab === 'print' && (
        <PrintTab
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          onPrintRecipes={printRecipeCostReport}
          onPrintIngredients={printIngredientList}
          onPrintSuppliers={() => setShowSupplierDateModal(true)}
        />
      )}

      {/* ── Supplier date-range modal ──────────────────────────────────── */}
      {showSupplierDateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowSupplierDateModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <Truck className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Supplier Report</h2>
                  <p className="text-sm text-gray-500">Select date range</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSupplierDateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {/* Quick presets */}
              <div className="mb-5 flex flex-wrap gap-2">
                {[
                  { label: 'This month',    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],     to: new Date().toISOString().split('T')[0] },
                  { label: 'Last month',    from: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0], to: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0] },
                  { label: 'Last 3 months', from: new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1).toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] },
                  { label: 'This year',     from: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],                         to: new Date().toISOString().split('T')[0] },
                  { label: 'All time',      from: '2020-01-01',                                                                                  to: new Date().toISOString().split('T')[0] },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => { setSupplierDateFrom(preset.from); setSupplierDateTo(preset.to) }}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs transition-colors',
                      supplierDateFrom === preset.from && supplierDateTo === preset.to
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom date inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">From</label>
                  <input
                    type="date"
                    value={supplierDateFrom}
                    onChange={(e) => setSupplierDateFrom(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">To</label>
                  <input
                    type="date"
                    value={supplierDateTo}
                    onChange={(e) => setSupplierDateTo(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>

              {/* Period summary */}
              <div className="mt-4 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <span className="text-sm text-gray-500">Period</span>
                <span className="text-sm font-semibold text-gray-800">
                  {new Date(supplierDateFrom + 'T12:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' — '}
                  {new Date(supplierDateTo + 'T12:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowSupplierDateModal(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSupplierDateModal(false)
                  printSupplierReport(supplierDateFrom, supplierDateTo)
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                <Printer className="h-4 w-4" />
                Generate Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  recipes,
  pricedRecipesCount,
  invoiceCount,
  avgMargin,
  avgFoodCost,
  totalInvoiceSpend,
  topPerformers,
  needsAttention,
  categoryData,
  insights,
  insightsLoading,
  onGenerateInsights,
}: {
  recipes: RecipeWithCost[]
  pricedRecipesCount: number
  invoiceCount: number
  avgMargin: number
  avgFoodCost: number
  totalInvoiceSpend: number
  topPerformers: RecipeWithCost[]
  needsAttention: RecipeWithCost[]
  categoryData: { name: string; value: number }[]
  insights: Insight[]
  insightsLoading: boolean
  onGenerateInsights: () => void
}) {
  const insightEmoji = (type: Insight['type']) => {
    if (type === 'positive') return '✅'
    if (type === 'warning') return '⚠️'
    return '💡'
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Recipes */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total Recipes</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
              <ChefHat className="h-4.5 w-4.5 text-emerald-500" />
            </div>
          </div>
          <p className="text-3xl font-black text-gray-800">{recipes.length}</p>
          <p className="mt-1 text-xs text-gray-400">{pricedRecipesCount} with selling price</p>
        </div>

        {/* Avg Margin */}
        <div className={cn(
          'rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md',
          avgMargin >= 50 ? 'border-emerald-200 bg-emerald-50'
            : avgMargin >= 30 ? 'border-amber-200 bg-amber-50'
            : 'border-red-200 bg-red-50'
        )}>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Avg Margin</span>
            <div className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              avgMargin >= 50 ? 'bg-emerald-100' : avgMargin >= 30 ? 'bg-amber-100' : 'bg-red-100'
            )}>
              <TrendingUp className={cn(
                'h-4.5 w-4.5',
                avgMargin >= 50 ? 'text-emerald-600' : avgMargin >= 30 ? 'text-amber-600' : 'text-red-500'
              )} />
            </div>
          </div>
          <p className={cn(
            'text-3xl font-black',
            avgMargin >= 50 ? 'text-emerald-700' : avgMargin >= 30 ? 'text-amber-700' : 'text-red-600'
          )}>
            {avgMargin.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-gray-400">target: above 50%</p>
        </div>

        {/* Avg Food Cost */}
        <div className={cn(
          'rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md',
          avgFoodCost <= 30 ? 'border-emerald-200 bg-emerald-50'
            : avgFoodCost <= 40 ? 'border-amber-200 bg-amber-50'
            : 'border-red-200 bg-red-50'
        )}>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Avg Food Cost</span>
            <div className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              avgFoodCost <= 30 ? 'bg-emerald-100' : avgFoodCost <= 40 ? 'bg-amber-100' : 'bg-red-100'
            )}>
              <Receipt className={cn(
                'h-4.5 w-4.5',
                avgFoodCost <= 30 ? 'text-emerald-600' : avgFoodCost <= 40 ? 'text-amber-600' : 'text-red-500'
              )} />
            </div>
          </div>
          <p className={cn(
            'text-3xl font-black',
            avgFoodCost <= 30 ? 'text-emerald-700' : avgFoodCost <= 40 ? 'text-amber-700' : 'text-red-600'
          )}>
            {avgFoodCost.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-gray-400">target: below 35%</p>
        </div>

        {/* Invoice Spend */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Invoice Spend</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100">
              <FileText className="h-4.5 w-4.5 text-gray-500" />
            </div>
          </div>
          <p className="text-3xl font-black text-gray-800">
            €{totalInvoiceSpend.toLocaleString('en-IE', { maximumFractionDigits: 0 })}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {invoiceCount} invoice{invoiceCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <SquareAnalyticsPanel />

      {/* Top performers + Needs attention */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top performers */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Top Performers</p>
              <p className="text-xs text-slate-400">Highest margin recipes</p>
            </div>
          </div>
          {topPerformers.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">
              No recipes above 30% margin yet
            </p>
          ) : (
            <div className="space-y-1">
              {topPerformers.map((r, i) => (
                <Link
                  key={r.id}
                  href={`/recipes/${r.id}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-slate-50"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {r.name}
                  </span>
                  <span className="text-xs font-semibold text-emerald-600">
                    {r.cost.margin.toFixed(1)}%
                  </span>
                  <span className="text-xs text-slate-400">
                    +€{r.cost.profitPerUnit.toFixed(2)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Needs attention */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Needs Attention</p>
              <p className="text-xs text-slate-400">Margin below 30% or loss-making</p>
            </div>
          </div>
          {needsAttention.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-3">
              <span className="text-emerald-500">✅</span>
              <p className="text-sm text-emerald-700">All recipes are above 30% margin — great job!</p>
            </div>
          ) : (
            <div className="space-y-1">
              {needsAttention.map((r) => (
                <Link
                  key={r.id}
                  href={`/recipes/${r.id}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {r.name}
                  </span>
                  <span className={cn(
                    'text-xs font-semibold',
                    r.cost.margin < 0 ? 'text-red-600' : 'text-amber-600'
                  )}>
                    {r.cost.margin.toFixed(1)}%
                  </span>
                  <span className={cn(
                    'text-xs',
                    r.cost.profitPerUnit < 0 ? 'text-red-500' : 'text-slate-400'
                  )}>
                    {r.cost.profitPerUnit >= 0 ? '+' : ''}€{r.cost.profitPerUnit.toFixed(2)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Insights */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
              <Sparkles className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-800">AI Insights</h3>
              <p className="text-xs text-gray-400">Powered by Claude · Analyses your recipes and costs</p>
            </div>
          </div>
          <button
            onClick={onGenerateInsights}
            disabled={insightsLoading || recipes.length === 0}
            className="flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {insightsLoading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Analysing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Insights
              </>
            )}
          </button>
        </div>

        {insights.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {insights.map((ins, i) => (
              <div
                key={i}
                className={cn(
                  'cursor-default rounded-xl border-l-4 bg-gray-50 p-4 transition-colors hover:bg-gray-100/80',
                  ins.type === 'positive' ? 'border-l-emerald-500'
                    : ins.type === 'warning' ? 'border-l-amber-400'
                    : 'border-l-blue-400'
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex-shrink-0 text-base">
                    {insightEmoji(ins.type)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold leading-snug text-gray-800">{ins.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500">{ins.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-gray-50 py-8 text-center">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-gray-200" />
            <p className="text-sm text-gray-400">Click &quot;Generate Insights&quot; to get AI-powered analysis</p>
            <p className="mt-1 text-xs text-gray-300">Analyses your recipes, costs, margins and pricing</p>
          </div>
        )}
      </div>

      {/* Cost by category bar chart */}
      {categoryData.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-slate-900">
            Ingredient Cost by Category
          </p>
          <ResponsiveContainer width="100%" height={Math.max(120, categoryData.length * 40)}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 0, right: 72, top: 0, bottom: 0 }}>
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickFormatter={(v: number) => `€${v}`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: '#64748b' }}
                width={90}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: unknown) => [`€${Number(v).toFixed(2)}`, 'Ingredient Cost']}
                contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
              />
              <Bar dataKey="value" fill="#059669" radius={[0, 6, 6, 0]}>
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: unknown) => `€${Number(v).toFixed(2)}`}
                  style={{ fontSize: 12, fontWeight: 600, fill: '#374151' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── Trends Tab ───────────────────────────────────────────────────────────────

function TrendsTab({
  priceMovers,
  supplierBreakdown,
}: {
  priceMovers: PriceMover[]
  supplierBreakdown: SupplierSummary[]
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Price movers */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-semibold text-slate-900">Price Movers</p>
        <p className="mb-4 text-xs text-slate-400">Biggest changes vs. previous recorded price</p>
        {priceMovers.length === 0 ? (
          <div className="py-8 text-center">
            <TrendingUp className="mx-auto mb-2 h-8 w-8 text-gray-200" />
            <p className="text-sm font-medium text-gray-400">No price changes detected yet</p>
            <p className="mt-1 text-xs text-gray-300">
              Import more invoices to track price trends over time
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {priceMovers.map((m) => (
              <Link
                key={m.id}
                href={`/ingredients/${m.id}`}
                className="flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                  {m.name}
                </span>
                <span className="text-xs text-slate-400">
                  €{m.currentPrice.toFixed(2)}/{m.unit}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold',
                  m.changePct > 0
                    ? 'bg-red-100 text-red-600'
                    : 'bg-emerald-100 text-emerald-700'
                )}>
                  {m.changePct > 0
                    ? <ArrowUpRight className="h-3 w-3" />
                    : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(m.changePct).toFixed(1)}%
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Supplier breakdown */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-1 text-sm font-semibold text-slate-900">Supplier Breakdown</p>
        <p className="mb-4 text-xs text-slate-400">Total spend per supplier</p>
        {supplierBreakdown.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            No invoices yet. Upload invoices to see supplier spend.
          </p>
        ) : (() => {
          const totalAll = supplierBreakdown.reduce((sum, x) => sum + x.total, 0)
          return (
            <div className="divide-y divide-gray-50">
              {supplierBreakdown.map((s, i) => {
                const pct = totalAll > 0 ? (s.total / totalAll) * 100 : 0
                return (
                  <div key={i} className="py-2.5">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">
                        {s.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">
                          {s.count} invoice{s.count !== 1 ? 's' : ''}
                        </span>
                        <span className="text-sm font-bold text-gray-800">
                          €{s.total.toFixed(0)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-right text-[10px] text-gray-400">
                      {pct.toFixed(1)}% of total spend
                    </p>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── Print Tab ────────────────────────────────────────────────────────────────

function PrintTab({
  sortMode,
  onSortModeChange,
  onPrintRecipes,
  onPrintIngredients,
  onPrintSuppliers,
}: {
  sortMode: SortMode
  onSortModeChange: (v: SortMode) => void
  onPrintRecipes: () => void
  onPrintIngredients: () => void
  onPrintSuppliers: () => void
}) {
  return (
    <div className="space-y-4">
      {/* Recipe cost report */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
              <FileText className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Recipe Cost Report</p>
              <p className="mt-0.5 text-xs text-slate-400">
                All recipes with costs, margins and selling prices
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-slate-500">Sort by:</span>
                <select
                  value={sortMode}
                  onChange={(e) => onSortModeChange(e.target.value as SortMode)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none"
                >
                  <option value="name">Name A→Z</option>
                  <option value="margin-high">Margin highest</option>
                  <option value="margin-low">Margin lowest</option>
                  <option value="cost-high">Cost highest</option>
                  <option value="profit-high">Profit highest</option>
                </select>
              </div>
            </div>
          </div>
          <button
            onClick={onPrintRecipes}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      {/* Ingredient price list */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
              <Apple className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Ingredient Price List</p>
              <p className="mt-0.5 text-xs text-slate-400">
                All ingredients with current prices and last-updated date
              </p>
            </div>
          </div>
          <button
            onClick={onPrintIngredients}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-400"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      {/* Supplier report */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
              <Truck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Supplier Report</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Purchase history grouped by supplier with totals
              </p>
            </div>
          </div>
          <button
            onClick={onPrintSuppliers}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Summary Card ─────────────────────────────────────────────────────────────
