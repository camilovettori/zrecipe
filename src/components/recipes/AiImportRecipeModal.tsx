'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import {
  AlertTriangle,
  CheckCircle,
  FileText,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { bytesToSize, extractPdfText, fileTypeFromName } from '@/lib/invoices-client'
import { compressImage } from '@/lib/utils/image-compress'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

type FileKind = 'pdf' | 'image' | 'csv'

type IngredientOption = {
  id: string
  name: string
  brand: string | null
  current_price: number | null
  price_unit: string | null
}

type ImportRow = {
  id: string
  name: string
  brand: string
  quantity: number
  unit: string
  status: 'matched' | 'new' | 'review'
  match: IngredientOption | null
}

export type ImportedRecipePayload = {
  name: string
  brand: string | null
  prepTimeMinutes: number
  cookTimeMinutes: number
  yieldQuantity: number
  yieldUnit: string
  ingredients: Array<{
    id: string
    ingredientId: string
    ingredientName: string
    ingredientBrand: string | null
    quantity: number
    unit: string
    currentPrice: number | null
    priceUnit: string | null
    isNew: boolean
  }>
}

type ExtractedRecipeResponse = {
  error?: string
  limitReached?: boolean
  recipe_name?: string | null
  brand?: string | null
  prep_time_minutes?: number | null
  cook_time_minutes?: number | null
  yield_quantity?: number | null
  yield_unit?: string | null
  ingredients?: Array<{ name?: string | null; brand?: string | null; quantity?: number | null; unit?: string | null }>
}

interface AiImportRecipeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (payload: ImportedRecipePayload) => void
}

const UNIT_OPTIONS = ['g', 'kg', 'ml', 'L', 'unit', 'tsp', 'tbsp', 'cup', 'dozen']

function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const INGREDIENT_NAME_ALIASES: Record<string, string> = {
  'all purpose flour': 'plain flour',
  'all purpose wheat flour': 'plain flour',
  'baking soda': 'bicarbonate of soda',
  'confectioners sugar': 'icing sugar',
  'confectioner sugar': 'icing sugar',
  'full cream milk': 'whole milk',
  'full fat milk': 'whole milk',
  'powdered sugar': 'icing sugar',
  'sodium bicarbonate': 'bicarbonate of soda',
  'superfine sugar': 'caster sugar',
}

function canonicalIngredientName(value: string) {
  const normalized = normalizeName(value)
  return INGREDIENT_NAME_ALIASES[normalized] ?? normalized
}

function findIngredientMatch(name: string, brand: string, options: IngredientOption[]) {
  const canonicalName = canonicalIngredientName(name)
  const sameName = options.filter((option) => canonicalIngredientName(option.name) === canonicalName)
  const normalizedBrand = normalizeName(brand)
  if (normalizedBrand) {
    const sameBrand = sameName.find((option) => normalizeName(option.brand ?? '') === normalizedBrand)
    if (sameBrand) return sameBrand
  }
  return sameName.length === 1 ? sameName[0] : undefined
}

function normalizeUnit(value: string | null | undefined) {
  const lower = (value ?? '').trim().toLowerCase()
  if (!lower) return 'unit'
  if (['gram', 'grams', 'gr', 'g.'].includes(lower)) return 'g'
  if (['kilogram', 'kilograms', 'kgs', 'kg.'].includes(lower)) return 'kg'
  if (['milliliter', 'milliliters', 'millilitre', 'millilitres', 'ml.'].includes(lower)) return 'ml'
  if (['liter', 'liters', 'litre', 'litres', 'l'].includes(lower)) return 'L'
  if (['tablespoon', 'tablespoons', 'tbsp.'].includes(lower)) return 'tbsp'
  if (['teaspoon', 'teaspoons', 'tsp.'].includes(lower)) return 'tsp'
  if (['units', 'each', 'ea'].includes(lower)) return 'unit'
  return value?.trim() || 'unit'
}

function imageFileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(new Error('Could not read image file'))
    reader.readAsDataURL(file)
  })
}

function matchRows(
  ingredients: ExtractedRecipeResponse['ingredients'],
  options: IngredientOption[]
): ImportRow[] {
  return (ingredients ?? []).map((item) => {
    const name = String(item.name ?? '').trim()
    const brand = String(item.brand ?? '').trim()
    const exact = findIngredientMatch(name, brand, options)
    return {
      id: crypto.randomUUID(),
      name,
      brand: exact?.brand ?? brand,
      quantity: item.quantity && item.quantity > 0 ? Number(item.quantity) : 1,
      unit: normalizeUnit(item.unit),
      status: exact ? 'matched' : name.includes('?') || !name ? 'review' : 'new',
      match: exact ?? null,
    }
  })
}

