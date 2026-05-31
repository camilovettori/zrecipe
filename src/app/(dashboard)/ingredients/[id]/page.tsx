'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ChefHat, RefreshCw, Save, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import IngredientForm from '@/components/ingredients/IngredientForm'
import AllergenPicker from '@/components/ingredients/AllergenPicker'
import PriceHistoryChart, { type PricePoint } from '@/components/ingredients/PriceHistoryChart'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import PriceChangeBanner from '@/components/ingredients/PriceChangeBanner'
import { cn } from '@/lib/utils'
import type { IngredientRow } from '@/hooks/useIngredients'
import { EU_ALLERGENS, type AllergenStatus, type IngredientAllergen } from '@/lib/allergens'

function formatMoney(value: number) {
  return `€${value.toFixed(2)}`
}

function formatPricePerKg(ingredient: IngredientRow | null) {
  if (ingredient?.current_price == null) return null

  const price = ingredient.current_price
  const packageUnit = (ingredient.package_unit ?? '').toLowerCase()
  const baseUnit = (ingredient.base_unit ?? '').toLowerCase()

  if (packageUnit === 'kg' && ingredient.package_size && ingredient.package_size > 0) {
    return `${formatMoney(price / ingredient.package_size)} / kg`
  }

  if (baseUnit === 'kg') return `${formatMoney(price)} / kg`
  if (baseUnit === 'g') return `${formatMoney(price * 1000)} / kg`
  if (baseUnit === 'lb') return `${formatMoney(price * 2.20462)} / kg`

  return `${formatMoney(price)} / ${ingredient.base_unit || 'unit'}`
}

function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-24 rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="h-8 flex-1 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-9 w-20 rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="h-9 w-20 rounded-lg bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  )
}

