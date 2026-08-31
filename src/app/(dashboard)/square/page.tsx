'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import { BarChart3, ChevronRight, Link2, Loader2, Lock, Settings, TrendingUp } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import { useRecipes } from '@/hooks/useRecipes'
import { getMarginBand } from '@/components/recipes/CostBreakdown'
import { computeMarginRows, type LinkedRecipeForMargin, type MarginRow } from '@/lib/square/margin'
import EmptyState from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'

type SquareStatus = {
  connected: boolean
  analytics?: {
    orderCount: number
    salesCents: number
    averageOrderCents: number
    currency: string
  }
  connection?: {
    lastSyncedAt: string | null
  }
}

type ItemSummary = {
  itemName: string
  unitsSold: number
  revenueCents: number
  currency: string
  linkedRecipeId: string | null
}

type DailySales = { date: string; revenueCents: number }
type DailyChartPoint = DailySales & { label: string; revenue: number }

function money(cents: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100)
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not synced yet'
  return new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function DailySalesTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DailyChartPoint }> }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
      <p className="text-xs text-slate-500">{format(new Date(point.date), 'MMM d, yyyy')}</p>
      <p className="mt-0.5 text-sm font-bold text-slate-900">{'€'}{point.revenue.toFixed(2)}</p>
    </div>
  )
}

