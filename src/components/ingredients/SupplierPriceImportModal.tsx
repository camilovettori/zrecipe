'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDropzone } from 'react-dropzone'
import { AlertTriangle, Check, CircleCheck, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Search, UploadCloud, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { compressImage } from '@/lib/utils/image-compress'
import { calculateNormalizedIngredientPrice, formatIngredientMoney, getDefaultIngredientPriceUnit, hasMeaningfulPriceChange } from '@/lib/utils/ingredient-pricing'
import type { IngredientRow } from '@/hooks/useIngredients'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { scoreIngredientMatch } from '@/lib/invoices'

type ExtractedImportRow = {
  id: string
  selected: boolean
  ingredientName: string
  productCode: string
  brand: string
  category: string
  supplier: string
  packagePrice: string
  packageQuantity: string
  packageUnit: string
  priceUnit: string
  notes: string
  allergenIds: number[]
  matchStatus: 'new' | 'update' | 'duplicate' | 'review'
  matchedIngredientId: string | null
  calculatedUnitPrice: number | null
}

interface SupplierPriceImportModalProps {
  open: boolean
  onClose: () => void
  ingredients: IngredientRow[]
}

type SupplierLookup = { id: string; name: string }

function normalizeString(value: string) {
  return value.trim().toLowerCase()
}

function mapMatchStatus(
  ingredientName: string,
  ingredients: IngredientRow[]
): { matchStatus: ExtractedImportRow['matchStatus']; matchedIngredientId: string | null } {
  const exact = ingredients.find((item) => normalizeString(item.name) === normalizeString(ingredientName))
  if (exact) return { matchStatus: 'update', matchedIngredientId: exact.id }

  const scores = ingredients
    .map((item) => ({ item, score: scoreIngredientMatch(ingredientName, item.name) }))
    .sort((a, b) => b.score - a.score)

  if (scores[0] && scores[0].score >= 80) {
    return { matchStatus: 'duplicate', matchedIngredientId: scores[0].item.id }
  }

  return { matchStatus: 'new', matchedIngredientId: null }
}

function buildRow(row: Partial<ExtractedImportRow> & { ingredientName: string }, ingredients: IngredientRow[]): ExtractedImportRow {
  const packagePrice = row.packagePrice ?? ''
  const packageQuantity = row.packageQuantity ?? ''
  const packageUnit = row.packageUnit ?? ''
  const priceUnit = row.priceUnit || getDefaultIngredientPriceUnit(packageUnit)
  const normalized = calculateNormalizedIngredientPrice({
    packagePrice: packagePrice === '' ? null : Number(packagePrice),
    packageQuantity: packageQuantity === '' ? null : Number(packageQuantity),
    packageUnit,
    priceUnit,
  })

  const match = mapMatchStatus(row.ingredientName, ingredients)

  return {
    id: row.id ?? crypto.randomUUID(),
    selected: row.selected ?? true,
    ingredientName: row.ingredientName,
    productCode: row.productCode ?? '',
    brand: row.brand ?? '',
    category: row.category ?? '',
    supplier: row.supplier ?? '',
    packagePrice: packagePrice.toString(),
    packageQuantity: packageQuantity.toString(),
    packageUnit,
    priceUnit,
    notes: row.notes ?? '',
    allergenIds: row.allergenIds ?? [],
    matchStatus: normalized.isValid ? match.matchStatus : 'review',
    matchedIngredientId: match.matchedIngredientId,
    calculatedUnitPrice: normalized.normalizedPrice,
  }
}

export default function SupplierPriceImportModal({ open, onClose, ingredients }: SupplierPriceImportModalProps) {
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [loading, setLoading] = useState(false)
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)
  const [tenantName, setTenantName] = useState('')
  const [suppliers, setSuppliers] = useState<SupplierLookup[]>([])
  const [rows, setRows] = useState<ExtractedImportRow[]>([])
  const [textInput, setTextInput] = useState('')
  const [fileName, setFileName] = useState('')
  const [selectedFileKind, setSelectedFileKind] = useState<'csv' | 'pdf' | 'image' | null>(null)

  useEffect(() => {
    if (!open) return
    const load = async () => {
      setLoadingSuppliers(true)
      try {
        const supabase = createClient()
        const tenantId = await resolveTenantId()
        const [{ data: supplierData }, { data: tenantData }] = await Promise.all([
          supabase.from('suppliers').select('id, name').eq('tenant_id', tenantId).order('name'),
          supabase.from('tenants').select('name').single(),
        ])
        setSuppliers((supplierData ?? []) as SupplierLookup[])
        setTenantName((tenantData as { name?: string | null } | null)?.name ?? '')
      } catch {
        // best effort
      } finally {
        setLoadingSuppliers(false)
      }
    }
    void load()
  }, [open])

  useEffect(() => {
    if (!open) {
      setRows([])
      setTextInput('')
      setFileName('')
      setSelectedFileKind(null)
      setMode('file')
    }
  }, [open])

  const selectedCount = rows.filter((r) => r.selected).length
  const newCount = rows.filter((r) => r.matchStatus === 'new').length
  const updateCount = rows.filter((r) => r.matchStatus === 'update').length
  const needsReviewCount = rows.filter((r) => r.matchStatus === 'review' || r.matchStatus === 'duplicate').length

  const updateRow = (id: string, patch: Partial<ExtractedImportRow>) => {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row
        const next = { ...row, ...patch }
        const normalized = calculateNormalizedIngredientPrice({
          packagePrice: next.packagePrice === '' ? null : Number(next.packagePrice),
          packageQuantity: next.packageQuantity === '' ? null : Number(next.packageQuantity),
          packageUnit: next.packageUnit,
          priceUnit: next.priceUnit || getDefaultIngredientPriceUnit(next.packageUnit),
        })
        const match = mapMatchStatus(next.ingredientName, ingredients)
        return {
          ...next,
          matchStatus: normalized.isValid ? match.matchStatus : 'review',
          matchedIngredientId: match.matchedIngredientId,
          calculatedUnitPrice: normalized.normalizedPrice,
          priceUnit: next.priceUnit || getDefaultIngredientPriceUnit(next.packageUnit),
        }
      })
    )
  }

  const loadParsedRows = (payload: {
    supplier_name?: string | null
    items?: Array<{
      ingredient_name?: string
      product_code?: string | null
      brand?: string | null
      category?: string | null
      supplier?: string | null
      package_price?: number | null
      package_quantity?: number | null
      package_unit?: string | null
      price_unit?: string | null
      needs_review?: boolean
      notes?: string | null
      allergen_ids?: number[]
    }>
  }) => {
    const supplierFallback = payload.supplier_name ?? ''
    const nextRows = (payload.items ?? []).map((item) => {
      const ingredientName = item.ingredient_name ?? ''
      const baseRow = buildRow(
        {
          ingredientName,
          productCode: item.product_code ?? '',
          brand: item.brand ?? '',
          category: item.category ?? '',
          supplier: item.supplier ?? supplierFallback,
          packagePrice: item.package_price?.toString() ?? '',
          packageQuantity: item.package_quantity?.toString() ?? '',
          packageUnit: item.package_unit ?? '',
          priceUnit: item.price_unit ?? '',
          notes: item.notes ?? '',
          allergenIds: item.allergen_ids ?? [],
        },
        ingredients
      )

      return {
        ...baseRow,
        selected: true,
        matchStatus: item.needs_review ? 'review' : baseRow.matchStatus,
      }
    })
    setRows(nextRows)
  }

  const extractFromFile = async (file: File) => {
    setLoading(true)
    setFileName(file.name)
    try {
      if (file.type.includes('csv') || file.name.toLowerCase().endsWith('.csv')) {
        const csv = await file.text()
        const response = await fetch('/api/ingredients/supplier-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'csv', csv, fileName: file.name }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error ?? 'Unable to parse CSV')
        loadParsedRows(payload)
        setSelectedFileKind('csv')
        return
      }

      if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        const parts: string[] = []
        for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
          const page = await pdf.getPage(pageIndex)
          const content = await page.getTextContent()
          const text = content.items
            .map((item) => (item as { str?: string }).str ?? '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
          if (text) parts.push(text)
        }
        const text = parts.join('\n')
        const response = await fetch('/api/ingredients/supplier-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'text', text, fileName: file.name }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error ?? 'Unable to parse PDF')
        loadParsedRows(payload)
        setSelectedFileKind('pdf')
        return
      }

      if (file.type.startsWith('image/')) {
        const compressed = await compressImage(file, 1400, 0.85)
        const reader = new FileReader()
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result
            if (typeof result === 'string') {
              resolve(result.split(',')[1] ?? '')
            } else {
              reject(new Error('Failed to read image'))
            }
          }
          reader.onerror = () => reject(new Error('Failed to read image'))
          reader.readAsDataURL(compressed)
        })

        const response = await fetch('/api/ingredients/supplier-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'image',
            imageBase64: base64,
            mimeType: compressed.type || 'image/jpeg',
            fileName: file.name,
          }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error ?? 'Unable to parse image')
        loadParsedRows(payload)
        setSelectedFileKind('image')
        return
      }

      throw new Error('Unsupported file type')
    } finally {
      setLoading(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive, open: openPicker } = useDropzone({
    onDrop: async (files) => {
      const file = files[0]
      if (!file) return
      try {
        await extractFromFile(file)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to parse file')
      }
    },
    accept: {
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    multiple: false,
    noClick: true,
    noKeyboard: true,
  })

  const parsePastedText = async () => {
    if (!textInput.trim()) return
    setLoading(true)
    try {
      const response = await fetch('/api/ingredients/supplier-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'text', text: textInput, fileName: 'Pasted list' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Unable to parse text')
      loadParsedRows(payload)
      setSelectedFileKind(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to parse text')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    const selectedRows = rows.filter((row) => row.selected)
    if (selectedRows.length === 0) {
      toast.error('Select at least one row to import.')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const tenantId = await resolveTenantId()
      const today = new Date().toISOString().slice(0, 10)

      const supplierMap = new Map(suppliers.map((supplier) => [normalizeString(supplier.name), supplier.id]))

      const skippedRows: string[] = []
      let importedCount = 0

      for (const row of selectedRows) {
        const packagePrice = row.packagePrice.trim() === '' ? null : Number(row.packagePrice)
        const packageQuantity = row.packageQuantity.trim() === '' ? null : Number(row.packageQuantity)
        const priceUnit = row.priceUnit || getDefaultIngredientPriceUnit(row.packageUnit)
        const normalized = calculateNormalizedIngredientPrice({
          packagePrice,
          packageQuantity,
          packageUnit: row.packageUnit,
          priceUnit,
        })

        if (!normalized.isValid || normalized.normalizedPrice == null) {
          // One bad row (e.g. a blank price cell) shouldn't stop the other
          // 76 valid rows from importing — skip it and report it instead.
          skippedRows.push(row.ingredientName || '(unnamed row)')
          continue
        }

        const supplierId = supplierMap.get(normalizeString(row.supplier)) ?? null

        const currentIngredient = row.matchedIngredientId
          ? ingredients.find((item) => item.id === row.matchedIngredientId) ?? null
          : ingredients.find((item) => normalizeString(item.name) === normalizeString(row.ingredientName)) ?? null

        const payload = {
          tenant_id: tenantId,
          name: row.ingredientName,
          brand: row.brand.trim() || null,
          category: row.category.trim() || 'Other',
          current_price: normalized.normalizedPrice,
          price_unit: normalized.normalizedUnit,
          package_size: packageQuantity,
          package_unit: row.packageUnit || null,
          last_purchase_date: today,
          last_supplier_id: supplierId ?? currentIngredient?.last_supplier_id ?? null,
        }

        let ingredientId: string | null = null

        if (currentIngredient) {
          const changed = hasMeaningfulPriceChange(currentIngredient.current_price, normalized.normalizedPrice)
          const { error } = await supabase
            .from('ingredients')
            .update(payload)
            .eq('id', currentIngredient.id)
          if (error) throw error

          ingredientId = currentIngredient.id

          if (changed) {
            await supabase.from('ingredient_price_history').insert({
              ingredient_id: currentIngredient.id,
              tenant_id: tenantId,
              price: normalized.normalizedPrice,
              unit: normalized.normalizedUnit,
              recorded_at: today,
            })
          }
        } else {
          const { data, error } = await supabase
            .from('ingredients')
            .insert(payload)
            .select('id')
            .single()
          if (error) throw error

          ingredientId = data?.id ?? null

          if (data?.id) {
            await supabase.from('ingredient_price_history').insert({
              ingredient_id: data.id,
              tenant_id: tenantId,
              price: normalized.normalizedPrice,
              unit: normalized.normalizedUnit,
              recorded_at: today,
            })
          }
        }

        // Uses the same tenant-scoped browser client as everything else here
        // (never a service-role client — that must stay server-only). RLS on
        // ingredient_allergens already allows this because the ingredient
        // row above was just created/updated under this same tenant.
        if (ingredientId && row.allergenIds.length > 0) {
          const { error: allergenError } = await supabase.from('ingredient_allergens').upsert(
            row.allergenIds.map((allergenId) => ({
              ingredient_id: ingredientId,
              allergen_id: allergenId,
              status: 'contains',
            })),
            { onConflict: 'ingredient_id,allergen_id' }
          )
          if (allergenError) throw allergenError
        }

        importedCount += 1
      }

      if (skippedRows.length > 0) {
        toast.error(
          `Skipped ${skippedRows.length} row${skippedRows.length !== 1 ? 's' : ''} with invalid price: ${skippedRows.slice(0, 3).join(', ')}${skippedRows.length > 3 ? '…' : ''}`
        )
      }

      if (importedCount > 0) {
        toast.success(`Imported ${importedCount} ingredient${importedCount !== 1 ? 's' : ''}`)
        onClose()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to import selected rows')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  // Portaled to document.body — DashboardShell's `.page-fade-in` wrapper
  // (see globals.css) leaves a lingering `transform: translateY(0)` after
  // its entrance animation completes (animation-fill-mode: both), which
  // creates a new containing block for any `position: fixed` descendant.
  // Without the portal, this modal positions relative to that scrolling
  // wrapper instead of the viewport and scrolls off-screen with the page.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Supplier import
                </p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Import supplier price list
                </h2>
                <p className="text-sm text-slate-500">
                  {tenantName ? `${tenantName} · ` : ''}
                  Review the rows before importing into ingredients.
                </p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="w-full shrink-0 border-b border-slate-100 bg-slate-50/60 p-5 lg:w-56 lg:border-b-0 lg:border-r lg:border-slate-100 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setMode('file')}
                className={cn(
                  'flex-1 rounded-xl px-3 py-2 text-sm font-medium transition',
                  mode === 'file' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500'
                )}
              >
                File
              </button>
              <button
                type="button"
                onClick={() => setMode('paste')}
                className={cn(
                  'flex-1 rounded-xl px-3 py-2 text-sm font-medium transition',
                  mode === 'paste' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500'
                )}
              >
                Paste
              </button>
            </div>

            {mode === 'file' ? (
              <div className="mt-4 space-y-4">
                <div
                  {...getRootProps()}
                  className={cn(
                    'flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-5 py-8 text-center transition',
                    isDragActive
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-slate-700 dark:bg-slate-900/40'
                  )}
                >
                  <input {...getInputProps()} />
                  <div className="rounded-3xl bg-emerald-50 p-4">
                    <UploadCloud className="h-10 w-10 text-emerald-600" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
                    Drop CSV, PDF, or image
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    We extract the rows, then you review them before importing.
                  </p>
                  <button
                    type="button"
                    onClick={openPicker}
                    className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Browse files
                  </button>
                </div>

                {fileName && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                        {selectedFileKind === 'pdf' ? (
                          <FileText className="h-6 w-6" />
                        ) : selectedFileKind === 'csv' ? (
                          <FileSpreadsheet className="h-6 w-6" />
                        ) : (
                          <ImageIcon className="h-6 w-6" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {fileName}
                        </p>
                        <p className="text-xs text-slate-500">
                          Ready for review
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Paste supplier price list
                  </label>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    rows={10}
                    placeholder={'Sugar Granulated 10kg €25.00\nWhole Milk 1L €1.25\nButter Salted 5kg €38.50'}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900/60 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={parsePastedText}
                  disabled={loading || !textInput.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Parse pasted list
                </button>
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/60">
              <p className="font-semibold text-slate-700 dark:text-slate-200">What we keep</p>
              <p className="mt-1 leading-relaxed">
                Ingredient name, brand, category, supplier, package price, package size, and normalized unit cost.
              </p>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Review before import</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                  Supplier price preview
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Every selected row stays editable until you import it.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: true })))}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-200 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setRows((current) => current.map((row) => ({ ...row, selected: false })))}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
                >
                  Clear
                </button>
              </div>
            </div>

            {rows.length > 0 && (
              <div className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3 sm:grid-cols-5 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Total rows</p>
                  <p className="mt-0.5 text-lg font-bold text-slate-800 dark:text-white">{rows.length}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/30">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Selected</p>
                  <p className="mt-0.5 text-lg font-bold text-emerald-700 dark:text-emerald-300">{selectedCount}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-800 dark:bg-slate-900">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">New</p>
                  <p className="mt-0.5 text-lg font-bold text-emerald-700 dark:text-emerald-300">{newCount}</p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-white px-3 py-2 dark:border-sky-800 dark:bg-slate-900">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Updates</p>
                  <p className="mt-0.5 text-lg font-bold text-sky-700 dark:text-sky-300">{updateCount}</p>
                </div>
                <div className={cn(
                  'col-span-2 rounded-xl border px-3 py-2 sm:col-span-1',
                  needsReviewCount > 0
                    ? 'border-amber-200 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30'
                    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                )}>
                  <p className={cn(
                    'text-[9px] font-bold uppercase tracking-widest',
                    needsReviewCount > 0 ? 'text-amber-600' : 'text-slate-400'
                  )}>Needs review</p>
                  <p className={cn(
                    'mt-0.5 text-lg font-bold',
                    needsReviewCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-800 dark:text-white'
                  )}>{needsReviewCount}</p>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
              {loading || loadingSuppliers ? (
                <div className="flex h-full items-center justify-center p-8">
                  <div className="text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
                    <p className="mt-2 text-sm text-slate-500">Analysing supplier list…</p>
                  </div>
                </div>
              ) : rows.length === 0 ? (
                <div className="flex h-full items-center justify-center p-8 text-center">
                  <div>
                    <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-200" />
                    <p className="mt-2 text-sm font-medium text-slate-500">No preview yet</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Add a CSV, PDF, image, or pasted list to build the import preview.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden">
                  {/* Flex-row "table" instead of a native <table>: HTML table
                      layout ignores flex-1/min-w-0 on cells, so there's no
                      reliable way to make one column (Ingredient) flex and
                      truncate while the rest stay fixed-width without either
                      a horizontal scrollbar or silently clipped content. */}
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-3 py-3 text-xs uppercase tracking-wide text-slate-400 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                    <div className="w-10 shrink-0">
                      <input
                        type="checkbox"
                        checked={selectedCount === rows.length && rows.length > 0}
                        className="h-4 w-4 rounded border-slate-300 accent-emerald-600 focus:ring-emerald-500"
                        onChange={(e) =>
                          setRows((current) => current.map((row) => ({ ...row, selected: e.target.checked })))
                        }
                      />
                    </div>
                    <div className="min-w-[200px] flex-1">Ingredient</div>
                    <div className="w-24 shrink-0">Supplier</div>
                    <div className="w-20 shrink-0">Price</div>
                    <div className="w-20 shrink-0">Size</div>
                    <div className="w-20 shrink-0">Unit</div>
                    <div className="w-24 shrink-0">Unit cost</div>
                    <div className="w-24 shrink-0">Status</div>
                    <div className="w-20 shrink-0">Code</div>
                  </div>
                  <div className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                    {rows.map((row) => (
                      <div
                        key={row.id}
                        className={cn(
                          'flex items-start gap-2 px-3 py-3 transition-colors',
                          row.selected ? 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30' : 'bg-slate-50/80 opacity-60 dark:bg-slate-950/40'
                        )}
                      >
                        <div className="flex w-10 shrink-0 items-center pt-2">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            className="h-4 w-4 rounded border-slate-300 accent-emerald-600 focus:ring-emerald-500"
                            onChange={(e) => updateRow(row.id, { selected: e.target.checked })}
                          />
                        </div>
                        <div className="min-w-[200px] flex-1">
                          <input
                            value={row.ingredientName}
                            onChange={(e) => updateRow(row.id, { ingredientName: e.target.value })}
                            title={row.ingredientName}
                            className="w-full truncate rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800"
                          />
                        </div>
                        <div className="w-24 shrink-0">
                          <input
                            value={row.supplier}
                            onChange={(e) => updateRow(row.id, { supplier: e.target.value })}
                            title={row.supplier}
                            className="w-full truncate rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800"
                            placeholder="Supplier"
                          />
                        </div>
                        <div className="w-20 shrink-0">
                          <input
                            value={row.packagePrice}
                            onChange={(e) => updateRow(row.id, { packagePrice: e.target.value })}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800"
                          />
                        </div>
                        <div className="w-20 shrink-0">
                          <input
                            value={row.packageQuantity}
                            onChange={(e) => updateRow(row.id, { packageQuantity: e.target.value })}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800"
                          />
                        </div>
                        <div className="w-20 shrink-0">
                          <CustomSelect
                            value={row.packageUnit}
                            onChange={(value) => updateRow(row.id, { packageUnit: value })}
                            options={[
                              { value: 'kg', label: 'kg' },
                              { value: 'g', label: 'g' },
                              { value: 'L', label: 'L' },
                              { value: 'ml', label: 'ml' },
                              { value: 'unit', label: 'unit' },
                              { value: 'dozen', label: 'dozen' },
                            ]}
                            placeholder="Unit"
                            size="sm"
                            className="w-full"
                          />
                        </div>
                        <div className="w-24 shrink-0">
                          <p className="truncate font-bold text-emerald-700 dark:text-emerald-300">
                            {formatIngredientMoney(row.calculatedUnitPrice)}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            / {row.priceUnit || getDefaultIngredientPriceUnit(row.packageUnit)}
                          </p>
                        </div>
                        <div className="w-24 shrink-0 pt-1">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold',
                              row.matchStatus === 'update'
                                ? 'border-sky-200 bg-sky-50 text-sky-700'
                                : row.matchStatus === 'duplicate'
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : row.matchStatus === 'review'
                                    ? 'border-red-200 bg-red-50 text-red-700'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            )}
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                            {row.matchStatus === 'update'
                              ? 'Update'
                              : row.matchStatus === 'duplicate'
                                ? 'Duplicate'
                                : row.matchStatus === 'review'
                                  ? 'Review'
                                  : 'New'}
                          </span>
                        </div>
                        <div className="w-20 shrink-0 truncate pt-2 text-xs text-slate-400" title={row.productCode}>
                          {row.productCode || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  {needsReviewCount > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CircleCheck className="h-4 w-4 text-emerald-600" />
                  )}
                  <p>
                    {needsReviewCount > 0
                      ? `${needsReviewCount} row${needsReviewCount !== 1 ? 's need' : ' needs'} a quick check before import.`
                      : 'Selected rows are ready to import into ingredients and price history.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={loading || rows.filter((row) => row.selected).length === 0}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Import selected ({selectedCount})
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