export default function IngredientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isNew = id === 'new'

  const [ingredient, setIngredient] = useState<IngredientRow | null>(null)
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [allergenMap, setAllergenMap] = useState<Record<number, AllergenStatus>>({})
  const [imageRefreshing, setImageRefreshing] = useState(false)
  const autoImageFetchAttemptedFor = useRef<string | null>(null)

  type IngredientDbRow = IngredientRow & {
    price_unit?: string | null
  }

  type FetchImageResponse = {
    imageUrl?: string | null
    query?: string | null
    skipped?: string | null
    error?: string | null
  }

  const refreshIngredientImage = useCallback(
    async (target: IngredientRow, force = false, showToast = false) => {
      if (!target.id) return null

      try {
        setImageRefreshing(true)

        const response = await fetch('/api/ingredients/fetch-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ingredientId: target.id,
            ingredientName: target.name,
            force,
          }),
        })

        const payload = (await response.json().catch(() => ({}))) as FetchImageResponse

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to fetch image')
        }

        if (payload.imageUrl) {
          setIngredient((current) =>
            current && current.id === target.id
              ? { ...current, image_url: payload.imageUrl ?? null }
              : current
          )
          return payload.imageUrl
        }

        if (showToast) {
          toast.info(payload.error ?? 'No image found for this ingredient')
        }

        return null
      } catch (error: unknown) {
        if (showToast) {
          toast.error(error instanceof Error ? error.message : 'Unable to fetch image')
        }
        return null
      } finally {
        setImageRefreshing(false)
      }
    },
    []
  )

  useEffect(() => {
    if (isNew) return

    const supabase = createClient()
    Promise.all([
      supabase
        .from('ingredients')
        .select('*, supplier:suppliers!last_supplier_id(name)')
        .eq('id', id)
        .single(),
      supabase
        .from('ingredient_price_history')
        .select('id, ingredient_id, price, unit, recorded_at, invoice_id')
        .eq('ingredient_id', id)
        .order('recorded_at', { ascending: true }),
      fetch(`/api/ingredients/allergens?id=${id}`).then((r) => r.json()).catch(() => ({})),
    ]).then(([ingRes, histRes, allergenRes]) => {
      if (ingRes.error) {
        toast.error('Ingredient not found')
        router.replace('/ingredients')
        return
      }

      console.log('[INGREDIENT DETAIL] price history query result:', {
        ingredientId: id,
        count: histRes.data?.length ?? 0,
        error: histRes.error?.message ?? null,
        rows: histRes.data,
      })

      setIngredient({
        ...(ingRes.data as IngredientDbRow),
        base_unit: (ingRes.data as IngredientDbRow).price_unit ?? 'unit',
      } as IngredientRow)
      setPriceHistory((histRes.data ?? []) as PricePoint[])

      // Hydrate allergen map from API response
      const ingAllergens: IngredientAllergen[] = allergenRes?.[id] ?? []
      const map: Record<number, AllergenStatus> = {}
      for (const { allergenId, status } of ingAllergens) map[allergenId] = status
      setAllergenMap(map)

      setLoading(false)
    })
  }, [id, isNew, router])

  useEffect(() => {
    if (isNew || !ingredient?.id || ingredient.image_url) return
    if (autoImageFetchAttemptedFor.current === ingredient.id) return

    autoImageFetchAttemptedFor.current = ingredient.id
    void refreshIngredientImage(ingredient, false, false)
  }, [ingredient, isNew, refreshIngredientImage])

  const handleDelete = async () => {
    if (!ingredient) return
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('ingredients').delete().eq('id', ingredient.id)
    if (error) {
      toast.error(error.message)
      setDeleting(false)
    } else {
      toast.success(`"${ingredient.name}" deleted`)
      router.push('/ingredients')
    }
  }

  const handleIngredientSaved = async (updated: IngredientRow) => {
    setIngredient(updated)
    const allergens = Object.entries(allergenMap).map(([id, status]) => ({
      allergenId: parseInt(id),
      status,
    }))
    console.log('[allergen save] payload:', { ingredientId: updated.id, allergens })
    try {
      const res = await fetch('/api/ingredients/allergens', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredientId: updated.id, allergens }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        console.error('[allergen save] failed:', res.status, body)
        toast.error(body.error ?? 'Allergens could not be saved')
      } else {
        console.log('[allergen save] success')
      }
    } catch (err) {
      console.error('[allergen save] network error:', err)
      toast.error('Allergens could not be saved')
    }
  }

  if (loading) return <PageSkeleton />

  const pageTitle = isNew ? 'New Ingredient' : (ingredient?.name ?? 'Ingredient')

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push('/ingredients')}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <h1 className="font-display flex-1 truncate text-xl font-bold text-slate-900 dark:text-white">
          {pageTitle}
        </h1>

        <button
          form="ingredient-form"
          type="submit"
          disabled={isSaving}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? 'Saving…' : 'Save'}
        </button>

        {!isNew && ingredient && (
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}
      </div>

      {/* Price change banner — shown once per session when price shifted */}
      {!isNew && ingredient && (
        <PriceChangeBanner ingredientId={id} priceHistory={priceHistory} />
      )}

      {/* Main layout */}
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Left: form */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <IngredientForm
            ingredient={ingredient}
            onSubmittingChange={setIsSaving}
            onSaved={handleIngredientSaved}
          />

          {/* Allergen section — only shown for existing ingredients */}
          {!isNew && (
            <div className="mt-6 border-t border-slate-200 pt-6">
              <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">
                Allergens
              </h2>
              <p className="mb-4 text-xs text-slate-500">
                EU Regulation 1169/2011 — declare which allergens this ingredient contains.
                Click a chip to cycle: <strong>Contains</strong> → <strong>May contain</strong> → Not present.
                Saved automatically with the ingredient.
              </p>
              <AllergenPicker value={allergenMap} onChange={setAllergenMap} />
            </div>
          )}
        </div>

        {/* Right: price history */}
        <div className="space-y-4">
          {!isNew && ingredient && (
            <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              {ingredient.image_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ingredient.image_url}
                    alt={ingredient.name}
                    className="h-56 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => void refreshIngredientImage(ingredient, true, true)}
                    disabled={imageRefreshing}
                    aria-label="Refresh image"
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 shadow-sm backdrop-blur-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5 text-slate-700', imageRefreshing && 'animate-spin')} />
                  </button>
                </>
              ) : (
                <div className="flex h-56 flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center dark:bg-slate-900">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20">
                    <ChefHat className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No image yet</p>
                  <button
                    type="button"
                    onClick={() => void refreshIngredientImage(ingredient, true, true)}
                    disabled={imageRefreshing}
                    aria-label="Refresh image"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5 text-slate-600 dark:text-slate-300', imageRefreshing && 'animate-spin')} />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
              Price History
            </h2>
            <PriceHistoryChart
              priceHistory={priceHistory}
              unit={ingredient?.base_unit ?? 'unit'}
            />
          </div>

          {!isNew && ingredient && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
                Details
              </h2>
              <dl className="space-y-2 text-sm">
                {ingredient.package_size && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Package size</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">
                      {ingredient.package_size} {ingredient.package_unit}
                    </dd>
                  </div>
                )}
                {ingredient.supplier?.name && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Supplier</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">
                      {ingredient.supplier.name}
                    </dd>
                  </div>
                )}
                {ingredient.current_price != null && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Price per kg</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">
                      {formatPricePerKg(ingredient)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-500">Price entries</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">
                    {priceHistory.length}
                  </dd>
                </div>
                <div>
                  <dt className="mb-1.5 text-slate-500">Allergens</dt>
                  <dd>
                    {Object.keys(allergenMap).length === 0 ? (
                      <span className="text-xs text-slate-400">None declared</span>
                    ) : (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {EU_ALLERGENS.filter((a) => allergenMap[a.id]).map((a) => (
                          <span key={a.id} className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                allergenMap[a.id] === 'contains' ? 'bg-red-500' : 'bg-amber-400'
                              }`}
                            />
                            {a.shortName}
                          </span>
                        ))}
                      </div>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Delete modal */}
      <ConfirmDelete
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        itemName={ingredient?.name ?? ''}
        loading={deleting}
      />
    </div>
  )
}
