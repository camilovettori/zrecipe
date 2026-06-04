'use client'

import { useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import type { RecipeCostSummary } from '@/hooks/useRecipes'
import { cn } from '@/lib/utils'

const VAT_PRESETS = [0, 9, 13.5, 23]

function clampMargin(v: number) {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(95, v))
}

function marginTextClass(pct: number) {
  if (pct > 60) return 'text-emerald-600 font-bold'
  if (pct >= 40) return 'text-emerald-500'
  if (pct >= 20) return 'text-amber-500'
  return 'text-red-500'
}

function sellingPriceFromMargin(costPerUnit: number, margin: number) {
  if (costPerUnit <= 0) return 0
  const d = 1 - margin / 100
  if (d <= 0) return 0
  return Number((costPerUnit / d).toFixed(2))
}

function parseMoney(value: string) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export default function CostBreakdown({
  cost,
  yieldQuantity,
  yieldUnit,
  prepTimeMinutes,
  laborHourlyRate,
  laborMode,
  overheadMode,
  overheadPercent,
  wastePercent,
  onLaborModeChange,
  onLaborCostChange,
  onOverheadModeChange,
  onOverheadCostChange,
  onOverheadPercentChange,
  onWastePercentChange,
  onSellingPriceChange,
}: {
  cost: RecipeCostSummary
  yieldQuantity?: number
  yieldUnit?: string
  prepTimeMinutes?: number
  laborHourlyRate?: number
  laborMode?: 'fixed' | 'time'
  overheadMode?: 'fixed' | 'percent'
  overheadPercent?: number
  wastePercent?: number
  onLaborModeChange: (v: 'fixed' | 'time') => void
  onLaborCostChange: (v: number) => void
  onOverheadModeChange: (v: 'fixed' | 'percent') => void
  onOverheadCostChange: (v: number) => void
  onOverheadPercentChange: (v: number) => void
  onWastePercentChange: (v: number) => void
  onSellingPriceChange: (v: number) => void
}) {
  const [lastEdited, setLastEdited] = useState<'price' | 'margin'>('price')
  const [targetMargin, setTargetMargin] = useState<number | null>(null)
  const [sellingPriceFocused, setSellingPriceFocused] = useState(false)
  const [vatEnabled, setVatEnabled] = useState(true)
  const [vatRate, setVatRate] = useState(13.5)

  const activeMargin = lastEdited === 'margin' && targetMargin != null
    ? clampMargin(targetMargin)
    : clampMargin(cost.marginPercent)

  useEffect(() => {
    if (lastEdited !== 'margin' || targetMargin == null || cost.costPerUnit <= 0) return
    const next = sellingPriceFromMargin(cost.costPerUnit, targetMargin)
    if (Math.abs(next - cost.sellingPrice) > 0.005) onSellingPriceChange(next)
  }, [cost.sellingPrice, cost.costPerUnit, lastEdited, onSellingPriceChange, targetMargin])

  const vat = useMemo(() => {
    const rate = vatEnabled ? vatRate : 0
    const ex = cost.sellingPrice
    const amount = ex * (rate / 100)
    return { ex, amount, inc: ex + amount }
  }, [cost.sellingPrice, vatEnabled, vatRate])

  const handlePriceChange = (v: string) => {
    setLastEdited('price')
    setTargetMargin(null)
    onSellingPriceChange(parseMoney(v))
  }

  const handleMarginSlider = (v: number) => {
    const m = clampMargin(v)
    setLastEdited('margin')
    setTargetMargin(m)
    onSellingPriceChange(sellingPriceFromMargin(cost.costPerUnit, m))
  }

  const handleVatRate = (v: number) => {
    const r = Number.isFinite(v) && v >= 0 ? v : 0
    setVatRate(r)
    setVatEnabled(r > 0)
  }

  const incVatActive = vatEnabled && vatRate > 0
  const isBatch = cost.isBatch
  const laborIsTime = laborMode === 'time'
  const overheadIsPercent = overheadMode === 'percent'

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Cost Breakdown</h3>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          cost.foodCostPercentage < 30 ? 'bg-emerald-100 text-emerald-700'
            : cost.foodCostPercentage < 40 ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-600'
        )}>
          Food cost {cost.foodCostPercentage.toFixed(1)}%
        </span>
      </div>

      <div className="space-y-3">
        {/* Ingredient cost — read only */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Ingredient cost</span>
          <span className="font-medium text-slate-900">€{cost.ingredientCost.toFixed(2)}</span>
        </div>

        {/* Labor cost */}
        <div className="text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Labor cost</span>
              <button
                type="button"
                onClick={() => onLaborModeChange(laborIsTime ? 'fixed' : 'time')}
                className={cn(
                  'rounded border px-1.5 py-0.5 text-xs transition-colors',
                  laborIsTime
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                    : 'border-slate-200 text-slate-400 hover:border-slate-300'
                )}
              >
                {laborIsTime ? 'time-based' : 'fixed'}
              </button>
            </div>

            {laborIsTime ? (
              <div className="text-right">
                <span className="font-medium text-slate-900">€{cost.laborCost.toFixed(2)}</span>
                <p className="text-xs text-slate-400">
                  {prepTimeMinutes ?? 0} min × €{laborHourlyRate ?? 0}/hr
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-slate-400">€</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost.laborCost}
                  onChange={(e) => onLaborCostChange(parseFloat(e.target.value || '0'))}
                  className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-right text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
                />
              </div>
            )}
          </div>
        </div>

        {/* Overhead cost */}
        <div className="text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Overhead</span>
              <button
                type="button"
                onClick={() => onOverheadModeChange(overheadIsPercent ? 'fixed' : 'percent')}
                className={cn(
                  'rounded border px-1.5 py-0.5 text-xs transition-colors',
                  overheadIsPercent
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                    : 'border-slate-200 text-slate-400 hover:border-slate-300'
                )}
              >
                {overheadIsPercent ? '% of ingredients' : 'fixed'}
              </button>
            </div>

            {overheadIsPercent ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={overheadPercent ?? 0}
                  onChange={(e) => onOverheadPercentChange(parseFloat(e.target.value || '0'))}
                  className="w-14 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
                />
                <span className="text-slate-400">%</span>
                <span className="w-16 text-right font-medium text-slate-900">
                  €{cost.overheadCost.toFixed(2)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-slate-400">€</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost.overheadCost}
                  onChange={(e) => onOverheadCostChange(parseFloat(e.target.value || '0'))}
                  className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-right text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
                />
              </div>
            )}
          </div>
        </div>

        {/* Waste % */}
        <div className={cn(
          'rounded-lg text-sm transition-colors',
          (wastePercent ?? 0) > 10 ? 'bg-amber-50 px-2 py-1' : ''
        )}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Waste</span>
              <span className="text-xs italic text-slate-400">production loss</span>
              {(wastePercent ?? 0) > 10 && (
                <span className="text-xs font-medium text-amber-600">high</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={wastePercent ?? 0}
                onChange={(e) => onWastePercentChange(parseFloat(e.target.value || '0'))}
                className="w-14 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
              />
              <span className="text-slate-400">%</span>
              {(wastePercent ?? 0) > 0 && (
                <span className="w-16 text-right text-slate-500">
                  +€{cost.wasteCost.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="my-4 h-px bg-slate-200" />

      {/* Three summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {/* Card 1 — Total / Batch cost */}
        <div className={cn(
          'flex min-w-0 flex-col items-center rounded-xl p-4 text-center',
          isBatch ? 'border border-emerald-200 bg-emerald-50' : 'border border-gray-200 bg-gray-50'
        )}>
          <span className={cn(
            'text-xs font-semibold uppercase tracking-wider',
            isBatch ? 'text-emerald-600' : 'text-gray-400'
          )}>
            {isBatch ? 'Batch cost' : 'Total cost'}
          </span>
          <span className={cn(
            'mt-2 text-2xl font-bold',
            isBatch ? 'text-emerald-800' : 'text-gray-800'
          )}>
            €{cost.totalCost.toFixed(2)}
          </span>
          {isBatch && (yieldQuantity ?? 0) > 1 ? (
            <>
              <span className="mt-1 text-xs font-medium text-emerald-600">
                €{cost.costPerUnit.toFixed(3)} / unit &times; {yieldQuantity}
              </span>
              {incVatActive && (
                <>
                  <span className="my-1 w-full border-t border-emerald-200" />
                  <span className="text-xs text-gray-400">Batch incl. VAT</span>
                  <span className="text-sm font-semibold text-gray-600">
                    €{(cost.totalCost * (1 + vatRate / 100)).toFixed(2)}
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="mt-1 text-xs text-gray-400">
              per {yieldUnit ?? 'unit'}
            </span>
          )}
        </div>

        {/* Card 2 — Selling price */}
        <label className="flex min-w-0 flex-col items-center rounded-xl border-2 border-emerald-400 bg-white p-4 text-center shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            {isBatch ? 'Price / unit' : 'Selling price'}
          </span>
          <div className="mt-1 flex w-full items-center justify-center border-b border-transparent transition focus-within:border-emerald-400">
            <span className="text-lg font-semibold text-gray-400">€</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cost.sellingPrice > 0 ? cost.sellingPrice : ''}
              placeholder="0.00"
              onFocus={() => setSellingPriceFocused(true)}
              onBlur={() => setSellingPriceFocused(false)}
              onChange={(e) => handlePriceChange(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-center text-2xl font-bold text-gray-900 outline-none placeholder:text-gray-300"
            />
          </div>
          {!sellingPriceFocused && cost.sellingPrice <= 0 ? (
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
              <Pencil className="h-3 w-3" />
              tap to edit
            </span>
          ) : (
            <span className="mt-0.5 text-xs text-gray-400">ex VAT</span>
          )}
          {incVatActive && cost.sellingPrice > 0 && (
            <div className="mt-1.5 w-full border-t border-gray-100 pt-1.5">
              <div className="flex items-center justify-center gap-1">
                <span className="text-sm font-semibold text-indigo-600">
                  €{vat.inc.toFixed(2)}
                </span>
                <span className="text-xs text-indigo-400">inc VAT</span>
              </div>
            </div>
          )}
          {isBatch && (yieldQuantity ?? 0) > 1 && cost.sellingPrice > 0 && (
            <span className="mt-1 text-xs text-gray-400">
              Batch: €{(cost.sellingPrice * (yieldQuantity ?? 1)).toFixed(2)}
            </span>
          )}
        </label>

        {/* Card 3 — Profit */}
        {(() => {
          const profitPerUnit = cost.sellingPrice - cost.costPerUnit
          const batchProfit = isBatch ? profitPerUnit * (yieldQuantity ?? 1) : null
          const isProfit = profitPerUnit >= 0
          return (
            <div className={cn(
              'flex min-w-0 flex-col items-center rounded-xl border p-4 text-center',
              cost.sellingPrice <= 0
                ? 'border-dashed border-gray-200 bg-gray-50'
                : isProfit
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
            )}>
              {cost.sellingPrice <= 0 ? (
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                  Set price to see profit
                </span>
              ) : (
                <>
                  <span className={cn(
                    'text-xs font-semibold uppercase tracking-wider',
                    isProfit ? 'text-emerald-600' : 'text-red-500'
                  )}>
                    {isBatch ? 'Batch profit' : 'Profit'}
                  </span>
                  <span className={cn('mt-2 text-2xl font-bold', isProfit ? 'text-emerald-700' : 'text-red-500')}>
                    {profitPerUnit >= 0 ? '+' : ''}€{(batchProfit ?? profitPerUnit).toFixed(2)}
                  </span>
                  {isBatch && (yieldQuantity ?? 0) > 1 ? (
                    <span className="mt-1 text-xs text-emerald-500">
                      €{profitPerUnit.toFixed(2)} / unit
                    </span>
                  ) : (
                    <span className={cn('mt-1 text-xs', isProfit ? 'text-emerald-400' : 'text-red-400')}>
                      per unit sold
                    </span>
                  )}
                  {!isProfit && (
                    <span className="mt-1 text-xs font-medium text-red-500">selling at loss</span>
                  )}
                </>
              )}
            </div>
          )
        })()}
      </div>

      {/* Margin */}
      <div className="mt-4 space-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">Margin</span>
          <span className={`text-2xl font-bold ${marginTextClass(activeMargin)}`}>
            {activeMargin.toFixed(1)}%
          </span>
        </div>

        <div className="relative pt-2">
          <input
            type="range"
            min={0}
            max={95}
            step={0.5}
            value={activeMargin}
            onChange={(e) => handleMarginSlider(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-red-400 via-amber-400 to-emerald-500 outline-none [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-500 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform active:[&::-webkit-slider-thumb]:scale-110 [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-500 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md"
          />
        </div>

        <div className="relative h-4 text-xs text-gray-400">
          <span className="absolute left-0 top-0">0%</span>
          {activeMargin > 60 && (
            <span className="absolute left-[65%] top-0 -translate-x-1/2 font-medium text-emerald-600">
              ✓ Excellent
            </span>
          )}
          <span className="absolute right-0 top-0">100%</span>
        </div>
      </div>

      {/* VAT calculator */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">VAT calculator</h4>
            <p className="mt-0.5 text-xs text-slate-500">Estimate tax from the selling price.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={vatEnabled}
            onClick={() => setVatEnabled((e) => !e)}
            className={`relative h-6 w-11 rounded-full transition ${vatEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${vatEnabled ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        <div className="mb-3 space-y-2">
          <label className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
            VAT rate
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition focus-within:border-emerald-500 focus-within:bg-white">
              <input
                type="number"
                min="0"
                step="0.5"
                value={vatRate}
                onChange={(e) => handleVatRate(Number(e.target.value))}
                className="w-16 bg-transparent px-2 py-1 text-right text-xs text-slate-700 outline-none"
              />
              <span className="pr-2 text-xs text-slate-400">%</span>
            </div>
          </label>

          <div className="flex flex-wrap gap-1.5">
            {VAT_PRESETS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => handleVatRate(rate)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  vatRate === rate && vatEnabled === (rate > 0)
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {rate}%
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">VAT amount</span>
          <span className="font-medium text-slate-900">€{vat.amount.toFixed(2)}</span>
        </div>
      </div>
    </section>
  )
}
