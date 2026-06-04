'use client'

import { useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import type { RecipeCostSummary } from '@/hooks/useRecipes'

const VAT_PRESETS = [0, 9, 13.5, 23]

function clampMargin(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(95, value))
}

function marginTextClass(pct: number) {
  if (pct > 60) return 'text-emerald-600 font-bold'
  if (pct >= 40) return 'text-emerald-500'
  if (pct >= 20) return 'text-amber-500'
  return 'text-red-500'
}

function sellingPriceFromMargin(totalCost: number, margin: number) {
  if (totalCost <= 0) return 0
  const denominator = 1 - margin / 100
  if (denominator <= 0) return 0
  return Number((totalCost / denominator).toFixed(2))
}

function parseMoney(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
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
  const [lastEdited, setLastEdited] = useState<'price' | 'margin'>('price')
  const [targetMargin, setTargetMargin] = useState<number | null>(null)
  const [sellingPriceFocused, setSellingPriceFocused] = useState(false)
  const [vatEnabled, setVatEnabled] = useState(true)
  const [vatRate, setVatRate] = useState(13.5)

  const margin = clampMargin(cost.marginPercent)
  const activeMargin = lastEdited === 'margin' && targetMargin != null ? targetMargin : margin
  const costPerPortion =
    yieldQuantity && yieldQuantity > 0 ? cost.totalCost / yieldQuantity : null

  useEffect(() => {
    if (lastEdited !== 'margin' || targetMargin == null || cost.totalCost <= 0) return
    const nextSellingPrice = sellingPriceFromMargin(cost.totalCost, targetMargin)
    if (Math.abs(nextSellingPrice - cost.sellingPrice) > 0.005) {
      onSellingPriceChange(nextSellingPrice)
    }
  }, [cost.sellingPrice, cost.totalCost, lastEdited, onSellingPriceChange, targetMargin])

  const vat = useMemo(() => {
    const effectiveRate = vatEnabled ? vatRate : 0
    const exVat = cost.sellingPrice
    const amount = exVat * (effectiveRate / 100)
    return {
      exVat,
      amount,
      incVat: exVat + amount,
    }
  }, [cost.sellingPrice, vatEnabled, vatRate])

  const handlePriceChange = (value: string) => {
    setLastEdited('price')
    setTargetMargin(null)
    onSellingPriceChange(parseMoney(value))
  }

  const handleMarginSliderChange = (value: number) => {
    const nextMargin = clampMargin(value)
    setLastEdited('margin')
    setTargetMargin(nextMargin)
    onSellingPriceChange(sellingPriceFromMargin(cost.totalCost, nextMargin))
  }

  const handleVatRateChange = (value: number) => {
    const nextRate = Number.isFinite(value) && value >= 0 ? value : 0
    setVatRate(nextRate)
    setVatEnabled(nextRate > 0)
  }

  const incVatActive = vatEnabled && vatRate > 0

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Cost Breakdown</h3>
        <span className="text-xs text-slate-400">
          Food cost {cost.foodCostPercentage.toFixed(1)}%
        </span>
      </div>

      <div className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Ingredient cost</span>
            <span className="font-medium text-slate-900">
              {'\u20ac'}{cost.ingredientCost.toFixed(2)}
            </span>
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
        </div>

        <div className="h-px bg-slate-200" />

        <div className="grid grid-cols-3 gap-3">
          <div className="flex min-w-0 flex-col items-center rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Total cost
            </span>
            <span className="mt-2 text-2xl font-bold text-gray-800">
              {'\u20ac'}{cost.totalCost.toFixed(2)}
            </span>
            <span className="mt-1 text-xs text-gray-400">
              per {yieldUnit ?? 'unit'}{' '}
              {costPerPortion != null ? `\u20ac${costPerPortion.toFixed(3)}` : '\u2014'}
            </span>
          </div>

          <label className="flex min-w-0 flex-col items-center rounded-xl border-2 border-emerald-400 bg-white p-4 text-center shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
              Selling price
            </span>
            <div className="mt-1 flex w-full items-center justify-center border-b border-transparent transition focus-within:border-emerald-400">
              <span className="text-lg font-semibold text-gray-400">{'\u20ac'}</span>
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
            {!sellingPriceFocused && cost.sellingPrice <= 0 && (
              <span className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
                <Pencil className="h-3 w-3" />
                tap to edit
              </span>
            )}
          </label>

          <div
            className={
              incVatActive
                ? 'flex min-w-0 flex-col items-center rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-center'
                : 'flex min-w-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-4 text-center'
            }
          >
            {incVatActive ? (
              <>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
                  Inc VAT
                </span>
                <span className="mt-2 text-2xl font-bold text-indigo-600">
                  {'\u20ac'}{vat.incVat.toFixed(2)}
                </span>
                <span className="mt-1 text-xs text-indigo-400">{vatRate}% VAT</span>
              </>
            ) : (
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                INC VAT &mdash; Enable VAT below
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
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
              onChange={(e) => handleMarginSliderChange(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-red-400 via-amber-400 to-emerald-500 outline-none [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-500 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform active:[&::-webkit-slider-thumb]:scale-110 [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-500 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md"
            />
          </div>

          <div className="relative h-4 text-xs text-gray-400">
            <span className="absolute left-0 top-0">0%</span>
            {activeMargin > 60 && (
              <span className="absolute left-[65%] top-0 -translate-x-1/2 font-medium text-emerald-600">
                {'\u2713'} Excellent
              </span>
            )}
            <span className="absolute right-0 top-0">100%</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">VAT calculator</h4>
              <p className="mt-0.5 text-xs text-slate-500">Estimate tax from the selling price.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={vatEnabled}
              onClick={() => setVatEnabled((enabled) => !enabled)}
              className={`relative h-6 w-11 rounded-full transition ${
                vatEnabled ? 'bg-emerald-500' : 'bg-slate-200'
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${
                  vatEnabled ? 'left-6' : 'left-1'
                }`}
              />
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
                  onChange={(e) => handleVatRateChange(Number(e.target.value))}
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
                  onClick={() => handleVatRateChange(rate)}
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

          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Ex VAT</span>
              <span className="font-medium text-slate-900">
                {'\u20ac'}{vat.exVat.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">VAT amount</span>
              <span className="font-medium text-slate-900">
                {'\u20ac'}{vat.amount.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
