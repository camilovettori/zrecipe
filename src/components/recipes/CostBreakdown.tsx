'use client'

import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
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

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="ml-1 text-gray-300 transition-colors hover:text-gray-400 focus:outline-none"
        tabIndex={-1}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {show && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-52 -translate-x-1/2">
          <div className="relative rounded-lg bg-gray-800 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
            {text}
            <div className="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-800" />
          </div>
        </div>
      )}
    </div>
  )
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
  batchMultiplier = 1,
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
  batchMultiplier?: number
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
  const [focusedIncVatStr, setFocusedIncVatStr] = useState('')
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

  // The large input field represents the inc-VAT price when VAT is enabled.
  // Ex-VAT is derived from it and is what gets stored / used in margin math.
  const displayIncVat = vatEnabled && vatRate > 0
    ? cost.sellingPrice * (1 + vatRate / 100)
    : cost.sellingPrice

  const handleIncVatChange = (v: string) => {
    setFocusedIncVatStr(v)
    setLastEdited('price')
    setTargetMargin(null)
    const incVat = parseMoney(v)
    if (vatEnabled && vatRate > 0) {
      onSellingPriceChange(incVat / (1 + vatRate / 100))
    } else {
      onSellingPriceChange(incVat)
    }
  }

  // When VAT rate changes: keep the inc-VAT price the user entered fixed,
  // recompute ex-VAT from the new rate so the shelf price stays the same.
  const handleVatRateChange = (newRate: number) => {
    const currentIncVat = vatEnabled && vatRate > 0
      ? cost.sellingPrice * (1 + vatRate / 100)
      : cost.sellingPrice
    setVatRate(newRate)
    if (newRate > 0) {
      onSellingPriceChange(currentIncVat / (1 + newRate / 100))
    } else {
      onSellingPriceChange(currentIncVat)
    }
  }

  const handleMarginSlider = (v: number) => {
    const m = clampMargin(v)
    setLastEdited('margin')
    setTargetMargin(m)
    onSellingPriceChange(sellingPriceFromMargin(cost.costPerUnit, m))
  }

  const yieldQty = Math.max(1, yieldQuantity ?? 1)
  const yieldUnitLabel = (yieldUnit ?? '').trim()
  const laborIsTime = laborMode === 'time'
  const overheadIsPercent = overheadMode === 'percent'
  const profitPerUnit = cost.sellingPrice - cost.costPerUnit
  const foodCostPct = cost.foodCostPercentage

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Cost Breakdown</h3>
          {batchMultiplier > 1 && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
              Batch ×{batchMultiplier}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className={cn(
            'rounded-full px-2.5 py-1 text-xs font-semibold',
            foodCostPct < 25 ? 'bg-emerald-100 text-emerald-700'
              : foodCostPct < 35 ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-600'
          )}>
            Food cost {foodCostPct.toFixed(1)}%
          </span>
          <InfoTooltip text="Percentage of selling price that goes to costs. Industry target: under 35%." />
        </div>
      </div>

      <div>
        {/* Ingredient cost */}
        <div className="flex items-center justify-between border-b border-gray-50 py-2">
          <div className="flex items-center">
            <span className="text-sm text-gray-500">Ingredient cost</span>
            <InfoTooltip text="Total cost of all ingredients in this recipe, adjusted for yield factor." />
          </div>
          <span className="text-sm font-semibold text-gray-800">
            €{(cost.ingredientCost * batchMultiplier).toFixed(2)}
          </span>
        </div>

        {/* Labor */}
        <div className="flex items-start justify-between border-b border-gray-50 py-2">
          <div className="flex flex-1 items-center gap-1.5">
            <span className="text-sm text-gray-500">Labor</span>
            <InfoTooltip text="Cost of staff time to prepare this recipe. Use 'time' mode to calculate from prep minutes × hourly rate." />
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
                €{(cost.laborCost * batchMultiplier).toFixed(2)}
              </div>
              <div className="text-xs text-gray-400">
                {batchMultiplier > 1 ? `×${batchMultiplier} batches · ` : ''}{prepTimeMinutes ?? 0}min × €{laborHourlyRate ?? 0}/hr
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {batchMultiplier > 1 ? (
                <span className="text-sm font-semibold text-gray-800">€{(cost.laborCost * batchMultiplier).toFixed(2)}</span>
              ) : (
                <>
                  <span className="text-xs text-gray-400">€</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost.laborCost || ''}
                    onChange={(e) => onLaborCostChange(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    className="w-16 rounded border border-gray-200 px-2 py-0.5 text-right text-sm focus:border-emerald-400 focus:outline-none"
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* Overhead */}
        <div className="flex items-center justify-between border-b border-gray-50 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500">Overhead</span>
            <InfoTooltip text="Indirect costs like energy, packaging, rent. Use '% ingr.' to auto-calculate as a percentage of ingredient cost." />
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
                €{(cost.overheadCost * batchMultiplier).toFixed(2)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {batchMultiplier > 1 ? (
                <span className="text-sm font-semibold text-gray-800">€{(cost.overheadCost * batchMultiplier).toFixed(2)}</span>
              ) : (
                <>
                  <span className="text-xs text-gray-400">€</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost.overheadCost || ''}
                    onChange={(e) => onOverheadCostChange(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    className="w-16 rounded border border-gray-200 px-2 py-0.5 text-right text-sm focus:border-emerald-400 focus:outline-none"
                  />
                </>
              )}
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
            <InfoTooltip text="Expected production loss — burnt items, portioning errors, unsold perishables. Applied to the subtotal." />
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
                +€{(cost.wasteCost * batchMultiplier).toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="my-4 border-t-2 border-gray-100" />

      {/* SECTION 2: Summary strip — 2 cards side by side */}
      <div className="mb-4 grid grid-cols-2 gap-3">

        {/* LEFT — Total cost */}
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-2 flex items-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {batchMultiplier > 1 ? `Batch total cost ×${batchMultiplier}` : 'Total cost'}
            </p>
            <InfoTooltip text="Sum of ingredients + labor + overhead + waste. This is what it costs you to produce this recipe." />
          </div>
          <p className="mb-1 text-2xl font-black text-gray-800">
            €{(cost.totalCost * batchMultiplier).toFixed(2)}
          </p>
          {batchMultiplier > 1 ? (
            <p className="text-xs text-gray-400">
              ×1 base: €{cost.totalCost.toFixed(2)}
              {yieldQty > 1 && <> · €{cost.costPerUnit.toFixed(3)}/unit</>}
            </p>
          ) : yieldQty > 1 ? (
            <p className="text-xs text-gray-400">
              €{cost.costPerUnit.toFixed(3)} per unit · {yieldQty} units
            </p>
          ) : null}
        </div>

        {/* RIGHT — Selling Price */}
        <div className="rounded-2xl border-2 border-emerald-500 bg-white p-4 shadow-sm shadow-emerald-100">
          <div className="mb-2 flex items-center gap-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
              {batchMultiplier > 1
                ? `Batch selling price ×${batchMultiplier}`
                : yieldQty > 1 ? 'Price per unit' : 'Selling price'}
            </p>
            {vatEnabled && vatRate > 0 && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                inc VAT
              </span>
            )}
            <InfoTooltip text="The price you charge per unit (inc. VAT when enabled). Margin and profit are always calculated on the ex-VAT (net) price." />
          </div>

          {batchMultiplier > 1 ? (
            /* Batch mode — static scaled display, mirrors Total cost card */
            <>
              <p className="mb-1 text-2xl font-black text-gray-900">
                €{(displayIncVat * batchMultiplier).toFixed(2)}
              </p>
              <div className="space-y-0.5 text-xs text-gray-400">
                <p>Batch total · ×1 base: €{displayIncVat.toFixed(2)}</p>
                {vatEnabled && vatRate > 0 && (
                  <p>Ex VAT base: €{cost.sellingPrice.toFixed(2)} per unit</p>
                )}
              </div>
            </>
          ) : (
            /* Normal mode — editable input */
            <>
              <div className="mb-1 flex items-baseline gap-1">
                <span className="text-base text-gray-400">€</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={sellingPriceFocused
                    ? focusedIncVatStr
                    : (displayIncVat > 0 ? displayIncVat.toFixed(2) : '')}
                  placeholder="0.00"
                  onFocus={() => {
                    setSellingPriceFocused(true)
                    setFocusedIncVatStr(displayIncVat > 0 ? displayIncVat.toFixed(2) : '')
                  }}
                  onBlur={() => setSellingPriceFocused(false)}
                  onChange={(e) => handleIncVatChange(e.target.value)}
                  className="w-full bg-transparent text-2xl font-black leading-none text-gray-900 outline-none placeholder:text-gray-300"
                />
              </div>
              {vatEnabled && vatRate > 0 && (
                <p className="text-xs text-gray-400">
                  €{cost.sellingPrice.toFixed(2)} ex VAT
                </p>
              )}
            </>
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
            <div className="flex items-center">
              <span className="text-sm font-semibold text-gray-600">Margin</span>
              <InfoTooltip text="Profit as a percentage of selling price. Above 60% is excellent for most food businesses." />
            </div>
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
          <div className="flex items-center">
            <span className="text-sm text-gray-500">Profit per unit</span>
            <InfoTooltip text="Selling price minus cost per unit. This is what you keep from each sale." />
          </div>
          <span className={cn(
            'text-lg font-bold',
            profitPerUnit >= 0 ? 'text-emerald-600' : 'text-red-500'
          )}>
            {profitPerUnit >= 0 ? '+' : ''}€{profitPerUnit.toFixed(2)}
          </span>
        </div>

        {/* Batch rows — batchMultiplier takes priority over yieldQty */}
        {batchMultiplier > 1 && cost.sellingPrice > 0 && (
          <>
            <div className="flex items-start justify-between gap-3 py-1.5">
              <div className="flex flex-col">
                <span className="text-sm text-gray-500">Batch revenue ×{batchMultiplier}</span>
                <span className="text-[11px] text-gray-400">×1 base: €{cost.sellingPrice.toFixed(2)} per unit</span>
              </div>
              <span className="text-sm font-semibold text-gray-700">
                €{(cost.sellingPrice * batchMultiplier).toFixed(2)}
                {vatEnabled && vatRate > 0 && <span className="ml-1 text-xs font-normal text-gray-400">ex VAT</span>}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 py-1.5">
              <div className="flex flex-col">
                <span className="text-sm text-gray-500">Batch profit ×{batchMultiplier}</span>
                <span className="text-[11px] text-gray-400">×1 base: €{profitPerUnit.toFixed(2)} per unit</span>
              </div>
              <span className={cn(
                'text-sm font-semibold',
                profitPerUnit >= 0 ? 'text-emerald-600' : 'text-red-500'
              )}>
                {profitPerUnit >= 0 ? '+' : ''}€{(profitPerUnit * batchMultiplier).toFixed(2)}
              </span>
            </div>
          </>
        )}
        {batchMultiplier === 1 && yieldQty > 1 && cost.sellingPrice > 0 && (
          <>
            <div className="flex items-start justify-between gap-3 py-1.5">
              <div className="flex flex-col">
                <span className="text-sm text-gray-500">Batch revenue ({yieldQty} {yieldUnitLabel || 'units'})</span>
                <span className="text-[11px] text-gray-400">Per unit: €{cost.sellingPrice.toFixed(2)} ex VAT</span>
              </div>
              <span className="text-sm font-semibold text-gray-700">
                €{(cost.sellingPrice * yieldQty).toFixed(2)}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 py-1.5">
              <div className="flex flex-col">
                <span className="text-sm text-gray-500">Batch profit ({yieldQty} {yieldUnitLabel || 'units'})</span>
                <span className="text-[11px] text-gray-400">Per unit: €{profitPerUnit.toFixed(2)}</span>
              </div>
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
            <div className="flex items-center">
              <p className="text-sm font-semibold text-gray-700">VAT</p>
              <InfoTooltip text="Value Added Tax included in the selling price. Standard rate in Ireland is 23%, reduced rate for food is 13.5% or 9%. Margin is always computed on the ex-VAT price." />
            </div>
            <p className="text-xs text-gray-400">Included in selling price</p>
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
                    onClick={() => handleVatRateChange(rate)}
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
                  onChange={(e) => handleVatRateChange(Math.max(0, Number(e.target.value)))}
                  className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm focus:border-emerald-400 focus:outline-none"
                />
                <span className="text-xs text-gray-400">%</span>
              </div>
            </div>
            <div className="flex justify-between pt-1 text-sm">
              <span className="text-gray-500">{batchMultiplier > 1 ? `VAT total ×${batchMultiplier}` : 'VAT amount'}</span>
              <span className="font-medium text-gray-700">
                €{(cost.sellingPrice * batchMultiplier * vatRate / 100).toFixed(2)}
              </span>
            </div>
            {batchMultiplier > 1 && (
              <div className="mt-1 text-right text-[11px] text-gray-400">
                ×1 base: €{(cost.sellingPrice * vatRate / 100).toFixed(2)}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}


