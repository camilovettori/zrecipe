'use client'

import type { RecipeCostSummary } from '@/hooks/useRecipes'

function marginTone(marginPercent: number) {
  if (marginPercent >= 30) return 'bg-emerald-500'
  if (marginPercent >= 15) return 'bg-amber-500'
  return 'bg-red-500'
}

function marginText(marginPercent: number) {
  if (marginPercent >= 30) return 'text-emerald-700'
  if (marginPercent >= 15) return 'text-amber-700'
  return 'text-red-700'
}

export default function CostBreakdown({
  cost,
  onLaborCostChange,
  onOverheadCostChange,
  onSellingPriceChange,
}: {
  cost: RecipeCostSummary
  onLaborCostChange: (value: number) => void
  onOverheadCostChange: (value: number) => void
  onSellingPriceChange: (value: number) => void
}) {
  const marginWidth = Math.max(0, Math.min(100, cost.marginPercent + 50))

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Cost Breakdown
        </h3>
        <span className="text-xs text-slate-400">
          Food cost {cost.foodCostPercentage.toFixed(1)}%
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Ingredient Cost</span>
          <span className="font-medium text-slate-900">€{cost.ingredientCost.toFixed(2)}</span>
        </div>

        <label className="flex items-center justify-between gap-4 text-sm">
          <span className="text-slate-500">Labor Cost</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost.laborCost}
            onChange={(event) => onLaborCostChange(Number.parseFloat(event.target.value || '0'))}
            className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right outline-none transition focus:border-emerald-500 focus:bg-white"
          />
        </label>

        <label className="flex items-center justify-between gap-4 text-sm">
          <span className="text-slate-500">Overhead Cost</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost.overheadCost}
            onChange={(event) => onOverheadCostChange(Number.parseFloat(event.target.value || '0'))}
            className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right outline-none transition focus:border-emerald-500 focus:bg-white"
          />
        </label>

        <div className="h-px bg-slate-200" />

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Total Cost</span>
          <span className="text-xl font-semibold text-slate-900">€{cost.totalCost.toFixed(2)}</span>
        </div>

        <label className="flex items-center justify-between gap-4 text-sm">
          <span className="text-slate-500">Selling Price</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost.sellingPrice}
            onChange={(event) =>
              onSellingPriceChange(Number.parseFloat(event.target.value || '0'))
            }
            className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right outline-none transition focus:border-emerald-500 focus:bg-white"
          />
        </label>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Margin</span>
          <span className={`text-lg font-semibold ${marginText(cost.marginPercent)}`}>
            {cost.marginPercent.toFixed(1)}%
          </span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${marginTone(cost.marginPercent)}`}
            style={{ width: `${marginWidth}%` }}
          />
        </div>
      </div>
    </section>
  )
}

