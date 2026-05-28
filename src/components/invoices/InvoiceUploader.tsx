'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  UploadCloud,
  X,
  Image as ImageIcon,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import OCRReviewModal, { type OCRReviewData, type OCRDraftRow } from './OCRReviewModal'
import type {
  IngredientLookup,
  InvoiceFileType,
  InvoiceRecord,
  SupplierLookup,
} from '@/hooks/useInvoices'
import { cn } from '@/lib/utils'

type ParsedCsvData = {
  headers: string[]
  rows: Record<string, string>[]
}

const EXPECTED_COLUMNS = [
  { key: 'description', label: 'Description' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'unit', label: 'Unit' },
  { key: 'unitPrice', label: 'Unit Price' },
  { key: 'total', label: 'Total' },
] as const

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function autoMapColumns(headers: string[]) {
  const normalized = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }))

  const map: Record<string, string> = {}

  for (const field of EXPECTED_COLUMNS) {
    const match = normalized.find(({ normalized: header }) => {
      if (field.key === 'description') {
        return /description|item|product|article|name/.test(header)
      }
      if (field.key === 'quantity') {
        return /qty|quantity|amount|count/.test(header)
      }
      if (field.key === 'unit') {
        return /unit|uom|measure/.test(header)
      }
      if (field.key === 'unitPrice') {
        return /unitprice|priceeach|priceperunit|price/.test(header)
      }
      return /total|amount|lineitemtotal|subtotal/.test(header)
    })

    if (match) {
      map[field.key] = match.original
    }
  }

  return map
}

function fileTypeFromName(file: File): InvoiceFileType {
  if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (file.type.includes('csv') || file.name.toLowerCase().endsWith('.csv')) return 'csv'
  return 'image'
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Unable to read file preview'))
    reader.readAsDataURL(file)
  })
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Unable to read file'))
    reader.readAsText(file)
  })
}

async function extractPdfText(file: File) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const pageTexts: string[] = []

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim()
    if (text) {
      pageTexts.push(text)
    }
  }

  return pageTexts.join('\n')
}

