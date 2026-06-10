'use client'

import { useEffect, useRef, useState } from 'react'
import type { RecipeIngredientDraft } from '@/hooks/useRecipes'
import { findYieldFactor } from '@/lib/data/yield-factors'
import { cn } from '@/lib/utils'

interface Props {
  item: RecipeIngredientDraft
  onUpdate: (patch: Partial<RecipeIngredientDraft>) => void
}

export function YieldFactorPopover({ item, onUpdate }: Props) {
  const yieldPct = item.yield_percent ?? 100
  const [open, setOpen] = useState(false)
  const [localPct, setLocalPct] = useState(yieldPct)
  const [yfEnabled, setYfEnabled] = useState(yieldPct < 100)
  const containerRef = useRef<HTMLDivElement>(null)

  const suggestion = findYieldFactor(item.ingredientName)
  const suggestedPct = suggestion?.yieldPercent ?? 80

  const previewApQty = localPct > 0
    ? Math.ceil(item.quantity / (localPct / 100))
    : item.quantity

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const handleOpen = () => {
    setLocalPct(Math.round(yieldPct))
    setYfEnabled(yieldPct < 100)
    setOpen((v) => !v)
  }

  const handleApply = () => {
    const clamped = Math.min(100, Math.max(1, localPct || 100))
    onUpdate({ yield_percent: clamped, yield_override: clamped !== suggestedPct })
    setOpen(false)
  }

  const handleReset = () => {
    setLocalPct(suggestedPct)
  }

  const handleToggle = () => {
    const newEnabled = !yfEnabled
    setYfEnabled(newEnabled)
    if (!newEnabled) {
      onUpdate({ yield_percent: 100, yield_override: false })
      setOpen(false)
    } else {
      setLocalPct(suggestedPct)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {yieldPct < 100 ? (
        <button
          type="button"
          onClick={handleOpen}
          title="Yield factor applied — click to edit"
          className="flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
        >
          YF {Math.round(yieldPct)}%
        </button>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          title="No yield loss — click to set yield factor"
          className="rounded-md px-1.5 py-0.5 text-xs text-slate-300 transition-colors hover:bg-slate-50 hover:text-slate-500"
        >
          YF
        </button>
      )}

      {open && (
        <div className="dropdown-in absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">

          {/* Header with toggle */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-gray-800">Yield Factor</p>
              <p className="mt-0.5 text-xs leading-tight text-gray-400">
                {yfEnabled ? 'Trim loss applied' : 'No trim loss'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggle}
              className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0',
                yfEnabled ? 'bg-emerald-500' : 'bg-gray-200'
              )}
            >
              <span className={cn(
                'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
                yfEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
              )} />
            </button>
          </div>

          {yfEnabled ? (
            <>
              {suggestion && (
                <p className="mb-2 text-xs text-slate-400">
                  Reference: {suggestedPct}% — {suggestion.notes}
                </p>
              )}

              <div className="mb-3 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={localPct || ''}
                  onChange={(e) => setLocalPct(Number(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleApply() }}
                  autoFocus
                  className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-emerald-500"
                />
                <span className="text-sm text-slate-500">%</span>
                {localPct < 100 && item.quantity > 0 && (
                  <span className="text-xs text-slate-400">
                    AP: {previewApQty}{item.unit}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                  title={`Restore reference value (${suggestedPct}%)`}
                >
                  Reset
                </button>
              </div>
            </>
          ) : (
            <p className="py-2 text-xs text-gray-400">
              Enable to account for trim loss (peeling, boning, etc.)
            </p>
          )}
        </div>
      )}
    </div>
  )
}
