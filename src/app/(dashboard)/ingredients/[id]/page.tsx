'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertTriangle, ArrowDownRight, ArrowLeft, ArrowUpRight, Calculator, Camera, Check, ChefHat, Loader2, Minus, Repeat, Save, Trash2, X, type LucideIcon } from 'lucide-react'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import IngredientForm, {
  type AutoSaveStatus,
  type IngredientCostPreview,
} from '@/components/ingredients/IngredientForm'
import AllergenPicker from '@/components/ingredients/AllergenPicker'
import PriceHistoryChart, { type PricePoint } from '@/components/ingredients/PriceHistoryChart'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import PriceChangeBanner from '@/components/ingredients/PriceChangeBanner'
import type { IngredientRow } from '@/hooks/useIngredients'
import { EU_ALLERGENS, type AllergenStatus, type IngredientAllergen } from '@/lib/allergens'
import { findIngredientImage } from '@/lib/utils/ingredient-image'
import { compressImage } from '@/lib/utils/image-compress'
import { PriceSimulatorModal } from '@/components/ingredients/PriceSimulatorModal'
import { SubstituteIngredientModal, type SubstituteReplacement } from '@/components/recipes/SubstituteIngredientModal'
import { resolveIngredientPrice } from '@/lib/ingredients/resolveIngredientPrice'
import { setSelectedPrice } from '@/lib/ingredients/setSelectedPrice'
import { cn } from '@/lib/utils'
import {
  buildCostExamples,
  formatIngredientMoney,
  formatIngredientUnitPrice,
  getPriceChangePercent,
  getSuspiciousIngredientPriceWarning,
} from '@/lib/utils/ingredient-pricing'

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