export default function AiImportRecipeModal({ open, onOpenChange, onImported }: AiImportRecipeModalProps) {
  const [step, setStep] = useState<'upload' | 'review'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recipeName, setRecipeName] = useState('')
  const [brand, setBrand] = useState<string | null>(null)
  const [prepTime, setPrepTime] = useState(0)
  const [cookTime, setCookTime] = useState(0)
  const [yieldQty, setYieldQty] = useState(1)
  const [yieldUnit, setYieldUnit] = useState('portion')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([])
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [matchQuery, setMatchQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const loadIngredients = async () => {
      try {
        const supabase = createClient()
        const tenantId = await resolveTenantId()
        const { data, error: loadError } = await supabase
          .from('ingredients')
          .select('id, name, brand, current_price, price_unit')
          .eq('tenant_id', tenantId)
          .order('name')

        if (loadError) throw loadError
        setIngredientOptions((data ?? []) as IngredientOption[])
      } catch (err) {
        console.error('[ai recipe import] ingredient lookup failed', err)
      }
    }
    loadIngredients()
  }, [open])

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    }
  }, [filePreviewUrl])

  const reset = useCallback(() => {
    setStep('upload')
    setFile(null)
    setFilePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setCsvPreview(null)
    setExtracting(false)
    setSaving(false)
    setError(null)
    setRecipeName('')
    setBrand(null)
    setPrepTime(0)
    setCookTime(0)
    setYieldQty(1)
    setYieldUnit('portion')
    setRows([])
    setEditingMatchId(null)
    setMatchQuery('')
  }, [])

  const closeModal = useCallback(() => {
    reset()
    onOpenChange(false)
  }, [onOpenChange, reset])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const onDrop = useCallback((accepted: File[]) => {
    const next = accepted[0]
    if (!next) return
    reset()
    setFile(next)
    const kind = fileTypeFromName(next) as FileKind
    if (kind === 'image' || kind === 'pdf') setFilePreviewUrl(URL.createObjectURL(next))
    if (kind === 'csv') {
      next.text().then((text) => {
        const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
        setCsvPreview({ headers: parsed.meta.fields ?? [], rows: (parsed.data ?? []).slice(0, 20) })
      })
    }
  }, [reset])

  const { getRootProps, getInputProps, isDragActive, open: openPicker } = useDropzone({
    onDrop,
    multiple: false,
    noClick: true,
    accept: {
      'application/pdf': ['.pdf'],
      'text/csv': ['.csv'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
    },
  })

  const fileKind = file ? (fileTypeFromName(file) as FileKind) : null
  const matchedCount = rows.filter((row) => row.status === 'matched').length
  const newCount = rows.filter((row) => row.status === 'new').length
  const reviewCount = rows.filter((row) => row.status === 'review').length
  const canSave = recipeName.trim().length > 0 && rows.length > 0 && rows.every((row) => row.name.trim() && row.quantity > 0)

  const matchOptions = useMemo(() => {
    const query = normalizeName(matchQuery)
    if (!query) return ingredientOptions.slice(0, 8)
    return ingredientOptions
      .filter((option) => normalizeName(option.name).includes(query))
      .slice(0, 8)
  }, [ingredientOptions, matchQuery])

  const updateRow = (id: string, patch: Partial<ImportRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const handleExtract = async () => {
    if (!file || !fileKind) return
    setExtracting(true)
    setError(null)

    try {
      let body: Record<string, unknown> = { kind: fileKind, fileName: file.name }
      if (fileKind === 'pdf') {
        const text = await extractPdfText(file)
        body = { ...body, text }
      } else if (fileKind === 'csv') {
        body = { ...body, csv: await file.text() }
      } else {
        const compressed = await compressImage(file, 1400, 0.85)
        body = {
          ...body,
          imageBase64: await imageFileToBase64(compressed),
          mimeType: compressed.type || 'image/jpeg',
        }
      }

      const response = await fetch('/api/recipes/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await response.json().catch(() => ({}))) as ExtractedRecipeResponse

      if (!response.ok) {
        throw new Error(data.error ?? 'Could not extract this recipe')
      }

      setRecipeName(data.recipe_name?.trim() || file.name.replace(/\.[^.]+$/, ''))
      setBrand(data.brand ?? null)
      setPrepTime(data.prep_time_minutes ?? 0)
      setCookTime(data.cook_time_minutes ?? 0)
      setYieldQty(data.yield_quantity && data.yield_quantity > 0 ? data.yield_quantity : 1)
      setYieldUnit(data.yield_unit || 'portion')
      setRows(matchRows(data.ingredients, ingredientOptions))
      setStep('review')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not extract this recipe'
      setError(message)
    } finally {
      setExtracting(false)
    }
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const tenantId = await resolveTenantId()
      const importedIngredients: ImportedRecipePayload['ingredients'] = []
      let createdCount = 0

      for (const row of rows) {
        let ingredient = row.match
        let isNew = false

        if (!ingredient) {
          const { data, error: insertError } = await supabase
            .from('ingredients')
            .insert({
              tenant_id: tenantId,
              name: row.name.trim(),
              brand: row.brand.trim() || null,
              category: 'Other',
              current_price: null,
              price_unit: null,
              package_size: null,
              package_unit: null,
            })
            .select('id, name, brand, current_price, price_unit')
            .single()

          if (insertError) throw insertError
          ingredient = data as IngredientOption
          isNew = true
          createdCount += 1
        }

        importedIngredients.push({
          id: crypto.randomUUID(),
          ingredientId: ingredient.id,
          ingredientName: row.name.trim(),
          ingredientBrand: ingredient.brand ?? (row.brand.trim() || null),
          quantity: row.quantity,
          unit: normalizeUnit(row.unit),
          currentPrice: ingredient.current_price ?? null,
          priceUnit: ingredient.price_unit ?? null,
          isNew,
        })
      }

      onImported({
        name: recipeName.trim(),
        brand,
        prepTimeMinutes: prepTime,
        cookTimeMinutes: cookTime,
        yieldQuantity: yieldQty,
        yieldUnit,
        ingredients: importedIngredients,
      })
      toast('Recipe imported', {
        description: `${importedIngredients.length} ingredients added${createdCount ? `, ${createdCount} new to price later` : ''}.`,
      })
      closeModal()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add this recipe'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (next) onOpenChange(true)
      else closeModal()
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[96vh] flex-col rounded-t-3xl bg-white shadow-2xl outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(96vw,1280px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50">
                <Sparkles className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-bold text-slate-950">Import recipe by AI</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-slate-500">
                  Upload a recipe photo, PDF, or CSV. Review everything before adding it to this recipe.
                </Dialog.Description>
              </div>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-5 sm:px-6">
            {step === 'upload' ? (
              <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                <div
                  {...getRootProps()}
                  className={cn(
                    'flex min-h-[360px] flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-slate-50 p-8 text-center transition',
                    isDragActive ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300'
                  )}
                >
                  <input {...getInputProps()} />
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white shadow-sm">
                    <UploadCloud className="h-8 w-8 text-emerald-500" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-950">Drop your recipe file here</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                    Supports PDF, camera photos, screenshots, and CSV ingredient lists. Photos are compressed before extraction.
                  </p>
                  <button
                    type="button"
                    onClick={openPicker}
                    className="mt-5 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                  >
                    Choose file
                  </button>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Selected file</p>
                  {file ? (
                    <div className="mt-4 space-y-4">
                      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
                          {fileKind === 'image' ? <ImageIcon className="h-5 w-5 text-emerald-500" /> : <FileText className="h-5 w-5 text-emerald-500" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                          <p className="text-xs text-slate-400">{bytesToSize(file.size)} · {fileKind?.toUpperCase()}</p>
                        </div>
                      </div>

                      {error && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          {error}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleExtract}
                        disabled={extracting}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {extracting ? 'Extracting recipe...' : 'Extract recipe'}
                      </button>
                      <p className="text-xs leading-relaxed text-slate-400">
                        Your file is sent to Claude only for recipe extraction. You will confirm matches and new ingredients before anything is added.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-14 text-center">
                      <Sparkles className="mx-auto h-8 w-8 text-slate-200" />
                      <p className="mt-2 text-sm text-slate-400">Choose a file to begin.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(430px,0.8fr)]">
                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="grid gap-3 sm:grid-cols-5">
                      <label className="sm:col-span-2">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Recipe name</span>
                        <input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400" />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Prep min</span>
                        <input type="number" value={prepTime || ''} onChange={(e) => setPrepTime(Number(e.target.value) || 0)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400" />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Cook min</span>
                        <input type="number" value={cookTime || ''} onChange={(e) => setCookTime(Number(e.target.value) || 0)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400" />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Yield</span>
                        <div className="flex gap-2">
                          <input type="number" value={yieldQty || ''} onChange={(e) => setYieldQty(Number(e.target.value) || 1)} className="w-20 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400" />
                          <input value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400" />
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                      <div>
                        <p className="text-sm font-bold text-slate-900">Ingredient review</p>
                        <p className="text-xs text-slate-500">Match existing ingredients or create new price-less ingredients to complete later.</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{matchedCount} matched</span>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{newCount} new</span>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{reviewCount} review</span>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {rows.map((row, index) => (
                        <div
                          key={row.id}
                          className={cn(
                            'relative grid gap-2 px-4 py-3 sm:grid-cols-[1fr_88px_100px_104px_36px] sm:items-center',
                            index % 2 === 1 && 'bg-slate-50/45'
                          )}
                        >
                          <div className="space-y-1.5">
                            <input
                              value={row.name}
                              onChange={(e) => updateRow(row.id, { name: e.target.value, match: null, status: e.target.value.includes('?') ? 'review' : 'new' })}
                              className={cn(
                                'w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-4',
                                row.status === 'matched'
                                  ? 'border-emerald-300 bg-emerald-50/60 focus:border-emerald-500 focus:ring-emerald-500/10'
                                  : 'border-amber-300 bg-amber-50/40 focus:border-amber-400 focus:ring-amber-400/10'
                              )}
                            />
                            <input
                              value={row.brand}
                              onChange={(e) => updateRow(row.id, { brand: e.target.value })}
                              placeholder="Brand (optional)"
                              className="h-7 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10"
                            />
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={row.quantity || ''}
                            onChange={(e) => updateRow(row.id, { quantity: Number(e.target.value) || 0 })}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-right text-sm outline-none transition focus:border-emerald-400"
                          />
                          <select
                            value={row.unit}
                            onChange={(e) => updateRow(row.id, { unit: e.target.value })}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-400"
                          >
                            {UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMatchId(editingMatchId === row.id ? null : row.id)
                              setMatchQuery(row.name)
                            }}
                            className={cn(
                              'inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition',
                              row.status === 'matched' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            )}
                          >
                            {row.status === 'matched' ? <CheckCircle className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                            {row.status === 'matched' ? 'Matched' : row.status === 'review' ? 'Review' : 'New'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                            className="rounded-xl p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>

                          {editingMatchId === row.id && (
                            <div className="absolute left-4 right-4 top-full z-20 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:left-auto sm:right-20 sm:w-80">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
                                <input
                                  value={matchQuery}
                                  onChange={(e) => setMatchQuery(e.target.value)}
                                  placeholder="Search ingredient library..."
                                  className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-400"
                                />
                              </div>
                              <div className="mt-2 max-h-56 overflow-y-auto">
                                {matchOptions.map((option) => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => {
                                      updateRow(row.id, { match: option, brand: option.brand ?? row.brand, status: 'matched' })
                                      setEditingMatchId(null)
                                    }}
                                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition hover:bg-emerald-50"
                                  >
                                    <span className="min-w-0">
                                      <span className="block truncate font-medium text-slate-800">{option.name}</span>
                                      {option.brand && <span className="block truncate text-xs text-slate-400">{option.brand}</span>}
                                    </span>
                                    <span className="text-xs text-slate-400">{option.current_price != null ? `€${option.current_price}/${option.price_unit ?? 'unit'}` : 'no price'}</span>
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateRow(row.id, { match: null, status: 'new' })
                                    setEditingMatchId(null)
                                  }}
                                  className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                                >
                                  <Plus className="h-4 w-4" />
                                  Create new ingredient
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setRows((current) => [...current, { id: crypto.randomUUID(), name: '', brand: '', quantity: 1, unit: 'g', status: 'review', match: null }])}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <Plus className="h-4 w-4" />
                        Add ingredient row
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 xl:sticky xl:top-0 xl:self-start">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Source preview</p>
                        <p className="mt-1 text-xs text-slate-500">Compare the extracted details with the original file.</p>
                      </div>
                      {filePreviewUrl && (
                        <a
                          href={filePreviewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                          Open full size
                        </a>
                      )}
                    </div>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                      {fileKind === 'image' && filePreviewUrl && (
                        // Blob previews are user-selected local files, so next/image optimisation is not useful here.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={filePreviewUrl} alt="Recipe preview" className="h-[560px] w-full object-contain" />
                      )}
                      {fileKind === 'pdf' && filePreviewUrl && <iframe src={filePreviewUrl} title="Recipe PDF preview" className="h-[560px] w-full" />}
                      {fileKind === 'csv' && csvPreview && (
                        <div className="max-h-[560px] overflow-auto p-3 text-xs">
                          <table className="w-full">
                            <thead>
                              <tr>{csvPreview.headers.map((header) => <th key={header} className="whitespace-nowrap px-2 py-1 text-left font-bold text-slate-500">{header}</th>)}</tr>
                            </thead>
                            <tbody>
                              {csvPreview.rows.map((row, idx) => (
                                <tr key={idx}>{csvPreview.headers.map((header) => <td key={header} className="border-t border-slate-200 px-2 py-1 text-slate-600">{row[header]}</td>)}</tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm font-bold text-slate-900">Ready check</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Recipe</span><span className="font-semibold text-slate-800">{recipeName || 'Missing'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Ingredients</span><span className="font-semibold text-slate-800">{rows.length}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Yield</span><span className="font-semibold text-slate-800">{yieldQty} {yieldUnit}</span></div>
                    </div>
                    {reviewCount > 0 && (
                      <div className="mt-4 flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Review highlighted rows before adding this recipe.
                      </div>
                    )}
                    {error && (
                      <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            {step === 'review' && (
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave || saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add to recipe
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