function DailySalesChart({ data }: { data: DailySales[] }) {
  const chartData = useMemo(
    () => data.map((d) => ({ ...d, label: format(new Date(d.date), 'MMM d'), revenue: d.revenueCents / 100 })),
    [data]
  )

  if (chartData.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-slate-200">
        <p className="text-sm text-slate-400">No completed sales in the last 30 days yet.</p>
      </div>
    )
  }

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
          <Tooltip content={<DailySalesTooltip />} />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#059669"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: '#059669', strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function SquareAnalyticsPage() {
  const { limits, loading: subscriptionLoading } = useSubscription()
  const { recipes, loading: recipesLoading } = useRecipes()
  const [status, setStatus] = useState<SquareStatus | null>(null)
  const [items, setItems] = useState<ItemSummary[]>([])
  const [dailySales, setDailySales] = useState<DailySales[]>([])
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (subscriptionLoading) return
    if (!limits.canUseSquareIntegration) {
      setLoadingData(false)
      return
    }

    let active = true
    const load = async () => {
      setLoadingData(true)
      const [statusRes, summaryRes] = await Promise.all([
        fetch('/api/integrations/square/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/integrations/square/item-summary', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ])
      if (!active) return
      setStatus(statusRes)
      setItems(summaryRes?.items ?? [])
      setDailySales(summaryRes?.dailySales ?? [])
      setLoadingData(false)
    }
    void load()
    return () => { active = false }
  }, [subscriptionLoading, limits.canUseSquareIntegration])

  // Costed per CLAUDE.md core costing rule 4/6: costPerUnit is the live cost
  // of one recipe yield unit (totalCost / yieldQuantity), matching how the
  // Recipes page itself costs a single portion — never a snapshot.
  const recipeById = useMemo(() => {
    const map = new Map<string, LinkedRecipeForMargin>()
    for (const r of recipes) {
      map.set(r.id, { id: r.id, name: r.name, isSubIngredient: r.isSubIngredient, cost: { costPerUnit: r.cost.costPerUnit } })
    }
    return map
  }, [recipes])

  const marginRows: MarginRow[] = useMemo(() => computeMarginRows(items, recipeById), [items, recipeById])

  const topByVolume = useMemo(
    () => [...marginRows].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 5),
    [marginRows]
  )
  const topByMargin = useMemo(
    () =>
      marginRows
        .filter((row): row is MarginRow & { marginCents: number } => row.marginCents != null)
        .sort((a, b) => b.marginCents - a.marginCents)
        .slice(0, 5),
    [marginRows]
  )

  const loading = loadingData || recipesLoading

  if (subscriptionLoading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
  }

  if (!limits.canUseSquareIntegration) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <EmptyState
          icon={Lock}
          title="Square is a Pro feature"
          description="Upgrade to Pro or Business to see real margin on your Square sales."
          action={{ label: 'View plans', onClick: () => window.location.assign('/settings/billing') }}
        />
      </div>
    )
  }

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
  }

  if (!status?.connected) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <EmptyState
          icon={BarChart3}
          title="Connect Square to see real margin"
          description="Connect your Square account to compare POS sales against your actual recipe costs."
          action={{ label: 'Connect Square', onClick: () => window.location.assign('/settings/integrations/square') }}
        />
      </div>
    )
  }

  const analytics = status.analytics

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-slate-900">Square</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Real margin on your Square sales — units sold x your actual recipe cost, the one thing Square&apos;s own
            dashboard can&apos;t show.
          </p>
        </div>
        <Link
          href="/settings/integrations/square"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <Settings className="h-4 w-4" />
          Connect / sync
        </Link>
      </div>

      {/* Connection summary */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">Square sales — last 30 days</h2>
          </div>
          <span className="text-xs text-slate-400">
            Last sync: {formatDate(status.connection?.lastSyncedAt)}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Sales', money(analytics?.salesCents ?? 0, analytics?.currency)],
            ['Completed orders', String(analytics?.orderCount ?? 0)],
            ['Average order', money(analytics?.averageOrderCents ?? 0, analytics?.currency)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Real margin by item */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Real margin by item — last 90 days</h2>
          <p className="mt-0.5 text-xs text-slate-500">Only completed Square orders count.</p>
        </div>
        {marginRows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">No Square sales in the last 90 days yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-3">Item</th>
                  <th className="px-4 py-3 text-right">Units</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-right">Margin</th>
                  <th className="px-4 py-3 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {marginRows.map((row) => {
                  const band = row.marginPercent != null ? getMarginBand(row.marginPercent) : null
                  return (
                    <tr key={row.itemName} className="border-b border-slate-50 last:border-0">
                      <td className="px-6 py-3 font-medium text-slate-900">
                        {row.itemName}
                        {row.linkedRecipeName && (
                          <span className="ml-2 text-xs font-normal text-slate-400">→ {row.linkedRecipeName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{row.unitsSold}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{money(row.revenueCents, row.currency)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {row.costCents != null ? money(row.costCents, row.currency) : '—'}
                      </td>
                      {row.isSubRecipe ? (
                        <td colSpan={2} className="px-4 py-3 text-right text-xs text-slate-400">
                          Sub-recipe — margin hidden
                        </td>
                      ) : row.linkedRecipeId ? (
                        <>
                          <td className={cn('px-4 py-3 text-right font-semibold', band?.colorClass)}>
                            {money(row.marginCents ?? 0, row.currency)}
                          </td>
                          <td className={cn('px-4 py-3 text-right font-semibold', band?.colorClass)}>
                            {row.marginPercent?.toFixed(1)}%
                          </td>
                        </>
                      ) : (
                        <td colSpan={2} className="px-4 py-3 text-right">
                          <Link
                            href="/settings/integrations/square/mapping"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            Link a recipe
                          </Link>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Top sellers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">Top sellers by volume</h2>
          </div>
          {topByVolume.length === 0 ? (
            <p className="text-sm text-slate-400">No sales yet.</p>
          ) : (
            <ul className="space-y-2">
              {topByVolume.map((row) => (
                <li key={row.itemName} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span className="truncate font-medium text-slate-800">{row.itemName}</span>
                  <span className="shrink-0 font-semibold text-slate-900">{row.unitsSold} sold</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">Top sellers by margin €</h2>
          </div>
          {topByMargin.length === 0 ? (
            <p className="text-sm text-slate-400">Link recipes to items to see this.</p>
          ) : (
            <ul className="space-y-2">
              {topByMargin.map((row) => (
                <li key={row.itemName} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span className="truncate font-medium text-slate-800">{row.itemName}</span>
                  <span className="shrink-0 font-semibold text-emerald-700">{money(row.marginCents ?? 0, row.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sales over time */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-slate-900">Daily revenue — last 30 days</h2>
        </div>
        <DailySalesChart data={dailySales} />
      </section>
    </div>
  )
}
