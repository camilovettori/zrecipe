'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, X, Loader2, ChefHat } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { COMMON_UNITS } from '@/lib/utils/unit-converter'
import { cn } from '@/lib/utils'
import { CustomSelect } from '@/components/ui/CustomSelect'
import type { IngredientLookup } from '@/hooks/useInvoices'

export interface SubRecipeLookup {
  id: string
  name: string
  costPerUnit: number | null
  unit: string
}

type SelectionKind = 'ingredient' | 'sub-recipe'

interface Selection {
  kind: SelectionKind
  ingredient?: IngredientLookup
  subRecipe?: SubRecipeLookup
}

interface IngredientSearchProps {
  onAddIngredient: (ingredient: IngredientLookup, quantity: number, unit: string) => Promise<void> | void
  onCreateIngredient: (name: string) => Promise<void> | void
  onAddSubRecipe?: (subRecipe: SubRecipeLookup, quantity: number, unit: string) => Promise<void> | void
}

function formatPrice(ingredient: IngredientLookup) {
  if (ingredient.currentPrice == null) return 'No price set'
  return `€${ingredient.currentPrice.toFixed(2)} / ${ingredient.priceUnit ?? 'unit'}`
}

export default function IngredientSearch({
  onAddIngredient,
  onCreateIngredient,
  onAddSubRecipe,
}: IngredientSearchProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<IngredientLookup[]>([])
  const [subRecipes, setSubRecipes] = useState<SubRecipeLookup[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [quantity, setQuantity] = useState<number | ''>('')
  const [unit, setUnit] = useState('unit')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const addQtyRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selection) {
      setTimeout(() => addQtyRef.current?.focus(), 50)
    }
  }, [selection])

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(handle)
  }, [query])

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!debouncedQuery) {
        setResults([])
        setSubRecipes([])
        setLoading(false)
        return
      }

      setLoading(true)
      const supabase = createClient()

      const [ingredientResult, subRecipeResult] = await Promise.all([
        supabase
          .from('ingredients')
          .select('id, name, current_price, price_unit')
          .ilike('name', `%${debouncedQuery}%`)
          .order('name')
          .limit(6),
        onAddSubRecipe
          ? supabase
              .from('recipes')
              .select('id, name, sub_ingredient_cost_per_unit, sub_ingredient_unit, yield_quantity, yield_unit')
              .eq('is_sub_ingredient', true)
              .ilike('name', `%${debouncedQuery}%`)
              .order('name')
              .limit(4)
          : Promise.resolve({ data: null, error: null }),
      ])

      if (!active) return

      setResults(
        (ingredientResult.data ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          currentPrice: item.current_price ?? null,
          priceUnit: item.price_unit ?? null,
        }))
      )

      setSubRecipes(
        (subRecipeResult.data ?? []).map((r: {
          id: string
          name: string
          sub_ingredient_cost_per_unit?: number | null
          sub_ingredient_unit?: string | null
          yield_quantity?: number | null
          yield_unit?: string | null
        }) => ({
          id: r.id,
          name: r.name,
          costPerUnit: r.sub_ingredient_cost_per_unit ?? null,
          unit: r.sub_ingredient_unit ?? r.yield_unit ?? 'unit',
          yieldQuantity: Math.max(1, Number(r.yield_quantity ?? 1)),
          yieldUnit: r.yield_unit ?? 'unit',
        }))
      )

      setLoading(false)
    }

    load()
    return () => { active = false }
  }, [debouncedQuery, onAddSubRecipe])

  const hasExactMatch = useMemo(
    () => results.some((i) => i.name.toLowerCase() === query.trim().toLowerCase()),
    [query, results]
  )

  const showCreate = !hasExactMatch && !!query.trim()

  // Flat ordered list of navigable options — used to drive keyboard nav
  const navOptions = useMemo(() => {
    type NavOpt =
      | { kind: 'ingredient'; data: IngredientLookup }
      | { kind: 'sub-recipe'; data: SubRecipeLookup }
      | { kind: 'create' }
    const opts: NavOpt[] = [
      ...results.map((ing) => ({ kind: 'ingredient' as const, data: ing })),
      ...subRecipes.map((sr) => ({ kind: 'sub-recipe' as const, data: sr })),
      ...(showCreate ? [{ kind: 'create' as const }] : []),
    ]
    return opts
  }, [results, subRecipes, showCreate])

  // Reset highlight whenever the option list changes
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [navOptions])

  const resetSelection = () => {
    setSelection(null)
    setQuantity('')
    setUnit('unit')
  }

  const handleAdd = async () => {
    if (!selection || !quantity || quantity <= 0) return

    if (selection.kind === 'ingredient' && selection.ingredient) {
      await onAddIngredient(selection.ingredient, quantity, unit)
    } else if (selection.kind === 'sub-recipe' && selection.subRecipe && onAddSubRecipe) {
      await onAddSubRecipe(selection.subRecipe, quantity, unit)
    }

    setQuery('')
    resetSelection()
    setOpen(false)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  const getDefaultRecipeUnit = (priceUnit: string | null): string => {
    switch (priceUnit) {
      case 'kg': return 'g'
      case 'L':  return 'ml'
      default:   return priceUnit ?? 'unit'
    }
  }

  const selectIngredient = (ing: IngredientLookup) => {
    setSelection({ kind: 'ingredient', ingredient: ing })
    setUnit(getDefaultRecipeUnit(ing.priceUnit ?? null))
    setQuantity('')
    setOpen(true)
  }

  const selectSubRecipe = (sr: SubRecipeLookup) => {
    setSelection({ kind: 'sub-recipe', subRecipe: sr })
    setUnit(sr.unit)
    setQuantity('')
    setOpen(true)
  }

  const selectCreate = () => {
    const name = query.trim()
    if (!name) return
    void onCreateIngredient(name)
    setQuery('')
    resetSelection()
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || loading || navOptions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < navOptions.length - 1 ? prev + 1 : 0))
        break
      case 'Tab':
        // Only intercept Tab when dropdown is open to avoid trapping focus
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < navOptions.length - 1 ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : navOptions.length - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < navOptions.length) {
          const opt = navOptions[highlightedIndex]
          if (opt.kind === 'ingredient') selectIngredient(opt.data)
          else if (opt.kind === 'sub-recipe') selectSubRecipe(opt.data)
          else selectCreate()
        }
        break
      case 'Escape':
        e.preventDefault()
        setQuery('')
        setHighlightedIndex(-1)
        setOpen(false)
        break
    }
  }

  const hasDropdownContent =
    loading || results.length > 0 || subRecipes.length > 0 || showCreate

  // Index offsets for the two sectioned lists
  const subRecipesOffset = results.length

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchInputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setSelection(null)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder="Search ingredients or sub-recipes..."
          className="w-full rounded-xl border border-slate-200 bg-white px-10 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
        />
      </div>

      {open && hasDropdownContent && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : (
            <>
              {results.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Ingredients
                  </div>
                  {results.map((ing, i) => (
                    <button
                      key={ing.id}
                      type="button"
                      onClick={() => selectIngredient(ing)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition',
                        i === highlightedIndex ? 'bg-emerald-50' : 'hover:bg-slate-50'
                      )}
                    >
                      <div>
                        <p className={cn(
                          'text-sm font-medium',
                          i === highlightedIndex ? 'text-emerald-700' : 'text-slate-900'
                        )}>
                          {ing.name}
                        </p>
                        <p className="text-xs text-slate-500">{formatPrice(ing)}</p>
                      </div>
                      <Plus className={cn(
                        'h-4 w-4 shrink-0',
                        i === highlightedIndex ? 'text-emerald-500' : 'text-slate-400'
                      )} />
                    </button>
                  ))}
                </div>
              )}

              {subRecipes.length > 0 && (
                <div className={cn(results.length > 0 && 'border-t border-slate-100')}>
                  <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-600">
                    Sub-Recipes
                  </div>
                  {subRecipes.map((sr, i) => {
                    const idx = subRecipesOffset + i
                    return (
                      <button
                        key={sr.id}
                        type="button"
                        onClick={() => selectSubRecipe(sr)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition',
                          idx === highlightedIndex ? 'bg-emerald-50' : 'hover:bg-emerald-50'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <ChefHat className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <div>
                            <p className={cn(
                              'text-sm font-medium',
                              idx === highlightedIndex ? 'text-emerald-700' : 'text-emerald-800'
                            )}>
                              {sr.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {sr.costPerUnit != null
                                ? `€${sr.costPerUnit.toFixed(4)} / ${sr.unit}`
                                : `per ${sr.unit}`}
                            </p>
                          </div>
                        </div>
                        <Plus className={cn(
                          'h-4 w-4 shrink-0',
                          idx === highlightedIndex ? 'text-emerald-600' : 'text-emerald-500'
                        )} />
                      </button>
                    )
                  })}
                </div>
              )}

              {showCreate && (() => {
                const idx = subRecipesOffset + subRecipes.length
                return (
                  <button
                    type="button"
                    onClick={selectCreate}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-emerald-700 transition',
                      (results.length > 0 || subRecipes.length > 0) && 'border-t border-slate-100',
                      idx === highlightedIndex ? 'bg-emerald-50' : 'hover:bg-emerald-50'
                    )}
                  >
                    <Plus className="h-4 w-4" />
                    Create &quot;{query.trim()}&quot;
                  </button>
                )
              })()}
            </>
          )}
        </div>
      )}

      {selection && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {selection.kind === 'sub-recipe' && (
                <ChefHat className="h-4 w-4 text-emerald-600" />
              )}
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {selection.kind === 'sub-recipe'
                    ? selection.subRecipe?.name
                    : selection.ingredient?.name}
                </p>
                <p className="text-xs text-slate-500">
                  {selection.kind === 'sub-recipe'
                    ? selection.subRecipe?.costPerUnit != null
                      ? `€${selection.subRecipe.costPerUnit.toFixed(4)} / ${selection.subRecipe.unit}`
                      : 'Sub-recipe'
                    : formatPrice(selection.ingredient!)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetSelection}
              className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px_140px]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Quantity</span>
              <input
                ref={addQtyRef}
                type="number"
                min="0"
                step="0.001"
                value={quantity}
                onChange={(e) => {
                  const val = e.target.value
                  setQuantity(val === '' ? '' : parseFloat(val))
                }}
                placeholder="Amount"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Unit</span>
              <CustomSelect
                value={unit}
                onChange={setUnit}
                options={COMMON_UNITS.map((u) => ({ value: u, label: u }))}
              />
            </label>

            <button
              type="button"
              onClick={handleAdd}
              disabled={!quantity || quantity <= 0}
              className="self-end rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add to recipe
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
