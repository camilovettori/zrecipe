'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import Link from 'next/link'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { Reorder, useDragControls } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  ChefHat,
  Check,
  CheckCircle,
  Copy,
  FileText,
  GripVertical,
  ImageIcon,
  Link2,
  Loader2,
  Info,
  Lock,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  StickyNote,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import dynamic from 'next/dynamic'
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
import { resolveTenantContext, resolveTenantId } from '@/hooks/useTenant'
import { useSubscription } from '@/hooks/useSubscription'
import { computeRecipeAllergens, type RecipeAllergenSummary, type IngredientAllergen } from '@/lib/allergens'
import KitchenCardOptionsModal from '@/components/recipes/KitchenCardOptionsModal'
import type { KitchenCardData } from '@/lib/print/kitchenCard'
import IngredientSearch, { type SubRecipeLookup } from './IngredientSearch'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { YieldFactorPopover } from './YieldFactorPopover'
import { YieldFactorModal } from './YieldFactorModal'
import { findYieldFactor } from '@/lib/data/yield-factors'
import { compressImage } from '@/lib/utils/image-compress'
import { isConvertible } from '@/lib/utils/unit-converter'
import CostBreakdown from './CostBreakdown'
import LaborConfigModal from './LaborConfigModal'
import NewIngredientModal, { type NewIngredientFormData } from './NewIngredientModal'
import { IngredientNoteModal } from './IngredientNoteModal'
import { SubstituteIngredientModal, type SubstituteReplacement } from './SubstituteIngredientModal'
import AiImportRecipeModal, { type ImportedRecipePayload } from './AiImportRecipeModal'

const PhotoCropModal = dynamic(() => import('./PhotoCropModal'), { ssr: false })

const INGREDIENT_ROW_UNITS = [
  { value: 'g',    label: 'g' },
  { value: 'kg',   label: 'kg' },
  { value: 'ml',   label: 'ml' },
  { value: 'L',    label: 'L' },
  { value: 'unit', label: 'unit' },
  { value: 'tsp',  label: 'tsp' },
  { value: 'tbsp', label: 'tbsp' },
  { value: 'cup',  label: 'cup' },
  { value: 'dozen', label: 'dozen' },
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
    ingredientBrand: partial?.ingredientBrand ?? null,
    quantity: partial?.quantity ?? 1,
    unit: partial?.unit ?? 'unit',
    currentPrice: partial?.currentPrice ?? null,
    priceUnit: partial?.priceUnit ?? null,
    notes: partial?.notes ?? null,
    allergens: partial?.allergens ?? [],
    yield_percent: partial?.yield_percent ?? 100,
    yield_override: partial?.yield_override ?? false,
    ep_weight_manual: partial?.ep_weight_manual ?? null,
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
    laborEnabled: false,
    laborCost: 0,
    laborMode: 'fixed',
    laborJobTitle: null,
    laborHourlyRate: null,
    overheadEnabled: false,
    overheadCost: 0,
    overheadMode: 'fixed',
    overheadPercent: 0,
    wastePercent: 0,
    sellingPrice: 0,
    imageUrl: null,
    imageUrls: [],
    isSubIngredient: false,
    subIngredientUnit: 'g',
    storageInstructions: null,
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
    laborEnabled: recipe.laborEnabled ?? false,
    laborCost: recipe.laborCost,
    laborMode: recipe.laborMode ?? 'fixed',
    laborJobTitle: recipe.laborJobTitle ?? null,
    laborHourlyRate: recipe.laborHourlyRate ?? null,
    overheadEnabled: recipe.overheadEnabled ?? false,
    overheadCost: recipe.overheadCost,
    overheadMode: recipe.overheadMode ?? 'fixed',
    overheadPercent: recipe.overheadPercent ?? 0,
    wastePercent: recipe.wastePercent ?? 0,
    sellingPrice: recipe.sellingPrice,
    imageUrl: recipe.imageUrl,
    imageUrls: recipe.imageUrls ?? (recipe.imageUrl ? [recipe.imageUrl] : []),
    isSubIngredient: recipe.isSubIngredient ?? false,
    subIngredientUnit: recipe.subIngredientUnit ?? 'g',
    storageInstructions: recipe.storageInstructions ?? null,
    instructions: recipe.instructions.length > 0 ? recipe.instructions : [createStep()],
    ingredients: recipe.ingredients.length > 0
      ? recipe.ingredients.map((item) => createIngredientLine(item))
      : [],
  }
}

type DuplicateRecipeSnapshot = Omit<RecipeEditorData, 'ingredients' | 'instructions'> & {
  ingredients: Partial<RecipeIngredientDraft>[]
  instructions: Array<Pick<RecipeStepDraft, 'text'>>
}

function FieldHint({ text }: { text: string }) {
  const [show, setShow] = useState(false)

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="ml-1 inline-flex items-center text-slate-300 transition hover:text-slate-500 focus:outline-none"
        aria-label={text}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {show && (
        <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-600 shadow-lg">
          {text}
        </span>
      )}
    </span>
  )
}

// ── Draggable ingredient row ─────────────────────────────────────────────────

