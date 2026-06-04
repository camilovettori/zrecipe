'use client'

import { useEffect, useRef, useState } from 'react'
import type { RecipeIngredientDraft } from '@/hooks/useRecipes'
import { findYieldFactor } from '@/lib/data/yield-factors'

interface Props {
  item: RecipeIngredientDraft
  onUpdate: (patch: Partial<RecipeIngredientDraft>) => void
}

export function YieldFactorPopover({ item, onUpdate }: Props) {
  const yieldPct = item.yield_percent ?? 100
  const [open, setOpen] = useState(false)
  const [localPct, setLocalPct] = useState(yieldPct)
  const ref = useRef<HTMLDivElement>(null)

  const suggestion = findYieldFactor(item.ingredientName)
  const suggestedPct = suggestion?.yieldPercent ?? 100

  const previewApQty = localPct > 0
    ? Math.ceil(item.quantity / (localPct / 100))
    : item.quantity

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
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
    setLocalPct(yieldPct)
    setOpen((v) => !v)
  }

  const handleApply = () => {
    const clamped = Math.min(100, Math.max(1, localPct || 100))
    onUpdate({ yield_percent: clamped, yield_override: clamped !== suggestedPct })
    setOpen(false)
  }

  const handleReset = () => {
    onUpdate({ yield_percent: suggestedPct, yield_override: false })
    setOpen(false)
  }

  const isOverridden = item.yield_override && yieldPct !== suggestedPct

  return (
    <div ref={ref} className="relative">
      {yieldPct < 100 ? (
        <button
          type="button"
          onClick={handleOpen}
          title="Yield factor applied — click to edit"
          className="flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
        >
          YF {yieldPct}%
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
        <div className="dropdown-in absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-1 text-xs font-semibold text-slate-700">Yield Factor</p>

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
              value={localPct}
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
            {isOverridden && (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                title={`Reset to reference (${suggestedPct}%)`}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
