'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { Reorder } from 'framer-motion'
import {
  ArrowLeft,
  Save,
  Printer,
  UploadCloud,
  GripVertical,
  Plus,
  Trash2,
  Loader2,
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
  RECIPE_UNITS,
  useRecipes,
} from '@/hooks/useRecipes'
import { type IngredientLookup } from '@/hooks/useInvoices'
import { resolveTenantId } from '@/hooks/useTenant'
import IngredientSearch from './IngredientSearch'
import CostBreakdown from './CostBreakdown'
import PrintOptionsModal from './PrintOptionsModal'

function createStep(text = ''): RecipeStepDraft {
  return { id: crypto.randomUUID(), text }
}

function createIngredientLine(partial?: Partial<RecipeIngredientDraft>): RecipeIngredientDraft {
  const line: RecipeIngredientDraft = {
    id: partial?.id ?? crypto.randomUUID(),
    ingredientId: partial?.ingredientId ?? null,
    ingredientName: partial?.ingredientName ?? '',
    quantity: partial?.quantity ?? 1,
    unit: partial?.unit ?? 'unit',
    currentPrice: partial?.currentPrice ?? null,
    priceUnit: partial?.priceUnit ?? null,
    notes: partial?.notes ?? null,
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
    overheadCost: 0,
    sellingPrice: 0,
    imageUrl: null,
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
    overheadCost: recipe.overheadCost,
    sellingPrice: recipe.sellingPrice,
    imageUrl: recipe.imageUrl,
    instructions:
      recipe.instructions.length > 0 ? recipe.instructions : [createStep()],
    ingredients:
      recipe.ingredients.length > 0
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
  const cost = calculateRecipeCost(
    state.ingredients.map((item) => ({
      ...item,
      lineCost: calculateLineCost(item),
    })),
    state.laborCost,
    state.overheadCost,
    state.sellingPrice
  )

  return {
    id,
    tenantId,
    name: state.name,
    description: state.description,
    category: state.category,
    yieldQuantity: state.yieldQuantity,
    yieldUnit: state.yieldUnit,
    prepTimeMinutes: state.prepTimeMinutes,
    cookTimeMinutes: state.cookTimeMinutes,
    laborCost: state.laborCost,
    overheadCost: state.overheadCost,
    sellingPrice: state.sellingPrice,
    imageUrl: state.imageUrl,
    instructions: state.instructions,
    ingredients: state.ingredients.map((item) => ({
      ...item,
      lineCost: calculateLineCost(item),
    })),
    cost,
    createdAt,
    updatedAt,
  }
}

export default function RecipeBuilder({ recipeId }: { recipeId: string }) {
  const router = useRouter()
  const isNew = recipeId === 'new'
  const { getRecipeWithIngredients, createRecipe, updateRecipe, deleteRecipe } = useRecipes({
    autoLoad: false,
  })

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [recipe, setRecipe] = useState<RecipeEditorData>(blankRecipe())
  const [loadedRecipe, setLoadedRecipe] = useState<RecipeRecord | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const storageKey = `zrecipe:recipe-draft:${recipeId}`

  useEffect(() => {
    if (isNew) {
      const rawDraft =
        typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
      if (rawDraft) {
        try {
          const parsed = JSON.parse(rawDraft) as RecipeEditorData
          setRecipe({
            ...blankRecipe(),
            ...parsed,
            instructions:
              parsed.instructions?.length > 0 ? parsed.instructions : [createStep()],
            ingredients:
              parsed.ingredients?.map((item) => createIngredientLine(item)) ?? [],
          })
          setImagePreview(parsed.imageUrl)
        } catch {
          setRecipe(blankRecipe())
        }
      }
      setLoading(false)
      return
    }

    const loadRecipe = async () => {
      try {
        setLoading(true)
        setError(null)
        const existing = await getRecipeWithIngredients(recipeId)
        if (!existing) {
          setError('Recipe not found.')
          return
        }
        setLoadedRecipe(existing)
        setRecipe(mapRecipeToState(existing))
        setImagePreview(existing.imageUrl)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load recipe')
      } finally {
        setLoading(false)
      }
    }

    loadRecipe()
  }, [getRecipeWithIngredients, isNew, recipeId, storageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handle = window.setInterval(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(recipe))
    }, 30000)
    return () => window.clearInterval(handle)
  }, [recipe, storageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, JSON.stringify(recipe))
  }, [recipe, storageKey])

  const computedIngredients = useMemo(
    () =>
      recipe.ingredients.map((item) => ({
        ...item,
        lineCost: calculateLineCost(item),
      })),
    [recipe.ingredients]
  )

  const cost = useMemo(
    () =>
      calculateRecipeCost(
        computedIngredients,
        recipe.laborCost,
        recipe.overheadCost,
        recipe.sellingPrice
      ),
    [computedIngredients, recipe.laborCost, recipe.overheadCost, recipe.sellingPrice]
  )

  const currentRecipeRecord = useMemo(
    () =>
      toRecipeRecord(
        { ...recipe, ingredients: computedIngredients },
        loadedRecipe?.id ?? recipeId,
        loadedRecipe?.tenantId ?? 'draft',
        loadedRecipe?.createdAt ?? new Date().toISOString(),
        new Date().toISOString()
      ),
    [computedIngredients, loadedRecipe, recipe, recipeId]
  )

  const updateRecipeField = <K extends keyof RecipeEditorData>(
    field: K,
    value: RecipeEditorData[K]
  ) => {
    setRecipe((current) => ({ ...current, [field]: value }))
  }

  const updateIngredient = (id: string, patch: Partial<RecipeIngredientDraft>) => {
    setRecipe((current) => ({
      ...current,
      ingredients: current.ingredients.map((item) =>
        item.id === id
          ? createIngredientLine({
              ...item,
              ...patch,
              lineCost: 0,
            })
          : item
      ),
    }))
  }

  const updateStep = (id: string, text: string) => {
    setRecipe((current) => ({
      ...current,
      instructions: current.instructions.map((step) =>
        step.id === id ? { ...step, text } : step
      ),
    }))
  }

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploadingImage(true)
    try {
      const supabase = createClient()
      const path = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`
      const { error } = await supabase.storage.from('recipe-images').upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from('recipe-images').getPublicUrl(path)
      const url = data.publicUrl
      setImagePreview(url)
      updateRecipeField('imageUrl', url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image upload failed')
    } finally {
      setUploadingImage(false)
    }
  }

  const { getRootProps, getInputProps, open: openFilePicker } = useDropzone({
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
    },
    multiple: false,
    noClick: true,
    noKeyboard: true,
    onDrop: async (files) => {
      const file = files[0]
      if (file) {
        await uploadImage(file)
      }
    },
  })

  const addInstruction = () => {
    setRecipe((current) => ({
      ...current,
      instructions: [...current.instructions, createStep()],
    }))
  }

  const removeInstruction = (id: string) => {
    setRecipe((current) => ({
      ...current,
      instructions:
        current.instructions.length > 1
          ? current.instructions.filter((step) => step.id !== id)
          : current.instructions,
    }))
  }

  const addIngredient = async (
    ingredient: IngredientLookup,
    quantity: number,
    unit: string
  ) => {
    const nextLine = createIngredientLine({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      quantity,
      unit,
      currentPrice: ingredient.currentPrice ?? null,
      priceUnit: ingredient.priceUnit ?? unit,
    })

    setRecipe((current) => ({
      ...current,
      ingredients: [...current.ingredients, nextLine],
    }))
  }

  const createIngredient = async (name: string, quantity: number, unit: string) => {
    try {
      const supabase = createClient()
      const tenantId = await resolveTenantId()
      const { data, error } = await supabase
        .from('ingredients')
        .insert({
          tenant_id: tenantId,
          name,
          current_price: 0,
          price_unit: unit,
        })
        .select('id, name, current_price, price_unit')
        .single()

      if (error || !data) {
        throw error ?? new Error('Unable to create ingredient')
      }

      await addIngredient(
        {
          id: data.id,
          name: data.name,
          currentPrice: data.current_price ?? 0,
          priceUnit: data.price_unit ?? unit,
        },
        quantity,
        unit
      )

      toast.success(`Created ${name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to create ingredient')
    }
  }

  const removeIngredient = (id: string) => {
    setRecipe((current) => ({
      ...current,
      ingredients: current.ingredients.filter((item) => item.id !== id),
    }))
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      const payload: RecipeEditorData = {
        ...recipe,
        ingredients: computedIngredients.map((item) => ({
          ...item,
          lineCost: calculateLineCost(item),
        })),
      }

      const saved = isNew
        ? await createRecipe(payload)
        : await updateRecipe(recipeId, payload)

      setLoadedRecipe(saved)
      setRecipe(mapRecipeToState(saved))
      setImagePreview(saved.imageUrl)
      window.localStorage.removeItem(storageKey)
      toast.success('Recipe saved')

      if (isNew) {
        router.replace(`/recipes/${saved.id}`)
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save recipe')
      toast.error(saveError instanceof Error ? saveError.message : 'Unable to save recipe')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (isNew) return

    try {
      setDeleteBusy(true)
      await deleteRecipe(recipeId)
      window.localStorage.removeItem(storageKey)
      toast.success('Recipe deleted')
      router.push('/recipes')
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Unable to delete recipe')
    } finally {
      setDeleteBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-56 animate-pulse rounded-full bg-slate-100" />
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="h-[42rem] animate-pulse rounded-3xl bg-slate-100" />
          <div className="h-[42rem] animate-pulse rounded-3xl bg-slate-100" />
        </div>
      </div>
    )
  }

  if (error && !recipe) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push('/recipes')}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <input
            value={recipe.name}
            onChange={(event) => updateRecipeField('name', event.target.value)}
            placeholder="Recipe name"
            className="min-w-[220px] rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          {!isNew && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteBusy}
              className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div
              {...getRootProps()}
              className={cn(
                'group flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-slate-50 p-5 text-center transition',
                isDragging
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50'
              )}
              onDragEnter={() => setIsDragging(true)}
              onDragLeave={() => setIsDragging(false)}
              onDropCapture={() => setIsDragging(false)}
            >
              <input {...getInputProps()} />
              {imagePreview ? (
                <div className="relative h-56 w-full overflow-hidden rounded-2xl">
                  <Image
                    src={imagePreview}
                    alt={recipe.name || 'Recipe image'}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/30 to-transparent" />
                </div>
              ) : (
                <>
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                    <UploadCloud className="h-10 w-10 text-emerald-600" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-900">
                    Photo upload
                  </h2>
                  <p className="mt-2 max-w-md text-sm text-slate-500">
                    Drop a recipe image here or click to upload a hero photo for the card and PDF.
                  </p>
                </>
              )}

              <button
                type="button"
                onClick={openFilePicker}
                className="mt-5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                {uploadingImage ? 'Uploading...' : 'Choose photo'}
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Recipe Details
            </h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Category</span>
                <select
                  value={recipe.category}
                  onChange={(event) => updateRecipeField('category', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                >
                  {RECIPE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Yield Qty
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={recipe.yieldQuantity}
                    onChange={(event) =>
                      updateRecipeField(
                        'yieldQuantity',
                        Number.parseFloat(event.target.value || '0')
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Yield Unit
                  </span>
                  <select
                    value={recipe.yieldUnit}
                    onChange={(event) => updateRecipeField('yieldUnit', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  >
                    {RECIPE_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Description
                </span>
                <textarea
                  value={recipe.description}
                  onChange={(event) => updateRecipeField('description', event.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  placeholder="Short description for the recipe"
                />
              </label>

              <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Prep (min)
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={recipe.prepTimeMinutes}
                    onChange={(event) =>
                      updateRecipeField(
                        'prepTimeMinutes',
                        Number.parseInt(event.target.value || '0', 10)
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Cook (min)
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={recipe.cookTimeMinutes}
                    onChange={(event) =>
                      updateRecipeField(
                        'cookTimeMinutes',
                        Number.parseInt(event.target.value || '0', 10)
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Selling Price
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={recipe.sellingPrice}
                    onChange={(event) =>
                      updateRecipeField(
                        'sellingPrice',
                        Number.parseFloat(event.target.value || '0')
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Instructions
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Drag to reorder the steps and keep the workflow clear.
                </p>
              </div>
              <button
                type="button"
                onClick={addInstruction}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                Add step
              </button>
            </div>

            <Reorder.Group
              axis="y"
              values={recipe.instructions}
              onReorder={(steps) => updateRecipeField('instructions', steps)}
              className="mt-4 space-y-3"
            >
              {recipe.instructions.map((step, index) => (
                <Reorder.Item
                  key={step.id}
                  value={step}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-2 text-slate-400">
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Step {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeInstruction(step.id)}
                          className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-red-600"
                          aria-label="Delete step"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <textarea
                        value={step.text}
                        onChange={(event) => updateStep(step.id, event.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                        placeholder="Describe this step"
                      />
                    </div>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <IngredientSearch
              onAddIngredient={addIngredient}
              onCreateIngredient={createIngredient}
            />

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Added ingredients</h3>
              </div>

              {computedIngredients.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  Search and add ingredients to start building the recipe.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Ingredient</th>
                        <th className="px-4 py-3 font-semibold">Qty</th>
                        <th className="px-4 py-3 font-semibold">Unit</th>
                        <th className="px-4 py-3 font-semibold">Cost</th>
                        <th className="px-4 py-3 font-semibold" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {computedIngredients.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {item.ingredientName}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={item.quantity}
                              onChange={(event) =>
                                updateIngredient(item.id, {
                                  quantity: Number.parseFloat(event.target.value || '0'),
                                })
                              }
                              className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 outline-none transition focus:border-emerald-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.unit}
                              onChange={(event) =>
                                updateIngredient(item.id, {
                                  unit: event.target.value,
                                })
                              }
                              className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none transition focus:border-emerald-500"
                            >
                              {RECIPE_UNITS.map((unit) => (
                                <option key={unit} value={unit}>
                                  {unit}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            €{calculateLineCost(item).toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => removeIngredient(item.id)}
                              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-600"
                              aria-label="Remove ingredient"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <CostBreakdown
            cost={cost}
            onLaborCostChange={(value) => updateRecipeField('laborCost', value)}
            onOverheadCostChange={(value) => updateRecipeField('overheadCost', value)}
            onSellingPriceChange={(value) => updateRecipeField('sellingPrice', value)}
          />
        </div>
      </div>

      <PrintOptionsModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        recipe={currentRecipeRecord}
      />
    </div>
  )
}
