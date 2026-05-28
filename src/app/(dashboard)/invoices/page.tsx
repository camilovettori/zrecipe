'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Search,
  UploadCloud,
  FileText,
  ArrowUpDown,
  Sparkles,
} from 'lucide-react'
import InvoiceUploader from '@/components/invoices/InvoiceUploader'
import {
  type IngredientLookup,
  type InvoiceRecord,
  type SupplierLookup,
  useInvoices,
} from '@/hooks/useInvoices'
import { resolveTenantId } from '@/hooks/useTenant'
import { useSubscription } from '@/hooks/useSubscription'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function statusStyles(status: InvoiceRecord['ocrStatus']) {
  if (status === 'completed') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  }
  if (status === 'failed') {
    return 'bg-red-50 text-red-700 ring-red-200'
  }
  return 'bg-amber-50 text-amber-700 ring-amber-200'
}

function UploadEmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center shadow-sm">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
        <UploadCloud className="h-10 w-10" />
      </div>
      <h3 className="mt-6 font-display text-2xl font-semibold text-slate-900">
        Bring invoices into one clean workflow
      </h3>
      <p className="mt-3 max-w-xl text-sm text-slate-500">
        Upload PDFs, CSVs, or images to extract invoice lines, review the OCR draft, and
        attach each invoice to ingredients in a single pass.
      </p>
      <button
        type="button"
        onClick={onImport}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
      >
        <UploadCloud className="h-4 w-4" />
        Import Invoice
      </button>
    </div>
  )
}

function InvoicesSkeleton() {
  return (
    <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="grid grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((__, cell) => (
            <div
              key={cell}
              className="h-10 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function InvoicesPage() {
  const router = useRouter()
  const { invoices, loading, refreshInvoices, error } = useInvoices()
  const { limits } = useSubscription()
  const [uploaderOpen, setUploaderOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [suppliers, setSuppliers] = useState<SupplierLookup[]>([])
  const [ingredients, setIngredients] = useState<IngredientLookup[]>([])
  const [loadingLookups, setLoadingLookups] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('import') === '1') {
      setUploaderOpen(true)
      params.delete('import')
      router.replace(`/invoices${params.toString() ? `?${params.toString()}` : ''}`)
    }
  }, [router])

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const supabase = createClient()
        const tenantId = await resolveTenantId()

        const [supplierResult, ingredientResult] = await Promise.all([
          supabase
            .from('suppliers')
            .select('id, name, contact_email, contact_phone, address')
            .eq('tenant_id', tenantId)
            .order('name', { ascending: true }),
          supabase
            .from('ingredients')
            .select('id, name, current_price, price_unit')
            .eq('tenant_id', tenantId)
            .order('name', { ascending: true }),
        ])

        if (supplierResult.data) {
          setSuppliers(
            supplierResult.data.map((item) => ({
              id: item.id,
              name: item.name,
              contactEmail: item.contact_email ?? null,
              contactPhone: item.contact_phone ?? null,
              address: item.address ?? null,
            }))
          )
        }

        if (ingredientResult.data) {
          setIngredients(
            ingredientResult.data.map((item) => ({
              id: item.id,
              name: item.name,
              currentPrice: item.current_price ?? null,
              priceUnit: item.price_unit ?? null,
            }))
          )
        }
      } catch (error) {
        if (!(error instanceof Error)) {
          console.error('Invoice lookup load error:', error)
        }
      } finally {
        setLoadingLookups(false)
      }
    }

    loadLookups()
  }, [])

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase()
    const sorted = [...invoices].sort(
      (a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()
    )

    if (!query) {
      return sorted
    }

    return sorted.filter((invoice) => {
      const invoiceNumber = invoice.invoiceNumber?.toLowerCase() ?? ''
      const supplierName = invoice.supplier?.name.toLowerCase() ?? ''
      return invoiceNumber.includes(query) || supplierName.includes(query)
    })
  }, [invoices, search])

  const handleSaved = async () => {
    await refreshInvoices()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" />
            Invoices
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">
            Invoices
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Track every supplier bill, review OCR extraction, and link line items back to your
            ingredient catalogue.
          </p>
        </div>

        {limits.canUploadInvoices ? (
          <button
            type="button"
            onClick={() => setUploaderOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            <UploadCloud className="h-4 w-4" />
            Import Invoice
          </button>
        ) : (
          <a
            href="/settings?tab=billing"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-emerald-400 hover:text-emerald-600"
            title="Invoice import is a Pro feature"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
            Import Invoice — Pro
          </a>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by invoice # or supplier"
            className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
          />
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-sm text-slate-500 ring-1 ring-slate-200">
          <ArrowUpDown className="h-4 w-4" />
          Newest first
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
          <FileText className="h-4 w-4" />
          {filteredInvoices.length} invoices
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading || loadingLookups ? (
        <InvoicesSkeleton />
      ) : filteredInvoices.length === 0 ? (
        <UploadEmptyState onImport={() => setUploaderOpen(true)} />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Date</th>
                  <th className="px-5 py-4 font-semibold">Invoice #</th>
                  <th className="px-5 py-4 font-semibold">Supplier</th>
                  <th className="px-5 py-4 font-semibold">Items</th>
                  <th className="px-5 py-4 font-semibold">Total</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredInvoices.map((invoice, index) => (
                  <motion.tr
                    key={invoice.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/invoices/${invoice.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        router.push(`/invoices/${invoice.id}`)
                      }
                    }}
                    className="cursor-pointer transition hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {formatDate(invoice.invoiceDate)}
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-900">
                      {invoice.invoiceNumber ?? 'N/A'}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {invoice.supplier?.name ?? 'Unassigned'}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {invoice.items.length}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                      {formatCurrency(invoice.totalAmount ?? 0)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1',
                          statusStyles(invoice.ocrStatus)
                        )}
                      >
                        {invoice.ocrStatus}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <InvoiceUploader
        open={uploaderOpen}
        onOpenChange={setUploaderOpen}
        ingredients={ingredients}
        suppliers={suppliers}
        onSaved={handleSaved}
      />
    </div>
  )
}
