'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { Reorder, useDragControls } from 'framer-motion'
import {
  ArrowLeft,
  Save,
  Printer,
  UploadCloud,
  GripVertical,
  Plus,
  Trash2,
  Loader2,
  Check,
  CheckCircle,
  Link2,
  ChefHat,
  RefreshCw,
  Pencil,
  X,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  calculateRecipeCost,
  calculateLineCost,
  type RecipeEditorData,
  type RecipeIngredientDraft,
  type RecipeRecord,
  type RecipeStepDraft,
  RECIPE_CATEGORIES,
  useRecipes,
} from '@/hooks/useRecipes'
import type { IngredientLookup } from '@/hooks/useInvoices'
import { resolveTenantId } from '@/hooks/useTenant'
import { computeRecipeAllergens, type RecipeAllergenSummary, type IngredientAllergen } from '@/lib/allergens'
import IngredientSearch, { type SubRecipeLookup } from './IngredientSearch'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { YieldFactorPopover } from './YieldFactorPopover'
import { YieldFactorModal } from './YieldFactorModal'
import { findYieldFactor } from '@/lib/data/yield-factors'
import CostBreakdown from './CostBreakdown'
import NewIngredientModal, { type NewIngredientFormData } from './NewIngredientModal'

const PrintOptionsModal = dynamic(() => import('./PrintOptionsModal'), {
  ssr: false,
})

const SUB_INGREDIENT_UNITS = ['g', 'kg', 'ml', 'L', 'unit', 'portion']

const YIELD_UNIT_OPTIONS = [
  { value: 'g',       label: 'g' },
  { value: 'kg',      label: 'kg' },
  { value: 'ml',      label: 'ml' },
  { value: 'L',       label: 'L' },
  { value: 'unit',    label: 'unit' },
  { value: 'portion', label: 'portion' },
  { value: 'batch',   label: 'Batch' },
]

const INGREDIENT_ROW_UNITS = [
  { value: 'g',    label: 'g' },
  { value: 'kg',   label: 'kg' },
  { value: 'ml',   label: 'ml' },
  { value: 'L',    label: 'L' },
  { value: 'unit', label: 'unit' },
  { value: 'tsp',  label: 'tsp' },
  { value: 'tbsp', label: 'tbsp' },
]

function allergensToEntries(allergens: RecipeAllergenSummary): IngredientAllergen[] {
  return [
    ...allergens.contains.map((allergen) => ({
      allergenId: allergen.id,
      status: 'contains' as const,
    })),
    ...allergens.mayContain.map((allergen) => ({
      allergenId: allergen.id,
      status: 'may_contain' as const,
    })),
  ]
}

function createStep(text = ''): RecipeStepDraft {
  return { id: crypto.randomUUID(), text }
}

function createIngredientLine(partial?: Partial<RecipeIngredientDraft>): RecipeIngredientDraft {
  const line: RecipeIngredientDraft = {
    id: partial?.id ?? crypto.randomUUID(),
    ingredientId: partial?.ingredientId ?? null,
    subRecipeId: partial?.subRecipeId ?? null,
    ingredientName: partial?.ingredientName ?? '',
    quantity: partial?.quantity ?? 1,
    unit: partial?.unit ?? 'unit',
    currentPrice: partial?.currentPrice ?? null,
    priceUnit: partial?.priceUnit ?? null,
    notes: partial?.notes ?? null,
    allergens: partial?.allergens ?? [],
    yield_percent: partial?.yield_percent ?? 100,
    yield_override: partial?.yield_override ?? false,
    lineCost: 0,
  }
  line.lineCost = calculateLineCost(line)
  return line
}

function blankRecipe(): RecipeEditorData {
  return {
    name: '',
    description: '',
    category: 'Other',
    yieldQuantity: 1,
    yieldUnit: 'portion',
    prepTimeMinutes: 0,
    cookTimeMinutes: 0,
    laborCost: 0,
    laborMode: 'fixed',
    overheadCost: 0,
    overheadMode: 'fixed',
    overheadPercent: 0,
    wastePercent: 0,
    sellingPrice: 0,
    imageUrl: null,
    isSubIngredient: false,
    subIngredientUnit: 'g',
    instructions: [createStep()],
    ingredients: [],
  }
}

function mapRecipeToState(recipe: RecipeRecord): RecipeEditorData {
  return {
    name: recipe.name,
    description: recipe.description,
    category: recipe.category,
    yieldQuantity: recipe.yieldQuantity,
    yieldUnit: recipe.yieldUnit,
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    laborCost: recipe.laborCost,
    laborMode: recipe.laborMode ?? 'fixed',
    overheadCost: recipe.overheadCost,
    overheadMode: recipe.overheadMode ?? 'fixed',
    overheadPercent: recipe.overheadPercent ?? 0,
    wastePercent: recipe.wastePercent ?? 0,
    sellingPrice: recipe.sellingPrice,
    imageUrl: recipe.imageUrl,
    isSubIngredient: recipe.isSubIngredient ?? false,
    subIngredientUnit: recipe.subIngredientUnit ?? 'g',
    instructions: recipe.instructions.length > 0 ? recipe.instructions : [createStep()],
    ingredients: recipe.ingredients.length > 0
      ? recipe.ingredients.map((item) => createIngredientLine(item))
      : [],
  }
}