function resolveHistorySupplierName(point: PricePoint | null) {
  if (!point?.invoice) return null
  const invoice = Array.isArray(point.invoice) ? point.invoice[0] : point.invoice
  const supplier = Array.isArray(invoice?.supplier) ? invoice?.supplier[0] : invoice?.supplier
  return supplier?.name ?? null
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

function IconButtonWithTooltip({
  icon: Icon,
  tooltip,
  onClick,
  disabled,
  iconClassName,
}: {
  icon: LucideIcon
  tooltip: string
  onClick: () => void
  disabled?: boolean
  iconClassName?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        disabled={disabled}
        aria-label={tooltip}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400"
      >
        <Icon className={cn('h-3.5 w-3.5', iconClassName)} />
      </button>
      {show && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[180px] -translate-x-1/2">
          <div className="relative rounded-lg bg-gray-800 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
            {tooltip}
            <div className="absolute left-1/2 top-full -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-800" />
          </div>
        </div>
      )}
    </div>
  )
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
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const [substituteModalOpen, setSubstituteModalOpen] = useState(false)
  const [substituting, setSubstituting] = useState(false)
  const [formCanSave, setFormCanSave] = useState(false)
  const [costPreview, setCostPreview] = useState<IngredientCostPreview | null>(null)
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
          brand,
          is_selected_price,
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

  const handleSelectionChange = useCallback(async (historyId: string | null) => {
    if (!ingredient) return
    setPriceHistory((prev) => prev.map((p) => ({ ...p, is_selected_price: p.id === historyId })))
    const result = await setSelectedPrice(ingredient.id, historyId)
    if (!result.ok) {
      toast.error('Failed to update selected price')
      // Revert to server truth rather than leaving the optimistic update stuck wrong.
      const supabase = createClient()
      const { data } = await supabase
        .from('ingredient_price_history')
        .select(`
          id, ingredient_id, price, unit, brand, is_selected_price, recorded_at, invoice_id,
          invoice:invoices ( id, invoice_number, supplier:suppliers ( name ) )
        `)
        .eq('ingredient_id', ingredient.id)
        .order('recorded_at', { ascending: true })
      setPriceHistory((data ?? []) as PricePoint[])
    }
  }, [ingredient])

  const refreshUsedRecipes = useCallback(async () => {
    if (isNew) return
    setUsedRecipesLoading(true)
    const supabase = createClient()
    const { data } = await supabase
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
    setUsedRecipes(normalizeUsedRecipes((data ?? []) as RecipeIngredientUsageRow[]))
    setUsedRecipesLoading(false)
  }, [id, isNew])

  useEffect(() => {
    let cancelled = false
    refreshUsedRecipes().then(() => {
      if (cancelled) return
    })
    return () => {
      cancelled = true
    }
  }, [refreshUsedRecipes])

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
      const compressed = await compressImage(file, 1200, 0.8)
      const formData = new FormData()
      formData.append('file', compressed)
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
  const latestPrice = priceHistory[priceHistory.length - 1] ?? null
  const previousPrice = priceHistory[priceHistory.length - 2] ?? null
  const priceChangePct = getPriceChangePercent(previousPrice?.price ?? null, latestPrice?.price ?? null)
  const resolvedPrice = resolveIngredientPrice(
    priceHistory.map((p) => ({
      id: p.id,
      price: p.price,
      unit: p.unit,
      is_selected_price: p.is_selected_price ?? false,
      recorded_at: p.recorded_at ?? null,
    })),
    ingredient?.current_price ?? null,
    ingredient?.base_unit ?? null
  )
  const currentPriceValue = resolvedPrice.price ?? ingredient?.current_price ?? latestPrice?.price ?? null
  const currentPriceUnit = resolvedPrice.unit ?? ingredient?.base_unit ?? latestPrice?.unit ?? ingredient?.package_unit ?? 'unit'
  const panelPriceValue = costPreview?.normalizedPrice ?? currentPriceValue
  const panelPriceUnit = costPreview?.normalizedUnit ?? currentPriceUnit
  const priceSourceLabel =
    resolvedPrice.source === 'selected'
      ? 'Currently using: your selected price'
      : resolvedPrice.source === 'latest'
        ? 'Currently using: latest purchase'
        : resolvedPrice.source === 'manual'
          ? 'Currently using: manual price'
          : null
  const unitExamples = buildCostExamples(panelPriceValue, panelPriceUnit)
  const suspiciousPriceWarning = getSuspiciousIngredientPriceWarning(costPreview)
  const previewWarnings = costPreview?.warnings ?? []
  const hasEnteredPackage = Boolean(
    costPreview?.packagePrice &&
    costPreview.packagePrice > 0 &&
    costPreview.packageQuantity &&
    costPreview.packageQuantity > 0 &&
    costPreview.packageUnit
  )
  const usingExistingPrice = !isNew && panelPriceValue != null && !hasEnteredPackage
  const previewIsValid = (costPreview?.isValid ?? panelPriceValue != null) || usingExistingPrice

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
          disabled={isSaving || !formCanSave}
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
            onValidityChange={setFormCanSave}
            onPricingPreviewChange={setCostPreview}
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

        {/* Right: image + cost intelligence + details */}
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
                  {uploadingImage && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="text-center">
                        <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <p className="text-xs font-medium text-white">Saving photo…</p>
                      </div>
                    </div>
                  )}
                  {/* Change photo button — overlay for user uploads */}
                  {userImageUrl && !uploadingImage && (
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

          {/* Cost intelligence */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Cost Intelligence
                  </p>
                  <h2 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    Pricing summary
                  </h2>
                </div>
              </div>
              {!isNew && ingredient && (
                <button
                  type="button"
                  onClick={() => setSimulatorOpen(true)}
                  title="Price simulator"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Calculator className="h-3.5 w-3.5" />
                  Simulate
                </button>
              )}
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 dark:border-emerald-800 dark:from-emerald-950/40 dark:to-slate-900">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                  {isNew ? 'Calculated unit cost' : 'Current unit cost'}
                </p>
                <p className="mt-1.5 text-3xl font-black tracking-tight text-emerald-700 dark:text-emerald-300">
                  {formatIngredientUnitPrice(panelPriceValue, panelPriceUnit)}
                </p>
                {!isNew && priceSourceLabel && (
                  <p className="mt-0.5 text-[11px] text-slate-400">{priceSourceLabel}</p>
                )}
                {hasEnteredPackage && costPreview ? (
                  <p className="mt-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {formatIngredientMoney(costPreview.packagePrice)} for{' '}
                    {costPreview.packageQuantity} {costPreview.packageUnit}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-500">
                    {isNew ? 'Enter the package price, quantity and unit to calculate.' : 'Package details not available.'}
                  </p>
                )}
                {costPreview?.isOverride && (
                  <p className="mt-1 text-[11px] font-medium text-amber-700">Manual unit cost override active</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Example recipe usage
                </p>
                {unitExamples.length > 0 ? (
                  <div className="mt-2 divide-y divide-slate-200/80 text-sm text-slate-700 dark:divide-slate-700 dark:text-slate-200">
                    {unitExamples.map((example) => (
                      <p key={example} className="py-1.5 first:pt-0 last:pb-0">{example}</p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">Examples update when the unit cost is available.</p>
                )}
              </div>

              {!isNew && ingredient && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {ingredient.package_size && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          Package size
                        </p>
                        <p className="mt-1.5 text-sm font-medium text-slate-900 dark:text-white">
                          {ingredient.package_size} {ingredient.package_unit}
                        </p>
                      </div>
                    )}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        Price entries
                      </p>
                      <p className="mt-1.5 text-sm font-medium text-slate-900 dark:text-white">
                        {priceHistory.length}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Allergens
                    </p>
                    <div className="mt-1.5">
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
                    </div>
                  </div>
                </>
              )}

              {(isNew || !previewIsValid) && (
              <div className={cn(
                'rounded-xl border p-4',
                previewIsValid
                  ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
                  : 'border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20'
              )}>
                <div className="flex items-start gap-2.5">
                  {previewIsValid ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <div>
                    <p className={cn(
                      'text-sm font-semibold',
                      previewIsValid ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'
                    )}>
                      {usingExistingPrice
                        ? 'Using existing unit cost'
                        : previewIsValid
                          ? 'Ready to save'
                          : 'Complete the purchase details'}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {usingExistingPrice
                        ? 'Add package details when available to enable automatic cost calculation.'
                        : previewIsValid
                          ? 'The package conversion is valid and ready for recipe costing.'
                        : previewWarnings[0] ?? 'Enter a valid package price, quantity and unit.'}
                    </p>
                  </div>
                </div>
              </div>
              )}

              {suspiciousPriceWarning && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Check the package unit</p>
                      <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                        {suspiciousPriceWarning}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!isNew && (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Previous cost
                    </p>
                    <p className="mt-1.5 text-lg font-bold text-slate-900 dark:text-white">
                      {previousPrice
                        ? formatIngredientUnitPrice(previousPrice.price, previousPrice.unit)
                        : '—'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Last recorded unit price</p>
                  </div>
                  <div className={cn(
                    'rounded-xl border p-4',
                    priceChangePct == null
                      ? 'border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/40'
                      : priceChangePct > 15
                        ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                        : priceChangePct > 0
                          ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                          : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
                  )}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Price change
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {priceChangePct == null ? (
                        <Minus className="h-4 w-4 text-slate-400" />
                      ) : priceChangePct > 0 ? (
                        <ArrowUpRight className={cn('h-4 w-4', priceChangePct > 15 ? 'text-red-500' : 'text-amber-600')} />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-emerald-600" />
                      )}
                      <p className={cn(
                        'text-lg font-bold',
                        priceChangePct == null
                          ? 'text-slate-500'
                          : priceChangePct > 15
                            ? 'text-red-700 dark:text-red-300'
                            : priceChangePct > 0
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-emerald-700 dark:text-emerald-300'
                      )}>
                        {priceChangePct == null ? '—' : `${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(1)}%`}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {priceChangePct == null ? 'No comparison yet' : priceChangePct > 0 ? 'Cost increased' : 'Cost decreased or unchanged'}
                    </p>
                  </div>
                </div>

                {ingredient && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Last purchase
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                    {ingredient.last_purchase_date
                      ? new Date(ingredient.last_purchase_date).toLocaleDateString('en-IE', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : latestPrice?.recorded_at
                        ? new Date(latestPrice.recorded_at).toLocaleDateString('en-IE', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Supplier: {ingredient.supplier?.name ?? resolveHistorySupplierName(latestPrice) ?? '—'}
                  </p>
                  </div>
                )}

                  {priceHistory.length > 0 && (
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        Price history
                      </p>
                      <PriceHistoryChart
                        priceHistory={priceHistory}
                        unit={panelPriceUnit}
                        ingredientId={ingredient?.id}
                        onSelectionChange={handleSelectionChange}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
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
                {!isNew && usedRecipes.length > 0 && (
                  <div className="ml-auto">
                    <IconButtonWithTooltip
                      icon={substituting ? Loader2 : Repeat}
                      iconClassName={substituting ? 'animate-spin' : undefined}
                      tooltip="Substitute in all recipes"
                      onClick={() => setSubstituteModalOpen(true)}
                      disabled={substituting}
                    />
                  </div>
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
        </div>
      </div>

      <ConfirmDelete
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        itemName={ingredient?.name ?? ''}
        loading={deleting}
      />

      {ingredient && (
        <PriceSimulatorModal
          open={simulatorOpen}
          onClose={() => setSimulatorOpen(false)}
          ingredient={ingredient}
          usedRecipeIds={usedRecipes.map((r) => r.id)}
          resolvedPrice={resolvedPrice}
        />
      )}

      <SubstituteIngredientModal
        open={substituteModalOpen}
        currentIngredientId={ingredient?.id ?? null}
        currentSubRecipeId={null}
        currentIngredientName={ingredient?.name ?? ''}
        hasNote={false}
        onSubstitute={async (replacement: SubstituteReplacement) => {
          if (!ingredient) return
          setSubstituting(true)
          try {
            const supabase = createClient()
            const updatePayload =
              replacement.kind === 'ingredient'
                ? { ingredient_id: replacement.data.id, sub_recipe_id: null }
                : { sub_recipe_id: replacement.data.id, ingredient_id: null }

            const affectedCount = usedRecipes.length

            const { error } = await supabase
              .from('recipe_ingredients')
              .update(updatePayload)
              .eq('ingredient_id', ingredient.id)

            if (error) {
              toast.error('Failed to substitute ingredient')
              return
            }

            toast.success(
              `Substituted in ${affectedCount} recipe${affectedCount !== 1 ? 's' : ''}`
            )
            await refreshUsedRecipes()
          } finally {
            setSubstituting(false)
          }
        }}
        onClose={() => setSubstituteModalOpen(false)}
      />
    </div>
  )
}
