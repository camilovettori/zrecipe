'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  UploadCloud,
} from 'lucide-react'
import InvoiceEditor from '@/components/invoices/InvoiceEditor'
import {
  autoDetectCsvColumns,
  createEmptyInvoiceItem,
  type InvoiceFileType,
  type InvoiceFormState,
  type InvoiceLineItem,
  scoreIngredientMatch,
  recalculateInvoiceTotals,
} from '@/lib/invoices'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import type { IngredientLookup, SupplierLookup } from '@/hooks/useInvoices'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type Step = 'upload' | 'review' | 'confirm'

type CsvData = {
  headers: string[]
  rows: Record<string, string>[]
}

function fileTypeFromName(file: File): InvoiceFileType {
  if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (file.type.includes('csv') || file.name.toLowerCase().endsWith('.csv')) return 'csv'
  return 'image'
}

function bytesToSize(size: number) {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(0)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

async function extractPdfText(file: File) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pageTexts: string[] = []

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex)
    const content = await page.getTextContent()
    const items = content.items as Array<{ str?: string; transform?: number[] }>
    const lines = items
      .map((item, index) => ({
        text: item.str ?? '',
        x: item.transform?.[4] ?? index,
        y: item.transform?.[5] ?? 0,
      }))
      .filter((item) => item.text.trim())
      .sort((a, b) => b.y - a.y || a.x - b.x)

    const pageLines: string[] = []
    let currentY: number | null = null
    let currentLine: string[] = []

    for (const item of lines) {
      const lineY = Math.round(item.y)
      if (currentY === null || Math.abs(lineY - currentY) <= 2) {
        currentLine.push(item.text)
      } else {
        const text = currentLine.join(' ').replace(/\s+/g, ' ').trim()
        if (text) {
          pageLines.push(text)
        }
        currentLine = [item.text]
      }
      currentY = lineY
    }

    const finalLine = currentLine.join(' ').replace(/\s+/g, ' ').trim()
    if (finalLine) {
      pageLines.push(finalLine)
    }

    if (pageLines.length > 0) {
      pageTexts.push(pageLines.join('\n'))
    }
  }

  return pageTexts.join('\n')
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
    quantity: number
    unit: string
    packageSize?: number | null
    packageUnit?: string | null
    unitPrice: number
    total: number
  }>,
  meta?: {
    subtotalAmount?: number | null
    vatAmount?: number | null
    vatRate?: number | null
  }
): InvoiceFormState {
  const draftItems: InvoiceLineItem[] = items.length
    ? items.map((item) => ({
        id: crypto.randomUUID(),
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        packageSize: item.packageSize ?? null,
        packageUnit: item.packageUnit ?? 'kg',
        unitPrice: item.unitPrice,
        total: item.total,
        ingredientId: null,
        ingredientMatch: null,
        ingredientQuery: item.description,
        createIngredient: false,
        newIngredientName: '',
        newIngredientCategory: 'Other',
        newIngredientUnit: item.unit,
      }))
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

type ExtractedInvoiceItem = {
  description: string
  quantity: number
  unit: string
  packageSize?: number | null
  packageUnit?: string | null
  unitPrice: number
  total: number
}

function normalizeExtractedItems(
  items: Array<
    | ExtractedInvoiceItem
    | {
        description?: string
        quantity?: number
        unit?: string
        unit_price?: number
        unitPrice?: number
        total?: number
      }
  >
): ExtractedInvoiceItem[] {
  return items.map((item) => ({
      description: (item as { description?: string }).description ?? '',
      quantity: Number((item as { quantity?: number }).quantity ?? 1) || 1,
      unit: (item as { unit?: string }).unit ?? 'unit',
      packageSize:
        (item as { packageSize?: number | null; package_size?: number | null }).packageSize ??
        (item as { packageSize?: number | null; package_size?: number | null }).package_size ??
        null,
      packageUnit:
        (item as { packageUnit?: string | null; package_unit?: string | null }).packageUnit ??
        (item as { packageUnit?: string | null; package_unit?: string | null }).package_unit ??
        null,
      unitPrice:
        Number(
          (item as { unitPrice?: number; unit_price?: number }).unitPrice ??
          (item as { unitPrice?: number; unit_price?: number }).unit_price ??
          0
      ) || 0,
    total:
      Number((item as { total?: number }).total ?? 0) ||
      Number(
        (
          Number((item as { quantity?: number }).quantity ?? 1) *
          Number(
            (item as { unitPrice?: number; unit_price?: number }).unitPrice ??
              (item as { unitPrice?: number; unit_price?: number }).unit_price ??
              0
          )
        ).toFixed(2)
      ),
  }))
}

function matchDraftItems(
  items: InvoiceLineItem[],
  ingredients: IngredientLookup[]
): InvoiceLineItem[] {
  return items.map((item) => {
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
  const [suppliers, setSuppliers] = useState<SupplierLookup[]>([])
  const [ingredients, setIngredients] = useState<IngredientLookup[]>([])
  const [loadingLookups, setLoadingLookups] = useState(true)
  const [csvData, setCsvData] = useState<CsvData | null>(null)
  const [csvColumnMap, setCsvColumnMap] = useState<Record<string, string>>({})

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
            .select('id, name, current_price, price_unit')
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
      const packageUnit = 'kg'
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

        console.log('[OCR] Parsed result:', payload)
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
        console.log('[PDF] Extracted text length:', text.length)
        console.log('[PDF] First 500 chars:', text.substring(0, 500))
        console.log('[OCR] Raw text:', text)

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
                  packageUnit: 'kg',
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

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to extract PDF data')
        }

        console.log('[OCR] Parsed result:', payload)
        const extractedItems = normalizeExtractedItems(payload.items ?? [])
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
                  packageUnit: 'kg',
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

      setDraft(
        buildMatchedDraft(
          '',
          '',
          new Date().toISOString().slice(0, 10),
          null,
          'image',
          null,
          [
            {
              description: '',
              quantity: 1,
              unit: 'unit',
              packageSize: null,
              packageUnit: 'kg',
              unitPrice: 0,
              total: 0,
            },
          ],
          ingredients,
          { subtotalAmount: null, vatAmount: null, vatRate: null }
        )
      )
      setStep('review')
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
              packageUnit: 'kg',
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push('/invoices')}
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
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
                    Preview
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-semibold text-slate-900">
                    {file?.name}
                  </h2>
                </div>
                {fileBadge}
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                {fileKind === 'pdf' && filePreview ? (
                  <iframe src={filePreview} className="h-[42rem] w-full" title="PDF preview" />
                ) : fileKind === 'image' && filePreview ? (
                  <div className="relative h-[42rem] w-full">
                    <Image
                      src={filePreview}
                      alt="Invoice preview"
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-[24rem] items-center justify-center">
                    <div className="text-center">
                      <FileText className="mx-auto h-12 w-12 text-slate-300" />
                      <p className="mt-3 text-sm font-medium text-slate-500">
                        Preview available after upload
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {csvData && (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-display text-xl font-semibold text-slate-900">
                  CSV column mapping
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Auto-detected mapping. Adjust it if the columns do not line up.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(['description', 'quantity', 'unit', 'unitPrice', 'total'] as const).map(
                    (field) => (
                      <label key={field} className="block">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {field}
                        </span>
                        <select
                          value={csvColumnMap[field] ?? ''}
                          onChange={(event) =>
                            setCsvColumnMap((current) => ({
                              ...current,
                              [field]: event.target.value,
                            }))
                          }
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-emerald-500"
                        >
                          <option value="">Select column</option>
                          {csvData.headers.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
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
                      const unitPrice =
                        Number.parseFloat(row[csvColumnMap.unitPrice] ?? '0') || 0
                      const packageSize = null
                      const packageUnit = 'kg'
                      const total =
                        Number.parseFloat(row[csvColumnMap.total] ?? `${quantity * unitPrice}`) ||
                        quantity * unitPrice

                      return {
                        description,
                        quantity,
                        unit,
                        packageSize,
                        packageUnit,
                        unitPrice,
                        total,
                      }
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
                    setCsvData({
                      headers: csvData.headers,
                      rows: csvData.rows,
                    })
                  }}
                  className="mt-4 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  Apply mapping
                </button>
              </div>
            )}
          </div>

          <div>
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
