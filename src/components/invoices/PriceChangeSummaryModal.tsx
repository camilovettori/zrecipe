'use client'

import { useRouter } from 'next/navigation'
import { TrendingUp, TrendingDown, X } from 'lucide-react'
import { formatPrice, formatPct } from '@/lib/price-alerts'

export interface PriceChange {
  ingredientId: string
  ingredientName: string
  previousPrice: number
  currentPrice: number
  unit: string
  percentChange: number
  direction: 'up' | 'down'
}

interface Props {
  changes: PriceChange[]
  onDismiss: () => void
}

export default function PriceChangeSummaryModal({ changes, onDismiss }: Props) {
  const router = useRouter()
  if (changes.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onDismiss}
        aria-hidden
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Price changes detected
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {changes.length} ingredient{changes.length !== 1 ? 's' : ''} updated
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {changes.map((c) => {
            const isUp = c.direction === 'up'
            return (
              <li key={c.ingredientId} className="flex items-center gap-3 px-6 py-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    isUp
                      ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  }`}
                >
                  {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {c.ingredientName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatPrice(c.previousPrice, c.unit)} → {formatPrice(c.currentPrice, c.unit)}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isUp
                      ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                  }`}
                >
                  {formatPct(c.percentChange)}
                </span>
              </li>
            )
          })}
        </ul>

        {/* Footer */}
        <div className="flex gap-3 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={() => router.push('/ingredients')}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Review ingredients
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
