'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { AlertCircle, FileText, Loader2, Lock, Trash2, UploadCloud, X } from 'lucide-react'
import BulkInvoiceReview, {
  type BulkInvoiceDraft,
  type ConsolidatedGroup,
  type InvoiceFileKind,
} from '@/components/invoices/BulkInvoiceReview'
import { getDefaultIngredientPriceUnit, type InvoiceFormState } from '@/lib/invoices'
import { bytesToSize, extractPdfText, fileTypeFromName, normalizeExtractedItems } from '@/lib/invoices-client'
import { compressImage } from '@/lib/utils/image-compress'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { useSubscription } from '@/hooks/useSubscription'
import type { IngredientLookup, SupplierLookup } from '@/hooks/useInvoices'
import { useSafeBack } from '@/hooks/useSafeBack'
import { toast } from '@/lib/toast'
import EmptyState from '@/components/shared/EmptyState'

type Step = 'upload' | 'processing' | 'review'

type ExtractResponse = {
  error?: string
  limitReached?: boolean
  supplier_name?: string
  invoice_number?: string | null
  invoice_date?: string
  total_amount?: number | null
  subtotal_amount?: number | null
  vat_amount?: number | null
  vat_rate?: number | null
  items?: Array<{
    description: string
    quantity: number
    unit: string
    package_size?: number | null
    package_unit?: string | null
    packageSize?: number | null
    packageUnit?: string | null
    unit_price?: number
    unitPrice?: number
    total: number
  }>
}

function createDraftMeta(supplierName: string, invoiceDate: string, totalAmount: number): InvoiceFormState {
  return {
    supplierName,
    supplierId: null,
    supplierMatch: null,
    invoiceNumber: '',
    invoiceDate,
    currency: 'EUR',
    notes: '',
    totalAmount,
    subtotalAmount: null,
    vatAmount: null,
    vatRate: null,
    fileUrl: null,
    fileType: null,
    items: [],
  }
}

async function extractFile(file: File, kind: InvoiceFileKind): Promise<ExtractResponse> {
  if (kind === 'csv') {
    const csvText = await file.text()
    const response = await fetch('/api/invoices/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'csv', csv: csvText, fileName: file.name, bulk: true }),
    })
    return (await response.json().catch(() => ({ error: 'Unable to parse CSV' }))) as ExtractResponse
  }

  if (kind === 'pdf') {
    const text = await extractPdfText(file)
    if (!text.trim()) {
      return { error: 'Scanned PDF with no extractable text — import it individually and fill in items manually.' }
    }
    const response = await fetch('/api/invoices/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'pdf', text, fileName: file.name, bulk: true }),
    })
    return (await response.json().catch(() => ({ error: 'Unable to extract PDF data' }))) as ExtractResponse
  }

  // image
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
    body: JSON.stringify({ kind: 'image', imageBase64, mimeType: compressed.type, fileName: file.name, bulk: true }),
  })
  return (await response.json().catch(() => ({ error: 'Unable to extract image data' }))) as ExtractResponse
}

