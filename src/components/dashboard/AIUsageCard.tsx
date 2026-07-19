'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

type AIUsage = {
  recipe_ideas:     { used: number; limit: number | null }
  invoice_extracts: { used: number; limit: number | null }
}

function UsageRow({
  label,
  used,
  limit,
}: {
  label: string
  used: number
  limit: number | null
}) {
  if (limit === null) return null // unlimited — don't show for pro users
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const atLimit = used >= limit

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className={cn('font-semibold', atLimit ? 'text-red-600' : 'text-slate-700')}>
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-1.5 rounded-full transition-all', atLimit ? 'bg-red-500' : 'bg-emerald-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function AIUsageCard() {
  const [usage, setUsage] = useState<AIUsage | null>(null)

  useEffect(() => {
    fetch('/api/ai/usage')
      .then((r) => r.json())
      .then((data: AIUsage) => {
        // Only show this card for free users (at least one feature has a finite limit)
        if (data?.recipe_ideas?.limit !== null || data?.invoice_extracts?.limit !== null) {
          setUsage(data)
        }
      })
      .catch(() => {})
  }, [])

  if (!usage) return null

  const anyAtLimit =
    (usage.recipe_ideas.limit !== null && usage.recipe_ideas.used >= usage.recipe_ideas.limit) ||
    (usage.invoice_extracts.limit !== null && usage.invoice_extracts.used >= usage.invoice_extracts.limit)

  return (
    <div className={cn(
      'rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-800',
      anyAtLimit
        ? 'border-amber-200 dark:border-amber-800'
        : 'border-slate-200 dark:border-slate-700'
    )}>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
          <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">AI Usage this month</p>
      </div>

      <div className="space-y-3">
        <UsageRow
          label="Recipe ideas"
          used={usage.recipe_ideas.used}
          limit={usage.recipe_ideas.limit}
        />
        <UsageRow
          label="Invoice extractions"
          used={usage.invoice_extracts.used}
          limit={usage.invoice_extracts.limit}
        />
      </div>

      {anyAtLimit && (
        <a
          href="/settings/billing"
          className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-500 transition-colors"
        >
          <Zap className="h-3.5 w-3.5" />
          Upgrade for more
        </a>
      )}
    </div>
  )
}
