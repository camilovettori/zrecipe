'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Lock,
  Maximize,
  Minus,
  Plus,
  Sparkles,
  UploadCloud,
} from 'lucide-react'
import InvoiceEditor from '@/components/invoices/InvoiceEditor'
import {
  autoDetectCsvColumns,
  createEmptyInvoiceItem,
  getDefaultIngredientPriceUnit,
  type InvoiceFileType,
  type InvoiceFormState,
  type InvoiceLineItem,
  scoreIngredientMatch,
  recalculateInvoiceTotals,
} from '@/lib/invoices'
import {
  bytesToSize,
  extractPdfText,
  fileTypeFromName,
  normalizeExtractedItems,
  type ExtractedInvoiceItem,
} from '@/lib/invoices-client'
import { compressImage } from '@/lib/utils/image-compress'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { useSubscription } from '@/hooks/useSubscription'
import type { IngredientLookup, SupplierLookup } from '@/hooks/useInvoices'
import { useSafeBack } from '@/hooks/useSafeBack'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { CustomSelect } from '@/components/ui/CustomSelect'
import EmptyState from '@/components/shared/EmptyState'
import type { AllergenStatus } from '@/lib/allergens'
import InvoicePdfPreview from '@/components/invoices/InvoicePdfPreview'

type Step = 'upload' | 'review' | 'confirm'

type CsvData = {
  headers: string[]
  rows: Record<string, string>[]
}

// The AI extraction prompt appends " (verify)" to a description when it's
// uncertain about a field on that row (see UNCERTAINTY RULES in the extract
// route's prompt). Strip it before it reaches the editable draft — the
// amber accent on uncertain rows is the intended signal, not raw text.
function stripVerifySuffix(description: string | null | undefined): string {
  return (description ?? '').replace(/\s*\(verify\)\s*$/i, '').trim()
}

function createInitialDraft(): InvoiceFormState {
  return {
    supplierName: '',
    supplierId: null,
    supplierMatch: null,
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    currency: 'EUR',
    notes: '',
    totalAmount: 0,
    subtotalAmount: null,
    vatAmount: null,
    vatRate: null,
    fileUrl: null,
    fileType: null,
    items: [createEmptyInvoiceItem()],
  }
}

function buildDraftFromItems(
  supplierName: string,
  invoiceNumber: string | null | undefined,
  invoiceDate: string | null | undefined,
  totalAmount: number | null | undefined,
  fileType: InvoiceFileType,
  fileUrl: string | null,
  items: Array<{
    description: string
    product_code?: string | null
    brand?: string | null
    quantity: number
    unit: string
    packageSize?: number | null
    packageUnit?: string | null
    unitPrice: number
    total: number
    // Supplier-aware ingredient name memory (see /api/invoices/extract and
    // /api/invoices/save) — memoryIngredientId/Name are only set when a
    // previous invoice from this supplier remembered a match for this exact
    // extracted description. extractedDescriptionOriginal is the raw
    // extraction text, always captured regardless of a memory hit.
    extractedDescriptionOriginal?: string
    memoryIngredientId?: string | null
    memoryIngredientName?: string | null
    // "(verify)" signal from AI extraction, already converted to a boolean
    // and stripped from description server-side — see /api/invoices/extract.
    needs_verification?: boolean
  }>,
  meta?: {
    subtotalAmount?: number | null
    vatAmount?: number | null
    vatRate?: number | null
  }
): InvoiceFormState {
  const draftItems: InvoiceLineItem[] = items.length
    ? items.map((item) => {
        const hasMemory = Boolean(item.memoryIngredientId && item.memoryIngredientName)
        const description = hasMemory ? item.memoryIngredientName! : item.description
        return {
          id: crypto.randomUUID(),
          description,
          product_code: item.product_code ?? null,
          extractedDescriptionOriginal: item.extractedDescriptionOriginal ?? item.description,
          needs_verification: item.needs_verification ?? false,
          newIngredientBrand: item.brand?.trim() || '',
          quantity: item.quantity,
          unit: item.unit,
          packageSize: item.packageSize ?? null,
          packageUnit: item.packageUnit ?? null,
          unitPrice: item.unitPrice,
          total: item.total,
          ingredientId: hasMemory ? item.memoryIngredientId! : null,
          ingredientMatch: hasMemory
            ? { type: 'existing' as const, id: item.memoryIngredientId!, name: item.memoryIngredientName! }
            : null,
          ingredientQuery: description,
          createIngredient: false,
          newIngredientName: '',
          newIngredientCategory: 'Other',
          newIngredientUnit:
            getDefaultIngredientPriceUnit(
              item.packageSize && item.packageUnit ? item.packageUnit : item.unit
            ) ?? item.unit,
          reviewAllergens: [],
          allergensChanged: false,
        }
      })
    : [createEmptyInvoiceItem()]

  const subtotal = recalculateInvoiceTotals(draftItems).subtotal

  return {
    supplierName,
    supplierId: null,
    invoiceNumber: invoiceNumber ?? '',
    invoiceDate: invoiceDate ?? new Date().toISOString().slice(0, 10),
    currency: 'EUR',
    notes: '',
    totalAmount: totalAmount ?? subtotal,
    subtotalAmount: meta?.subtotalAmount ?? subtotal,
    vatAmount: meta?.vatAmount ?? null,
    vatRate: meta?.vatRate ?? null,
    fileUrl,
    fileType,
    items: draftItems,
  }
}