export default function BulkImportInvoicesPage() {
  const router = useRouter()
  const handleBack = useSafeBack('/invoices')
  const { limits, loading: subLoading } = useSubscription()
  const [step, setStep] = useState<Step>('upload')
  const [files, setFiles] = useState<File[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierLookup[]>([])
  const [ingredients, setIngredients] = useState<IngredientLookup[]>([])
  const [loadingLookups, setLoadingLookups] = useState(true)

  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<{ index: number; total: number; fileName: string } | null>(null)
  const [failures, setFailures] = useState<Array<{ fileName: string; error: string }>>([])
  const [limitReachedAt, setLimitReachedAt] = useState<number | null>(null)

  const [drafts, setDrafts] = useState<BulkInvoiceDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<
    { index: number; total: number; failures: Array<{ fileName: string; error: string }> } | null
  >(null)

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
            .select('id, name, brand, current_price, price_unit')
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

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop: (accepted) => setFiles((prev) => [...prev, ...accepted]),
    accept: {
      'application/pdf': ['.pdf'],
      'text/csv': ['.csv'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    multiple: true,
    noClick: true,
    noKeyboard: true,
  })

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleProcess = async () => {
    if (files.length === 0) return

    setStep('processing')
    setProcessing(true)
    setFailures([])
    setLimitReachedAt(null)
    const nextDrafts: BulkInvoiceDraft[] = []
    const nextFailures: Array<{ fileName: string; error: string }> = []

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]
      setProgress({ index: i + 1, total: files.length, fileName: file.name })

      try {
        const kind = fileTypeFromName(file)
        const payload = await extractFile(file, kind)

        if (payload.limitReached) {
          setLimitReachedAt(i)
          for (let j = i; j < files.length; j += 1) {
            nextFailures.push({ fileName: files[j].name, error: 'Skipped — monthly AI extraction limit reached' })
          }
          break
        }

        if (payload.error && !payload.items?.length) {
          nextFailures.push({ fileName: file.name, error: payload.error })
          continue
        }

        const extractedItems = normalizeExtractedItems(payload.items ?? [])
        const invoiceDate = payload.invoice_date ?? new Date().toISOString().slice(0, 10)
        const meta = createDraftMeta(
          payload.supplier_name ?? file.name.replace(/\.[^.]+$/, ''),
          invoiceDate,
          payload.total_amount ?? extractedItems.reduce((sum, item) => sum + item.total, 0)
        )
        meta.invoiceNumber = payload.invoice_number ?? ''
        meta.subtotalAmount = payload.subtotal_amount ?? null
        meta.vatAmount = payload.vat_amount ?? null
        meta.vatRate = payload.vat_rate ?? null
        meta.fileType = kind

        nextDrafts.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          file,
          fileKind: kind,
          meta,
          items: extractedItems,
        })
      } catch (error) {
        nextFailures.push({
          fileName: file.name,
          error: error instanceof Error ? error.message : 'Extraction failed',
        })
      }
    }

    setDrafts(nextDrafts)
    setFailures(nextFailures)
    setProcessing(false)
    setProgress(null)

    if (nextDrafts.length === 0) {
      toast.error('No invoices could be processed. Check the errors below and try again.')
      setStep('upload')
      return
    }

    if (nextFailures.length > 0) {
      toast.info(`${nextDrafts.length} of ${files.length} invoices processed. ${nextFailures.length} skipped.`)
    } else {
      toast.success(`${nextDrafts.length} invoice${nextDrafts.length === 1 ? '' : 's'} processed.`)
    }

    setStep('review')
  }

  const handleUpdateDraftMeta = (draftId: string, meta: InvoiceFormState) => {
    setDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, meta } : d)))
  }

  const handleConfirmSave = async (
    currentDrafts: BulkInvoiceDraft[],
    groups: ConsolidatedGroup[]
  ) => {
    if (!tenantId) {
      toast.error('Missing tenant context')
      return
    }

    setSaving(true)
    const saveFailures: Array<{ fileName: string; error: string }> = []
    let savedCount = 0
    let skippedEmptyCount = 0

    for (let i = 0; i < currentDrafts.length; i += 1) {
      const draft = currentDrafts[i]
      setSaveStatus({ index: i + 1, total: currentDrafts.length, failures: saveFailures })

      const items = groups
        .filter((g) => !g.skip)
        .flatMap((g) =>
          g.occurrences
            .filter((occ) => occ.draftId === draft.id && !occ.skip)
            .map((occ) => ({
              description: g.name,
              quantity: occ.quantity,
              unit: occ.unit,
              packageSize: occ.packageSize,
              packageUnit: occ.packageUnit,
              unitPrice: occ.price,
              total: occ.total,
              ingredientId: g.ingredientMatch.type === 'existing' ? g.ingredientMatch.id : null,
              ingredientMatch: g.ingredientMatch,
              newIngredientBrand: occ.brand,
              newIngredientCategory: g.category,
              newIngredientUnit:
                getDefaultIngredientPriceUnit(
                  g.packageSize && g.packageUnit ? g.packageUnit : g.unit
                ) ?? g.unit,
            }))
        )

      if (items.length === 0) {
        skippedEmptyCount += 1
        continue
      }

      try {
        const formData = new FormData()
        formData.append(
          'data',
          JSON.stringify({
            invoice_id: crypto.randomUUID(),
            supplier_name: draft.meta.supplierName,
            supplier_id: draft.meta.supplierId,
            supplier_match: draft.meta.supplierMatch ?? null,
            invoice_number: draft.meta.invoiceNumber,
            invoice_date: draft.meta.invoiceDate,
            currency: draft.meta.currency,
            notes: draft.meta.notes,
            total_amount: draft.meta.totalAmount,
            file_url: draft.meta.fileUrl,
            file_type: draft.fileKind,
            items,
          })
        )
        if (draft.file) {
          formData.append('file', draft.file, draft.file.name)
        }

        const response = await fetch('/api/invoices/save', { method: 'POST', body: formData })
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to save invoice')
        }
        savedCount += 1
      } catch (error) {
        saveFailures.push({
          fileName: draft.fileName,
          error: error instanceof Error ? error.message : 'Unable to save invoice',
        })
      }
    }

    setSaveStatus({ index: currentDrafts.length, total: currentDrafts.length, failures: saveFailures })
    setSaving(false)

    if (savedCount > 0) {
      const skippedNote = skippedEmptyCount > 0 ? ` (${skippedEmptyCount} skipped — no items selected)` : ''
      if (saveFailures.length > 0) {
        toast.info(`${savedCount} of ${currentDrafts.length} invoices saved${skippedNote}. ${saveFailures.length} failed — see details below.`)
      } else {
        toast.success(`${savedCount} invoice${savedCount === 1 ? '' : 's'} saved${skippedNote}.`)
        router.push('/invoices?success=1')
        return
      }
    } else {
      toast.error('No invoices were saved. See errors below.')
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

  if (!subLoading && !limits.canBulkImportInvoices) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <EmptyState
          icon={Lock}
          title="Bulk invoice import is a Business feature"
          description="Upgrade to Business to process multiple invoices in one workflow."
          action={{ label: 'View Business', onClick: () => router.push('/settings/billing') }}
        />
      </div>
    )
  }

  if (step === 'review') {
    return (
      <BulkInvoiceReview
        drafts={drafts}
        onUpdateDraftMeta={handleUpdateDraftMeta}
        suppliers={suppliers}
        ingredients={ingredients}
        onBack={() => {
          setStep('upload')
          setDrafts([])
        }}
        onConfirm={handleConfirmSave}
        saving={saving}
        saveStatus={saveStatus}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Bulk import
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">Import multiple invoices</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Upload several invoices at once. AI extracts and groups matching ingredients across all of them —
            you review everything before anything is saved.
          </p>
        </div>
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>

      <section
        {...getRootProps()}
        className={`rounded-3xl border-2 border-dashed p-8 text-center transition ${
          isDragActive ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200 bg-white'
        }`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="mx-auto h-10 w-10 text-slate-400" />
        <p className="mt-3 text-sm font-medium text-slate-700">Drag and drop invoices here</p>
        <p className="mt-1 text-xs text-slate-500">PDF, CSV, PNG, or JPG — add as many as you like</p>
        <button
          type="button"
          onClick={openFilePicker}
          className="mt-4 inline-flex items-center justify-center rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Browse files
        </button>
      </section>

      {files.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {files.length} file{files.length === 1 ? '' : 's'} selected
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-3 px-5 py-3">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{file.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{bytesToSize(file.size)}</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove file"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={() => setFiles([])}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              <X className="h-4 w-4" />
              Clear all
            </button>
            <button
              type="button"
              onClick={handleProcess}
              disabled={processing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              Process {files.length} file{files.length === 1 ? '' : 's'}
            </button>
          </div>
        </section>
      )}

      {step === 'processing' && progress && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Processing {progress.index} of {progress.total}…
              </p>
              <p className="text-xs text-slate-500">{progress.fileName}</p>
            </div>
          </div>
          {limitReachedAt !== null && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Monthly AI extraction limit reached — remaining files were skipped.{' '}
                <a href="/settings/billing" className="font-semibold underline">
                  Upgrade to Business
                </a>{' '}
                for unlimited invoice extraction.
              </span>
            </div>
          )}
        </section>
      )}

      {failures.length > 0 && step === 'upload' && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-800">
            {failures.length} file{failures.length === 1 ? '' : 's'} could not be processed:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
            {failures.map((f) => (
              <li key={f.fileName}>
                {f.fileName}: {f.error}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
