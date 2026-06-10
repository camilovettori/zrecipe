'use client'

import { useEffect, useState } from 'react'
import type { RecipeCostSummary } from '@/hooks/useRecipes'
import { cn } from '@/lib/utils'

const VAT_PRESETS = [0, 9, 13.5, 23]

function clampMargin(v: number) {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(95, v))
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

  const yieldQty = Math.max(1, yieldQuantity ?? 1)
  const laborIsTime = laborMode === 'time'
  const overheadIsPercent = overheadMode === 'percent'
  const profitPerUnit = cost.sellingPrice - cost.costPerUnit
  const foodCostPct = cost.foodCostPercentage

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Cost Breakdown</h3>
        <span className={cn(
          'rounded-full px-2.5 py-1 text-xs font-semibold',
          foodCostPct < 25 ? 'bg-emerald-100 text-emerald-700'
            : foodCostPct < 35 ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-600'
        )}>
          Food cost {foodCostPct.toFixed(1)}%
        </span>
      </div>

      <div>
        {/* Ingredient cost */}
        <div className="flex items-center justify-between border-b border-gray-50 py-2">
          <span className="text-sm text-gray-500">Ingredient cost</span>
          <span className="text-sm font-semibold text-gray-800">
            €{cost.ingredientCost.toFixed(2)}
          </span>
        </div>

        {/* Labor */}
        <div className="flex items-start justify-between border-b border-gray-50 py-2">
          <div className="flex flex-1 items-center gap-1.5">
            <span className="text-sm text-gray-500">Labor</span>
            <div className="flex rounded-lg bg-gray-100 p-0.5">
              <button
                type="button"
                onClick={() => onLaborModeChange('fixed')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-medium transition-all',
                  !laborIsTime ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-400 hover:text-gray-500'
                )}
              >
                fixed
              </button>
              <button
                type="button"
                onClick={() => onLaborModeChange('time')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-medium transition-all',
                  laborIsTime ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-500'
                )}
              >
                time
              </button>
            </div>
          </div>
          {laborIsTime ? (
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-800">
                €{cost.laborCost.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400">
                {prepTimeMinutes ?? 0}min × €{laborHourlyRate ?? 0}/hr
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">€</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cost.laborCost || ''}
                onChange={(e) => onLaborCostChange(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                className="w-16 rounded border border-gray-200 px-2 py-0.5 text-right text-sm focus:border-emerald-400 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Overhead */}
        <div className="flex items-center justify-between border-b border-gray-50 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500">Overhead</span>
            <div className="flex rounded-lg bg-gray-100 p-0.5">
              <button
                type="button"
                onClick={() => onOverheadModeChange('fixed')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-medium transition-all',
                  !overheadIsPercent ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-400 hover:text-gray-500'
                )}
              >
                fixed
              </button>
              <button
                type="button"
                onClick={() => onOverheadModeChange('percent')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-medium transition-all',
                  overheadIsPercent ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-500'
                )}
              >
                % ingr.
              </button>
            </div>
          </div>
          {overheadIsPercent ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                max="100"
                value={overheadPercent || ''}
                onChange={(e) => onOverheadPercentChange(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                className="w-12 rounded border border-gray-200 px-2 py-0.5 text-right text-sm focus:border-emerald-400 focus:outline-none"
              />
              <span className="text-xs text-gray-400">%</span>
              <span className="w-14 text-right text-sm font-semibold text-gray-800">
                €{cost.overheadCost.toFixed(2)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">€</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cost.overheadCost || ''}
                onChange={(e) => onOverheadCostChange(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                className="w-16 rounded border border-gray-200 px-2 py-0.5 text-right text-sm focus:border-emerald-400 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Waste */}
        <div className={cn(
          'flex items-center justify-between rounded-lg py-2 transition-colors',
          (wastePercent ?? 0) > 10 ? '-mx-2 bg-amber-50 px-2' : ''
        )}>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Waste</span>
            <span className="text-xs italic text-gray-400">production loss</span>
            {(wastePercent ?? 0) > 10 && (
              <span className="text-xs font-medium text-amber-600">⚠</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="0"
              max="100"
              placeholder="0"
              value={wastePercent || ''}
              onChange={(e) => onWastePercentChange(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
              className="w-12 rounded border border-gray-200 px-2 py-0.5 text-right text-sm focus:border-emerald-400 focus:outline-none"
            />
            <span className="text-xs text-gray-400">%</span>
            {(wastePercent ?? 0) > 0 && (
              <span className="w-14 text-right text-sm text-gray-500">
                +€{cost.wasteCost.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="my-4 border-t-2 border-gray-100" />

      {/* SECTION 2: Summary strip — 2 cards side by side */}
      <div className="mb-4 grid grid-cols-2 gap-3">

        {/* LEFT — Total Cost */}
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Total Cost
          </p>
          <p className="mb-1 text-2xl font-black text-gray-800">
            €{cost.totalCost.toFixed(2)}
          </p>
          {yieldQty > 1 && (
            <p className="text-xs text-gray-400">
              €{cost.costPerUnit.toFixed(3)} per unit · {yieldQty} units
            </p>
          )}
        </div>

        {/* RIGHT — Selling Price (editable) */}
        <div className="rounded-2xl border-2 border-emerald-500 bg-white p-4 shadow-sm shadow-emerald-100">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-600">
            {yieldQty > 1 ? 'Price per Unit' : 'Selling Price'}
          </p>
          <div className="mb-1 flex items-baseline gap-1">
            <span className="text-base text-gray-400">€</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={sellingPriceFocused
                ? (cost.sellingPrice > 0 ? cost.sellingPrice : '')
                : (cost.sellingPrice > 0 ? Number(cost.sellingPrice).toFixed(2) : '')}
              placeholder="0.00"
              onFocus={() => setSellingPriceFocused(true)}
              onBlur={() => setSellingPriceFocused(false)}
              onChange={(e) => handlePriceChange(e.target.value)}
              className="w-full bg-transparent text-2xl font-black leading-none text-gray-900 outline-none placeholder:text-gray-300"
            />
          </div>
          {vatEnabled && vatRate > 0 && (
            <p className="text-xs text-gray-400">
              €{(cost.sellingPrice * (1 + vatRate / 100)).toFixed(2)} inc {vatRate}% VAT
            </p>
          )}
        </div>
      </div>

      {/* SECTION 3: Results card */}
      <div className={cn(
        'mb-4 rounded-2xl border p-5',
        profitPerUnit >= 0
          ? 'border-emerald-100 bg-gradient-to-b from-emerald-50/80 to-white'
          : 'border-red-100 bg-gradient-to-b from-red-50/80 to-white'
      )}>

        {/* Margin + Slider */}
        <div className="mb-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-gray-600">Margin</span>
            <span className={cn(
              'text-3xl font-black',
              activeMargin < 20 ? 'text-red-500'
                : activeMargin < 40 ? 'text-amber-500'
                : activeMargin < 60 ? 'text-emerald-500'
                : 'text-emerald-600'
            )}>
              {activeMargin.toFixed(1)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={95}
            step={0.5}
            value={Math.max(0, Math.min(95, activeMargin))}
            onChange={(e) => handleMarginSlider(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-red-400 via-amber-400 to-emerald-500 outline-none [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-500 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform active:[&::-webkit-slider-thumb]:scale-110 [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-500 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md"
          />
          <div className="mt-1 flex justify-between">
            <span className="text-[10px] text-gray-300">0%</span>
            {activeMargin >= 55 && (
              <span className="text-[10px] font-medium text-emerald-500">Excellent</span>
            )}
            <span className="text-[10px] text-gray-300">100%</span>
          </div>
        </div>

        <div className="my-3 border-t border-gray-100" />

        {/* Profit per unit */}
        <div className="flex items-center justify-between py-1.5">
          <span className="text-sm text-gray-500">Profit per unit</span>
          <span className={cn(
            'text-lg font-bold',
            profitPerUnit >= 0 ? 'text-emerald-600' : 'text-red-500'
          )}>
            {profitPerUnit >= 0 ? '+' : ''}€{profitPerUnit.toFixed(2)}
          </span>
        </div>

        {/* Batch rows */}
        {yieldQty > 1 && cost.sellingPrice > 0 && (
          <>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-500">Batch revenue ({yieldQty} units)</span>
              <span className="text-sm font-semibold text-gray-700">
                €{(cost.sellingPrice * yieldQty).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-500">Batch profit</span>
              <span className={cn(
                'text-sm font-semibold',
                profitPerUnit >= 0 ? 'text-emerald-600' : 'text-red-500'
              )}>
                {profitPerUnit >= 0 ? '+' : ''}€{(profitPerUnit * yieldQty).toFixed(2)}
              </span>
            </div>
          </>
        )}

        {/* Loss warning */}
        {profitPerUnit < 0 && (
          <div className="mt-3 rounded-xl bg-red-100 p-2.5">
            <p className="text-center text-xs font-medium text-red-600">
              Selling below cost — increase price or reduce costs
            </p>
          </div>
        )}
      </div>

      {/* VAT toggle — compact */}
      <div className="rounded-2xl border border-gray-100 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">VAT</p>
            <p className="text-xs text-gray-400">Applied to selling price</p>
          </div>
          <button
            type="button"
            onClick={() => setVatEnabled((prev) => !prev)}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0',
              vatEnabled ? 'bg-emerald-500' : 'bg-gray-200'
            )}
          >
            <span className={cn(
              'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
              vatEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
            )} />
          </button>
        </div>

        {vatEnabled && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1.5">
                {VAT_PRESETS.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setVatRate(rate)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                      vatRate === rate
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={vatRate}
                  onChange={(e) => setVatRate(Math.max(0, Number(e.target.value)))}
                  className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm focus:border-emerald-400 focus:outline-none"
                />
                <span className="text-xs text-gray-400">%</span>
              </div>
            </div>
            <div className="flex justify-between pt-1 text-sm">
              <span className="text-gray-500">VAT amount</span>
              <span className="font-medium text-gray-700">
                €{(cost.sellingPrice * vatRate / 100).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