function matchDraftItems(
  items: InvoiceLineItem[],
  ingredients: IngredientLookup[]
): InvoiceLineItem[] {
  return items.map((item) => {
    // Already resolved by supplier-aware memory — leave it alone rather
    // than letting a fuzzy re-match potentially pick a different ingredient.
    if (item.ingredientId) {
      const linked = ingredients.find((ingredient) => ingredient.id === item.ingredientId)
      return {
        ...item,
        reviewAllergens: linked?.allergens ?? [],
        allergensChanged: false,
      }
    }

    const matches = ingredients
      .map((ingredient) => ({
        ingredient,
        score: scoreIngredientMatch(item.description, ingredient.name),
      }))
      .filter(({ score }) => score >= 70)
      .sort((a, b) => b.score - a.score)

    const best = matches[0]?.ingredient
    if (!best) {
      return item
    }

    return {
      ...item,
      ingredientId: best.id,
      ingredientQuery: best.name,
      ingredientMatch: { type: 'existing', id: best.id, name: best.name },
      newIngredientBrand: item.newIngredientBrand || best.brand || '',
      reviewAllergens: best.allergens ?? [],
      allergensChanged: false,
    }
  })
}

function buildMatchedDraft(
  supplierName: string,
  invoiceNumber: string | null | undefined,
  invoiceDate: string | null | undefined,
  totalAmount: number | null | undefined,
  fileType: InvoiceFileType,
  fileUrl: string | null,
  items: ExtractedInvoiceItem[],
  ingredients: IngredientLookup[],
  meta?: {
    subtotalAmount?: number | null
    vatAmount?: number | null
    vatRate?: number | null
  }
): InvoiceFormState {
  const draft = buildDraftFromItems(
    supplierName,
    invoiceNumber,
    invoiceDate,
    totalAmount,
    fileType,
    fileUrl,
    items,
    meta
  )

  return {
    ...draft,
    items: matchDraftItems(draft.items, ingredients),
  }
}

