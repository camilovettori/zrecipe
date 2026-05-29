'use client'

import type { RecipeCostSummary } from '@/hooks/useRecipes'

function marginTone(pct: number) {
  if (pct >= 60) return 'bg-emerald-500'
  if (pct >= 30) return 'bg-amber-500'
  return 'bg-red-500'
}

function marginTextClass(pct: number) {
  if (pct >= 60) return 'text-emerald-700'
  if (pct >= 30) return 'text-amber-700'
  return 'text-red-700'
}

export default function CostBreakdown({
  cost,
  yieldQuantity,
  yieldUnit,
  onLaborCostChange,
  onOverheadCostChange,
  onSellingPriceChange,
}: {
  cost: RecipeCostSummary
  yieldQuantity?: number
  yieldUnit?: string
  onLaborCostChange: (value: number) => void
  onOverheadCostChange: (value: number) => void
  onSellingPriceChange: (value: number) => void
}) {
  const marginWidth = Math.max(0, Math.min(100, cost.marginPercent))
  const costPerPortion =
    yieldQuantity && yieldQuantity > 0 ? cost.totalCost / yieldQuantity : null

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Cost Breakdown</h3>
        <span className="text-xs text-slate-400">
          Food cost {cost.foodCostPercentage.toFixed(1)}%
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Ingredient cost</span>
          <span className="font-medium text-slate-900">€{cost.ingredientCost.toFixed(2)}</span>
        </div>

        <label className="flex items-center justify-between gap-4 text-sm">
          <span className="text-slate-500">Labor cost</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost.laborCost}
            onChange={(e) => onLaborCostChange(parseFloat(e.target.value || '0'))}
            className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-right text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
          />
        </label>

        <label className="flex items-center justify-between gap-4 text-sm">
          <span className="text-slate-500">Overhead cost</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost.overheadCost}
            onChange={(e) => onOverheadCostChange(parseFloat(e.target.value || '0'))}
            className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-right text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
          />
        </label>

        <div className="h-px bg-slate-200" />

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">Total cost</span>
          <span className="text-xl font-bold text-slate-900">€{cost.totalCost.toFixed(2)}</span>
        </div>

        <label className="flex items-center justify-between gap-4 text-sm">
          <span className="text-slate-500">Selling price</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost.sellingPrice}
            onChange={(e) => onSellingPriceChange(parseFloat(e.target.value || '0'))}
            className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-right text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
          />
        </label>

        <div className="h-px bg-slate-200" />

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">Margin</span>
          <span className={`text-xl font-bold ${marginTextClass(cost.marginPercent)}`}>
            {cost.marginPercent.toFixed(1)}%
          </span>
        </div>

        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${marginTone(cost.marginPercent)}`}
            style={{ width: `${marginWidth}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>0%</span>
          <span className="text-slate-500 font-medium">
            {cost.marginPercent >= 60
              ? '✓ Excellent'
              : cost.marginPercent >= 30
                ? '◎ Acceptable'
                : '✗ Low margin'}
          </span>
          <span>100%</span>
        </div>

        {costPerPortion != null && (
          <>
            <div className="h-px bg-slate-200" />
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
              <span className="text-xs text-slate-500">
                Cost per {yieldUnit ?? 'portion'}
              </span>
              <span className="text-sm font-semibold text-slate-900">
                €{costPerPortion.toFixed(3)}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
