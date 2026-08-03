'use client'

import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, ImageOff, Loader2, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { mergeIngredients } from '@/lib/ingredients/mergeIngredients'
import { toast } from '@/lib/toast'
import type { IngredientAllergen } from '@/lib/allergens'

export interface MergeKeeper {
  id: string
  name: string
  image_url: string | null
  category: string | null
  allergen_ids: number[]
}

type LoserCandidate = {
  id: string
  name: string
  image_url: string | null
  category: string | null
  current_price: number | null
  price_unit: string | null
}

interface Props {
  open: boolean
  keeper: MergeKeeper
  onMerged: () => void
  onClose: () => void
}

function Thumb({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
        <ImageOff className="h-5 w-5" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
  )
}

export default function MergeIngredientModal({ open, keeper, onMerged, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<LoserCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [loser, setLoser] = useState<LoserCandidate | null>(null)

  const [loserAllergens, setLoserAllergens] = useState<IngredientAllergen[]>([])
  const [priceHistoryCount, setPriceHistoryCount] = useState(0)
  const [recipeCount, setRecipeCount] = useState(0)
  const [supplierCodesCount, setSupplierCodesCount] = useState(0)
  const [countsLoading, setCountsLoading] = useState(false)

  const [photoChoice, setPhotoChoice] = useState<'keeper' | 'loser'>('keeper')
  const [categoryChoice, setCategoryChoice] = useState<'keeper' | 'loser'>('keeper')
  const [mergeAllergens, setMergeAllergens] = useState(true)

  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setDebouncedQuery('')
    setResults([])
    setLoser(null)
    setLoserAllergens([])
    setPriceHistoryCount(0)
    setRecipeCount(0)
    setSupplierCodesCount(0)
    setPhotoChoice('keeper')
    setCategoryChoice('keeper')
    setMergeAllergens(true)
    setError(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(handle)
  }, [query])

  // Typeahead — same query pattern as IngredientSearch / SubstituteIngredientModal
  useEffect(() => {
    let active = true
    if (!debouncedQuery) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    const supabase = createClient()
    supabase
      .from('ingredients')
      .select('id, name, image_url, category, current_price, price_unit')
      .or(`name.ilike.%${debouncedQuery}%,brand.ilike.%${debouncedQuery}%`)
      .neq('id', keeper.id)
      .limit(6)
      .then(({ data }) => {
        if (!active) return
        setResults((data ?? []) as LoserCandidate[])
        setSearching(false)
      })

    return () => { active = false }
  }, [debouncedQuery, keeper.id])

  // Once a loser is picked: fetch its allergens + the counts for the summary.
  useEffect(() => {
    if (!loser) return
    let active = true
    setCountsLoading(true)

    const supabase = createClient()
    Promise.all([
      fetch(`/api/ingredients/allergens?id=${loser.id}`).then((r) => r.json()).catch(() => ({})),
      supabase
        .from('ingredient_price_history')
        .select('id', { count: 'exact', head: true })
        .eq('ingredient_id', loser.id),
      supabase
        .from('recipe_ingredients')
        .select('recipe_id')
        .eq('ingredient_id', loser.id),
      supabase
        .from('ingredient_supplier_codes')
        .select('id', { count: 'exact', head: true })
        .eq('ingredient_id', loser.id),
    ]).then(([allergenRes, priceHistRes, recipeIngRes, supplierCodesRes]) => {
      if (!active) return
      setLoserAllergens((allergenRes?.[loser.id] ?? []) as IngredientAllergen[])
      setPriceHistoryCount(priceHistRes.count ?? 0)
      const distinctRecipeIds = new Set(
        (recipeIngRes.data ?? []).map((r: { recipe_id: string }) => r.recipe_id)
      )
      setRecipeCount(distinctRecipeIds.size)
      setSupplierCodesCount(supplierCodesRes.count ?? 0)
      setCountsLoading(false)
    })

    return () => { active = false }
  }, [loser])

  const selectLoser = (candidate: LoserCandidate) => {
    setLoser(candidate)
    setPhotoChoice('keeper')
    setCategoryChoice('keeper')
  }

  const showPhotoChoice = Boolean(keeper.image_url && loser?.image_url && keeper.image_url !== loser.image_url)
  const showCategoryChoice = Boolean(keeper.category && loser?.category && keeper.category !== loser.category)
  const showAllergenChoice = loserAllergens.length > 0
  const showDetailsSection = showPhotoChoice || showCategoryChoice || showAllergenChoice

  const handleClose = () => {
    if (merging) return
    onClose()
  }

  const handleMerge = async () => {
    if (!loser) return
    setMerging(true)
    setError(null)

    const result = await mergeIngredients({
      keeperId: keeper.id,
      loserId: loser.id,
      photoChoice,
      categoryChoice,
      mergeAllergens,
    })

    setMerging(false)

    if (!result.ok) {
      setError(result.error ?? 'Failed to merge ingredients')
      return
    }

    toast.success(`Merged into ${keeper.name}`, {
      description: `${result.priceHistoryMoved} purchase entr${result.priceHistoryMoved === 1 ? 'y' : 'ies'} and ${result.recipeIngredientsMoved} recipe${result.recipeIngredientsMoved === 1 ? '' : 's'} moved.`,
    })
    onMerged()
    onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl outline-none">

          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 p-5">
            <div className="min-w-0 pr-4">
              <Dialog.Title className="text-base font-semibold text-slate-900">
                Merge another ingredient into this one
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-relaxed text-slate-500">
                Everything (purchase history, recipes, allergens) from the ingredient you pick
                will be transferred into &ldquo;{keeper.name}&rdquo;, and the other one will be
                deleted. This cannot be undone.
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="max-h-[70vh] overflow-y-auto p-5">
            {!loser ? (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search ingredients by name or brand…"
                    className="w-full rounded-xl border border-slate-200 bg-white px-10 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  />
                </div>

                {searching && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching…
                  </div>
                )}

                {!searching && debouncedQuery && results.length === 0 && (
                  <p className="mt-3 text-sm text-slate-400">No other ingredients match.</p>
                )}

                {!searching && results.length > 0 && (
                  <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                    {results.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => selectLoser(candidate)}
                        className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-0 hover:bg-slate-50"
                      >
                        <Thumb url={candidate.image_url} alt={candidate.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{candidate.name}</p>
                          {candidate.category && (
                            <span className="mt-0.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                              {candidate.category}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-5">
                {/* Selected loser */}
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <Thumb url={loser.image_url} alt={loser.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{loser.name}</p>
                    <p className="text-xs text-slate-500">will be merged in, then deleted</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLoser(null)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
                    title="Pick a different ingredient"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Which details to keep */}
                {showDetailsSection && (
                  <div className="space-y-4 rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Which details to keep
                    </p>

                    {showPhotoChoice && (
                      <div>
                        <p className="mb-2 text-sm font-medium text-slate-700">Photo</p>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-slate-200 p-3 text-center transition hover:border-emerald-300">
                            <input
                              type="radio"
                              name="photoChoice"
                              checked={photoChoice === 'keeper'}
                              onChange={() => setPhotoChoice('keeper')}
                              className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                            />
                            <Thumb url={keeper.image_url} alt={keeper.name} />
                            <span className="text-xs text-slate-500">Keeper&rsquo;s photo</span>
                          </label>
                          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-slate-200 p-3 text-center transition hover:border-emerald-300">
                            <input
                              type="radio"
                              name="photoChoice"
                              checked={photoChoice === 'loser'}
                              onChange={() => setPhotoChoice('loser')}
                              className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                            />
                            <Thumb url={loser.image_url} alt={loser.name} />
                            <span className="text-xs text-slate-500">Merged-in photo</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {showCategoryChoice && (
                      <div>
                        <p className="mb-2 text-sm font-medium text-slate-700">Category</p>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 transition hover:border-emerald-300">
                            <input
                              type="radio"
                              name="categoryChoice"
                              checked={categoryChoice === 'keeper'}
                              onChange={() => setCategoryChoice('keeper')}
                              className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="truncate text-sm text-slate-700">{keeper.category}</span>
                          </label>
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 transition hover:border-emerald-300">
                            <input
                              type="radio"
                              name="categoryChoice"
                              checked={categoryChoice === 'loser'}
                              onChange={() => setCategoryChoice('loser')}
                              className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="truncate text-sm text-slate-700">{loser.category}</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {showAllergenChoice && (
                      <div>
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={mergeAllergens}
                            onChange={(e) => setMergeAllergens(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm text-slate-700">
                            Merge allergen declarations from both ingredients
                          </span>
                        </label>
                        <p className="mt-1.5 pl-6 text-xs leading-relaxed text-slate-400">
                          Recommended: keeping combined allergens is safer — an allergen present
                          on either ingredient means the merged ingredient may contain it.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Confirmation summary */}
                <div className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
                  {countsLoading ? (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Checking what will move…
                    </div>
                  ) : (
                    <ul className="list-disc space-y-1 pl-4">
                      <li>
                        {priceHistoryCount} purchase history entr{priceHistoryCount === 1 ? 'y' : 'ies'} will move to
                        &ldquo;{keeper.name}&rdquo;
                      </li>
                      <li>
                        {recipeCount} recipe{recipeCount === 1 ? '' : 's'} using &ldquo;{loser.name}&rdquo; will now use
                        &ldquo;{keeper.name}&rdquo;
                      </li>
                      {supplierCodesCount > 0 && (
                        <li>
                          {supplierCodesCount} supplier code{supplierCodesCount === 1 ? '' : 's'} will be transferred
                        </li>
                      )}
                      <li>&ldquo;{loser.name}&rdquo; will be deleted</li>
                    </ul>
                  )}
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={merging}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMerge}
              disabled={!loser || merging || countsLoading}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50',
                'bg-red-600 hover:bg-red-700'
              )}
            >
              {merging && <Loader2 className="h-4 w-4 animate-spin" />}
              Merge ingredients
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
