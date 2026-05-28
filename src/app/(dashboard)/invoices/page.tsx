'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowUpDown, FileText, Plus, Search, UploadCloud } from 'lucide-react'
import { useInvoices, type InvoiceRecord } from '@/hooks/useInvoices'
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
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'failed') return 'bg-red-50 text-red-700 ring-red-200'
  return 'bg-amber-50 text-amber-700 ring-amber-200'
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center shadow-sm">
      <div className="rounded-3xl bg-emerald-50 p-5 text-emerald-600">
        <FileText className="h-12 w-12" />
      </div>
      <h3 className="mt-6 font-display text-2xl font-semibold text-slate-900">
        No invoices yet
      </h3>
      <p className="mt-3 max-w-xl text-sm text-slate-500">
        Start by importing a PDF or CSV, or create a manual invoice entry when you already have
        the details ready.
      </p>
    </div>
  )
}

export default function InvoicesPage() {
  const router = useRouter()
  const { invoices, loading, error } = useInvoices()
  const [search, setSearch] = useState('')

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase()
    const sorted = [...invoices].sort(
      (a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()
    )

    if (!query) return sorted

    return sorted.filter((invoice) => {
      const invoiceNumber = invoice.invoiceNumber?.toLowerCase() ?? ''
      const supplierName = invoice.supplier?.name.toLowerCase() ?? ''
      return invoiceNumber.includes(query) || supplierName.includes(query)
    })
  }, [invoices, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Invoices
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">
            Invoices
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Track every supplier bill, import PDFs or CSVs, and manage invoices in one place.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push('/invoices/import')}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            <UploadCloud className="h-4 w-4" />
            Import Invoice
          </button>
          <button
            type="button"
            onClick={() => router.push('/invoices/new')}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Manual Entry
          </button>
        </div>
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

      {loading ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid grid-cols-6 gap-4 p-4">
                {Array.from({ length: 6 }).map((__, cell) => (
                  <div key={cell} className="h-10 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Date</th>
                  <th className="px-5 py-4 font-semibold">Invoice #</th>
                  <th className="px-5 py-4 font-semibold">Supplier</th>
                  <th className="px-5 py-4 font-semibold">Items Count</th>
                  <th className="px-5 py-4 font-semibold">Total (€)</th>
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
                      {formatCurrency(invoice.totalAmount ?? 0, invoice.currency ?? 'EUR')}
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
    </div>
  )
}
