import Link from 'next/link'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  computePriceChange,
  formatPrice,
  formatPct,
  resolveEntryDate,
  type IngredientPriceChange,
  type PriceHistoryEntry,
} from '@/lib/price-alerts'

type HistoryRow = PriceHistoryEntry & {
  ingredient: { id: string; name: string } | { id: string; name: string }[] | null
}

async function getPriceAlerts(): Promise<IngredientPriceChange[]> {
  try {
    const supabase = await createClient()

    // Fetch last 60 days so we can compare to the prior entry even when the
    // most recent change happened right at the 30-day boundary.
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('ingredient_price_history')
      .select('id, ingredient_id, price, unit, recorded_at, ingredient:ingredients!ingredient_id(id, name)')
      .gte('recorded_at', sixtyDaysAgo)
      .order('recorded_at', { ascending: false })
      .limit(500)

    if (error || !data) return []

    // Group entries by ingredient_id
    const byIngredient = new Map<string, { rows: HistoryRow[]; name: string }>()
    for (const row of data as HistoryRow[]) {
      const ingId = row.ingredient_id
      const ingredient = Array.isArray(row.ingredient) ? row.ingredient[0] ?? null : row.ingredient
      const ingName = ingredient?.name ?? 'Unknown ingredient'
      if (!byIngredient.has(ingId)) {
        byIngredient.set(ingId, { rows: [], name: ingName })
      }
      byIngredient.get(ingId)!.rows.push(row)
    }

    const alerts: IngredientPriceChange[] = []

    for (const [ingId, { rows, name }] of Array.from(byIngredient)) {
      // rows are already sorted desc; we need at least 2 to detect change
      if (rows.length < 2) continue

      // Only surface the change if the LATEST entry is within the last 30 days
      const latestDate = resolveEntryDate(rows[0])
      if (latestDate < thirtyDaysAgo) continue

      const change = computePriceChange(rows)
      if (!change) continue

      alerts.push({
        ...change,
        ingredientId: ingId,
        ingredientName: name,
        recordedAt: latestDate,
      })
    }

    // Sort by absolute percentage change descending
    alerts.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
    return alerts
  } catch {
    return []
  }
}

export default async function PriceAlerts() {
  const alerts = await getPriceAlerts()
  if (alerts.length === 0) return null

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
        Price Alerts
        <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
          {alerts.length}
        </span>
      </h2>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {alerts.map((alert) => {
            const isUp = alert.direction === 'up'
            return (
              <li key={alert.ingredientId}>
                <Link
                  href={`/ingredients/${alert.ingredientId}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  {/* Trend icon */}
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      isUp
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                    }`}
                  >
                    {isUp ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                  </div>

                  {/* Name + price */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {alert.ingredientName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatPrice(alert.previousPrice, alert.unit)}
                      {' → '}
                      {formatPrice(alert.currentPrice, alert.unit)}
                    </p>
                  </div>

                  {/* Percentage + date */}
                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        isUp
                          ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                      }`}
                    >
                      {formatPct(alert.percentChange)}
                    </span>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(alert.recordedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
