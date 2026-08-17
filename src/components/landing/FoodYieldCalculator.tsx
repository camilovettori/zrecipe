'use client'

import { useMemo, useState } from 'react'
import { Check, Clipboard, RotateCcw, Scale } from 'lucide-react'
import { calculateMeasuredYield, calculatePlannedYield } from '@/lib/food-yield-calculator'
import { YIELD_FACTORS } from '@/lib/data/yield-factors'
import { cn } from '@/lib/utils'

type Mode = 'plan' | 'measure'

const decimal = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 2 })
const euro = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function numberValue(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function ResultRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      'flex items-center justify-between gap-4 rounded-xl border px-4 py-4',
      highlight ? 'border-amber-300/20 bg-amber-300/10' : 'border-white/10 bg-white/5'
    )}>
      <dt className={cn('text-sm', highlight ? 'text-amber-100' : 'text-emerald-100')}>{label}</dt>
      <dd className={cn('text-lg font-semibold tabular-nums', highlight && 'text-amber-200')}>{value}</dd>
    </div>
  )
}

export default function FoodYieldCalculator({ initialIngredient }: { initialIngredient?: string }) {
  const initialReference = YIELD_FACTORS.find((item) => item.ingredient === initialIngredient) ?? YIELD_FACTORS.find((item) => item.ingredient === 'potato')!
  const [mode, setMode] = useState<Mode>('plan')
  const [selectedIngredient, setSelectedIngredient] = useState(initialReference.ingredient)
  const [yieldPercent, setYieldPercent] = useState(String(initialReference.yieldPercent))
  const [edibleQuantity, setEdibleQuantity] = useState('10')
  const [costPerUnit, setCostPerUnit] = useState('2.50')
  const [apWeight, setApWeight] = useState('10')
  const [epWeight, setEpWeight] = useState('7.5')
  const [totalCost, setTotalCost] = useState('25')
  const [copied, setCopied] = useState(false)

  const planned = useMemo(() => {
    try {
      return calculatePlannedYield({
        yieldPercent: numberValue(yieldPercent),
        edibleQuantity: numberValue(edibleQuantity),
        purchaseCostPerUnit: numberValue(costPerUnit),
      })
    } catch {
      return null
    }
  }, [costPerUnit, edibleQuantity, yieldPercent])

  const measured = useMemo(() => {
    try {
      return calculateMeasuredYield({
        asPurchasedWeight: numberValue(apWeight),
        edibleWeight: numberValue(epWeight),
        totalPurchaseCost: numberValue(totalCost),
      })
    } catch {
      return null
    }
  }, [apWeight, epWeight, totalCost])

  const chooseIngredient = (ingredient: string) => {
    setSelectedIngredient(ingredient)
    const found = YIELD_FACTORS.find((item) => item.ingredient === ingredient)
    if (found) setYieldPercent(String(found.yieldPercent))
  }

  const reset = () => {
    setMode('plan')
    setSelectedIngredient('potato')
    setYieldPercent('63')
    setEdibleQuantity('10')
    setCostPerUnit('2.50')
    setApWeight('10')
    setEpWeight('7.5')
    setTotalCost('25')
    setCopied(false)
  }

  const copyResult = async () => {
    const lines = mode === 'plan' && planned
      ? [
          `Food yield plan (${planned.yieldPercent}% yield)`,
          `AP to purchase: ${decimal.format(planned.asPurchasedQuantity)} kg`,
          `Usable EP: ${decimal.format(planned.edibleQuantity)} kg`,
          `Expected waste: ${decimal.format(planned.wasteQuantity)} kg (${decimal.format(planned.wastePercent)}%)`,
          `Estimated cost: ${euro.format(planned.estimatedPurchaseCost)}`,
          `True cost per usable kg: ${euro.format(planned.trueCostPerEdibleUnit)}`,
        ]
      : mode === 'measure' && measured
        ? [
            `Measured food yield: ${decimal.format(measured.yieldPercent)}%`,
            `Waste: ${decimal.format(measured.wasteWeight)} kg (${decimal.format(measured.wastePercent)}%)`,
            `True cost per usable kg: ${measured.trueCostPerEdibleUnit === null ? 'Not available' : euro.format(measured.trueCostPerEdibleUnit)}`,
          ]
        : []

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const inputClass = 'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'

  return (
    <div id="calculator" className="scroll-mt-24 overflow-hidden rounded-3xl border border-emerald-900/10 bg-white shadow-[0_24px_70px_rgba(14,59,46,0.12)]">
      <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
        <div className="p-5 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <Scale className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Food Yield Calculator</p>
              <p className="text-xs text-slate-500">AP, EP, trim loss and true ingredient cost</p>
            </div>
          </div>

          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Yield calculation type">
            <button type="button" onClick={() => setMode('plan')} aria-pressed={mode === 'plan'} className={cn('rounded-lg px-3 py-2.5 text-sm font-semibold transition', mode === 'plan' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              Plan a quantity
            </button>
            <button type="button" onClick={() => setMode('measure')} aria-pressed={mode === 'measure'} className={cn('rounded-lg px-3 py-2.5 text-sm font-semibold transition', mode === 'measure' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              Measure actual yield
            </button>
          </div>

          {mode === 'plan' ? (
            <div className="mt-6 space-y-5">
              <div>
                <label htmlFor="yield-ingredient" className="mb-2 block text-sm font-medium text-slate-700">Ingredient reference</label>
                <select id="yield-ingredient" value={selectedIngredient} onChange={(event) => chooseIngredient(event.target.value)} className={inputClass}>
                  {YIELD_FACTORS.map((item) => (
                    <option key={item.ingredient} value={item.ingredient}>
                      {item.ingredient.replace(/\b\w/g, (letter) => letter.toUpperCase())} — {item.yieldPercent}%
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">Reference values are editable because real yield varies by product and preparation.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="yield-percent" className="mb-2 block text-sm font-medium text-slate-700">Yield %</label>
                  <div className="relative">
                    <input id="yield-percent" type="number" min="0.01" max="100" step="0.1" value={yieldPercent} onChange={(event) => setYieldPercent(event.target.value)} className={`${inputClass} pr-9`} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">%</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="edible-quantity" className="mb-2 block text-sm font-medium text-slate-700">Usable EP needed</label>
                  <div className="relative">
                    <input id="edible-quantity" type="number" min="0" step="0.01" value={edibleQuantity} onChange={(event) => setEdibleQuantity(event.target.value)} className={`${inputClass} pr-10`} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">kg</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="purchase-cost" className="mb-2 block text-sm font-medium text-slate-700">AP cost / kg</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">€</span>
                    <input id="purchase-cost" type="number" min="0" step="0.01" value={costPerUnit} onChange={(event) => setCostPerUnit(event.target.value)} className={`${inputClass} pl-8`} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <p className="text-sm leading-6 text-slate-600">Weigh the ingredient before and after trimming or preparation. Use the same unit for both weights.</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="ap-weight" className="mb-2 block text-sm font-medium text-slate-700">AP weight</label>
                  <div className="relative"><input id="ap-weight" type="number" min="0" step="0.01" value={apWeight} onChange={(event) => setApWeight(event.target.value)} className={`${inputClass} pr-10`} /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">kg</span></div>
                </div>
                <div>
                  <label htmlFor="ep-weight" className="mb-2 block text-sm font-medium text-slate-700">Usable EP weight</label>
                  <div className="relative"><input id="ep-weight" type="number" min="0" step="0.01" value={epWeight} onChange={(event) => setEpWeight(event.target.value)} className={`${inputClass} pr-10`} /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">kg</span></div>
                </div>
                <div>
                  <label htmlFor="total-purchase-cost" className="mb-2 block text-sm font-medium text-slate-700">Total AP cost</label>
                  <div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">€</span><input id="total-purchase-cost" type="number" min="0" step="0.01" value={totalCost} onChange={(event) => setTotalCost(event.target.value)} className={`${inputClass} pl-8`} /></div>
                </div>
              </div>
              {numberValue(epWeight) > numberValue(apWeight) && <p className="text-sm font-medium text-rose-600">Usable EP weight cannot be greater than AP weight.</p>}
            </div>
          )}

          <p className="mt-6 text-xs leading-5 text-slate-500">
            {mode === 'plan' ? 'Formula: AP required = usable EP ÷ yield decimal.' : 'Formula: yield % = usable EP weight ÷ AP weight × 100.'}
          </p>
        </div>

        <div className="flex min-h-[410px] flex-col bg-brand-green p-5 text-white sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Calculation result</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{mode === 'plan' ? 'How much to purchase' : 'Your actual food yield'}</h3>

          <dl className="mt-8 space-y-3">
            {mode === 'plan' && planned ? (
              <>
                <ResultRow label="AP quantity to purchase" value={`${decimal.format(planned.asPurchasedQuantity)} kg`} />
                <ResultRow label={`Expected waste (${decimal.format(planned.wastePercent)}%)`} value={`${decimal.format(planned.wasteQuantity)} kg`} highlight />
                <ResultRow label="Estimated purchase cost" value={euro.format(planned.estimatedPurchaseCost)} />
                <div className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-5 text-brand-green shadow-sm">
                  <dt className="text-sm font-semibold">True cost per usable kg</dt>
                  <dd className="text-2xl font-bold tabular-nums">{euro.format(planned.trueCostPerEdibleUnit)}</dd>
                </div>
              </>
            ) : mode === 'measure' && measured ? (
              <>
                <ResultRow label="Actual yield" value={`${decimal.format(measured.yieldPercent)}%`} />
                <ResultRow label="Trim / waste" value={`${decimal.format(measured.wasteWeight)} kg`} highlight />
                <ResultRow label="Waste percentage" value={`${decimal.format(measured.wastePercent)}%`} />
                <div className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-5 text-brand-green shadow-sm">
                  <dt className="text-sm font-semibold">True cost per usable kg</dt>
                  <dd className="text-2xl font-bold tabular-nums">{measured.trueCostPerEdibleUnit === null ? '—' : euro.format(measured.trueCostPerEdibleUnit)}</dd>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm leading-6 text-emerald-100">Enter valid values to see your result.</div>
            )}
          </dl>

          <div className="mt-auto flex flex-col gap-2 pt-8 sm:flex-row">
            <button type="button" onClick={copyResult} disabled={mode === 'plan' ? !planned : !measured} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">
              {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}{copied ? 'Copied' : 'Copy result'}
            </button>
            <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-white/10"><RotateCcw className="h-4 w-4" />Reset</button>
          </div>
        </div>
      </div>
    </div>
  )
}
