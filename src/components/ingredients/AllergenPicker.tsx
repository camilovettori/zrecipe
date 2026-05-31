'use client'

import { EU_ALLERGENS, type AllergenStatus } from '@/lib/allergens'
import { cn } from '@/lib/utils'

interface Props {
  value: Record<number, AllergenStatus>
  onChange: (value: Record<number, AllergenStatus>) => void
  readOnly?: boolean
}

// Clicking cycles: not set → contains → may contain → not set
function nextStatus(current: AllergenStatus | undefined): AllergenStatus | null {
  if (current === undefined) return 'contains'
  if (current === 'contains') return 'may_contain'
  return null // remove
}

export default function AllergenPicker({ value, onChange, readOnly }: Props) {
  const toggle = (allergenId: number) => {
    if (readOnly) return
    const next = nextStatus(value[allergenId])
    const updated = { ...value }
    if (next === null) {
      delete updated[allergenId]
    } else {
      updated[allergenId] = next
    }
    onChange(updated)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-500" /> Contains
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-amber-400" /> May contain
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-slate-200" /> Not present
        </span>
        {!readOnly && (
          <span className="text-slate-400">(click to cycle)</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {EU_ALLERGENS.map((allergen) => {
          const status = value[allergen.id]
          return (
            <button
              key={allergen.id}
              type="button"
              onClick={() => toggle(allergen.id)}
              disabled={readOnly}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                status === 'contains'
                  ? 'border-red-300 bg-red-50 text-red-800 shadow-sm'
                  : status === 'may_contain'
                    ? 'border-amber-300 bg-amber-50 text-amber-800 shadow-sm'
                    : readOnly
                      ? 'border-slate-100 bg-slate-50 text-slate-400'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/30'
              )}
            >
              <span className="shrink-0 text-base leading-none">{allergen.icon}</span>
              <span className="min-w-0 truncate">{allergen.shortName}</span>
              {status === 'contains' && (
                <span className="ml-auto shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  C
                </span>
              )}
              {status === 'may_contain' && (
                <span className="ml-auto shrink-0 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  ?
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