export default function InvoiceUploader({
  open,
  onOpenChange,
  ingredients,
  suppliers,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ingredients: IngredientLookup[]
  suppliers: SupplierLookup[]
  onSaved: (invoice: InvoiceRecord) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [csvData, setCsvData] = useState<ParsedCsvData | null>(null)
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [reviewDraft, setReviewDraft] = useState<OCRReviewData | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  const fileKind = useMemo(() => (file ? fileTypeFromName(file) : null), [file])

  useEffect(() => {
    if (!open) {
      setFile(null)
      setFilePreview(null)
      setCsvData(null)
      setColumnMap({})
      setProgress(0)
      setProcessing(false)
      setError(null)
      setReviewDraft(null)
      setReviewOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (!file) {
      return
    }

    let active = true
    readFileAsDataUrl(file)
      .then((dataUrl) => {
        if (active) {
          setFilePreview(dataUrl)
        }
      })
      .catch(() => {
        if (active) {
          setFilePreview(null)
        }
      })

    return () => {
      active = false
    }
  }, [file])

  const onDrop = async (acceptedFiles: File[]) => {
    try {
      const nextFile = acceptedFiles[0]
      if (!nextFile) return

      setError(null)
      setReviewDraft(null)
      setReviewOpen(false)
      setFile(nextFile)
      setProgress(10)

      if (fileTypeFromName(nextFile) === 'csv') {
        const text = await readFileAsText(nextFile)
        const parsed = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
        })

        const rows = (parsed.data ?? []).filter((row) => Object.keys(row).length > 0)
        const headers = parsed.meta.fields ?? Object.keys(rows[0] ?? {})

        setCsvData({ headers, rows })
        setColumnMap(autoMapColumns(headers))
      } else {
        setCsvData(null)
        setColumnMap({})
      }

      setProgress(30)
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : 'Unable to read file')
      setProgress(0)
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

  const buildCsvDraft = (): OCRReviewData => {
    if (!csvData) {
      throw new Error('No CSV data found')
    }

    const lineItems: OCRDraftRow[] = csvData.rows.map((row, index) => {
      const description = row[columnMap.description] ?? row.Description ?? row.Item ?? ''
      const quantity = Number.parseFloat(row[columnMap.quantity] ?? row.Quantity ?? '1') || 1
      const unit = row[columnMap.unit] ?? row.Unit ?? 'unit'
      const unitPrice =
        Number.parseFloat(row[columnMap.unitPrice] ?? row['Unit Price'] ?? '0') || 0
      const total =
        Number.parseFloat(row[columnMap.total] ?? row.Total ?? `${quantity * unitPrice}`) ||
        quantity * unitPrice

      return {
        id: `${csvData.headers.join('-')}-${index}-${crypto.randomUUID()}`,
        description,
        quantity,
        unit,
        unitPrice,
        total,
      }
    })

    return {
      supplierName: file?.name.replace(/\.[^.]+$/, '') ?? 'CSV import',
      invoiceNumber: undefined,
      invoiceDate: new Date().toISOString().slice(0, 10),
      totalAmount: lineItems.reduce((sum, item) => sum + item.total, 0),
      currency: 'EUR',
      fileUrl: filePreview,
      fileType: 'csv',
      rawText: csvData.rows.map((row) => JSON.stringify(row)).join('\n'),
      lineItems,
    }
  }

  const buildImageDraft = (): OCRReviewData => ({
    supplierName: '',
    invoiceNumber: undefined,
    invoiceDate: new Date().toISOString().slice(0, 10),
    totalAmount: null,
    currency: 'EUR',
    fileUrl: filePreview,
    fileType: 'image',
    rawText: null,
    lineItems: [
      {
        id: crypto.randomUUID(),
        description: '',
        quantity: 1,
        unit: 'unit',
        unitPrice: 0,
        total: 0,
      },
    ],
  })

  const handleProcess = async () => {
    if (!file) {
      setError('Please select a file first.')
      return
    }

    try {
      setProcessing(true)
      setError(null)
      setProgress(40)

      if (fileKind === 'csv') {
        const draft = buildCsvDraft()
        setReviewDraft(draft)
        setReviewOpen(true)
        setProgress(100)
        return
      }

      if (fileKind === 'pdf') {
        setProgress(55)
        const text = await extractPdfText(file)
        setProgress(75)
        const response = await fetch('/api/ocr/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })

        if (!response.ok) {
          throw new Error('Unable to process the PDF')
        }

        const result = (await response.json()) as {
          supplierName?: string
          invoiceNumber?: string
          invoiceDate?: string
          totalAmount?: number | null
          currency?: string
          lineItems?: Array<{
            description: string
            quantity: number
            unit: string
            unitPrice: number
            total: number
          }>
          rawText?: string
        }

        const draft: OCRReviewData = {
          supplierName: result.supplierName ?? '',
          invoiceNumber: result.invoiceNumber ?? undefined,
          invoiceDate: result.invoiceDate ?? new Date().toISOString().slice(0, 10),
          totalAmount: result.totalAmount ?? null,
          currency: result.currency ?? 'EUR',
          fileUrl: filePreview,
          fileType: 'pdf',
          rawText: result.rawText ?? text,
          lineItems: (result.lineItems ?? []).map((item) => ({
            id: crypto.randomUUID(),
            description: item.description,
            quantity: Number(item.quantity || 0),
            unit: item.unit || 'unit',
            unitPrice: Number(item.unitPrice || 0),
            total: Number(item.total || 0),
          })),
        }

        if (draft.lineItems.length === 0) {
          draft.lineItems.push({
            id: crypto.randomUUID(),
            description: '',
            quantity: 1,
            unit: 'unit',
            unitPrice: 0,
            total: 0,
          })
        }

        setReviewDraft(draft)
        setReviewOpen(true)
        setProgress(100)
        return
      }

      setProgress(70)
      setReviewDraft(buildImageDraft())
      setReviewOpen(true)
      setProgress(100)
    } catch (processError) {
      setError(
        processError instanceof Error ? processError.message : 'Unable to process file'
      )
    } finally {
      setProcessing(false)
    }
  }

  const currentRows = csvData?.rows.slice(0, 5) ?? []

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 24, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-emerald-600">Import Invoice</p>
                  <h2 className="font-display text-2xl font-semibold text-slate-900">
                    Upload file to extract invoice data
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Close uploader"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div
                    {...getRootProps()}
                    className={cn(
                      'flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition',
                      isDragActive
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/50'
                    )}
                  >
                    <input {...getInputProps()} />
                    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                      <UploadCloud className="h-10 w-10 text-emerald-600" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">
                      Drop your invoice here
                    </h3>
                    <p className="mt-2 max-w-md text-sm text-slate-500">
                      PDF, CSV, PNG, and JPG files are supported. PDFs run through text
                      extraction, CSVs use column mapping, and images can be reviewed manually.
                    </p>
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="mt-5 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                    >
                      Browse files
                    </button>
                  </div>

                  {error && (
                    <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {processing && (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">Processing</span>
                        <span className="text-slate-500">{progress}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      {fileKind === 'pdf' ? (
                        <FileText className="h-6 w-6 text-emerald-600" />
                      ) : fileKind === 'csv' ? (
                        <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-emerald-600" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {file?.name ?? 'No file selected'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {file?.type || 'Awaiting upload'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                      {fileKind === 'image' && filePreview ? (
                        <div className="relative h-64 w-full">
                          <Image
                            src={filePreview}
                            alt="Invoice preview"
                            fill
                            unoptimized
                            className="object-cover"
                          />
                        </div>
                      ) : fileKind === 'csv' && currentRows.length > 0 ? (
                        <div className="overflow-auto">
                          <table className="min-w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-500">
                              <tr>
                                {csvData?.headers.slice(0, 4).map((header) => (
                                  <th key={header} className="px-3 py-2 font-semibold">
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {currentRows.map((row, index) => (
                                <tr key={`${file?.name}-${index}`}>
                                  {csvData?.headers.slice(0, 4).map((header) => (
                                    <td key={header} className="px-3 py-2 text-slate-600">
                                      {row[header] ?? 'N/A'}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="flex h-64 items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50">
                          <div className="text-center">
                            <FileText className="mx-auto h-12 w-12 text-slate-300" />
                            <p className="mt-3 text-sm font-medium text-slate-600">
                              {fileKind === 'pdf'
                                ? 'PDF preview will use extracted text'
                                : 'Preview appears here after upload'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {csvData && (
                    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="text-sm font-semibold text-slate-900">CSV column mapping</h3>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {EXPECTED_COLUMNS.map((field) => (
                          <label key={field.key} className="block">
                            <span className="mb-1 block text-xs font-medium text-slate-500">
                              {field.label}
                            </span>
                            <select
                              value={columnMap[field.key] ?? ''}
                              onChange={(event) =>
                                setColumnMap((current) => ({
                                  ...current,
                                  [field.key]: event.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
                            >
                              <option value="">Select a column</option>
                              {csvData.headers.map((header) => (
                                <option key={header} value={header}>
                                  {header}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      {fileKind === 'pdf'
                        ? 'PDFs extract text locally before sending the content to the OCR parser.'
                        : fileKind === 'csv'
                          ? 'CSV rows are mapped into invoice items for review.'
                          : 'Images open the review step so you can correct fields before saving.'}
                    </div>
                    <button
                      type="button"
                      onClick={handleProcess}
                      disabled={!file || processing}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Process
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <OCRReviewModal
        open={reviewOpen}
        draft={reviewDraft}
        ingredients={ingredients}
        suppliers={suppliers}
        onClose={() => {
          setReviewOpen(false)
          onOpenChange(false)
        }}
        onSaved={(invoice) => {
          onSaved(invoice)
          setReviewOpen(false)
          onOpenChange(false)
        }}
      />
    </>
  )
}