function toRecipeRecord(
  state: RecipeEditorData,
  id: string,
  tenantId = 'draft',
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString()
): RecipeRecord {
  const ingredients = state.ingredients.map((item) => ({
    ...item,
    lineCost: calculateLineCost(item),
  }))
  const cost = calculateRecipeCost(ingredients, state.laborCost, state.overheadCost, state.sellingPrice)
  return {
    id, tenantId, ...state, ingredients, cost, createdAt, updatedAt,
  }
}

// ── Draggable ingredient row ─────────────────────────────────────────────────

function IngredientRow({
  item,
  lineCost,
  onUpdate,
  onRemove,
}: {
  item: RecipeIngredientDraft
  lineCost: number
  onUpdate: (patch: Partial<RecipeIngredientDraft>) => void
  onRemove: () => void
}) {
  const controls = useDragControls()

  const yieldPct = item.yield_percent ?? 100
  const apQty = yieldPct > 0 && yieldPct < 100
    ? Math.ceil(item.quantity / (yieldPct / 100))
    : null

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="group"
    >
      <div className="grid grid-cols-[28px_1fr_72px_72px_auto_64px_28px] items-center gap-1.5 rounded-xl border border-slate-100 bg-white px-2 py-1.5 transition hover:border-slate-200 hover:shadow-sm">
        <div
          className="cursor-grab touch-none text-slate-300 transition hover:text-slate-500 active:cursor-grabbing"
          onPointerDown={(e) => controls.start(e)}
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {item.subRecipeId ? (
          <Link
            href={`/recipes/${item.subRecipeId}`}
            target="_blank"
            className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-600"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{item.ingredientName}</span>
          </Link>
        ) : (
          <span className="min-w-0 truncate text-sm text-slate-800">{item.ingredientName}</span>
        )}

        <input
          type="number"
          min="0"
          step="0.001"
          value={item.quantity}
          onChange={(e) => onUpdate({ quantity: parseFloat(e.target.value || '0') })}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
        />

        <CustomSelect
          value={item.unit}
          onChange={(v) => onUpdate({ unit: v })}
          options={INGREDIENT_ROW_UNITS}
          size="sm"
        />

        {/* Yield factor section */}
        <div className="flex items-center gap-1.5">
          {!item.subRecipeId && (
            <YieldFactorPopover item={item} onUpdate={onUpdate} />
          )}
          {apQty != null && (
            <span className="whitespace-nowrap text-xs text-slate-400">
              AP: {apQty}{item.unit}
            </span>
          )}
        </div>

        <span className="text-right text-sm font-medium tabular-nums text-slate-700">
          €{lineCost.toFixed(2)}
        </span>

        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
          aria-label="Remove ingredient"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </Reorder.Item>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function RecipeBuilder({ recipeId }: { recipeId: string }) {
  const router = useRouter()
  const isNew = recipeId === 'new'
  const { getRecipeWithIngredients, createRecipe, updateRecipe, deleteRecipe } = useRecipes({ autoLoad: false })

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [recipe, setRecipe] = useState<RecipeEditorData>(blankRecipe())
  const [loadedRecipe, setLoadedRecipe] = useState<RecipeRecord | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [recipeAllergens, setRecipeAllergens] = useState<RecipeAllergenSummary>({ contains: [], mayContain: [] })
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'clean' | 'dirty' | 'autosaving' | 'saved' | 'failed'>('clean')
  const [fetchingImage, setFetchingImage] = useState(false)
  const [categoryMode, setCategoryMode] = useState<'select' | 'custom'>('select')
  const [customCategoryInput, setCustomCategoryInput] = useState('')
  const [yieldModalOpen, setYieldModalOpen] = useState(false)
  const [newIngredientName, setNewIngredientName] = useState('')
  const [newIngredientModalOpen, setNewIngredientModalOpen] = useState(false)
  const [newIngredientSaving, setNewIngredientSaving] = useState(false)
  const [newIngredientError, setNewIngredientError] = useState<string | null>(null)
  const [laborHourlyRate, setLaborHourlyRate] = useState(0)
  const hasLoaded = useRef(false)
  const suppressNextDirtyRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recipeRef = useRef(recipe)
  const computedIngredientsRef = useRef<typeof computedIngredients>([])

  const storageKey = `zrecipe:recipe-draft:${recipeId}`

  // ── Load recipe ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isNew) {
      // AI prefill via sessionStorage takes priority
      const aiRaw = typeof window !== 'undefined' ? sessionStorage.getItem('prefill-recipe') : null
      if (aiRaw) {
        try {
          const parsed = JSON.parse(aiRaw) as Partial<RecipeEditorData>
          sessionStorage.removeItem('prefill-recipe')
          setRecipe({
            ...blankRecipe(),
            ...parsed,
            instructions: (parsed.instructions?.length ?? 0) > 0 ? parsed.instructions! : [createStep()],
            ingredients: parsed.ingredients?.map((item) => createIngredientLine(item)) ?? [],
          })
          if (parsed.imageUrl) setImagePreview(parsed.imageUrl)
        } catch {
          sessionStorage.removeItem('prefill-recipe')
        }
        hasLoaded.current = true
        setLoading(false)
        return
      }

      // Fall back to localStorage draft
      const rawDraft = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
      if (rawDraft) {
        try {
          const parsed = JSON.parse(rawDraft) as RecipeEditorData
          setRecipe({
            ...blankRecipe(),
            ...parsed,
            instructions: parsed.instructions?.length > 0 ? parsed.instructions : [createStep()],
            ingredients: parsed.ingredients?.map((item) => createIngredientLine(item)) ?? [],
          })
          setImagePreview(parsed.imageUrl)
        } catch {
          setRecipe(blankRecipe())
        }
      }
      hasLoaded.current = true
      setLoading(false)
      return
    }

    const loadRecipe = async () => {
      try {
        setLoading(true)
        setError(null)
        const existing = await getRecipeWithIngredients(recipeId)
        if (!existing) { setError('Recipe not found.'); return }
        const hydratedIngredients = await hydrateIngredientAllergens(existing.ingredients)
        const hydratedRecipe = {
          ...existing,
          ingredients: hydratedIngredients,
        } as RecipeRecord
        setLoadedRecipe(hydratedRecipe)
        setRecipe(mapRecipeToState(hydratedRecipe))
        setImagePreview(existing.imageUrl)
        setRecipeAllergens(
          computeRecipeAllergens(
            Object.fromEntries(
              hydratedIngredients.map((ing: RecipeIngredientDraft) => [ing.id, ing.allergens ?? []])
            )
          )
        )

        // Fetch allergens — suppress the dirty trigger from the setRecipe below
        const ingredientIds = hydratedIngredients
          .filter((i: RecipeIngredientDraft) => i.ingredientId)
          .map((i: RecipeIngredientDraft) => i.ingredientId as string)
        if (ingredientIds.length > 0) {
          try {
            const data = await fetch(`/api/ingredients/allergens?ids=${ingredientIds.join(',')}`)
              .then((r) => r.json() as Promise<Record<string, IngredientAllergen[]>>)
            setRecipe((c) => ({
              ...c,
              ingredients: c.ingredients.map((i) =>
                i.ingredientId && data[i.ingredientId]?.length
                  ? { ...i, allergens: data[i.ingredientId] }
                  : i
              ),
            }))
          } catch {
            // Allergens are optional; don't fail the recipe load
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load recipe')
      } finally {
        hasLoaded.current = true
        setLoading(false)
      }
    }

    loadRecipe()
  }, [getRecipeWithIngredients, isNew, recipeId, storageKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch tenant settings (labor rate, overhead defaults) ─────────────────

  useEffect(() => {
    resolveTenantId().then(async (tenantId) => {
      const supabase = createClient()
      const { data } = await supabase
        .from('tenants')
        .select('labor_hourly_rate, overhead_method, overhead_percent, waste_percent')
        .eq('id', tenantId)
        .maybeSingle()
      if (!data) return
      setLaborHourlyRate(Number(data.labor_hourly_rate ?? 0))
      // Pre-fill defaults for NEW recipes only
      if (isNew) {
        setRecipe((prev) => ({
          ...prev,
          laborMode: (data.labor_hourly_rate ?? 0) > 0 ? 'time' : 'fixed',
          overheadMode: data.overhead_method === 'percent' ? 'percent' : 'fixed',
          overheadPercent: Number(data.overhead_percent ?? 0),
          wastePercent: Number(data.waste_percent ?? 0),
        }))
      }
    }).catch(() => {})
  }, [isNew]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save draft to localStorage every 30 s ────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handle = setInterval(() => {
      localStorage.setItem(storageKey, JSON.stringify(recipe))
    }, 30_000)
    return () => clearInterval(handle)
  }, [recipe, storageKey])

  // ── Keep refs in sync ─────────────────────────────────────────────────────

  useEffect(() => { recipeRef.current = recipe }, [recipe])

  // ── Track dirty state after initial load ──────────────────────────────────

  useEffect(() => {
    if (!hasLoaded.current) return
    if (suppressNextDirtyRef.current) {
      suppressNextDirtyRef.current = false
      return
    }
    setSaveStatus('dirty')
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => void handleAutoSaveRef.current?.(), 3000)
  }, [recipe]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Warn before leaving with unsaved changes ──────────────────────────────

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'dirty' || saveStatus === 'failed') { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saveStatus])

  // ── Computed values ────────────────────────────────────────────────────────

  const computedIngredients = useMemo(
    () => recipe.ingredients.map((item) => ({ ...item, lineCost: calculateLineCost(item) })),
    [recipe.ingredients]
  )

  // Keep ref in sync so autosave always reads fresh computed ingredients
  useEffect(() => { computedIngredientsRef.current = computedIngredients }, [computedIngredients])

  // Recompute allergen summary whenever the ingredient list changes
  useEffect(() => {
    setRecipeAllergens(
      computeRecipeAllergens(
        Object.fromEntries(computedIngredients.map((ing) => [ing.id, ing.allergens ?? []]))
      )
    )
  }, [computedIngredients])

  // Stable ref to the latest autosave handler (avoids stale closure in setTimeout)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleAutoSaveRef = useRef<() => Promise<void>>(null as any)

  const cost = useMemo(
    () => calculateRecipeCost(
      computedIngredients,
      recipe.laborCost,
      recipe.overheadCost,
      recipe.sellingPrice,
      {
        laborMode: recipe.laborMode,
        prepTimeMinutes: recipe.prepTimeMinutes,
        laborHourlyRate,
        overheadMode: recipe.overheadMode,
        overheadPercent: recipe.overheadPercent,
        wastePercent: recipe.wastePercent,
        yieldQuantity: recipe.yieldQuantity,
        yieldUnit: recipe.yieldUnit,
      }
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [computedIngredients, recipe.laborCost, recipe.laborMode, recipe.overheadCost,
     recipe.overheadMode, recipe.overheadPercent, recipe.wastePercent,
     recipe.sellingPrice, recipe.prepTimeMinutes, recipe.yieldQuantity,
     recipe.yieldUnit, laborHourlyRate]
  )

  const currentRecipeRecord = useMemo(
    () => toRecipeRecord(
      { ...recipe, ingredients: computedIngredients },
      loadedRecipe?.id ?? recipeId,
      loadedRecipe?.tenantId ?? 'draft',
      loadedRecipe?.createdAt ?? new Date().toISOString(),
      new Date().toISOString()
    ),
    [computedIngredients, loadedRecipe, recipe, recipeId]
  )

  const hydrateIngredientAllergens = useCallback(
    async function hydrateIngredientAllergens(
      items: RecipeIngredientDraft[],
      visitedRecipeIds = new Set<string>()
    ): Promise<RecipeIngredientDraft[]> {
      const directIngredientIds = items
        .filter((item) => item.ingredientId)
        .map((item) => item.ingredientId as string)

      let directAllergenMap: Record<string, IngredientAllergen[]> = {}
      if (directIngredientIds.length > 0) {
        try {
          directAllergenMap = await fetch(`/api/ingredients/allergens?ids=${directIngredientIds.join(',')}`)
            .then((response) => response.json() as Promise<Record<string, IngredientAllergen[]>>)
        } catch {
          directAllergenMap = {}
        }
      }

      const hydrated: RecipeIngredientDraft[] = []

      for (const item of items) {
        if (item.ingredientId) {
          hydrated.push({
            ...item,
            allergens: directAllergenMap[item.ingredientId] ?? [],
          })
          continue
        }

        if (item.subRecipeId) {
          if (visitedRecipeIds.has(item.subRecipeId)) {
            hydrated.push({ ...item, allergens: [] })
            continue
          }

          const subRecipe = await getRecipeWithIngredients(item.subRecipeId)
          if (!subRecipe) {
            hydrated.push({ ...item, allergens: [] })
            continue
          }

          const nextVisited = new Set(visitedRecipeIds)
          nextVisited.add(item.subRecipeId)
          const hydratedSubIngredients = await hydrateIngredientAllergens(subRecipe.ingredients, nextVisited)
          const summary = computeRecipeAllergens(
            Object.fromEntries(hydratedSubIngredients.map((ing) => [ing.id, ing.allergens ?? []]))
          )

          hydrated.push({
            ...item,
            allergens: allergensToEntries(summary),
          })
          continue
        }

        hydrated.push({ ...item, allergens: [] })
      }

      return hydrated
    },
    [getRecipeWithIngredients]
  )

  // ── State updaters ─────────────────────────────────────────────────────────

  const updateRecipeField = <K extends keyof RecipeEditorData>(field: K, value: RecipeEditorData[K]) => {
    setRecipe((c) => ({ ...c, [field]: value }))
  }

  const updateIngredient = (id: string, patch: Partial<RecipeIngredientDraft>) => {
    setRecipe((c) => ({
      ...c,
      ingredients: c.ingredients.map((item) =>
        item.id === id ? createIngredientLine({ ...item, ...patch, lineCost: 0 }) : item
      ),
    }))
  }

  const updateStep = (id: string, text: string) => {
    setRecipe((c) => ({
      ...c,
      instructions: c.instructions.map((step) => step.id === id ? { ...step, text } : step),
    }))
  }

  const addIngredient = (ingredient: IngredientLookup, quantity: number, unit: string) => {
    const yf = findYieldFactor(ingredient.name)
    const yieldPercent = yf?.yieldPercent ?? 100
    const nextLine = createIngredientLine({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      quantity,
      unit,
      currentPrice: ingredient.currentPrice ?? null,
      priceUnit: ingredient.priceUnit ?? unit,
      allergens: [],
      yield_percent: yieldPercent,
      yield_override: false,
    })
    setRecipe((c) => ({ ...c, ingredients: [...c.ingredients, nextLine] }))
    if (yf && yieldPercent < 100) {
      toast.info(`Yield ${yieldPercent}% applied for ${ingredient.name} — ${yf.notes}`)
    }

    // Async: fetch allergens for the added ingredient so the panel updates in real time
    fetch(`/api/ingredients/allergens?id=${ingredient.id}`)
      .then((r) => r.json() as Promise<Record<string, IngredientAllergen[]>>)
      .then((data) => {
        const allergens = data[ingredient.id]
        if (allergens?.length) {
          setRecipe((c) => ({
            ...c,
            ingredients: c.ingredients.map((i) =>
              i.id === nextLine.id ? { ...i, allergens } : i
            ),
          }))
        }
      })
      .catch(() => {})
  }

  const addSubRecipe = (subRecipe: SubRecipeLookup, quantity: number, unit: string) => {
    const nextLine = createIngredientLine({
      ingredientId: null,
      subRecipeId: subRecipe.id,
      ingredientName: subRecipe.name,
      quantity,
      unit: unit || subRecipe.unit,
      currentPrice: subRecipe.costPerUnit ?? null,
      priceUnit: subRecipe.unit,
    })
    setRecipe((c) => ({ ...c, ingredients: [...c.ingredients, nextLine] }))

    void hydrateIngredientAllergens([nextLine]).then((hydrated) => {
      const hydratedLine = hydrated[0]
      if (!hydratedLine) return
      setRecipe((c) => ({
        ...c,
        ingredients: c.ingredients.map((item) => (item.id === hydratedLine.id ? hydratedLine : item)),
      }))
    })
  }

  const openCreateIngredientModal = (name: string) => {
    setNewIngredientName(name)
    setNewIngredientError(null)
    setNewIngredientModalOpen(true)
  }

  const closeCreateIngredientModal = () => {
    setNewIngredientModalOpen(false)
    setNewIngredientName('')
    setNewIngredientError(null)
  }

  const createIngredient = async (formData: NewIngredientFormData) => {
    try {
      setNewIngredientSaving(true)
      setNewIngredientError(null)
      const supabase = createClient()
      const tenantId = await resolveTenantId()
      const { data, error } = await supabase
        .from('ingredients')
        .insert({
          tenant_id: tenantId,
          name: formData.name,
          brand: formData.brand || null,
          category: formData.category || null,
          current_price: formData.pricePerUnit,
          price_unit: formData.unit,
          package_size: formData.packageSize || null,
          package_unit: formData.packageUnit || null,
        })
        .select('id, name, current_price, price_unit')
        .single()

      if (error || !data) throw error ?? new Error('Unable to create ingredient')

      const historyInsert = await supabase
        .from('ingredient_price_history')
        .insert({
          ingredient_id: data.id,
          tenant_id: tenantId,
          price: formData.pricePerUnit,
          unit: formData.unit,
          invoice_id: null,
          recorded_at: new Date().toISOString().slice(0, 10),
        })

      if (historyInsert.error) {
        await supabase.from('ingredients').delete().eq('id', data.id)
        throw historyInsert.error
      }

      addIngredient(
        {
          id: data.id,
          name: data.name,
          currentPrice: data.current_price ?? formData.pricePerUnit,
          priceUnit: data.price_unit ?? formData.unit,
        },
        formData.recipeQuantity,
        formData.recipeUnit
      )
      toast.success('Ingredient created and added to recipe')
      closeCreateIngredientModal()
    } catch (err) {
      console.error('[recipe builder] ingredient create failed:', err)
      setNewIngredientError('Failed to save ingredient. Please try again.')
    } finally {
      setNewIngredientSaving(false)
    }
  }

  const removeIngredient = (id: string) => {
    setRecipe((c) => ({ ...c, ingredients: c.ingredients.filter((item) => item.id !== id) }))
  }

  const addInstruction = () => {
    setRecipe((c) => ({ ...c, instructions: [...c.instructions, createStep()] }))
  }

  const removeInstruction = (id: string) => {
    setRecipe((c) => ({
      ...c,
      instructions: c.instructions.length > 1 ? c.instructions.filter((s) => s.id !== id) : c.instructions,
    }))
  }

  // ── Upload image via API route (service role) ──────────────────────────────

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('recipeId', isNew ? 'draft' : recipeId)
      const res = await fetch('/api/recipes/upload-image', { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'Upload failed')
      }
      const { url } = await res.json() as { url: string }
      setImagePreview(url)
      updateRecipeField('imageUrl', url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image upload failed')
    } finally {
      setUploadingImage(false)
    }
  }

  const { getRootProps, getInputProps, open: openFilePicker } = useDropzone({
    accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
    onDrop: async (files) => { if (files[0]) await uploadImage(files[0]) },
  })

  // ── Pexels image fetch for recipe ─────────────────────────────────────────

  const fetchRecipeImage = useCallback(async (savedRecipeId: string, recipeName: string) => {
    if (!recipeName.trim()) return
    setFetchingImage(true)
    try {
      const res = await fetch('/api/recipes/fetch-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeName, recipeId: savedRecipeId }),
      })
      if (!res.ok) return
      const { imageUrl } = await res.json() as { imageUrl: string | null }
      if (imageUrl) {
        setImagePreview(imageUrl)
        suppressNextDirtyRef.current = true
        setRecipe((c) => ({ ...c, imageUrl }))
        setLoadedRecipe((prev) => prev ? { ...prev, imageUrl } : prev)
      }
    } catch {
      // non-critical
    } finally {
      setFetchingImage(false)
    }
  }, [])

  // ── Save & Delete ──────────────────────────────────────────────────────────

  const doSave = useCallback(async (currentRecipe: RecipeEditorData, currentIngredients: typeof computedIngredients, silent = false) => {
    const payload: RecipeEditorData = {
      ...currentRecipe,
      ingredients: currentIngredients.map((item) => ({ ...item, lineCost: calculateLineCost(item) })),
    }

    const savedIsNew = !loadedRecipe
    const saved = savedIsNew ? await createRecipe(payload) : await updateRecipe(recipeId, payload)
    const hydratedIngredients = await hydrateIngredientAllergens(saved.ingredients)
    const hydratedRecipe = { ...saved, ingredients: hydratedIngredients } as RecipeRecord

    suppressNextDirtyRef.current = true
    setLoadedRecipe(hydratedRecipe)
    setRecipe(mapRecipeToState(hydratedRecipe))
    setImagePreview(saved.imageUrl)
    setRecipeAllergens(
      computeRecipeAllergens(
        Object.fromEntries(hydratedIngredients.map((ing: RecipeIngredientDraft) => [ing.id, ing.allergens ?? []]))
      )
    )
    localStorage.removeItem(storageKey)
    if (!silent) toast.success('Recipe saved')

    // Auto-fetch Pexels image for new recipe with no image
    if (savedIsNew && !saved.imageUrl && currentRecipe.name) {
      void fetchRecipeImage(saved.id, currentRecipe.name)
    }

    return saved
  }, [createRecipe, fetchRecipeImage, hydrateIngredientAllergens, loadedRecipe, recipeId, storageKey, updateRecipe])

  const handleSave = async () => {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
    try {
      setSaving(true)
      setError(null)
      const saved = await doSave(recipeRef.current, computedIngredientsRef.current, false)
      setSaveStatus('clean')
      if (isNew) router.replace(`/recipes/${saved.id}`)
    } catch (saveError) {
      const msg = saveError instanceof Error ? saveError.message : 'Unable to save recipe'
      setError(msg)
      toast.error(msg)
      setSaveStatus('failed')
    } finally {
      setSaving(false)
    }
  }

  const handleAutoSave = useCallback(async () => {
    autoSaveTimerRef.current = null
    setSaveStatus('autosaving')
    try {
      const saved = await doSave(recipeRef.current, computedIngredientsRef.current, true)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus((s) => s === 'saved' ? 'clean' : s), 2000)
      if (isNew) router.replace(`/recipes/${saved.id}`)
    } catch {
      setSaveStatus('failed')
    }
  }, [doSave, isNew, router])

  // Keep the ref pointing to the latest handleAutoSave
  handleAutoSaveRef.current = handleAutoSave

  const handleDelete = async () => {
    if (isNew) return
    try {
      setDeleteBusy(true)
      await deleteRecipe(recipeId)
      localStorage.removeItem(storageKey)
      toast.success('Recipe deleted')
      router.push('/recipes')
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Unable to delete recipe')
    } finally {
      setDeleteBusy(false)
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-14 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
        <div className="grid gap-6 lg:grid-cols-[55fr_45fr]">
          <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-12">

      {/* ── STICKY TOOLBAR ────────────────────────────────────────────────── */}
      <div className="sticky top-16 z-30 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          onClick={() => router.push('/recipes')}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="mx-2 h-5 w-px bg-slate-200" />

        <input
          value={recipe.name}
          onChange={(e) => updateRecipeField('name', e.target.value)}
          placeholder="Recipe name…"
          className="flex-1 min-w-0 bg-transparent text-base font-bold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
        />

        {saveStatus === 'dirty' && !saving && (
          <span className="hidden items-center gap-1 text-xs text-amber-600 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Unsaved
          </span>
        )}
        {saveStatus === 'autosaving' && (
          <span className="hidden items-center gap-1 text-xs text-slate-400 sm:flex">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving…
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="hidden items-center gap-1 text-xs text-emerald-600 sm:flex">
            <Check className="h-3 w-3" />
            Saved ✓
          </span>
        )}
        {saveStatus === 'failed' && !saving && (
          <span className="hidden items-center gap-1 text-xs text-red-500 sm:flex">
            Save failed — retry
          </span>
        )}

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>

          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print</span>
          </button>

          {!isNew && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteBusy}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── SECTION 1: Photo + Details ────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[224px_1fr]">

        {/* Photo upload */}
        {(() => {
          const imageSource = imagePreview?.includes('pexels.com') ? 'pexels' : imagePreview ? 'user' : null
          return (
            <div
              {...getRootProps()}
              onDragEnter={() => setIsDragging(true)}
              onDragLeave={() => setIsDragging(false)}
              onDropCapture={() => setIsDragging(false)}
              className={cn(
                'relative flex h-56 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition lg:h-full lg:min-h-[220px]',
                isDragging ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/40'
              )}
            >
              <input {...getInputProps()} />
              {imagePreview ? (
                <>
                  <Image src={imagePreview} alt={recipe.name || 'Recipe'} fill unoptimized className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />
                  {imageSource === 'pexels' && (
                    <span className="absolute top-2 left-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/80">
                      Stock photo
                    </span>
                  )}
                  <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="rounded-full bg-white/90 px-4 py-1.5 text-xs font-semibold text-slate-700 shadow transition hover:bg-white"
                    >
                      {uploadingImage ? 'Uploading…' : 'Change photo'}
                    </button>
                    {imageSource === 'pexels' && !isNew && (
                      <button
                        type="button"
                        title="Fetch new stock photo"
                        onClick={() => void fetchRecipeImage(recipeId, recipe.name)}
                        disabled={fetchingImage}
                        className="rounded-full bg-white/80 p-1.5 shadow transition hover:bg-white disabled:opacity-50"
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5 text-slate-600', fetchingImage && 'animate-spin')} />
                      </button>
                    )}
                  </div>
                </>
              ) : fetchingImage ? (
                <div className="flex flex-col items-center gap-3 px-4 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                  <p className="text-xs text-slate-500">Fetching photo…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 px-4 text-center">
                  {uploadingImage ? (
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                  ) : (
                    <UploadCloud className="h-8 w-8 text-slate-400" />
                  )}
                  <p className="text-xs text-slate-500">Drop an image here or</p>
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                  >
                    {uploadingImage ? 'Uploading…' : 'Choose photo'}
                  </button>
                </div>
              )}
            </div>
          )
        })()}

        {/* Details form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="block">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
                {recipe.category && !RECIPE_CATEGORIES.includes(recipe.category) && categoryMode === 'select' && (
                  <button
                    type="button"
                    title="Edit custom category"
                    onClick={() => { setCustomCategoryInput(recipe.category); setCategoryMode('custom') }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>

              {categoryMode === 'select' ? (
                <CustomSelect
                  value={recipe.category && !RECIPE_CATEGORIES.includes(recipe.category) ? recipe.category : recipe.category}
                  onChange={(v) => {
                    if (v === '__create__') {
                      setCategoryMode('custom')
                      setCustomCategoryInput('')
                    } else {
                      updateRecipeField('category', v)
                    }
                  }}
                  options={[
                    ...RECIPE_CATEGORIES.map((c) => ({ value: c, label: c })),
                    ...(recipe.category && !RECIPE_CATEGORIES.includes(recipe.category)
                      ? [{ value: recipe.category, label: recipe.category }]
                      : []),
                    { value: '', label: '', separator: true },
                    { value: '__create__', label: '+ Create category…' },
                  ]}
                />
              ) : (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={customCategoryInput}
                    onChange={(e) => setCustomCategoryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const trimmed = customCategoryInput.trim()
                        if (trimmed) { updateRecipeField('category', trimmed); setCategoryMode('select'); setCustomCategoryInput('') }
                      }
                      if (e.key === 'Escape') { setCategoryMode('select'); setCustomCategoryInput('') }
                    }}
                    placeholder="Category name…"
                    className="min-w-0 flex-1 rounded-xl border border-emerald-400 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400/20"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = customCategoryInput.trim()
                      if (trimmed) { updateRecipeField('category', trimmed); setCategoryMode('select'); setCustomCategoryInput('') }
                    }}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCategoryMode('select'); setCustomCategoryInput('') }}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-[1fr_100px] gap-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Yield qty</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={recipe.yieldQuantity}
                  onChange={(e) => updateRecipeField('yieldQuantity', parseFloat(e.target.value || '0'))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unit</span>
                <CustomSelect
                  value={recipe.yieldUnit}
                  onChange={(v) => updateRecipeField('yieldUnit', v)}
                  options={YIELD_UNIT_OPTIONS}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Prep time (min)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={recipe.prepTimeMinutes}
                onChange={(e) => updateRecipeField('prepTimeMinutes', parseInt(e.target.value || '0', 10))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Cook time (min)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={recipe.cookTimeMinutes}
                onChange={(e) => updateRecipeField('cookTimeMinutes', parseInt(e.target.value || '0', 10))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Description</span>
              <textarea
                value={recipe.description}
                onChange={(e) => updateRecipeField('description', e.target.value)}
                rows={2}
                placeholder="Brief recipe description…"
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
              />
            </label>

          </div>

          {/* Sub-ingredient toggle */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={recipe.isSubIngredient}
                onChange={(e) => updateRecipeField('isSubIngredient', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 outline-none focus:ring-emerald-500"
              />
              <span className="text-sm font-medium text-slate-700">Available as sub-ingredient</span>
              <span className="text-xs text-slate-400">(usable inside other recipes)</span>
            </label>

            {recipe.isSubIngredient && (
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600">Base unit:</span>
                  <CustomSelect
                    value={recipe.subIngredientUnit}
                    onChange={(v) => updateRecipeField('subIngredientUnit', v)}
                    options={SUB_INGREDIENT_UNITS.map((u) => ({ value: u, label: u }))}
                    size="sm"
                  />
                </label>

                {cost.totalCost > 0 && recipe.yieldQuantity > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5">
                    <ChefHat className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-700">
                      Cost: €{(cost.totalCost / recipe.yieldQuantity).toFixed(4)} / {recipe.yieldUnit}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Ingredients + Cost Breakdown ───────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[55fr_45fr]">

        {/* Ingredients panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Ingredients</h3>
            {computedIngredients.length > 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                {computedIngredients.length}
              </span>
            )}
            <button
              type="button"
              onClick={() => setYieldModalOpen(true)}
              title="Yield factor reference table"
              className="ml-auto rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
            >
              YF ref
            </button>
          </div>

          <IngredientSearch
            onAddIngredient={addIngredient}
            onCreateIngredient={openCreateIngredientModal}
            onAddSubRecipe={addSubRecipe}
          />

          {computedIngredients.length > 0 && (
            <div className="mt-4">
              {/* Table header */}
              <div className="mb-1 grid grid-cols-[28px_1fr_72px_72px_auto_64px_28px] items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                <div />
                <div>Ingredient</div>
                <div className="text-right">EP Qty</div>
                <div>Unit</div>
                <div>YF</div>
                <div className="text-right">Cost</div>
                <div />
              </div>

              <Reorder.Group
                axis="y"
                values={recipe.ingredients}
                onReorder={(ings) => updateRecipeField('ingredients', ings)}
                className="space-y-1"
              >
                {recipe.ingredients.map((item, idx) => (
                  <IngredientRow
                    key={item.id}
                    item={item}
                    lineCost={computedIngredients[idx]?.lineCost ?? 0}
                    onUpdate={(patch) => updateIngredient(item.id, patch)}
                    onRemove={() => removeIngredient(item.id)}
                  />
                ))}
              </Reorder.Group>

              <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Total ingredient cost</span>
                  <span className="font-semibold text-slate-900">€{cost.ingredientCost.toFixed(2)}</span>
                </div>

                {(() => {
                  const gramUnits = new Set(['g', 'kg'])
                  const epG = computedIngredients.reduce((sum, ing) => {
                    if (!gramUnits.has(ing.unit)) return sum
                    const grams = ing.unit === 'kg' ? ing.quantity * 1000 : ing.quantity
                    return sum + grams
                  }, 0)
                  const apG = computedIngredients.reduce((sum, ing) => {
                    if (!gramUnits.has(ing.unit)) return sum
                    const grams = ing.unit === 'kg' ? ing.quantity * 1000 : ing.quantity
                    const yf = Math.max(0.01, (ing.yield_percent ?? 100) / 100)
                    return sum + grams / yf
                  }, 0)
                  if (epG === 0) return null
                  return (
                    <div className="mt-2 space-y-0.5 text-xs text-slate-400">
                      <div className="flex items-center justify-between">
                        <span>Recipe weight (EP)</span>
                        <span>{epG >= 1000 ? `${(epG / 1000).toFixed(2)}kg` : `${Math.round(epG)}g`}</span>
                      </div>
                      {apG > epG + 0.5 && (
                        <div className="flex items-center justify-between">
                          <span>As purchased (AP)</span>
                          <span>{apG >= 1000 ? `${(apG / 1000).toFixed(2)}kg` : `${Math.round(apG)}g`}</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Allergens */}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Allergens</span>
                  <span className="text-xs text-slate-400">EU Reg. 1169/2011 — auto-calculated</span>
                </div>

                {recipeAllergens.contains.length === 0 && recipeAllergens.mayContain.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-600">
                    <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>No allergens detected. Tag ingredients on their detail pages.</span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {recipeAllergens.contains.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 w-16 flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-red-500">Contains</span>
                        <div className="flex flex-wrap gap-1">
                          {recipeAllergens.contains.map((a) => (
                            <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                              {a.icon} {a.shortName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {recipeAllergens.mayContain.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 w-16 flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-amber-500">May contain</span>
                        <div className="flex flex-wrap gap-1">
                          {recipeAllergens.mayContain.map((a) => (
                            <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
                              {a.icon} {a.shortName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Cost breakdown — sticky */}
        <div className="lg:sticky lg:top-32 h-fit">
          <CostBreakdown
            cost={cost}
            yieldQuantity={recipe.yieldQuantity}
            yieldUnit={recipe.yieldUnit}
            prepTimeMinutes={recipe.prepTimeMinutes}
            laborHourlyRate={laborHourlyRate}
            laborMode={recipe.laborMode}
            overheadMode={recipe.overheadMode}
            overheadPercent={recipe.overheadPercent}
            wastePercent={recipe.wastePercent}
            onLaborModeChange={(v) => updateRecipeField('laborMode', v)}
            onLaborCostChange={(v) => updateRecipeField('laborCost', v)}
            onOverheadModeChange={(v) => updateRecipeField('overheadMode', v)}
            onOverheadCostChange={(v) => updateRecipeField('overheadCost', v)}
            onOverheadPercentChange={(v) => updateRecipeField('overheadPercent', v)}
            onWastePercentChange={(v) => updateRecipeField('wastePercent', v)}
            onSellingPriceChange={(v) => updateRecipeField('sellingPrice', v)}
          />
        </div>
      </div>

      {/* ── SECTION 3: Instructions ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Instructions</h3>
            <p className="mt-0.5 text-xs text-slate-500">Drag to reorder steps.</p>
          </div>
          <button
            type="button"
            onClick={addInstruction}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Add step
          </button>
        </div>

        <Reorder.Group
          axis="y"
          values={recipe.instructions}
          onReorder={(steps) => updateRecipeField('instructions', steps)}
          className="space-y-3"
        >
          {recipe.instructions.map((step, index) => (
            <InstructionRow
              key={step.id}
              step={step}
              index={index}
              onUpdate={(text) => updateStep(step.id, text)}
              onRemove={() => removeInstruction(step.id)}
            />
          ))}
        </Reorder.Group>
      </div>

      <YieldFactorModal open={yieldModalOpen} onClose={() => setYieldModalOpen(false)} />

      <NewIngredientModal
        open={newIngredientModalOpen}
        initialName={newIngredientName}
        saving={newIngredientSaving}
        error={newIngredientError}
        onClose={closeCreateIngredientModal}
        onSave={createIngredient}
      />

      <PrintOptionsModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        recipe={currentRecipeRecord}
        allergens={recipeAllergens}
      />
    </div>
  )
}

// ── Instruction row ──────────────────────────────────────────────────────────

function InstructionRow({
  step,
  index,
  onUpdate,
  onRemove,
}: {
  step: RecipeStepDraft
  index: number
  onUpdate: (text: string) => void
  onRemove: () => void
}) {
  const controls = useDragControls()

  return (
    <Reorder.Item
      value={step}
      dragListener={false}
      dragControls={controls}
      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-2.5 cursor-grab touch-none text-slate-300 transition hover:text-slate-500 active:cursor-grabbing"
          onPointerDown={(e) => controls.start(e)}
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
              {index + 1}
            </span>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-red-500"
              aria-label="Delete step"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={step.text}
            onChange={(e) => onUpdate(e.target.value)}
            rows={2}
            placeholder="Describe this step…"
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
          />
        </div>
      </div>
    </Reorder.Item>
  )
}
