'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Camera, Check, ChefHat, Loader2, Save, Trash2, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import IngredientForm, { type AutoSaveStatus } from '@/components/ingredients/IngredientForm'
import AllergenPicker from '@/components/ingredients/AllergenPicker'
import PriceHistoryChart, { type PricePoint } from '@/components/ingredients/PriceHistoryChart'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import PriceChangeBanner from '@/components/ingredients/PriceChangeBanner'
import type { IngredientRow } from '@/hooks/useIngredients'
import { EU_ALLERGENS, type AllergenStatus, type IngredientAllergen } from '@/lib/allergens'
import { findIngredientImage } from '@/lib/utils/ingredient-image'

function formatMoney(value: number) {
  return `\u20ac${value.toFixed(2)}`
}

const categoryEmoji: Record<string, string> = {
  bread: '\u{1F35E}',
  pastry: '\u{1F950}',
  cake: '\u{1F382}',
  main: '\u{1F37D}\uFE0F',
  dessert: '\u{1F370}',
  beverage: '\u2615',
  other: '\u{1F374}',
}

type UsedRecipe = {
  id: string
  name: string
  category: string | null
  quantity: number
  unit: string
}

type RecipeIngredientUsageRow = {
  quantity: number | null
  unit: string | null
  recipes:
    | {
        id: string
        name: string
        category: string | null
      }
    | {
        id: string
        name: string
        category: string | null
      }[]
    | null
}

function formatPricePerKg(ingredient: IngredientRow | null) {
  if (ingredient?.current_price == null) return null

  const price = ingredient.current_price
  const packageUnit = (ingredient.package_unit ?? '').toLowerCase()
  const baseUnit = (ingredient.base_unit ?? '').toLowerCase()

  if (baseUnit === 'kg') return `${formatMoney(price)} / kg`
  if (baseUnit === 'g') return `${formatMoney(price * 1000)} / kg`
  if (baseUnit === 'lb') return `${formatMoney(price * 2.20462)} / kg`
  if (packageUnit === 'kg') return `${formatMoney(price)} / kg`

  return `${formatMoney(price)} / ${ingredient.base_unit || ingredient.package_unit || 'unit'}`
}

function normalizeUsedRecipes(rows: RecipeIngredientUsageRow[] | null): UsedRecipe[] {
  return (rows ?? []).flatMap((row) => {
    const recipe = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes
    if (!recipe) return []

    return [
      {
        id: recipe.id,
        name: recipe.name,
        category: recipe.category,
        quantity: row.quantity ?? 0,
        unit: row.unit ?? '',
      },
    ]
  })
}

function formatQuantity(value: number) {
  if (Number.isInteger(value)) return value.toString()
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
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

function AutoSaveIndicator({ status }: { status: AutoSaveStatus }) {
  if (status === 'idle') return null
  if (status === 'dirty') return (
    <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Unsaved
    </span>
  )
  if (status === 'saving') return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <Loader2 className="h-3 w-3 animate-spin" />
      Saving…
    </span>
  )
  if (status === 'saved') return (
    <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
      <Check className="h-3 w-3" />
      Saved
    </span>
  )
  if (status === 'error') return (
    <span className="text-xs text-red-600 dark:text-red-400">Save failed</span>
  )
  return null
}

