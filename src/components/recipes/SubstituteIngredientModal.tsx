'use client'

import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ChefHat, Loader2, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { IngredientLookup } from '@/hooks/useInvoices'
import type { SubRecipeLookup } from './IngredientSearch'

export type SubstituteReplacement =
  | { kind: 'ingredient'; data: IngredientLookup }
  | { kind: 'sub-recipe'; data: SubRecipeLookup }

interface Props {
  open: boolean
  currentIngredientId: string | null
  currentSubRecipeId: string | null
  currentIngredientName: string
  hasNote: boolean
  onSubstitute: (replacement: SubstituteReplacement, keepNote: boolean) => void
  onClose: () => void
}

export function SubstituteIngredientModal({
  open,
  currentIngredientId,
  currentSubRecipeId,
  currentIngredientName,
  hasNote,
  onSubstitute,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<IngredientLookup[]>([])
  const [subRecipes, setSubRecipes] = useState<SubRecipeLookup[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<SubstituteReplacement | null>(null)
  const [keepNote, setKeepNote] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setDebouncedQuery('')
      setResults([])
      setSubRecipes([])
      setSelected(null)
      setKeepNote(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(handle)
  }, [query])

  useEffect(() => {
    let active = true
    if (!debouncedQuery) {
      setResults([])
      setSubRecipes([])
      setLoading(false)
      return
    }

    setLoading(true)
    const supabase = createClient()

    Promise.all([
      supabase
        .from('ingredients')
        .select('id, name, current_price, price_unit')
        .ilike('name', `%${debouncedQuery}%`)
        .order('name')
        .limit(6),
      supabase
        .from('recipes')
        .select('id, name, sub_ingredient_cost_per_unit, sub_ingredient_unit, yield_quantity, yield_unit')
        .eq('is_sub_ingredient', true)
        .ilike('name', `%${debouncedQuery}%`)
        .order('name')
        .limit(4),
    ]).then(([ingResult, srResult]) => {
      if (!active) return
      setResults(
        (ingResult.data ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          currentPrice: item.current_price ?? null,
          priceUnit: item.price_unit ?? null,
        }))
      )
      setSubRecipes(
        (srResult.data ?? []).map((r: {
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
    }).catch(() => {
      if (active) setLoading(false)
    })

    return () => { active = false }
  }, [debouncedQuery])

  const isSameAsCurrentItem = (replacement: SubstituteReplacement) => {
    if (replacement.kind === 'ingredient') return replacement.data.id === currentIngredientId
    return replacement.data.id === currentSubRecipeId
  }

  const handleSubstitute = () => {
    if (!selected) return
    if (isSameAsCurrentItem(selected)) {
      onClose()
      return
    }
    onSubstitute(selected, keepNote)
    onClose()
  }

  const hasResults = results.length > 0 || subRecipes.length > 0

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl outline-none">

          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 p-5">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900">
                Substitute ingredient
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-slate-500">
                Replacing: {currentIngredientName}
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-4 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelected(null)
                }}
                placeholder="Search ingredients or sub-recipes..."
                className="w-full rounded-xl border border-slate-200 bg-white px-10 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); setSelected(null) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {loading && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            )}

            {!loading && hasResults && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                {results.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                      Ingredients
                    </div>
                    {results.map((ing) => {
                      const isSelected = selected?.kind === 'ingredient' && selected.data.id === ing.id
                      return (
                        <button
                          key={ing.id}
                          type="button"
                          onClick={() => setSelected({ kind: 'ingredient', data: ing })}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition',
                            isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'
                          )}
                        >
                          <div>
                            <p className={cn('text-sm font-medium', isSelected ? 'text-emerald-700' : 'text-slate-900')}>
                              {ing.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {ing.currentPrice != null
                                ? `€${ing.currentPrice.toFixed(2)} / ${ing.priceUnit ?? 'unit'}`
                                : 'No price set'}
                            </p>
                          </div>
                          {isSelected && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}

                {subRecipes.length > 0 && (
                  <div className={cn(results.length > 0 && 'border-t border-slate-100')}>
                    <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-600">
                      Sub-Recipes
                    </div>
                    {subRecipes.map((sr) => {
                      const isSelected = selected?.kind === 'sub-recipe' && selected.data.id === sr.id
                      return (
                        <button
                          key={sr.id}
                          type="button"
                          onClick={() => setSelected({ kind: 'sub-recipe', data: sr })}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition',
                            isSelected ? 'bg-emerald-50' : 'hover:bg-emerald-50'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <ChefHat className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            <div>
                              <p className={cn('text-sm font-medium', isSelected ? 'text-emerald-700' : 'text-emerald-800')}>
                                {sr.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {sr.costPerUnit != null
                                  ? `€${sr.costPerUnit.toFixed(4)} / ${sr.unit}`
                                  : `per ${sr.unit}`}
                              </p>
                            </div>
                          </div>
                          {isSelected && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {hasNote && (
              <label className="mt-4 flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={keepNote}
                  onChange={(e) => setKeepNote(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 outline-none focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-700">Keep the current note</span>
              </label>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubstitute}
              disabled={!selected}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Substitute
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
