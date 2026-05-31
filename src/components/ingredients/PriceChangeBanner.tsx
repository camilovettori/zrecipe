'use client'

import { useEffect, useState } from 'react'
import { X, TrendingUp, TrendingDown } from 'lucide-react'
import {
  computePriceChange,
  formatPrice,
  formatPct,
  type PriceHistoryEntry,
} from '@/lib/price-alerts'

interface Props {
  ingredientId: string
  priceHistory: PriceHistoryEntry[]
}

export default function PriceChangeBanner({ ingredientId, priceHistory }: Props) {
  const [dismissed, setDismissed] = useState(true) // start hidden; hydrate below

  useEffect(() => {
    const key = `price-banner-dismissed:${ingredientId}`
    const already = sessionStorage.getItem(key) === '1'
    if (!already) setDismissed(false)
  }, [ingredientId])

  const change = computePriceChange(priceHistory)
  if (!change || dismissed) return null

  const isUp = change.direction === 'up'
  const pctLabel = formatPct(change.percentChange)
  const prevLabel = formatPrice(change.previousPrice, change.unit)
  const currLabel = formatPrice(change.currentPrice, change.unit)
  const verb = isUp ? 'increased' : 'dropped'
  const arrow = isUp ? '↑' : '↓'

  const dismiss = () => {
    sessionStorage.setItem(`price-banner-dismissed:${ingredientId}`, '1')
    setDismissed(true)
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
        isUp
          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300'
      }`}
    >
      {isUp ? (
        <TrendingUp className="h-4 w-4 shrink-0" />
      ) : (
        <TrendingDown className="h-4 w-4 shrink-0" />
      )}
      <p className="flex-1">
        <span className="font-semibold">
          {arrow} Price {verb} {pctLabel}
        </span>{' '}
        since last invoice ({prevLabel} → {currLabel})
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