export default function IngredientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isNew = id === 'new'

  const [ingredient, setIngredient] = useState<IngredientRow | null>(null)
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([])
  const [usedRecipes, setUsedRecipes] = useState<UsedRecipe[]>([])
  const [usedRecipesLoading, setUsedRecipesLoading] = useState(!isNew)
  const [loading, setLoading] = useState(!isNew)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [allergenMap, setAllergenMap] = useState<Record<number, AllergenStatus>>({})
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle')
  // Manifest image resolved client-side — never saved to DB
  const [manifestImageUrl, setManifestImageUrl] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  type IngredientDbRow = IngredientRow & { price_unit?: string | null }

  // Fade 'saved' back to idle after 3 s
  useEffect(() => {
    if (autoSaveStatus !== 'saved') return
    const t = setTimeout(() => setAutoSaveStatus('idle'), 3000)
    return () => clearTimeout(t)
  }, [autoSaveStatus])

  // Load ingredient + price history + allergens
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
        .select(`
          id,
          ingredient_id,
          price,
          unit,
          recorded_at,
          invoice_id,
          invoice:invoices (
            id,
            invoice_number,
            supplier:suppliers (
              name
            )
          )
        `)
        .eq('ingredient_id', id)
        .order('recorded_at', { ascending: true }),
      fetch(`/api/ingredients/allergens?id=${id}`).then((r) => r.json()).catch(() => ({})),
    ]).then(([ingRes, histRes, allergenRes]) => {
      if (ingRes.error) {
        toast.error('Ingredient not found')
        router.replace('/ingredients')
        return
      }

      console.log('[INGREDIENT DETAIL] price history query result:', histRes.data, 'error:', histRes.error)

      setIngredient({
        ...(ingRes.data as IngredientDbRow),
        base_unit: (ingRes.data as IngredientDbRow).price_unit ?? 'unit',
      } as IngredientRow)
      setPriceHistory((histRes.data ?? []) as PricePoint[])

      const ingAllergens: IngredientAllergen[] = allergenRes?.[id] ?? []
      const map: Record<number, AllergenStatus> = {}
      for (const { allergenId, status } of ingAllergens) map[allergenId] = status
      setAllergenMap(map)

      setLoading(false)
    })
  }, [id, isNew, router])

  useEffect(() => {
    if (isNew) return

    let cancelled = false
    const supabase = createClient()
    setUsedRecipesLoading(true)

    supabase
      .from('recipe_ingredients')
      .select(`
        quantity,
        unit,
        recipes!recipe_ingredients_recipe_id_fkey (
          id,
          name,
          category
        )
      `)
      .eq('ingredient_id', id)
      .then((usedRecipesRes) => {
        console.log('[INGREDIENT DETAIL] used recipes query result:', usedRecipesRes.data, 'error:', usedRecipesRes.error)
        if (cancelled) return
        setUsedRecipes(normalizeUsedRecipes((usedRecipesRes.data ?? []) as RecipeIngredientUsageRow[]))
        setUsedRecipesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, isNew])

  // Resolve manifest image whenever ingredient name changes (client-side, no DB write)
  useEffect(() => {
    if (!ingredient?.name) return
    // Only use manifest if no user-uploaded image
    const userImage = ingredient.image_url?.startsWith('http') ? ingredient.image_url : null
    if (userImage) { setManifestImageUrl(null); return }
    findIngredientImage(ingredient.name).then(setManifestImageUrl)
  }, [ingredient?.name, ingredient?.image_url])

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
    try {
      const res = await fetch('/api/ingredients/allergens', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredientId: updated.id, allergens }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast.error(body.error ?? 'Allergens could not be saved')
      }
    } catch (err) {
      console.error('[allergen save] network error:', err)
      toast.error('Allergens could not be saved')
    }
  }

  // Upload user photo → Supabase storage → save URL to DB
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !ingredient) return

    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('ingredientId', ingredient.id)

      const res = await fetch('/api/ingredients/upload-image', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Upload failed')
        return
      }

      const { url } = await res.json() as { url: string }
      const supabase = createClient()
      await supabase.from('ingredients').update({ image_url: url }).eq('id', ingredient.id)
      setIngredient((prev) => prev ? { ...prev, image_url: url } : prev)
      setManifestImageUrl(null)
      toast.success('Photo updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [ingredient])

  // Remove user-uploaded photo, fall back to manifest
  const handleRemoveImage = useCallback(async () => {
    if (!ingredient) return
    const supabase = createClient()
    await supabase.from('ingredients').update({ image_url: null }).eq('id', ingredient.id)
    setIngredient((prev) => prev ? { ...prev, image_url: null } : prev)
    findIngredientImage(ingredient.name).then(setManifestImageUrl)
  }, [ingredient])

  if (loading) return <PageSkeleton />

  const pageTitle = isNew ? 'New Ingredient' : (ingredient?.name ?? 'Ingredient')

  // User-uploaded image wins; manifest image is the fallback; null → placeholder
  const userImageUrl = ingredient?.image_url?.startsWith('http') ? ingredient.image_url : null
  const displayImageUrl = userImageUrl ?? manifestImageUrl

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

        {!isNew && <AutoSaveIndicator status={autoSaveStatus} />}

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

      {/* Price change banner */}
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
            onAutoSaveStatus={setAutoSaveStatus}
          />

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

        {/* Right: image + price history + details */}
        <div className="space-y-4">
          {/* ── Image card ─────────────────────────────────────────────── */}
          {!isNew && ingredient && (
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              {displayImageUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayImageUrl}
                    alt={ingredient.name}
                    className="h-52 w-full object-cover"
                  />
                  {/* × remove button — only for user uploads */}
                  {userImageUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      title="Remove photo"
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm transition hover:bg-white"
                    >
                      <X className="h-3.5 w-3.5 text-slate-700" />
                    </button>
                  )}
                  {/* Change photo button — overlay for user uploads */}
                  {userImageUrl && (
                    <label className="absolute bottom-2 right-2 flex cursor-pointer items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-white">
                      <Camera className="h-3 w-3" />
                      Change
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={handleFileChange}
                      />
                    </label>
                  )}
                </div>
              ) : (
                // Placeholder — click anywhere to upload
                <label className="flex h-52 cursor-pointer flex-col items-center justify-center gap-2 bg-slate-50 transition hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800/80">
                  {uploadingImage ? (
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  ) : (
                    <>
                      <ChefHat className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <Camera className="h-5 w-5 text-slate-400" />
                      <span className="text-sm text-slate-400">Add photo</span>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>
          )}

          {/* Price history chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
              Price History
            </h2>
            <PriceHistoryChart
              priceHistory={priceHistory}
              unit={ingredient?.base_unit ?? 'unit'}
            />
          </div>

          {!isNew && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Used in Recipes
                </h2>
                {usedRecipes.length > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {usedRecipes.length}
                  </span>
                )}
              </div>

              {usedRecipesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="flex animate-pulse items-center justify-between rounded-lg px-2 py-2.5">
                      <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="h-3 w-14 rounded bg-slate-200 dark:bg-slate-700" />
                    </div>
                  ))}
                </div>
              ) : usedRecipes.length === 0 ? (
                <p className="py-3 text-center text-sm italic text-slate-400">
                  Not used in any recipe yet
                </p>
              ) : (
                <div className="space-y-1">
                  {usedRecipes.map((recipe) => {
                    const category = (recipe.category ?? 'other').toLowerCase()
                    const emoji = categoryEmoji[category] ?? categoryEmoji.other

                    return (
                      <button
                        key={recipe.id}
                        type="button"
                        onClick={() => router.push(`/recipes/${recipe.id}`)}
                        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">
                          <span className="mr-2" aria-hidden="true">{emoji}</span>
                          {recipe.name}
                        </span>
                        <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">
                          {formatQuantity(recipe.quantity)} {recipe.unit}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Details panel */}
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
