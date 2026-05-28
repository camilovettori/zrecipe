'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { COMMON_UNITS } from '@/lib/utils/unit-converter'
import { cn } from '@/lib/utils'
import type { IngredientLookup } from '@/hooks/useInvoices'

interface IngredientSearchProps {
  onAddIngredient: (
    ingredient: IngredientLookup,
    quantity: number,
    unit: string
  ) => Promise<void> | void
  onCreateIngredient: (
    name: string,
    quantity: number,
    unit: string
  ) => Promise<void> | void
}

function formatPrice(ingredient: IngredientLookup) {
  if (ingredient.currentPrice == null) {
    return 'No price'
  }
  return `€${ingredient.currentPrice.toFixed(2)} / ${ingredient.priceUnit ?? 'unit'}`
}

export default function IngredientSearch({
  onAddIngredient,
  onCreateIngredient,
}: IngredientSearchProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<IngredientLookup[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<IngredientLookup | null>(null)
  const [createMode, setCreateMode] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [unit, setUnit] = useState('unit')

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(handle)
  }, [query])

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!debouncedQuery) {
        setResults([])
        setLoading(false)
        return
      }

      setLoading(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('ingredients')
        .select('id, name, current_price, price_unit')
        .ilike('name', `%${debouncedQuery}%`)
        .order('name', { ascending: true })
        .limit(8)

      if (!active) return

      if (error) {
        setResults([])
      } else {
        setResults(
          (data ?? []).map((item) => ({
            id: item.id,
            name: item.name,
            currentPrice: item.current_price ?? null,
            priceUnit: item.price_unit ?? null,
          }))
        )
      }
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [debouncedQuery])

  const hasExactMatch = useMemo(
    () => results.some((ingredient) => ingredient.name.toLowerCase() === query.trim().toLowerCase()),
    [query, results]
  )

  const resetSelection = () => {
    setSelected(null)
    setCreateMode(false)
    setQuantity(1)
    setUnit('unit')
  }

  const handleAdd = async () => {
    if (selected) {
      await onAddIngredient(selected, quantity, unit)
      setQuery('')
      resetSelection()
      setOpen(false)
      return
    }

    if (createMode && query.trim()) {
      await onCreateIngredient(query.trim(), quantity, unit)
      setQuery('')
      resetSelection()
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        Add ingredients
      </label>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setSelected(null)
            setCreateMode(false)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Search ingredients..."
          className="w-full rounded-xl border border-slate-200 bg-white px-10 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
        />
      </div>

      {open && (query.trim() || results.length > 0) && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : (
            <>
              {results.map((ingredient) => (
                <button
                  key={ingredient.id}
                  type="button"
                  onClick={() => {
                    setSelected(ingredient)
                    setCreateMode(false)
                    setUnit(ingredient.priceUnit ?? 'unit')
                    setQuantity(1)
                    setOpen(true)
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{ingredient.name}</p>
                    <p className="text-xs text-slate-500">{formatPrice(ingredient)}</p>
                  </div>
                  <Plus className="h-4 w-4 text-slate-400" />
                </button>
              ))}

              {!hasExactMatch && query.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setCreateMode(true)
                    setSelected(null)
                    setUnit('unit')
                    setQuantity(1)
                    setOpen(true)
                  }}
                  className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                >
                  <Plus className="h-4 w-4" />
                  Create &quot;{query.trim()}&quot;
                </button>
              )}
            </>
          )}
        </div>
      )}

      {(selected || createMode) && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {createMode ? `Create ${query.trim()}` : selected?.name}
              </p>
              <p className="text-xs text-slate-500">
                {createMode
                  ? 'Create a placeholder ingredient and link it to this recipe.'
                  : formatPrice(selected!)}
              </p>
            </div>
            <button
              type="button"
              onClick={resetSelection}
              className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px_140px]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Quantity</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={quantity}
                onChange={(event) => setQuantity(Number.parseFloat(event.target.value || '0'))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Unit</span>
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                className={cn(
                  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500',
                  '[&>option]:bg-white'
                )}
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={handleAdd}
              className="self-end rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Add to recipe
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