export default function ImportInvoicesPage() {
  const router = useRouter()
  const handleBack = useSafeBack('/invoices')
  const { limits, loading: subLoading } = useSubscription()
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [fileKind, setFileKind] = useState<InvoiceFileType | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [invoiceId, setInvoiceId] = useState<string>(() => crypto.randomUUID())
  const [draft, setDraft] = useState<InvoiceFormState>(createInitialDraft)
  const [thousandsCorrectionApplied, setThousandsCorrectionApplied] = useState(false)
  const [suppliers, setSuppliers] = useState<SupplierLookup[]>([])
  const [ingredients, setIngredients] = useState<IngredientLookup[]>([])
  const [loadingLookups, setLoadingLookups] = useState(true)
  const [csvData, setCsvData] = useState<CsvData | null>(null)
  const [csvColumnMap, setCsvColumnMap] = useState<Record<string, string>>({})
  const [previewOpen, setPreviewOpen] = useState(false)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const supabase = createClient()
        const currentTenantId = await resolveTenantId()
        setTenantId(currentTenantId)

        const [supplierResult, ingredientResult] = await Promise.all([
          supabase
            .from('suppliers')
            .select('id, name, contact_email, contact_phone, address')
            .eq('tenant_id', currentTenantId)
            .order('name', { ascending: true }),
          supabase
            .from('ingredients')
            .select('id, name, brand, current_price, price_unit, ingredient_allergens(allergen_id, status)')
            .eq('tenant_id', currentTenantId)
            .order('name', { ascending: true }),
        ])

        setSuppliers(
          (supplierResult.data ?? []).map((item) => ({
            id: item.id,
            name: item.name,
            contactEmail: item.contact_email ?? null,
            contactPhone: item.contact_phone ?? null,
            address: item.address ?? null,
          }))
        )
        setIngredients(
          (ingredientResult.data ?? []).map((item) => ({
            id: item.id,
            name: item.name,
            brand: item.brand ?? null,
            currentPrice: item.current_price ?? null,
            priceUnit: item.price_unit ?? null,
            allergens: (item.ingredient_allergens ?? [])
              .filter((row) => row.status === 'contains' || row.status === 'may_contain')
              .map((row) => ({
                allergenId: row.allergen_id,
                status: row.status as AllergenStatus,
              })),
          }))
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load lookups')
      } finally {
        setLoadingLookups(false)
      }
    }

    loadLookups()
  }, [])

  const fileBadge = useMemo(() => {
    if (!fileKind) return null
    const label = fileKind === 'pdf' ? 'PDF' : fileKind === 'csv' ? 'CSV' : 'Image'
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
        {label}
      </span>
    )
  }, [fileKind])

  const updateDraft = (next: InvoiceFormState) => {
    setDraft({
      ...next,
      totalAmount: recalculateInvoiceTotals(next.items, next.totalAmount).totalAmount,
    })
  }

  const onDrop = async (acceptedFiles: File[]) => {
    const nextFile = acceptedFiles[0]
    if (!nextFile) return

    setFileError(null)
    setFile(nextFile)
    setFileKind(fileTypeFromName(nextFile))
    setInvoiceId(crypto.randomUUID())
    setStep('upload')
    setZoom(1)

    try {
      const preview = URL.createObjectURL(nextFile)
      setFilePreview(preview)
    } catch {
      setFilePreview(null)
    }
  }

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/csv': ['.csv'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    multiple: false,
    noClick: true,
    noKeyboard: true,
  })

  const applyCsvMapping = (data: CsvData, map: Record<string, string>) => {
    const items = data.rows.map((row) => {
      const description = row[map.description] ?? row.Description ?? row.Item ?? ''
      const quantity = Number.parseFloat(row[map.quantity] ?? row.Quantity ?? '1') || 1
      const unit = row[map.unit] ?? row.Unit ?? 'unit'
      const unitPrice = Number.parseFloat(row[map.unitPrice] ?? row['Unit Price'] ?? '0') || 0
      const packageSize = null
      const packageUnit = null
      const total =
        Number.parseFloat(row[map.total] ?? row.Total ?? `${quantity * unitPrice}`) ||
        quantity * unitPrice

      return { description, quantity, unit, packageSize, packageUnit, unitPrice, total }
    })

    setDraft(
      buildMatchedDraft(
        file?.name.replace(/\.[^.]+$/, '') ?? 'CSV import',
        '',
        new Date().toISOString().slice(0, 10),
        items.reduce((sum, item) => sum + item.total, 0),
        'csv',
        null,
        items,
        ingredients
      )
    )
  }

  const handleExtract = async () => {
    if (!file || !fileKind) {
      setFileError('Please select a file first.')
      return
    }

    try {
      setProcessing(true)
      setFileError(null)
      setThousandsCorrectionApplied(false)

      if (fileKind === 'csv') {
        const csvText = await file.text()
        const parsed = Papa.parse<Record<string, string>>(csvText, {
          header: true,
          skipEmptyLines: true,
        })
        const rows = (parsed.data ?? []).filter((row) => Object.keys(row).length > 0)
        const headers = parsed.meta.fields ?? Object.keys(rows[0] ?? {})
        const detected = autoDetectCsvColumns(headers)
        setCsvData({ headers, rows })
        setCsvColumnMap(detected)

        const response = await fetch('/api/invoices/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'csv', csv: csvText, fileName: file.name }),
        })

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
          supplier_name?: string
          invoice_number?: string | null
          invoice_date?: string
          total_amount?: number | null
          subtotal_amount?: number | null
          vat_amount?: number | null
          vat_rate?: number | null
          items?: Array<{
            description: string
            brand?: string | null
            quantity: number
            unit: string
            unit_price?: number
            unitPrice?: number
            total: number
          }>
        }

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to extract CSV data')
        }

        applyCsvMapping({ headers, rows }, detected)
        setDraft(
          buildMatchedDraft(
            payload.supplier_name ?? file.name.replace(/\.[^.]+$/, ''),
            payload.invoice_number,
            payload.invoice_date,
            payload.total_amount,
            'csv',
            null,
            normalizeExtractedItems(payload.items ?? []),
            ingredients,
            {
              subtotalAmount: payload.subtotal_amount ?? null,
              vatAmount: payload.vat_amount ?? null,
              vatRate: payload.vat_rate ?? null,
            }
          )
        )
        setStep('review')
        return
      }

      if (fileKind === 'pdf') {
        const text = await extractPdfText(file)

        if (!text.trim()) {
          toast.info('This PDF appears to be scanned. Please enter items manually.')
          setDraft(
            buildMatchedDraft(
              '',
              '',
              new Date().toISOString().slice(0, 10),
              null,
              'pdf',
              null,
              [
                {
                  description: '',
                  quantity: 1,
                  unit: 'unit',
                  packageSize: null,
                  packageUnit: null,
                  unitPrice: 0,
                  total: 0,
                },
              ],
              ingredients
            )
          )
          setStep('review')
          return
        }

        const response = await fetch('/api/invoices/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'pdf', text, fileName: file.name }),
        })

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
          supplier_name?: string
          invoice_number?: string | null
          invoice_date?: string
          total_amount?: number | null
          subtotal_amount?: number | null
          vat_amount?: number | null
          vat_rate?: number | null
            items?: Array<{
              description: string
              product_code?: string | null
              brand?: string | null
              quantity: number
              unit: string
              package_size?: number | null
              package_unit?: string | null
              packageSize?: number | null
              packageUnit?: string | null
              unit_price?: number | null
              unitPrice?: number | null
              total?: number | null
              memory_ingredient_id?: string | null
              memory_ingredient_name?: string | null
              needs_verification?: boolean
            }>
          thousands_correction_applied?: boolean
        }

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to extract PDF data')
        }

        setThousandsCorrectionApplied(payload.thousands_correction_applied ?? false)

        const rawItems = payload.items ?? []
        const extractedItems = normalizeExtractedItems(
          rawItems.map((item) => ({
            ...item,
            description: stripVerifySuffix(item.description),
            unit_price: item.unit_price ?? undefined,
            unitPrice: item.unitPrice ?? undefined,
            total: item.total ?? undefined,
          }))
        ).map((normalized, i) => ({
          ...normalized,
          extractedDescriptionOriginal: normalized.description,
          memoryIngredientId: rawItems[i]?.memory_ingredient_id ?? null,
          memoryIngredientName: rawItems[i]?.memory_ingredient_name ?? null,
          needs_verification: rawItems[i]?.needs_verification ?? false,
        }))
        setDraft(
          buildMatchedDraft(
            payload.supplier_name ?? '',
            payload.invoice_number,
            payload.invoice_date,
            payload.total_amount,
            'pdf',
            null,
            extractedItems.length > 0
              ? extractedItems
              : [
                {
                  description: '',
                  quantity: 1,
                  unit: 'unit',
                  packageSize: null,
                  packageUnit: null,
                  unitPrice: 0,
                  total: 0,
                  },
                ],
            ingredients,
            {
              subtotalAmount: payload.subtotal_amount ?? null,
              vatAmount: payload.vat_amount ?? null,
              vatRate: payload.vat_rate ?? null,
            }
          )
        )
        if (extractedItems.length === 0) {
          toast.info("We couldn't extract all data. Please fill in the missing fields.")
        }
        setStep('review')
        return
      }

      if (fileKind === 'image') {
        const compressed = await compressImage(file, 1400, 0.85)
        const imageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            resolve(result.split(',')[1] ?? '')
          }
          reader.onerror = () => reject(new Error('Failed to read image'))
          reader.readAsDataURL(compressed)
        })

        const response = await fetch('/api/invoices/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'image',
            imageBase64,
            mimeType: compressed.type,
            fileName: file.name,
          }),
        })

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
          supplier_name?: string
          invoice_number?: string | null
          invoice_date?: string
          total_amount?: number | null
          subtotal_amount?: number | null
          vat_amount?: number | null
          vat_rate?: number | null
          items?: Array<{
            description: string
            product_code?: string | null
            brand?: string | null
            quantity: number
            unit: string
            package_size?: number | null
            package_unit?: string | null
            packageSize?: number | null
            packageUnit?: string | null
            unit_price?: number | null
            unitPrice?: number | null
            total?: number | null
            memory_ingredient_id?: string | null
            memory_ingredient_name?: string | null
            needs_verification?: boolean
          }>
          thousands_correction_applied?: boolean
        }

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to extract image data')
        }

        setThousandsCorrectionApplied(payload.thousands_correction_applied ?? false)

        const rawItems = payload.items ?? []
        const extractedItems = normalizeExtractedItems(
          rawItems.map((item) => ({
            ...item,
            description: stripVerifySuffix(item.description),
            unit_price: item.unit_price ?? undefined,
            unitPrice: item.unitPrice ?? undefined,
            total: item.total ?? undefined,
          }))
        ).map((normalized, i) => ({
          ...normalized,
          extractedDescriptionOriginal: normalized.description,
          memoryIngredientId: rawItems[i]?.memory_ingredient_id ?? null,
          memoryIngredientName: rawItems[i]?.memory_ingredient_name ?? null,
          needs_verification: rawItems[i]?.needs_verification ?? false,
        }))
        setDraft(
          buildMatchedDraft(
            payload.supplier_name ?? '',
            payload.invoice_number,
            payload.invoice_date,
            payload.total_amount,
            'image',
            null,
            extractedItems.length > 0
              ? extractedItems
              : [
                {
                  description: '',
                  quantity: 1,
                  unit: 'unit',
                  packageSize: null,
                  packageUnit: null,
                  unitPrice: 0,
                  total: 0,
                  },
                ],
            ingredients,
            {
              subtotalAmount: payload.subtotal_amount ?? null,
              vatAmount: payload.vat_amount ?? null,
              vatRate: payload.vat_rate ?? null,
            }
          )
        )
        if (extractedItems.length === 0) {
          toast.info("We couldn't extract all data. Please fill in the missing fields.")
        }
        setStep('review')
        return
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to extract invoice data'
      setFileError(message)
      console.error('[OCR] Error:', error)
      toast.error(message)
      setDraft(
        buildMatchedDraft(
          '',
          '',
          new Date().toISOString().slice(0, 10),
          null,
          fileKind ?? 'image',
          null,
          [
            {
              description: '',
              quantity: 1,
              unit: 'unit',
              packageSize: null,
              packageUnit: null,
              unitPrice: 0,
              total: 0,
            },
          ],
          ingredients,
          { subtotalAmount: null, vatAmount: null, vatRate: null }
        )
      )
      setStep('review')
    } finally {
      setProcessing(false)
    }
  }

  const handleContinue = () => {
    if (!draft.supplierName.trim()) {
      toast.error('Supplier name is required.')
      return
    }
    if (draft.items.length === 0) {
      toast.error('Add at least one invoice item.')
      return
    }
    setStep('confirm')
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      if (!tenantId) {
        throw new Error('Missing tenant context')
      }

      const totals = recalculateInvoiceTotals(draft.items, draft.totalAmount)
      const formData = new FormData()
      formData.append(
        'data',
        JSON.stringify({
          invoice_id: invoiceId,
          supplier_name: draft.supplierName,
          supplier_id: draft.supplierId,
          supplier_match: draft.supplierMatch ?? null,
          invoice_number: draft.invoiceNumber,
          invoice_date: draft.invoiceDate,
          currency: draft.currency,
          notes: draft.notes,
          total_amount: totals.totalAmount,
          file_url: draft.fileUrl,
          file_type: fileKind,
          items: draft.items,
        })
      )

      if (file) {
        formData.append('file', file, file.name)
      }

      const response = await fetch('/api/invoices/save', {
        method: 'POST',
        body: formData,
      })

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to save invoice')
      }

      toast.success('Invoice saved')
      router.push('/invoices?success=1')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save invoice')
    } finally {
      setSaving(false)
    }
  }

  if (loadingLookups) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="h-8 w-48 animate-pulse rounded-full bg-slate-100" />
        <div className="mt-6 h-[36rem] animate-pulse rounded-3xl bg-slate-100" />
      </div>
    )
  }

  if (!subLoading && !limits.canUploadInvoices) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <EmptyState
          icon={Lock}
          title="Invoice import is a Pro feature"
          description="Upgrade to Pro to import invoices with AI-powered extraction."
          action={{ label: 'Upgrade to Pro', onClick: () => router.push('/settings/billing') }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
          Step {step === 'upload' ? '1' : step === 'review' ? '2' : '3'} of 3
        </div>
      </div>

      {step === 'upload' && (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div
              {...getRootProps()}
              className={cn(
                'flex min-h-[320px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition',
                isDragActive
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/40'
              )}
            >
              <input {...getInputProps()} />
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <UploadCloud className="h-12 w-12 text-emerald-600" />
              </div>
              <h1 className="mt-5 font-display text-3xl font-semibold text-slate-900">
                Import Invoice
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Drop a PDF, CSV, PNG, or JPG. We will extract what we can and keep the rest
                editable before saving.
              </p>
              <button
                type="button"
                onClick={openFilePicker}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Browse files
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                PDF
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                CSV
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                PNG
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                JPG
              </span>
            </div>
          </div>

          {file && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                    {fileKind === 'pdf' ? (
                      <FileText className="h-8 w-8" />
                    ) : fileKind === 'csv' ? (
                      <FileSpreadsheet className="h-8 w-8" />
                    ) : (
                      <ImageIcon className="h-8 w-8" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{file.name}</p>
                    <p className="text-sm text-slate-500">
                      {bytesToSize(file.size)} · {file.type || 'Unknown type'}
                    </p>
                  </div>
                </div>
              <div className="flex items-center gap-2">
                {fileBadge}
                <button
                  type="button"
                  onClick={handleExtract}
                    disabled={processing}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Next: Extract Data
                  </button>
                </div>
              </div>

              {processing && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting invoice data with AI… this takes a few seconds
                </div>
              )}

              {fileError && (
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{fileError}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step === 'review' && (
        <div className="grid gap-6 lg:grid-cols-12 lg:items-start">

          {/* ── Source preview — sticky on desktop, collapsible on mobile ──── */}
          <div className="lg:col-span-5 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setPreviewOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate text-sm font-medium text-slate-700">{file?.name}</span>
                  {fileBadge}
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 lg:hidden',
                    previewOpen && 'rotate-180'
                  )}
                />
              </button>

              <div className={cn(previewOpen ? 'block' : 'hidden', 'lg:block border-t border-slate-200')}>
                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
                      title="Zoom out"
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-12 text-center text-xs font-medium text-slate-500">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.min(3, Number((z + 0.15).toFixed(2))))}
                      title="Zoom in"
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom(1)}
                      title="Fit width"
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Maximize className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => filePreview && window.open(filePreview, '_blank')}
                    disabled={!filePreview}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in new tab
                  </button>
                </div>

                {/* Body */}
                <div className="h-[calc(100vh-16rem)] min-h-[36rem] w-full overflow-auto rounded-b-3xl bg-slate-100">
                  {fileKind === 'pdf' && file ? (
                    <InvoicePdfPreview file={file} zoom={zoom} onZoomChange={setZoom} />
                  ) : fileKind === 'image' && filePreview ? (
                    // Blob preview of a locally-selected file — next/image optimisation
                    // doesn't apply, and a plain img lets us pan a zoomed-in scan.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={filePreview}
                      alt="Invoice preview"
                      style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                      className="max-w-none"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <FileText className="mx-auto h-10 w-10 text-slate-300" />
                        <p className="mt-2 text-sm text-slate-400">No preview available</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Review form ───────────────────────────────────────────────── */}
          <div className="min-w-0 space-y-5 overflow-visible lg:col-span-7">

          {/* ── CSV column mapping (only for CSV uploads) ────────────────── */}
          {csvData && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-display text-xl font-semibold text-slate-900">
                CSV column mapping
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Auto-detected mapping. Adjust it if the columns do not line up.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {(['description', 'quantity', 'unit', 'unitPrice', 'total'] as const).map(
                  (field) => (
                    <label key={field} className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {field}
                      </span>
                      <CustomSelect
                        value={csvColumnMap[field] ?? ''}
                        onChange={(v) => setCsvColumnMap((cur) => ({ ...cur, [field]: v }))}
                        placeholder="Select column"
                        options={csvData.headers.map((h) => ({ value: h, label: h }))}
                      />
                    </label>
                  )
                )}
              </div>

              <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {csvData.headers.map((header) => (
                        <th key={header} className="px-3 py-2 font-semibold">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {csvData.rows.slice(0, 5).map((row, index) => (
                      <tr key={`${index}-${file?.name}`}>
                        {csvData.headers.map((header) => (
                          <td key={header} className="px-3 py-2 text-slate-600">
                            {row[header] ?? 'N/A'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => {
                  const items = csvData.rows.map((row) => {
                    const description = row[csvColumnMap.description] ?? ''
                    const quantity = Number.parseFloat(row[csvColumnMap.quantity] ?? '1') || 1
                    const unit = row[csvColumnMap.unit] ?? 'unit'
                    const unitPrice = Number.parseFloat(row[csvColumnMap.unitPrice] ?? '0') || 0
                    const packageSize = null
                    const packageUnit = null
                    const total =
                      Number.parseFloat(row[csvColumnMap.total] ?? `${quantity * unitPrice}`) ||
                      quantity * unitPrice
                    return { description, quantity, unit, packageSize, packageUnit, unitPrice, total }
                  })
                  setDraft(
                    buildDraftFromItems(
                      file?.name.replace(/\.[^.]+$/, '') ?? 'CSV import',
                      draft.invoiceNumber,
                      draft.invoiceDate,
                      items.reduce((sum, item) => sum + item.total, 0),
                      'csv',
                      null,
                      items
                    )
                  )
                  setCsvData({ headers: csvData.headers, rows: csvData.rows })
                }}
                className="mt-4 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                Apply mapping
              </button>
            </div>
          )}

          {/* ── Thousands-convention correction banner ───────────────────── */}
          {thousandsCorrectionApplied && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">Thousands convention applied</div>
                  <div className="mt-0.5 text-emerald-700">
                    {draft.supplierName || 'This supplier'} uses quantity in thousands. We&apos;ve
                    multiplied quantities by 1000 and adjusted unit prices accordingly. Verify
                    the amounts against your invoice.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Invoice editor — full page width ─────────────────────────── */}
          <InvoiceEditor
            title="Review extracted data"
            subtitle="Edit the supplier, metadata, items, and ingredient links before confirming."
            draft={draft}
            onChange={updateDraft}
            suppliers={suppliers}
            ingredients={ingredients}
            onSave={handleContinue}
            onBack={() => setStep('upload')}
            saving={false}
            saveLabel="Continue to confirm"
            allowEditing
            showSummary
            itemsLayout="review-cards"
          />
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-2xl font-semibold text-slate-900">Confirm &amp; Save</h2>
            <p className="mt-2 text-sm text-slate-500">
              Review what will be saved. This will create the invoice, line items, supplier if
              needed, and update ingredient pricing for matched rows.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Supplier</p>
                <p className="mt-1 font-semibold text-slate-900">{draft.supplierName}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Invoice number</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {draft.invoiceNumber || 'N/A'}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Items</p>
                <p className="mt-1 font-semibold text-slate-900">{draft.items.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
                <p className="mt-1 font-semibold text-slate-900">
                  €{recalculateInvoiceTotals(draft.items, draft.totalAmount).totalAmount.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Your invoice file will be securely stored with this record.
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setStep('review')}
                className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back to review
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Invoice
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-display text-2xl font-semibold text-slate-900">Summary</h3>
            <div className="mt-4 space-y-3 text-sm">
              {draft.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{item.description || 'Untitled'}</p>
                    <p className="text-xs text-slate-500">
                      {item.quantity} {item.unit} · {item.ingredientId ? 'linked' : 'unlinked'}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-900">€{item.total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