function IngredientRow({
  item,
  lineCost,
  hasMismatch,
  batchMultiplier,
  onUpdate,
  onRemove,
  onNoteClick,
  onSubstituteClick,
}: {
  item: RecipeIngredientDraft
  lineCost: number
  hasMismatch: boolean
  batchMultiplier: number
  onUpdate: (patch: Partial<RecipeIngredientDraft>) => void
  onRemove: () => void
  onNoteClick: () => void
  onSubstituteClick: () => void
}) {
  const controls = useDragControls()
  const [epWeightDraft, setEpWeightDraft] = useState<string | null>(null)
  const hasNote = !!item.notes && item.notes !== item.ingredientName
  const notePreview = hasNote
    ? (item.notes!.length > 60 ? item.notes!.substring(0, 60) + '…' : item.notes!)
    : ''

  const yieldPct = item.yield_percent ?? 100
  const apQty = yieldPct > 0 && yieldPct < 100
    ? Math.ceil(item.quantity / (yieldPct / 100))
    : null

  const apWeight = (() => {
    if (item.unit === 'g')  return item.quantity
    if (item.unit === 'kg') return item.quantity * 1000
    if (item.unit === 'ml') return item.quantity
    if (item.unit === 'L')  return item.quantity * 1000
    return null
  })()

  const epWeight = (() => {
    if (apWeight == null) return null
    if (['g', 'kg'].includes(item.unit)) return { value: apWeight * (yieldPct / 100), unitLabel: 'g' }
    if (['ml', 'L'].includes(item.unit)) return { value: apWeight * (yieldPct / 100), unitLabel: 'ml' }
    return null
  })()

  const handleEpWeightChange = (newEpG: number) => {
    if (apWeight == null || apWeight <= 0) return
    const newYieldPct = Math.round(Math.min(100, Math.max(1, (newEpG / apWeight) * 100)) * 100) / 100
    onUpdate({ yield_percent: newYieldPct, yield_override: true })
  }

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="group"
    >
      <div className="rounded-xl border border-slate-100 bg-white transition hover:border-slate-200 hover:shadow-sm">
        <div className="grid grid-cols-[28px_1fr_36px_70px_70px_60px_80px_65px_28px] items-center gap-1.5 px-2 py-1.5">
          <div
            className="cursor-grab touch-none text-slate-300 transition hover:text-slate-500 active:cursor-grabbing"
            onPointerDown={(e) => controls.start(e)}
          >
            <GripVertical className="h-4 w-4" />
          </div>

          {item.subRecipeId ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <Link
                href={`/recipes/${item.subRecipeId}`}
                target="_blank"
                className="shrink-0 text-emerald-600 hover:text-emerald-500"
                onClick={(e) => e.stopPropagation()}
              >
                <Link2 className="h-3.5 w-3.5" />
              </Link>
              <Link
                href={`/recipes/${item.subRecipeId}`}
                target="_blank"
                title="View sub-recipe"
                className="min-w-0 whitespace-normal break-words text-left text-sm font-medium leading-tight text-emerald-700 transition hover:text-emerald-500 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {item.ingredientName}
              </Link>
              <button
                type="button"
                onClick={onSubstituteClick}
                title="Substitute"
                className="shrink-0 rounded-full p-1 text-slate-300 transition hover:bg-emerald-50 hover:text-emerald-600"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : item.ingredientId ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Link
                href={`/ingredients/${item.ingredientId}`}
                target="_blank"
                title="View ingredient details"
                className="min-w-0 whitespace-normal break-words text-left text-sm leading-tight text-slate-800 transition hover:text-emerald-600 hover:underline"
              >
                <span className="block">{item.ingredientName}</span>
                {item.ingredientBrand && (
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{item.ingredientBrand}</span>
                )}
              </Link>
              {item.currentPrice == null && (
                <Link
                  href={`/ingredients/${item.ingredientId}`}
                  target="_blank"
                  title="Add a price to calculate this line cost"
                  className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  New - add price
                </Link>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onSubstituteClick}
              title="This ingredient is no longer linked. Click to match a replacement."
              className="flex min-w-0 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-left transition hover:border-amber-300 hover:bg-amber-100"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span className="min-w-0">
                <span className="block whitespace-normal break-words text-sm leading-tight text-slate-800">
                  {item.ingredientName}
                </span>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Unlinked - fix match
                </span>
              </span>
            </button>
          )}

          {/* Note */}
          {hasNote ? (
            <button
              type="button"
              title={notePreview}
              onClick={onNoteClick}
              className="flex items-center justify-center rounded-full p-1 text-emerald-600 transition hover:bg-emerald-50"
            >
              <StickyNote className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              title="Add note"
              onClick={onNoteClick}
              className="flex items-center justify-center rounded-full p-1 text-slate-300 transition hover:bg-slate-50 hover:text-slate-500"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}

          {/* EP Qty — always editable (base value); scaled quantity is visible in NET WT column */}
          <input
            type="number"
            min="0"
            step="0.001"
            value={item.quantity || ''}
            onChange={(e) => {
              const v = e.target.value === '' ? 0 : parseFloat(e.target.value)
              if (!isNaN(v)) onUpdate({ quantity: v })
            }}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
          />

          {/* Unit */}
          <CustomSelect
            value={item.unit}
            onChange={(v) => onUpdate({ unit: v })}
            options={INGREDIENT_ROW_UNITS}
            size="sm"
          />

          {/* YF — fixed width, no inline AP text */}
          <div className="flex justify-center">
            {!item.subRecipeId ? (
              <YieldFactorPopover item={item} onUpdate={onUpdate} />
            ) : (
              <span className="text-xs text-slate-300">—</span>
            )}
          </div>

          {/* EP WT */}
          {batchMultiplier > 1 ? (
            <span className="text-right text-sm tabular-nums text-slate-600">
              {epWeight
                ? `${Math.round(epWeight.value * batchMultiplier)}${epWeight.unitLabel}`
                : (item.ep_weight_manual ? `${Math.round(item.ep_weight_manual * batchMultiplier)}g` : '—')}
            </span>
          ) : (
            <input
              type="number"
              min="0"
              step="1"
              value={epWeight
                ? (epWeightDraft ?? (Math.round(epWeight.value) || ''))
                : (item.ep_weight_manual || '')}
              onChange={(e) => {
                if (epWeight) {
                  setEpWeightDraft(e.target.value)
                } else {
                  const num = e.target.value === '' ? 0 : parseFloat(e.target.value)
                  onUpdate({ ep_weight_manual: isNaN(num) ? 0 : num })
                }
              }}
              onBlur={(e) => {
                if (epWeight) {
                  const v = parseFloat(e.target.value || '0')
                  if (!isNaN(v) && v >= 0) handleEpWeightChange(v)
                  setEpWeightDraft(null)
                }
              }}
              onKeyDown={(e) => {
                if (epWeight) {
                  if (e.key === 'Enter') {
                    const v = parseFloat(e.currentTarget.value || '0')
                    if (!isNaN(v) && v >= 0) handleEpWeightChange(v)
                    setEpWeightDraft(null)
                  }
                  if (e.key === 'Escape') setEpWeightDraft(null)
                }
              }}
              placeholder={epWeight ? '' : 'g'}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
            />
          )}

          {/* Cost */}
          <span className="flex items-center justify-end gap-1 text-right text-sm font-medium tabular-nums text-slate-700">
            {hasMismatch && (
              <span
                title={`Unit mismatch: recipe uses ${item.unit} but price is per ${item.priceUnit ?? item.unit} — cost excluded`}
                className="shrink-0 text-amber-500"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            )}
            €{(lineCost * batchMultiplier).toFixed(2)}
          </span>

          {/* Delete */}
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
            aria-label="Remove ingredient"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* AP sub-row — only when yield factor is applied */}
        {apQty != null && (
          <div className="grid grid-cols-[28px_1fr_36px_70px_70px_60px_80px_65px_28px] gap-1.5 px-2 pb-1">
            <div className="col-start-7 text-center text-[10px] text-slate-400">
              AP: {apQty}{item.unit}
            </div>
          </div>
        )}
      </div>
    </Reorder.Item>
  )
}

type LabelData = {
  productName: string
  businessName: string
  category: string
  batchId: string
  yieldQty: number | string
  productionDate: string
  expiryDate: string
  ingredients: string
  storageInstructions: string
  weight: string
}

// ── Main component ───────────────────────────────────────────────────────────

