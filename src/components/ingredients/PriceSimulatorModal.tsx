'use client'

import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, Minus, RotateCcw, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calculateCost } from '@/lib/utils/cost-calculator'
import { calculateCostPerBaseUnit } from '@/lib/invoices'
import { isConvertible } from '@/lib/utils/unit-converter'
import { cn } from '@/lib/utils'
import type { IngredientRow } from '@/hooks/useIngredients'

// ── Constants ─────────────────────────────────────────────────────────────────

const PRICE_UNITS = ['kg', 'g', 'L', 'ml', 'unit']

// ── Types ─────────────────────────────────────────────────────────────────────

type SimInputs = {
  newPrice: string
  unit: string
  packageSize: string
  packageUnit: string
}

type NormIngRow = {
  id: string
  ingredientId: string | null
  quantity: number
  unit: string
  yieldPercent: number | null
  price: number | null
  priceUnit: string | null
}

type NormRecipe = {
  id: string
  name: string
  yieldQty: number
  yieldUnit: string
  laborCost: number
  laborMode: 'fixed' | 'time'
  overheadCost: number
  overheadMode: 'fixed' | 'percent'
  overheadPercent: number
  wastePercent: number
  sellingPrice: number
  ingredients: NormIngRow[]
}

type SimRow = {
  id: string
  name: string
  curIngCost: number
  simIngCost: number | null
  curTotal: number
  simTotal: number | null
  curMargin: number
  simMargin: number | null
  sellingPrice: number
  hasMismatch: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  ingredient: IngredientRow
  usedRecipeIds: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type RawRelation = { current_price?: number | null; price_unit?: string | null; sub_ingredient_cost_per_unit?: number | null; sub_ingredient_unit?: string | null } | null

function pickRelation(v: unknown): RawRelation {
  if (!v) return null
  return (Array.isArray(v) ? v[0] : v) as RawRelation
}

function normalizeIngRow(row: Record<string, unknown>): NormIngRow {
  const ing = pickRelation(row.ingredient)
  const sr = pickRelation(row.sub_recipe)
  const hasIng = !!row.ingredient_id
  return {
    id: row.id as string,
    ingredientId: (row.ingredient_id as string | null) ?? null,
    quantity: (row.quantity as number) ?? 0,
    unit: (row.unit as string) ?? 'unit',
    yieldPercent: (row.yield_percent as number | null) ?? null,
    price: hasIng ? (ing?.current_price ?? null) : (sr?.sub_ingredient_cost_per_unit ?? null),
    priceUnit: hasIng ? (ing?.price_unit ?? null) : (sr?.sub_ingredient_unit ?? null),
  }
}

function singleIngCost(ing: NormIngRow, overridePrice?: number, overridePriceUnit?: string): number {
  const price = overridePrice ?? ing.price
  const priceUnit = overridePriceUnit ?? ing.priceUnit ?? ing.unit
  if (!price || price <= 0) return 0
  const result = calculateCost({
    ingredients: [{ quantity: ing.quantity, unit: ing.unit, yield_percent: ing.yieldPercent, current_price: price, price_unit: priceUnit }],
    sellingPrice: 0,
  })
  return result.ingredientCost
}

function computeSimRow(
  recipe: NormRecipe,
  ingredientId: string,
  simPrice: number | null,
  simPriceUnit: string | null,
): SimRow {
  const opts = {
    laborMode: recipe.laborMode,
    laborCostFixed: recipe.laborCost,
    overheadMode: recipe.overheadMode,
    overheadCostFixed: recipe.overheadCost,
    overheadPercent: recipe.overheadPercent,
    wastePercent: recipe.wastePercent,
    sellingPrice: recipe.sellingPrice,
    yieldQty: recipe.yieldQty,
    yieldUnit: recipe.yieldUnit,
  }

  const toInput = (ing: NormIngRow, priceOverride?: number, unitOverride?: string) => ({
    quantity: ing.quantity,
    unit: ing.unit,
    yield_percent: ing.yieldPercent,
    current_price: priceOverride ?? ing.price,
    price_unit: unitOverride ?? ing.priceUnit ?? ing.unit,
  })

  const target = recipe.ingredients.find((i) => i.ingredientId === ingredientId)
  const curResult = calculateCost({ ingredients: recipe.ingredients.map((i) => toInput(i)), ...opts })
  const curIngCost = target ? singleIngCost(target) : 0

  const hasMismatch = !!target && simPriceUnit !== null && !isConvertible(target.unit, simPriceUnit)

  if (!target || simPrice === null || simPriceUnit === null || hasMismatch) {
    return {
      id: recipe.id, name: recipe.name,
      curIngCost, simIngCost: null,
      curTotal: curResult.totalCost, simTotal: null,
      curMargin: curResult.margin, simMargin: null,
      sellingPrice: recipe.sellingPrice, hasMismatch,
    }
  }

  const simInputs = recipe.ingredients.map((i) =>
    i.ingredientId === ingredientId ? toInput(i, simPrice, simPriceUnit) : toInput(i)
  )
  const simResult = calculateCost({ ingredients: simInputs, ...opts })
  const simIngCost = singleIngCost(target, simPrice, simPriceUnit)

  return {
    id: recipe.id, name: recipe.name,
    curIngCost, simIngCost,
    curTotal: curResult.totalCost, simTotal: simResult.totalCost,
    curMargin: curResult.margin, simMargin: simResult.margin,
    sellingPrice: recipe.sellingPrice, hasMismatch: false,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PriceSimulatorModal({ open, onClose, ingredient, usedRecipeIds }: Props) {
  const makeDefault = (): SimInputs => ({
    newPrice: ingredient.current_price?.toString() ?? '',
    unit: ingredient.base_unit || 'unit',
    packageSize: '',
    packageUnit: ingredient.package_unit ?? 'kg',
  })

  const [inputs, setInputs] = useState<SimInputs>(makeDefault)
  const [debouncedInputs, setDebouncedInputs] = useState<SimInputs>(makeDefault)
  const [recipes, setRecipes] = useState<NormRecipe[]>([])
  const [loading, setLoading] = useState(false)

  // Reset + fetch when modal opens
  useEffect(() => {
    if (!open) return
    const def = makeDefault()
    setInputs(def)
    setDebouncedInputs(def)

    if (usedRecipeIds.length === 0) { setRecipes([]); setLoading(false); return }

    setLoading(true)
    const supabase = createClient()
    ;(async () => {
      try {
        const { data } = await supabase
          .from('recipes')
          .select(`
            id, name, yield_quantity, yield_unit,
            labor_cost, labor_mode, overhead_cost, overhead_mode, overhead_percent,
            waste_percent, selling_price,
            recipe_ingredients!recipe_ingredients_recipe_id_fkey (
              id, ingredient_id, sub_recipe_id, quantity, unit, yield_percent,
              ingredient:ingredients (id, name, current_price, price_unit),
              sub_recipe:recipes!recipe_ingredients_sub_recipe_id_fkey (id, name, sub_ingredient_cost_per_unit, sub_ingredient_unit)
            )
          `)
          .in('id', usedRecipeIds)

        const normalized: NormRecipe[] = (data ?? []).map((r) => {
          const rawIngs = (Array.isArray(r.recipe_ingredients)
            ? r.recipe_ingredients
            : r.recipe_ingredients ? [r.recipe_ingredients] : []) as Record<string, unknown>[]
          return {
            id: r.id as string,
            name: r.name as string,
            yieldQty: Math.max(1, (r.yield_quantity as number) ?? 1),
            yieldUnit: (r.yield_unit as string) ?? 'unit',
            laborCost: (r.labor_cost as number) ?? 0,
            laborMode: ((r.labor_mode ?? 'fixed') as 'fixed' | 'time'),
            overheadCost: (r.overhead_cost as number) ?? 0,
            overheadMode: ((r.overhead_mode ?? 'fixed') as 'fixed' | 'percent'),
            overheadPercent: (r.overhead_percent as number) ?? 0,
            wastePercent: (r.waste_percent as number) ?? 0,
            sellingPrice: (r.selling_price as number) ?? 0,
            ingredients: rawIngs.map(normalizeIngRow),
          }
        })
        setRecipes(normalized)
      } catch {
        // silently fail — table stays empty
      } finally {
        setLoading(false)
      }
    })()
  }, [open, usedRecipeIds]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce inputs by 200 ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInputs(inputs), 200)
    return () => clearTimeout(t)
  }, [inputs])

  // Derive simulated per-unit cost
  const simCost = useMemo(() => {
    const price = parseFloat(debouncedInputs.newPrice)
    if (!Number.isFinite(price) || price < 0) return null
    const size = parseFloat(debouncedInputs.packageSize)
    if (debouncedInputs.packageSize.trim() && Number.isFinite(size) && size > 0) {
      const r = calculateCostPerBaseUnit(price, size, debouncedInputs.packageUnit)
      return r ? { costPerUnit: r.costPerBaseUnit, unit: r.baseUnit } : null
    }
    return { costPerUnit: price, unit: debouncedInputs.unit }
  }, [debouncedInputs])

  // Compute all rows
  const simRows = useMemo(
    () => recipes.map((r) => computeSimRow(r, ingredient.id, simCost?.costPerUnit ?? null, simCost?.unit ?? null)),
    [recipes, ingredient.id, simCost]
  )

  // Summary
  const summary = useMemo(() => {
    const withSim = simRows.filter((r) => r.simMargin !== null)
    if (withSim.length === 0) return null
    const avgCur = withSim.reduce((s, r) => s + r.curMargin, 0) / withSim.length
    const avgSim = withSim.reduce((s, r) => s + r.simMargin!, 0) / withSim.length
    const affected = withSim.filter((r) => Math.abs((r.simIngCost ?? 0) - r.curIngCost) > 0.005).length
    const belowThreshold = withSim.filter((r) => r.curMargin >= 60 && r.simMargin! < 60).length
    return { avgCur, avgSim, affected, belowThreshold }
  }, [simRows])

  const setField = (field: keyof SimInputs) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setInputs((p) => ({ ...p, [field]: e.target.value }))

  const inputCls = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10'
  const selectCls = 'rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-none transition focus:border-emerald-500'

  const isAtCurrent = simCost
    && Math.abs(simCost.costPerUnit - (ingredient.current_price ?? 0)) < 0.0001
    && simCost.unit === (ingredient.base_unit || 'unit')

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[95vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-2xl outline-none">

          {/* Header */}
          <div className="flex shrink-0 items-start justify-between border-b border-slate-100 p-5">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900">
                Price Simulator — {ingredient.name}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-slate-500">
                Simulate a price change and preview the impact across your recipes. Nothing is saved.
              </Dialog.Description>
            </div>
            <button type="button" onClick={onClose} className="ml-4 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

            {/* Sim inputs */}
            <div className="shrink-0 border-b border-slate-100 bg-slate-50/60 p-5">
              <div className="flex flex-wrap items-end gap-3">

                {/* Price + unit */}
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    New price
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-slate-400">€</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={inputs.newPrice}
                      onChange={setField('newPrice')}
                      placeholder="0.00"
                      className={cn(inputCls, 'w-24')}
                    />
                    <span className="text-xs text-slate-400">per</span>
                    <select value={inputs.unit} onChange={setField('unit')} className={selectCls}>
                      {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Package */}
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Package size <span className="font-normal normal-case text-slate-300">(optional — if price is per package)</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min="0" step="0.01"
                      value={inputs.packageSize}
                      onChange={setField('packageSize')}
                      placeholder="e.g. 5"
                      className={cn(inputCls, 'w-20')}
                    />
                    <select value={inputs.packageUnit} onChange={setField('packageUnit')} className={selectCls}>
                      {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Reset */}
                <button
                  type="button"
                  onClick={() => setInputs(makeDefault())}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to current
                </button>

                {/* Derived cost preview */}
                {simCost && (
                  <div className={cn('ml-auto rounded-xl px-4 py-2 text-sm', isAtCurrent ? 'bg-slate-100' : 'bg-emerald-50')}>
                    <span className="text-slate-500">Per-unit cost: </span>
                    <span className={cn('font-semibold', isAtCurrent ? 'text-slate-600' : 'text-emerald-700')}>
                      €{simCost.costPerUnit.toFixed(4)} / {simCost.unit}
                    </span>
                    {isAtCurrent && <span className="ml-1.5 text-xs text-slate-400">(unchanged)</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Summary bar */}
            {summary && !loading && (
              <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-2.5">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-slate-600">
                    <span className="font-semibold text-slate-900">{summary.affected}</span>{' '}
                    recipe{summary.affected !== 1 ? 's' : ''} affected
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="flex items-center gap-1 text-slate-600">
                    Avg margin:
                    <span className="ml-1 font-semibold">{summary.avgCur.toFixed(1)}%</span>
                    <span className="text-slate-300 mx-1">→</span>
                    <span className={cn('font-semibold', summary.avgSim < summary.avgCur ? 'text-red-600' : summary.avgSim > summary.avgCur ? 'text-emerald-600' : 'text-slate-600')}>
                      {summary.avgSim.toFixed(1)}%
                    </span>
                    {Math.abs(summary.avgSim - summary.avgCur) >= 0.05 && (
                      <span className={cn('ml-1 text-xs font-medium', summary.avgSim < summary.avgCur ? 'text-red-500' : 'text-emerald-500')}>
                        ({summary.avgSim < summary.avgCur ? '▼' : '▲'} {Math.abs(summary.avgSim - summary.avgCur).toFixed(1)} pts)
                      </span>
                    )}
                  </span>
                  {summary.belowThreshold > 0 && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {summary.belowThreshold} recipe{summary.belowThreshold !== 1 ? 's' : ''} drop{summary.belowThreshold === 1 ? 's' : ''} below 60% margin
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Table area */}
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading recipe data…
                </div>
              ) : usedRecipeIds.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm italic text-slate-400">
                    This ingredient isn&apos;t used in any recipe yet — nothing to simulate.
                  </p>
                  <p className="mt-1.5 text-xs text-slate-400">
                    You can still use the inputs above to see the derived per-unit cost.
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-100">
                      <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-400">Recipe</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-400">This ingredient cost</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-400">Total recipe cost</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-400">Selling price</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-400">Margin</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {simRows.map((row) => {
                      const marginDelta = row.simMargin !== null ? row.simMargin - row.curMargin : 0
                      const ingUp = row.simIngCost !== null && row.simIngCost > row.curIngCost + 0.005
                      const ingDown = row.simIngCost !== null && row.simIngCost < row.curIngCost - 0.005
                      const hasChange = Math.abs(marginDelta) >= 0.05

                      return (
                        <tr key={row.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50 last:border-0">

                          {/* Recipe name */}
                          <td className="px-5 py-3 font-medium text-slate-800">{row.name}</td>

                          {/* Ingredient line cost */}
                          <td className="px-4 py-3">
                            {row.hasMismatch ? (
                              <span className="flex items-center gap-1 text-amber-500 text-xs">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                unit mismatch
                              </span>
                            ) : (
                              <div className="flex items-center gap-1 tabular-nums">
                                <span className="text-slate-600">€{row.curIngCost.toFixed(2)}</span>
                                {(ingUp || ingDown) && (
                                  <>
                                    <span className="text-slate-300">→</span>
                                    <span className={cn('font-semibold', ingUp ? 'text-red-600' : 'text-emerald-600')}>
                                      €{row.simIngCost!.toFixed(2)}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Total cost */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 tabular-nums">
                              <span className="text-slate-600">€{row.curTotal.toFixed(2)}</span>
                              {row.simTotal !== null && Math.abs(row.simTotal - row.curTotal) > 0.005 && (
                                <>
                                  <span className="text-slate-300">→</span>
                                  <span className={cn('font-semibold', row.simTotal > row.curTotal ? 'text-red-600' : 'text-emerald-600')}>
                                    €{row.simTotal.toFixed(2)}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* Selling price */}
                          <td className="px-4 py-3 tabular-nums text-slate-600">
                            {row.sellingPrice > 0 ? `€${row.sellingPrice.toFixed(2)}` : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Margin */}
                          <td className="px-4 py-3">
                            {row.sellingPrice <= 0 ? (
                              <span className="text-slate-300">—</span>
                            ) : (
                              <div className="flex items-center gap-1 tabular-nums">
                                <span className="text-slate-600">{row.curMargin.toFixed(1)}%</span>
                                {row.simMargin !== null && hasChange && (
                                  <>
                                    <span className="text-slate-300">→</span>
                                    <span className={cn('font-semibold', marginDelta < 0 ? 'text-red-600' : 'text-emerald-600')}>
                                      {row.simMargin.toFixed(1)}%
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Trend icon */}
                          <td className="px-4 py-3">
                            {row.hasMismatch || row.simMargin === null || row.sellingPrice <= 0 || !hasChange ? (
                              <Minus className="h-4 w-4 text-slate-200" />
                            ) : marginDelta > 0 ? (
                              <ArrowUp className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <ArrowDown className="h-4 w-4 text-red-500" />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-5 py-4">
            <p className="text-xs italic text-slate-400">
              This is a simulation. Your ingredient price and recipes are unchanged.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-5 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