export default function RecipeBuilder({ recipeId }: { recipeId: string }) {
  const router = useRouter()
  const isNew = recipeId === 'new'
  const { getRecipeWithIngredients, createRecipe, updateRecipe, deleteRecipe } = useRecipes({ autoLoad: false })
  const { hasFullAccess } = useSubscription()

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [recipe, setRecipe] = useState<RecipeEditorData>(blankRecipe())
  const [loadedRecipe, setLoadedRecipe] = useState<RecipeRecord | null>(null)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [showKitchenCardModal, setShowKitchenCardModal] = useState(false)
  const [showLabelEditor, setShowLabelEditor] = useState(false)
  const [recipeAllergens, setRecipeAllergens] = useState<RecipeAllergenSummary>({ contains: [], mayContain: [] })
  const [uploadingImage, setUploadingImage] = useState(false)
  const [cropModalFile, setCropModalFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'clean' | 'dirty' | 'autosaving' | 'saved' | 'failed'>('clean')
  const [fetchingImage, setFetchingImage] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [categoryMode, setCategoryMode] = useState<'select' | 'custom'>('select')
  const [customCategoryInput, setCustomCategoryInput] = useState('')
  const [aiImportOpen, setAiImportOpen] = useState(false)
  const [yieldModalOpen, setYieldModalOpen] = useState(false)
  const [yieldFactorsEnabled, setYieldFactorsEnabled] = useState(false)
  const [laborConfigModalOpen, setLaborConfigModalOpen] = useState(false)
  const [showYfTooltip, setShowYfTooltip] = useState(false)
  const [newIngredientName, setNewIngredientName] = useState('')
  const [newIngredientModalOpen, setNewIngredientModalOpen] = useState(false)
  const [newIngredientSaving, setNewIngredientSaving] = useState(false)
  const [newIngredientError, setNewIngredientError] = useState<string | null>(null)
  const [noteModalIngredientId, setNoteModalIngredientId] = useState<string | null>(null)
  const [substituteIngredientId, setSubstituteIngredientId] = useState<string | null>(null)
  const [assetOrigin, setAssetOrigin] = useState('')

  useEffect(() => { setAssetOrigin(window.location.origin) }, [])

  // Batch multiplier — session-only, never saved to DB
  const [batchEnabled, setBatchEnabled] = useState(false)
  const [batchQty, setBatchQty] = useState(2)
  const effectiveN = batchEnabled && batchQty > 1 ? Math.max(2, batchQty) : 1

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const hasLoaded = useRef(false)
  const suppressNextDirtyRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aiImportActiveRef = useRef(false)
  const aiImportSessionRef = useRef(0)
  const persistedRecipeIdRef = useRef<string | null>(isNew ? null : recipeId)
  const recipeRef = useRef(recipe)
  const computedIngredientsRef = useRef<typeof computedIngredients>([])

  const storageKey = `zrecipe:recipe-draft:${recipeId}`

  useEffect(() => {
    if (!isNew) persistedRecipeIdRef.current = recipeId
  }, [isNew, recipeId])

  // ── Load recipe ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isNew) {
      // A deliberate duplicate takes priority over AI prefill and stale local drafts.
      const duplicateRaw = typeof window !== 'undefined'
        ? sessionStorage.getItem('zrecipe-duplicate-source')
        : null
      if (duplicateRaw) {
        sessionStorage.removeItem('zrecipe-duplicate-source')
        try {
          const parsed = JSON.parse(duplicateRaw) as DuplicateRecipeSnapshot
          const duplicatedIngredients = parsed.ingredients?.map((item) =>
            createIngredientLine({ ...item, id: undefined })
          ) ?? []
          setRecipe({
            ...blankRecipe(),
            ...parsed,
            instructions: parsed.instructions?.length
              ? parsed.instructions.map((step) => createStep(step.text))
              : [createStep()],
            ingredients: duplicatedIngredients,
          })
          setYieldFactorsEnabled(duplicatedIngredients.some(
            (item) => (item.yield_percent ?? 100) < 100 && !item.yield_override
          ))
          hasLoaded.current = true
          setLoading(false)
          return
        } catch {
          // Invalid duplicate data should not block opening a clean new recipe.
        }
      }

      // AI prefill via sessionStorage takes priority
      const aiRaw = typeof window !== 'undefined' ? sessionStorage.getItem('prefill-recipe') : null
      if (aiRaw) {
        try {
          const parsed = JSON.parse(aiRaw) as Partial<RecipeEditorData>
          sessionStorage.removeItem('prefill-recipe')
          const aiImageUrls = (parsed as { imageUrls?: string[] }).imageUrls?.length
            ? (parsed as { imageUrls?: string[] }).imageUrls!
            : parsed.imageUrl ? [parsed.imageUrl] : []
          setRecipe({
            ...blankRecipe(),
            ...parsed,
            imageUrls: aiImageUrls,
            instructions: (parsed.instructions?.length ?? 0) > 0 ? parsed.instructions! : [createStep()],
            ingredients: parsed.ingredients?.map((item) => createIngredientLine({
              ...item,
              yield_percent: 100,
              yield_override: false,
            })) ?? [],
          })
          setYieldFactorsEnabled(false)
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
          const draftImageUrls = (parsed as { imageUrls?: string[] }).imageUrls?.length
            ? (parsed as { imageUrls?: string[] }).imageUrls!
            : parsed.imageUrl ? [parsed.imageUrl] : []
          setRecipe({
            ...blankRecipe(),
            ...parsed,
            imageUrls: draftImageUrls,
            instructions: parsed.instructions?.length > 0 ? parsed.instructions : [createStep()],
            ingredients: parsed.ingredients?.map((item) => createIngredientLine(item)) ?? [],
          })
          setYieldFactorsEnabled(parsed.ingredients?.some(
            (item) => (item.yield_percent ?? 100) < 100 && !item.yield_override
          ) ?? false)
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
        setYieldFactorsEnabled(hydratedIngredients.some(
          (item) => (item.yield_percent ?? 100) < 100 && !item.yield_override
        ))
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
      if (aiImportActiveRef.current) return
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
    if (aiImportActiveRef.current) {
      autoSaveTimerRef.current = null
      return
    }
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
    () => recipe.ingredients.map((item) => ({
      ...item,
      lineCost: calculateLineCost(item),
      hasMismatch: !!item.currentPrice && !isConvertible(item.unit, item.priceUnit ?? item.unit),
    })),
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
        laborEnabled: recipe.laborEnabled,
        laborMode: recipe.laborMode,
        prepTimeMinutes: recipe.prepTimeMinutes,
        laborHourlyRate: recipe.laborHourlyRate ?? 0,
        overheadEnabled: recipe.overheadEnabled,
        overheadMode: recipe.overheadMode,
        overheadPercent: recipe.overheadPercent,
        wastePercent: recipe.wastePercent,
        yieldQuantity: recipe.yieldQuantity,
        yieldUnit: recipe.yieldUnit,
      }
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [computedIngredients, recipe.laborEnabled, recipe.laborCost, recipe.laborMode,
     recipe.laborHourlyRate, recipe.overheadEnabled, recipe.overheadCost,
     recipe.overheadMode, recipe.overheadPercent, recipe.wastePercent,
     recipe.sellingPrice, recipe.prepTimeMinutes, recipe.yieldQuantity,
     recipe.yieldUnit]
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
    const yf = yieldFactorsEnabled ? findYieldFactor(ingredient.name) : null
    const yieldPercent = yf?.yieldPercent ?? 100
    const nextLine = createIngredientLine({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      ingredientBrand: ingredient.brand ?? null,
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

  const handleAiRecipeImported = (payload: ImportedRecipePayload) => {
    const importedLines = payload.ingredients.map((ingredient) => {
      // Sub-recipe lines have no ingredient row to look up a yield factor
      // for — mirrors addSubRecipe(), which never applies yield factors.
      const yf = yieldFactorsEnabled && !ingredient.subRecipeId ? findYieldFactor(ingredient.ingredientName) : null
      return createIngredientLine({
        id: ingredient.id,
        ingredientId: ingredient.ingredientId,
        subRecipeId: ingredient.subRecipeId ?? null,
        ingredientName: ingredient.ingredientName,
        ingredientBrand: ingredient.ingredientBrand,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        currentPrice: ingredient.currentPrice,
        priceUnit: ingredient.priceUnit ?? ingredient.unit,
        allergens: [],
        yield_percent: yf?.yieldPercent ?? 100,
        yield_override: false,
      })
    })

    setRecipe((current) => ({
      ...current,
      name: payload.name || current.name,
      prepTimeMinutes: payload.prepTimeMinutes,
      cookTimeMinutes: payload.cookTimeMinutes,
      yieldQuantity: payload.yieldQuantity,
      yieldUnit: payload.yieldUnit || current.yieldUnit,
      ingredients: importedLines,
    }))

    void hydrateIngredientAllergens(importedLines).then((hydrated) => {
      setRecipe((current) => ({
        ...current,
        ingredients: current.ingredients.map((item) => hydrated.find((next) => next.id === item.id) ?? item),
      }))
    })
  }

  const handleYieldFactorsToggle = () => {
    if (!hasFullAccess) {
      toast('Yield factor calculator is a Pro feature', {
        description: 'Upgrade to Pro from Settings -> Billing to unlock this.',
      })
      return
    }

    const nextEnabled = !yieldFactorsEnabled
    setYieldFactorsEnabled(nextEnabled)
    setRecipe((current) => ({
      ...current,
      ingredients: current.ingredients.map((item) => {
        const suggestion = nextEnabled && !item.subRecipeId
          ? findYieldFactor(item.ingredientName)
          : null
        return createIngredientLine({
          ...item,
          yield_percent: suggestion?.yieldPercent ?? 100,
          yield_override: false,
        })
      }),
    }))

    toast(nextEnabled ? 'Yield factors enabled' : 'Yield factors disabled', {
      description: nextEnabled
        ? 'Reference yields were applied to matching ingredients in this recipe.'
        : 'All ingredients were reset to 100% yield.',
    })
  }

  const addSubRecipe = (subRecipe: SubRecipeLookup, quantity: number, unit: string) => {
    // Priced exactly like a regular ingredient: current_price/price_unit are the
    // sub-recipe's own cost-per-unit (€/g, €/ml, or €/unit for count-yield
    // sub-recipes) and that unit — no separate reconstruction needed, the
    // shared cost calculator handles it.
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
          last_supplier_id: formData.supplierId ?? null,
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

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
  }, [])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setCropModalFile(file)
      e.target.value = ''
    }
  }

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploadingImage(true)
    try {
      const compressed = await compressImage(file, 1200, 0.8)
      const fd = new FormData()
      fd.append('file', compressed)
      fd.append('recipeId', isNew ? 'draft' : recipeId)
      const res = await fetch('/api/recipes/upload-image', { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'Upload failed')
      }
      const { url } = await res.json() as { url: string }
      setRecipe((c) => {
        const newUrls = [...c.imageUrls, url]
        return { ...c, imageUrls: newUrls, imageUrl: newUrls[0] }
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image upload failed')
    } finally {
      setUploadingImage(false)
    }
  }

  const removeFromGallery = (idx: number) => {
    setRecipe((c) => {
      const newUrls = c.imageUrls.filter((_, i) => i !== idx)
      return { ...c, imageUrls: newUrls, imageUrl: newUrls[0] ?? null }
    })
  }


  const { getRootProps, getInputProps, open: openFilePicker } = useDropzone({
    accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => { if (files[0]) setCropModalFile(files[0]) },
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
        suppressNextDirtyRef.current = true
        setRecipe((c) => ({ ...c, imageUrl, imageUrls: [imageUrl] }))
        setLoadedRecipe((prev) => prev ? { ...prev, imageUrl, imageUrls: [imageUrl] } : prev)
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
      // When used as a sub-recipe, pin the unit to the recipe's own yield unit so
      // convertUnit(yieldQty, yieldUnit, yieldUnit) = yieldQty and cost-per-unit = totalCost / yieldQty.
      // - Weight/volume yield (kg, g, L, ml, etc.) → sub_ingredient_unit = yield unit,
      //   cost = totalCost / yieldInBaseUnit (canonical formula, unchanged).
      // - Count yield (unit, dozen, portion, etc.) → sub_ingredient_unit = yield unit,
      //   cost = totalCost / yieldQuantity (e.g. "1 unit" Challah → €/unit, not forced into €/g).
      subIngredientUnit: currentRecipe.isSubIngredient
        ? (isConvertible(currentRecipe.yieldUnit, 'g') || isConvertible(currentRecipe.yieldUnit, 'ml')
            ? currentRecipe.yieldUnit
            : currentRecipe.yieldUnit || 'unit')  // count yield → price per yield unit (e.g. 'unit')
        : currentRecipe.subIngredientUnit,
      ingredients: currentIngredients.map((item) => ({ ...item, lineCost: calculateLineCost(item) })),
    }

    const activeRecipeId = persistedRecipeIdRef.current
    const savedIsNew = !activeRecipeId
    const saved = savedIsNew ? await createRecipe(payload) : await updateRecipe(activeRecipeId, payload)
    persistedRecipeIdRef.current = saved.id
    const hydratedIngredients = await hydrateIngredientAllergens(saved.ingredients)
    const hydratedRecipe = { ...saved, ingredients: hydratedIngredients } as RecipeRecord

    suppressNextDirtyRef.current = true
    setLoadedRecipe(hydratedRecipe)
    if (!silent) {
      setRecipe(mapRecipeToState(hydratedRecipe))
    }
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
  }, [createRecipe, fetchRecipeImage, hydrateIngredientAllergens, storageKey, updateRecipe])

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
    if (aiImportActiveRef.current) {
      setSaveStatus('dirty')
      return
    }
    const importSessionAtStart = aiImportSessionRef.current
    setSaveStatus('autosaving')
    try {
      const saved = await doSave(recipeRef.current, computedIngredientsRef.current, true)
      if (
        aiImportActiveRef.current ||
        aiImportSessionRef.current !== importSessionAtStart
      ) {
        setSaveStatus('dirty')
        return
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus((s) => s === 'saved' ? 'clean' : s), 2000)
      if (isNew) router.replace(`/recipes/${saved.id}`)
    } catch {
      setSaveStatus('failed')
    }
  }, [doSave, isNew, router])

  // Keep the ref pointing to the latest handleAutoSave
  handleAutoSaveRef.current = handleAutoSave

  const handleAiImportOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen && !aiImportActiveRef.current) {
      aiImportSessionRef.current += 1
    }
    aiImportActiveRef.current = nextOpen
    setAiImportOpen(nextOpen)

    if (nextOpen) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
      return
    }

    if (saveStatus === 'dirty' || saveStatus === 'failed') {
      autoSaveTimerRef.current = setTimeout(
        () => void handleAutoSaveRef.current?.(),
        3000
      )
    }
  }, [saveStatus])

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

  const handleDuplicate = () => {
    if (isNew || !loadedRecipe) return

    const ingredients = computedIngredients.map((item) => {
      const copy: Partial<RecipeIngredientDraft> = { ...item }
      delete copy.id
      return copy
    })

    const snapshot: DuplicateRecipeSnapshot = {
      ...recipe,
      name: `${recipe.name.trim() || loadedRecipe.name} (Copy)`,
      ingredients,
      instructions: recipe.instructions.map((step) => ({ text: step.text })),
    }

    sessionStorage.setItem('zrecipe-duplicate-source', JSON.stringify(snapshot))
    router.push('/recipes/new')
  }

  const handlePrintFull = useCallback(() => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const logoUrl = `${window.location.origin}/images/fundobranco2.png`
    const yieldQty = recipe.yieldQuantity
    const isBatch = yieldQty > 1
    const profitPerUnit = cost.sellingPrice - cost.costPerUnit
    const margin = cost.marginPercent
    const N = effectiveN

    const allergensList = recipeAllergens.contains.length > 0
      ? `<div style="margin-top:16px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
           <p style="font-weight:700;color:#dc2626;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;">Contains</p>
           <p style="color:#991b1b;font-size:14px;margin:0;">${recipeAllergens.contains.map((a) => `${a.icon} ${a.shortName}`).join(', ')}</p>
         </div>`
      : '<p style="color:#059669;font-size:13px;">✓ No allergens declared</p>'

    const ingredientRows = computedIngredients.map((ri) => {
      const scaledQty = ri.quantity * N
      const scaledCost = ri.lineCost * N
      const qtyStr = scaledQty % 1 === 0 ? scaledQty.toString() : scaledQty.toFixed(3).replace(/\.?0+$/, '')
      return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
          ${ri.ingredientName}${(ri.yield_percent ?? 100) < 100 ? ` <span style="color:#d97706;font-size:11px;">(YF ${Math.round(ri.yield_percent ?? 100)}%)</span>` : ''}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${qtyStr} ${ri.unit}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">€${scaledCost.toFixed(2)}</td>
      </tr>
    `}).join('')

    const today = new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${recipe.name}${N > 1 ? ` — Batch ×${N}` : ''} — ZRecipe</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; padding: 40px; max-width: 800px; margin: 0 auto; }
    @media print { body { padding: 20px; } .no-print { display: none !important; } @page { margin: 15mm; } }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #059669; padding-bottom: 16px; margin-bottom: 24px; }
    .recipe-name { font-size: 28px; font-weight: 800; }
    .brand { color: #059669; font-size: 14px; font-weight: 600; }
    .meta-badges { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .badge { font-size: 11px; padding: 4px 10px; border-radius: 20px; background: #f1f5f9; color: #475569; font-weight: 500; }
    .badge-batch { background: #ede9fe; color: #7c3aed; font-weight: 700; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #9ca3af; margin: 24px 0 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; padding: 8px 12px; border-bottom: 2px solid #e5e7eb; }
    th:last-child, th:nth-child(2) { text-align: right; }
    .cost-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
    .cost-card { padding: 16px; border-radius: 12px; border: 1px solid #e5e7eb; }
    .cost-card.primary { border: 2px solid #059669; background: #f0fdf4; }
    .cost-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 4px; }
    .cost-value { font-size: 24px; font-weight: 800; }
    .cost-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }
    .cost-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
    .cost-row-label { color: #6b7280; }
    .cost-row-value { font-weight: 600; }
    .profit-positive { color: #059669; }
    .profit-negative { color: #ef4444; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; background: #059669; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(5,150,105,0.3); }
    .print-btn:hover { background: #047857; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="recipe-name">${recipe.name}</h1>
      <div class="meta-badges">
        <span class="badge">${recipe.category || 'Uncategorised'}</span>
        ${N > 1 ? `<span class="badge badge-batch">Batch ×${N}</span>` : ''}
        <span class="badge">Yield: ${yieldQty}${isBatch ? ' units' : ''}</span>
        <span class="badge">Prep: ${recipe.prepTimeMinutes} min</span>
        <span class="badge">Cook: ${recipe.cookTimeMinutes} min</span>
      </div>
    </div>
    <div style="text-align:right;"><img src="${logoUrl}" style="height:32px;object-fit:contain;display:block;margin-left:auto;" alt="ZRecipe" /><p style="font-size:10px;color:#9ca3af;margin-top:2px;">food costing software</p><p style="font-size:12px;color:#9ca3af;">${today}</p></div>
  </div>

  ${recipe.imageUrls[0] ? `<img src="${recipe.imageUrls[0]}" style="width:100%;max-height:250px;object-fit:cover;border-radius:12px;margin-bottom:20px;" />` : ''}

  <p class="section-title">Ingredients${N > 1 ? ` (×${N} batch)` : ''}</p>
  <table>
    <thead><tr><th>Ingredient</th><th style="text-align:right;">Quantity</th><th style="text-align:right;">Cost</th></tr></thead>
    <tbody>
      ${ingredientRows}
      <tr style="font-weight:700;">
        <td style="padding:10px 12px;border-top:2px solid #e5e7eb;">Total ingredient cost</td>
        <td style="padding:10px 12px;border-top:2px solid #e5e7eb;"></td>
        <td style="padding:10px 12px;border-top:2px solid #e5e7eb;text-align:right;">€${(cost.ingredientCost * N).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <p class="section-title">Allergen Information (EU Reg. 1169/2011)</p>
  ${allergensList}

  <p class="section-title">Cost Summary${N > 1 ? ` — Batch total ×${N}` : ''}</p>
  <div class="cost-row"><span class="cost-row-label">Ingredient cost</span><span class="cost-row-value">€${(cost.ingredientCost * N).toFixed(2)}</span></div>
  ${recipe.laborEnabled ? `<div class="cost-row"><span class="cost-row-label">Labor${recipe.laborMode === 'time' ? ` (${recipe.laborJobTitle ? `${recipe.laborJobTitle}, ` : ''}${recipe.prepTimeMinutes}min × €${recipe.laborHourlyRate ?? 0}/hr)` : ''}</span><span class="cost-row-value">€${(cost.laborCost * N).toFixed(2)}</span></div>` : ''}
  ${recipe.overheadEnabled ? `<div class="cost-row"><span class="cost-row-label">Overhead${recipe.overheadMode === 'percent' ? ` (${recipe.overheadPercent}%)` : ''}</span><span class="cost-row-value">€${(cost.overheadCost * N).toFixed(2)}</span></div>` : ''}
  ${(recipe.wastePercent ?? 0) > 0 ? `<div class="cost-row"><span class="cost-row-label">Waste (${recipe.wastePercent}%)</span><span class="cost-row-value">+€${(cost.wasteCost * N).toFixed(2)}</span></div>` : ''}

  <div class="cost-grid">
    <div class="cost-card">
      <p class="cost-label">${N > 1 ? `Batch total cost ×${N}` : 'Total cost'}</p>
      <p class="cost-value">€${(cost.totalCost * N).toFixed(2)}</p>
      ${N > 1 ? `<p class="cost-sub">×1 base: €${cost.totalCost.toFixed(2)}</p>`
        : isBatch ? `<p class="cost-sub">€${cost.costPerUnit.toFixed(3)} per unit · ${yieldQty} units</p>` : ''}
    </div>
    <div class="cost-card primary">
      <p class="cost-label" style="color:#059669;">${N > 1 ? `Batch selling price ×${N}` : isBatch ? 'Price per unit' : 'Selling price'}</p>
      <p class="cost-value">€${cost.sellingPrice.toFixed(2)}</p>
      ${N > 1 ? `<p class="cost-sub" style="color:#059669;">×1 base: €${cost.sellingPrice.toFixed(2)}</p>` : ''}
    </div>
  </div>

  <div style="margin-top:16px;">
    <div class="cost-row">
      <span class="cost-row-label">Profit per unit${N > 1 ? ' (base)' : ''}</span>
      <span class="cost-row-value ${profitPerUnit >= 0 ? 'profit-positive' : 'profit-negative'}">${profitPerUnit >= 0 ? '+' : ''}€${profitPerUnit.toFixed(2)}</span>
    </div>
    <div class="cost-row">
      <span class="cost-row-label">Margin</span>
      <span class="cost-row-value" style="color:${margin >= 40 ? '#059669' : margin >= 20 ? '#d97706' : '#ef4444'};">${margin.toFixed(1)}%</span>
    </div>
    ${N > 1 ? `
      <div class="cost-row"><span class="cost-row-label">Batch total revenue ×${N}</span><span class="cost-row-value">€${(cost.sellingPrice * N).toFixed(2)}</span></div>
      <div class="cost-row"><span class="cost-row-label">Batch total profit ×${N}</span><span class="cost-row-value ${profitPerUnit >= 0 ? 'profit-positive' : 'profit-negative'}">${profitPerUnit >= 0 ? '+' : ''}€${(profitPerUnit * N).toFixed(2)}</span></div>
    ` : isBatch ? `
      <div class="cost-row"><span class="cost-row-label">Batch total revenue (${yieldQty} units)</span><span class="cost-row-value">€${(cost.sellingPrice * yieldQty).toFixed(2)}</span></div>
      <div class="cost-row"><span class="cost-row-label">Batch total profit (${yieldQty} units)</span><span class="cost-row-value ${profitPerUnit >= 0 ? 'profit-positive' : 'profit-negative'}">${profitPerUnit >= 0 ? '+' : ''}€${(profitPerUnit * yieldQty).toFixed(2)}</span></div>
    ` : ''}
  </div>

  <div class="footer">
    <span>www.zrecipe.ie — food costing software</span>
    <span>Prep: ${recipe.prepTimeMinutes} min · Cook: ${recipe.cookTimeMinutes} min</span>
    <span>${today}</span>
  </div>

  <button class="print-btn no-print" onclick="window.print()">🖨 Print</button>
</body>
</html>`)

    printWindow.document.close()
  }, [recipe, cost, computedIngredients, recipeAllergens, effectiveN])

  const handlePrintLabel = useCallback((labelData: LabelData) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const logoUrl = `${window.location.origin}/images/fundobranco2.png`
    const allergenNames = recipeAllergens.contains.map((a) => a.shortName)
    const allergenDisplay = recipeAllergens.contains.map((a) => `${a.icon} ${a.shortName}`).join(', ')

    let ingredientsHtml = labelData.ingredients
    allergenNames.forEach((name) => {
      const regex = new RegExp(`(${name})`, 'gi')
      ingredientsHtml = ingredientsHtml.replace(regex, '<strong style="text-transform:uppercase;">$1</strong>')
    })

    const prodDate = labelData.productionDate
      ? new Date(labelData.productionDate + 'T12:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
      : ''
    const expDate = labelData.expiryDate
      ? new Date(labelData.expiryDate + 'T12:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
      : ''

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${labelData.productName} — Label</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,sans-serif; color:#1e293b; padding:20px; display:flex; flex-direction:column; justify-content:flex-start; align-items:center; min-height:100vh; background:#f9fafb; }
    @media print { body { padding:0; background:white; min-height:auto; } .no-print { display:none !important; } @page { margin:5mm; } }
    .label { border:2.5px solid #1e293b; border-radius:10px; padding:20px 24px; max-width:420px; width:100%; background:white; }
    .product-name { font-size:24px; font-weight:900; color:#0f172a; line-height:1.2; margin-bottom:2px; }
    .business-name { font-size:13px; color:#6b7280; font-weight:500; margin-bottom:12px; }
    .section-label { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; color:#6b7280; margin-bottom:4px; }
    .ingredients-text { font-size:12px; color:#374151; line-height:1.5; margin-bottom:12px; }
    .allergen-box { background:#fef2f2; border:1.5px solid #fecaca; border-radius:8px; padding:8px 12px; margin-bottom:12px; }
    .allergen-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#dc2626; margin-bottom:2px; }
    .allergen-list { font-size:13px; font-weight:700; color:#991b1b; }
    .storage { font-size:11px; color:#6b7280; font-style:italic; margin-bottom:12px; }
    .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; border-top:1.5px solid #e5e7eb; padding-top:10px; margin-top:4px; }
    .meta-item { font-size:10px; }
    .meta-label { color:#9ca3af; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }
    .meta-value { color:#374151; font-weight:600; font-size:12px; }
    .print-btn { position:fixed; bottom:24px; right:24px; background:#059669; color:white; border:none; padding:14px 28px; border-radius:14px; font-size:15px; font-weight:600; cursor:pointer; box-shadow:0 4px 12px rgba(5,150,105,0.3); }
  </style>
</head>
<body>
  <div class="label">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
      <div><p class="product-name">${labelData.productName}</p>${labelData.businessName ? `<p class="business-name">${labelData.businessName}</p>` : ''}</div>
      <img src="${logoUrl}" style="height:22px;object-fit:contain;opacity:0.65;flex-shrink:0;margin-left:8px;" alt="ZRecipe" />
    </div>
    <p class="section-label">Ingredients</p>
    <p class="ingredients-text">${ingredientsHtml}</p>
    ${recipeAllergens.contains.length > 0
      ? `<div class="allergen-box"><p class="allergen-label">Contains</p><p class="allergen-list">${allergenDisplay}</p></div>`
      : '<p style="font-size:10px;color:#059669;margin-bottom:12px;">No allergens declared</p>'}
    ${labelData.storageInstructions ? `<p class="storage">${labelData.storageInstructions}</p>` : ''}
    ${labelData.weight ? `<p style="font-size:14px;font-weight:700;margin-bottom:8px;">Net Wt: ${labelData.weight}</p>` : ''}
    <div class="meta-grid">
      ${labelData.batchId ? `<div class="meta-item"><p class="meta-label">Batch</p><p class="meta-value">${labelData.batchId}</p></div>` : ''}
      ${labelData.yieldQty ? `<div class="meta-item"><p class="meta-label">Yield</p><p class="meta-value">${labelData.yieldQty} units</p></div>` : ''}
      ${prodDate ? `<div class="meta-item"><p class="meta-label">Produced</p><p class="meta-value">${prodDate}</p></div>` : ''}
      ${expDate ? `<div class="meta-item"><p class="meta-label">Best Before</p><p class="meta-value">${expDate}</p></div>` : ''}
    </div>
  </div>
  <p style="font-size:10px;color:#9ca3af;margin-top:10px;text-align:center;">www.zrecipe.ie — food costing software</p>
  <button class="print-btn no-print" onclick="window.print()">Print Label</button>
</body>
</html>`)
    printWindow.document.close()
  }, [recipeAllergens])

  const handlePrintSelect = useCallback((type: 'full' | 'kitchen' | 'label') => {
    setShowPrintModal(false)
    if (type === 'full') handlePrintFull()
    else if (type === 'kitchen') setShowKitchenCardModal(true)
    else setShowLabelEditor(true)
  }, [handlePrintFull])

  const kitchenCardData: KitchenCardData = useMemo(() => {
    const N = effectiveN
    return {
      name: recipe.name,
      category: recipe.category,
      yieldQuantity: recipe.yieldQuantity,
      yieldUnit: recipe.yieldUnit,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      imageUrls: recipe.imageUrls,
      description: recipe.description,
      ingredients: computedIngredients.map((ri) => {
        const scaledQty = ri.quantity * N
        const qtyStr = scaledQty % 1 === 0 ? scaledQty.toString() : scaledQty.toFixed(3).replace(/\.?0+$/, '')
        return {
          name: ri.ingredientName,
          quantity: qtyStr,
          unit: ri.unit,
          notes: (ri.notes && ri.notes !== ri.ingredientName) ? ri.notes : '',
        }
      }),
      instructions: recipe.instructions.filter((s) => s.text.trim()).map((s) => s.text),
      allergensContains: recipeAllergens.contains.map((a) => `${a.icon} ${a.shortName}`),
      allergensMayContain: recipeAllergens.mayContain.map((a) => `${a.icon} ${a.shortName}`),
      batchLabel: N > 1 ? `Batch ×${N}` : null,
      batchMultiplier: N,
    }
  }, [recipe, computedIngredients, recipeAllergens, effectiveN])

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-14 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
        <div className="grid gap-6 xl:grid-cols-[60fr_40fr]">
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
            onClick={() => {
              if (!hasFullAccess) {
                toast('PDF & Kitchen Card export is a Pro feature', {
                  description: 'Upgrade to Pro from Settings → Billing to print or export recipes.',
                })
                return
              }
              setShowPrintModal(true)
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {hasFullAccess ? <Printer className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            <span className="hidden sm:inline">Print</span>
          </button>

          {!isNew && (
            <button
              type="button"
              onClick={handleDuplicate}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">Duplicate</span>
            </button>
          )}

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
      <div className="grid gap-6 lg:grid-cols-[224px_1fr] lg:items-stretch">

        {/* Photo gallery */}
        <div className="flex flex-col gap-2 lg:h-full">
          {/* Primary photo / drop area */}
          {(() => {
            const primaryUrl = recipe.imageUrls[0] ?? null
            const imageSource = primaryUrl?.includes('pexels.com') ? 'pexels' : primaryUrl ? 'user' : null
            return (
              <div
                {...getRootProps()}
                onDragEnter={() => setIsDragging(true)}
                onDragLeave={() => setIsDragging(false)}
                onDropCapture={() => setIsDragging(false)}
                className={cn(
                  'relative flex h-56 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition lg:min-h-[240px] lg:flex-1',
                  isDragging ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/40'
                )}
              >
                <input {...getInputProps()} />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInputChange} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileInputChange} />

                {primaryUrl ? (
                  <>
                    <Image src={primaryUrl} alt={recipe.name || 'Recipe'} fill unoptimized className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />
                    {uploadingImage && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50">
                        <div className="text-center">
                          <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          <p className="text-xs font-medium text-white">Saving photo…</p>
                        </div>
                      </div>
                    )}
                    {imageSource === 'pexels' && (
                      <span className="absolute top-2 left-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/80">
                        Stock photo
                      </span>
                    )}
                    {recipe.imageUrls.length < 8 && (
                      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
                        {isMobile ? (
                          <>
                            <button
                              type="button"
                              onClick={() => cameraInputRef.current?.click()}
                              className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-2 text-xs text-white shadow-lg transition-transform active:scale-95"
                            >
                              <Camera className="h-3.5 w-3.5" />
                              Take photo
                            </button>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-2 text-xs text-white backdrop-blur-sm transition-transform active:scale-95"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              Add photo
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={openFilePicker}
                            className="rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur-sm transition hover:bg-black/70"
                          >
                            {uploadingImage ? 'Uploading…' : 'Add photo'}
                          </button>
                        )}
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
                    )}
                    {recipe.imageUrls.length >= 8 && (
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                        <span className="rounded-full bg-black/50 px-3 py-1 text-[10px] text-white/80">
                          Max 8 photos
                        </span>
                      </div>
                    )}
                  </>
                ) : fetchingImage ? (
                  <div className="flex flex-col items-center gap-3 px-4 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                    <p className="text-xs text-slate-500">Fetching photo…</p>
                  </div>
                ) : uploadingImage ? (
                  <div className="flex flex-col items-center gap-3 px-4 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                    <p className="text-xs text-slate-500">Uploading…</p>
                  </div>
                ) : isMobile ? (
                  <div
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center gap-2 px-4 text-center"
                  >
                    <Camera className="h-8 w-8 text-slate-400" />
                    <p className="text-xs text-slate-500">Tap to take a photo</p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                      className="mt-1 text-xs text-slate-400 underline"
                    >
                      or choose from gallery
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 px-4 text-center">
                    <UploadCloud className="h-8 w-8 text-slate-400" />
                    <p className="text-xs text-slate-500">Drop an image here or</p>
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                    >
                      Choose photo
                    </button>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Thumbnail strip — drag to reorder */}
          {recipe.imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Reorder.Group
                axis="x"
                values={recipe.imageUrls}
                onReorder={(newUrls: string[]) => {
                  setRecipe((c) => ({ ...c, imageUrls: newUrls, imageUrl: newUrls[0] ?? null }))
                }}
                as="div"
                className="contents"
              >
                {recipe.imageUrls.map((url, idx) => (
                  <Reorder.Item
                    key={url}
                    value={url}
                    as="div"
                    className="group relative h-12 w-12 shrink-0 cursor-grab overflow-hidden rounded-lg border-2 border-slate-200 active:cursor-grabbing"
                    whileDrag={{ scale: 1.1, boxShadow: '0 6px 18px rgba(0,0,0,0.28)', zIndex: 20, borderColor: '#34d399' }}
                    layout
                    layoutId={url}
                  >
                    <Image src={url} fill unoptimized className="pointer-events-none object-cover" alt="" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); removeFromGallery(idx) }}
                        className="rounded p-0.5 hover:bg-white/20"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                    {idx === 0 && (
                      <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-emerald-600/80 py-[1px] text-center text-[7px] leading-tight text-white">
                        main
                      </div>
                    )}
                  </Reorder.Item>
                ))}
              </Reorder.Group>
              {recipe.imageUrls.length < 8 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-500"
                  title="Add photo"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

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

            {/* Yield qty + Batch — same grid cell, side by side */}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.95fr)]">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">YIELD QTY</span>
                  <FieldHint text="How many units this recipe makes (e.g. 12 muffins, 1 cake)." />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={recipe.yieldQuantity || ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? 0 : parseFloat(e.target.value)
                      if (!isNaN(v)) updateRecipeField('yieldQuantity', v)
                    }}
                    className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    value={recipe.yieldUnit}
                    onChange={(e) => updateRecipeField('yieldUnit', e.target.value)}
                    placeholder="e.g. muffins"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  Permanent recipe output. Example: 1 cake, 12 muffins, 24 cookies.
                </p>
              </div>

              {/* Batch multiplier — session-only view toggle, never saved */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="mb-2 flex items-center gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">BATCH</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    Temporary
                  </span>
                  <FieldHint text="Making a large order? Scale the whole recipe to make it multiple times." />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!hasFullAccess) {
                        toast('Batch costing is a Pro feature', {
                          description: 'Upgrade to Pro from Settings → Billing to scale recipes into batches.',
                        })
                        return
                      }
                      setBatchEnabled((v) => !v)
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${!hasFullAccess ? 'cursor-not-allowed opacity-50' : ''} ${batchEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    aria-pressed={batchEnabled}
                    aria-disabled={!hasFullAccess}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${batchEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  {!hasFullAccess && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                  {batchEnabled && (
                    <input
                      type="number"
                      min="2"
                      step="1"
                      value={batchQty}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (!isNaN(v) && v >= 2) setBatchQty(v)
                      }}
                      className="w-14 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                    />
                  )}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  This only changes the shopping list and totals for the current view.
                </p>
              </div>
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
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Recipe Notes</span>
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
            <div className="flex items-center gap-2.5">
              <input
                id="sub-recipe-checkbox"
                type="checkbox"
                checked={recipe.isSubIngredient}
                onChange={(e) => updateRecipeField('isSubIngredient', e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 outline-none focus:ring-emerald-500"
              />
              <label htmlFor="sub-recipe-checkbox" className="inline-flex cursor-pointer items-center gap-1.5">
                <span className="text-sm font-medium text-slate-700">Sub-Recipe</span>
                <span className="text-xs text-slate-400">(use as an ingredient in other recipes)</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Ingredients + Cost Breakdown ───────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[60fr_40fr]">

        {/* Ingredients panel */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Ingredients</h3>
            {computedIngredients.length > 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                {computedIngredients.length}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {recipe.ingredients.length === 0 && (
                <button
                  type="button"
                  onClick={() => handleAiImportOpenChange(true)}
                  title="Upload a recipe photo, PDF, or file - AI will extract the ingredients for you."
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  AI import
                </button>
              )}
              <div
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-2.5 py-0.5 text-xs font-semibold transition-colors',
                  yieldFactorsEnabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-500'
                )}
              >
                <span>Auto YF</span>
                <button
                  type="button"
                  onClick={handleYieldFactorsToggle}
                  aria-pressed={yieldFactorsEnabled}
                  aria-label={yieldFactorsEnabled ? 'Disable automatic yield factors' : 'Enable automatic yield factors'}
                  title={yieldFactorsEnabled ? 'Disable yield factors for this recipe' : 'Apply reference yield factors to this recipe'}
                  className={cn(
                    'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
                    yieldFactorsEnabled ? 'bg-emerald-500' : 'bg-gray-200'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
                      yieldFactorsEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    )}
                  />
                </button>
              </div>
              <div className="relative">
              <button
                type="button"
                onClick={() => {
                  if (!hasFullAccess) {
                    toast('Yield factor calculator is a Pro feature', {
                      description: 'Upgrade to Pro from Settings → Billing to unlock this.',
                    })
                    return
                  }
                  setYieldModalOpen(true)
                }}
                onMouseEnter={() => setShowYfTooltip(true)}
                onMouseLeave={() => setShowYfTooltip(false)}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-400 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600"
              >
                YF ref
              </button>

              {showYfTooltip && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-lg pointer-events-none">
                  <p className="mb-1 text-sm font-semibold text-gray-800">Yield Factor Reference</p>
                  <p className="mb-2 text-xs leading-relaxed text-gray-500">
                    Yield factor accounts for trim loss during prep. Use Auto YF to apply the reference values to this recipe.
                  </p>
                  <p className="text-xs font-medium text-emerald-600">Click to view full reference table →</p>
                </div>
              )}
              </div>
            </div>
          </div>

          <IngredientSearch
            onAddIngredient={addIngredient}
            onCreateIngredient={openCreateIngredientModal}
            onAddSubRecipe={addSubRecipe}
          />

          {computedIngredients.length > 0 && (
            <div className="mt-4">
              {/* Table header */}
              <div className="mb-1 grid grid-cols-[28px_1fr_36px_70px_70px_60px_80px_65px_28px] items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                <div />
                <div>Ingredient</div>
                <div />
                <div className="text-center">Qty</div>
                <div className="text-center">Unit</div>
                <div className="text-center">Yield</div>
                <div className="text-center">Net Wt</div>
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
                    hasMismatch={computedIngredients[idx]?.hasMismatch ?? false}
                    batchMultiplier={effectiveN}
                    onUpdate={(patch) => updateIngredient(item.id, patch)}
                    onRemove={() => removeIngredient(item.id)}
                    onNoteClick={() => setNoteModalIngredientId(item.id)}
                    onSubstituteClick={() => setSubstituteIngredientId(item.id)}
                  />
                ))}
              </Reorder.Group>

              <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">
                    Total ingredient cost{effectiveN > 1 && <span className="ml-1 text-slate-400">×{effectiveN}</span>}
                  </span>
                  <span className="font-semibold text-slate-900">€{(cost.ingredientCost * effectiveN).toFixed(2)}</span>
                </div>

                {(() => {
                  const weightVolUnits = new Set(['g', 'kg', 'ml', 'L'])
                  const epG = computedIngredients.reduce((sum, ing) => {
                    if (weightVolUnits.has(ing.unit)) {
                      const base = ing.unit === 'kg' ? ing.quantity * 1000
                                 : ing.unit === 'L'  ? ing.quantity * 1000
                                 : ing.quantity
                      return sum + base * ((ing.yield_percent ?? 100) / 100)
                    }
                    return sum + (ing.ep_weight_manual ?? 0)
                  }, 0)
                  const apG = computedIngredients.reduce((sum, ing) => {
                    if (!weightVolUnits.has(ing.unit)) return sum
                    const base = ing.unit === 'kg' ? ing.quantity * 1000
                               : ing.unit === 'L'  ? ing.quantity * 1000
                               : ing.quantity
                    const yf = Math.max(0.01, (ing.yield_percent ?? 100) / 100)
                    return sum + base / yf
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
            isSubRecipe={recipe.isSubIngredient}
            prepTimeMinutes={recipe.prepTimeMinutes}
            laborEnabled={recipe.laborEnabled}
            laborHourlyRate={recipe.laborHourlyRate ?? 0}
            laborMode={recipe.laborMode}
            laborJobTitle={recipe.laborJobTitle}
            overheadEnabled={recipe.overheadEnabled}
            overheadMode={recipe.overheadMode}
            overheadPercent={recipe.overheadPercent}
            wastePercent={recipe.wastePercent}
            batchMultiplier={effectiveN}
            onLaborEnabledChange={(v) => updateRecipeField('laborEnabled', v)}
            onLaborModeChange={(v) => updateRecipeField('laborMode', v)}
            onLaborCostChange={(v) => updateRecipeField('laborCost', v)}
            onOpenLaborConfig={() => setLaborConfigModalOpen(true)}
            onOverheadEnabledChange={(v) => updateRecipeField('overheadEnabled', v)}
            onOverheadModeChange={(v) => updateRecipeField('overheadMode', v)}
            onOverheadCostChange={(v) => updateRecipeField('overheadCost', v)}
            onOverheadPercentChange={(v) => updateRecipeField('overheadPercent', v)}
            onWastePercentChange={(v) => updateRecipeField('wastePercent', v)}
            onSellingPriceChange={(v) => updateRecipeField('sellingPrice', v)}
          />
        </div>
      </div>

      {/* ── SECTION 3: Method ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Method</h3>
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

      {cropModalFile && (
        <PhotoCropModal
          file={cropModalFile}
          onCancel={() => setCropModalFile(null)}
          onSave={async (croppedFile) => {
            setCropModalFile(null)
            await uploadImage(croppedFile)
          }}
        />
      )}

      <YieldFactorModal open={yieldModalOpen} onClose={() => setYieldModalOpen(false)} />

      <LaborConfigModal
        open={laborConfigModalOpen}
        initialJobTitle={recipe.laborJobTitle}
        initialHourlyRate={recipe.laborHourlyRate}
        onSave={(jobTitle, hourlyRate) => {
          setRecipe((prev) => ({
            ...prev,
            laborJobTitle: jobTitle || null,
            laborHourlyRate: hourlyRate,
            laborEnabled: true,
          }))
          setLaborConfigModalOpen(false)
        }}
        onClose={() => setLaborConfigModalOpen(false)}
      />

      {(() => {
        const noteIng = noteModalIngredientId
          ? recipe.ingredients.find((i) => i.id === noteModalIngredientId) ?? null
          : null
        const isRealNote = noteIng != null && !!noteIng.notes && noteIng.notes !== noteIng.ingredientName
        return (
          <IngredientNoteModal
            open={noteModalIngredientId !== null}
            ingredientName={noteIng?.ingredientName ?? ''}
            initialNote={isRealNote ? noteIng!.notes! : null}
            onSave={(note) => {
              if (noteModalIngredientId) updateIngredient(noteModalIngredientId, { notes: note })
            }}
            onDelete={() => {
              if (noteModalIngredientId) updateIngredient(noteModalIngredientId, { notes: null })
            }}
            onClose={() => setNoteModalIngredientId(null)}
          />
        )
      })()}

      {(() => {
        const subIng = substituteIngredientId
          ? recipe.ingredients.find((i) => i.id === substituteIngredientId) ?? null
          : null
        const subIngHasNote = subIng != null && !!subIng.notes && subIng.notes !== subIng.ingredientName
        return (
          <SubstituteIngredientModal
            open={substituteIngredientId !== null}
            currentIngredientId={subIng?.ingredientId ?? null}
            currentSubRecipeId={subIng?.subRecipeId ?? null}
            currentIngredientName={subIng?.ingredientName ?? ''}
            hasNote={subIngHasNote}
            onSubstitute={(replacement: SubstituteReplacement, keepNote: boolean) => {
              if (!substituteIngredientId) return
              const currentItem = recipe.ingredients.find((i) => i.id === substituteIngredientId)
              if (!currentItem) return
              const lineId = substituteIngredientId
              updateIngredient(lineId, {
                ingredientId: replacement.kind === 'ingredient' ? replacement.data.id : null,
                subRecipeId: replacement.kind === 'sub-recipe' ? replacement.data.id : null,
                ingredientName: replacement.data.name,
                currentPrice: replacement.kind === 'ingredient'
                  ? (replacement.data.currentPrice ?? null)
                  : (replacement.data.costPerUnit ?? null),
                priceUnit: replacement.kind === 'ingredient'
                  ? (replacement.data.priceUnit ?? null)
                  : replacement.data.unit,
                notes: keepNote ? currentItem.notes : null,
                allergens: [],
              })
              // Async: refresh allergens for the new ingredient
              if (replacement.kind === 'ingredient') {
                fetch(`/api/ingredients/allergens?id=${replacement.data.id}`)
                  .then((r) => r.json() as Promise<Record<string, import('@/lib/allergens').IngredientAllergen[]>>)
                  .then((data) => {
                    const allergens = data[replacement.data.id]
                    if (allergens?.length) {
                      setRecipe((c) => ({
                        ...c,
                        ingredients: c.ingredients.map((i) =>
                          i.id === lineId ? { ...i, allergens } : i
                        ),
                      }))
                    }
                  })
                  .catch(() => {})
              } else {
                const draftForHydration = createIngredientLine({
                  ...currentItem,
                  ingredientId: null,
                  subRecipeId: replacement.data.id,
                  allergens: [],
                })
                void hydrateIngredientAllergens([draftForHydration]).then((hydrated) => {
                  const h = hydrated[0]
                  if (!h) return
                  setRecipe((c) => ({
                    ...c,
                    ingredients: c.ingredients.map((i) =>
                      i.id === lineId ? { ...i, allergens: h.allergens } : i
                    ),
                  }))
                })
              }
            }}
            onClose={() => setSubstituteIngredientId(null)}
          />
        )
      })()}

      <NewIngredientModal
        open={newIngredientModalOpen}
        initialName={newIngredientName}
        saving={newIngredientSaving}
        error={newIngredientError}
        onClose={closeCreateIngredientModal}
        onSave={createIngredient}
      />

      <PrintOptionsModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        onSelect={handlePrintSelect}
      />

      <KitchenCardOptionsModal
        open={showKitchenCardModal}
        onClose={() => setShowKitchenCardModal(false)}
        data={kitchenCardData}
        logoUrl={`${assetOrigin}/images/fundobranco2.png`}
      />

      <LabelEditorModal
        isOpen={showLabelEditor}
        onClose={() => setShowLabelEditor(false)}
        recipe={recipe}
        recipeId={loadedRecipe?.id ?? null}
        allergenNames={recipeAllergens.contains.map((a) => a.shortName)}
        allergenDisplay={recipeAllergens.contains.map((a) => `${a.icon} ${a.shortName}`).join(', ')}
        ingredientNames={computedIngredients.map((ri) => ri.ingredientName)}
        onPrint={(data) => handlePrintLabel(data)}
      />

      <AiImportRecipeModal
        open={aiImportOpen}
        onOpenChange={handleAiImportOpenChange}
        onImported={handleAiRecipeImported}
      />
    </div>
  )
}

// ── Print options modal ───────────────────────────────────────────────────────

function PrintOptionsModal({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean
  onClose: () => void
  onSelect: (type: 'full' | 'kitchen' | 'label') => void
}) {
  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-gray-900">Print Recipe</h2>
        <p className="mb-5 text-sm text-gray-500">Choose a format</p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onSelect('full')}
            className="group w-full rounded-xl border-2 border-gray-200 p-4 text-left transition-all hover:border-emerald-400 hover:bg-emerald-50/50"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                <FileText className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-emerald-700">
                  Full Cost Report
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Ingredients with costs, labor, overhead, waste, margin, profit, VAT. For management.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelect('kitchen')}
            className="group w-full rounded-xl border-2 border-gray-200 p-4 text-left transition-all hover:border-emerald-400 hover:bg-emerald-50/50"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                <ChefHat className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-emerald-700">
                  Kitchen Card
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Clean recipe with photo, ingredients, method and allergens. No prices. For kitchen staff.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelect('label')}
            className="group w-full rounded-xl border-2 border-gray-200 p-4 text-left transition-all hover:border-emerald-400 hover:bg-emerald-50/50"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                <Tag className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-emerald-700">
                  Product Label
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Compact label with name, allergens (EU 1169/2011), yield and date. For product packaging.
                </p>
              </div>
            </div>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full py-2 text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body
  )
}

// ── Label editor modal ────────────────────────────────────────────────────────

function LabelEditorModal({
  isOpen,
  onClose,
  recipe,
  recipeId,
  allergenNames,
  allergenDisplay,
  ingredientNames,
  onPrint,
}: {
  isOpen: boolean
  onClose: () => void
  recipe: RecipeEditorData
  recipeId: string | null
  allergenNames: string[]
  allergenDisplay: string
  ingredientNames: string[]
  onPrint: (data: LabelData) => void
}) {
  const [labelData, setLabelData] = useState<LabelData>({
    productName: '',
    businessName: '',
    category: '',
    batchId: '',
    yieldQty: '',
    productionDate: '',
    expiryDate: '',
    ingredients: '',
    storageInstructions: '',
    weight: '',
  })

  useEffect(() => {
    if (!isOpen) return
    // CHANGE 1: category, batchId, yieldQty start empty — user fills each time
    setLabelData({
      productName: recipe.name,
      businessName: '',
      category: '',
      batchId: '',
      yieldQty: '',
      productionDate: new Date().toISOString().split('T')[0],
      expiryDate: '',
      ingredients: ingredientNames.join(', '),
      storageInstructions: recipe.storageInstructions ?? '',
      weight: '',
    })
    resolveTenantContext()
      .then((ctx) => setLabelData((prev) => ({ ...prev, businessName: ctx.tenant.name })))
      .catch(() => {})
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null

  const set = (field: keyof LabelData, value: string | number) =>
    setLabelData((prev) => ({ ...prev, [field]: value }))

  const handlePrintClick = async () => {
    // CHANGE 2: save storage instructions to DB if recipe exists and value changed
    if (recipeId && labelData.storageInstructions !== (recipe.storageInstructions ?? '')) {
      try {
        const supabase = createClient()
        await supabase
          .from('recipes')
          .update({ storage_instructions: labelData.storageInstructions || null })
          .eq('id', recipeId)
      } catch {
        // non-fatal — print still proceeds
      }
    }
    onPrint(labelData)
    onClose()
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100'
  const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Product Label</h2>
            <p className="text-sm text-gray-500">Customise before printing</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">

          <div>
            <label className={labelCls}>Product Name</label>
            <input type="text" value={labelData.productName} onChange={(e) => set('productName', e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Business Name</label>
            <input type="text" value={labelData.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Your business name" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <input type="text" value={labelData.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Pastries" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Net Weight</label>
              <input type="text" value={labelData.weight} onChange={(e) => set('weight', e.target.value)} placeholder="e.g. 250g" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Batch ID</label>
              <input type="text" value={labelData.batchId} onChange={(e) => set('batchId', e.target.value)} placeholder="e.g. B-001" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Yield (units)</label>
              <input type="number" value={labelData.yieldQty || ''} onChange={(e) => set('yieldQty', e.target.value)} placeholder="e.g. 12" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Production Date</label>
              <input type="date" value={labelData.productionDate} onChange={(e) => set('productionDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Best Before / Use By</label>
              <input type="date" value={labelData.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Ingredients List</label>
            <textarea
              value={labelData.ingredients}
              onChange={(e) => set('ingredients', e.target.value)}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="Comma-separated ingredients"
            />
            <p className="mt-1 text-xs text-gray-400">Allergens will be highlighted in bold automatically</p>
          </div>

          <div>
            <label className={labelCls}>Storage Instructions (optional)</label>
            <input type="text" value={labelData.storageInstructions} onChange={(e) => set('storageInstructions', e.target.value)} placeholder="e.g. Store in a cool, dry place" className={inputCls} />
          </div>

          {allergenNames.length > 0 && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-3">
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-red-600">
                Allergens (auto-detected)
              </p>
              <p className="text-sm font-semibold text-red-700">{allergenDisplay}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrintClick}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <Printer className="h-4 w-4" />
            Print Label
          </button>
        </div>
      </div>
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
