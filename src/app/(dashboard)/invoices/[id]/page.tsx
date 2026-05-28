'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, Edit3, FileText, Image as ImageIcon, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import InvoiceEditor from '@/components/invoices/InvoiceEditor'
import { toast } from '@/lib/toast'
import { useInvoices, type IngredientLookup, type InvoiceRecord, type SupplierLookup } from '@/hooks/useInvoices'
import { createEmptyInvoiceItem, type InvoiceFormState, recalculateInvoiceTotals } from '@/lib/invoices'
import { cn } from '@/lib/utils'

function formatCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function statusStyles(status: InvoiceRecord['ocrStatus']) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'failed') return 'bg-red-50 text-red-700 ring-red-200'
  return 'bg-amber-50 text-amber-700 ring-amber-200'
}

function ConfirmDeleteDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Delete invoice?</h3>
            <p className="mt-2 text-sm text-slate-500">
              This will permanently remove the invoice and its line items.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function createDraftFromInvoice(invoice: InvoiceRecord | null): InvoiceFormState {
  if (!invoice) {
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

  return {
    supplierName: invoice.supplier?.name ?? '',
    supplierId: invoice.supplierId ?? null,
    supplierMatch: invoice.supplierId
      ? {
          type: 'existing' as const,
          id: invoice.supplierId,
          name: invoice.supplier?.name ?? '',
        }
      : null,
    invoiceNumber: invoice.invoiceNumber ?? '',
    invoiceDate: invoice.invoiceDate,
    currency: invoice.currency ?? 'EUR',
    notes: invoice.notes ?? '',
    totalAmount: invoice.totalAmount ?? invoice.items.reduce((sum, item) => sum + item.totalPrice, 0),
    subtotalAmount: null,
    vatAmount: null,
    vatRate: null,
    fileUrl: invoice.fileUrl ?? null,
    fileType: invoice.fileType ?? null,
    items: invoice.items.length
      ? invoice.items.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          packageSize: item.packageSize ?? null,
          packageUnit: item.packageUnit ?? 'kg',
          unitPrice: item.unitPrice,
          total: item.totalPrice,
          ingredientId: item.ingredientId ?? null,
          ingredientMatch: item.ingredientId
            ? {
                type: 'existing' as const,
                id: item.ingredientId,
                name: item.ingredient?.name ?? item.description,
              }
            : null,
          ingredientQuery: item.ingredient?.name ?? item.description,
          createIngredient: false,
          newIngredientName: '',
          newIngredientCategory: 'Other',
          newIngredientUnit: item.unit,
        }))
      : [createEmptyInvoiceItem()],
  }
}

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { getInvoiceById, deleteInvoice } = useInvoices({ autoLoad: false })
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null)
  const [draft, setDraft] = useState<InvoiceFormState>(createDraftFromInvoice(null))
  const [suppliers, setSuppliers] = useState<SupplierLookup[]>([])
  const [ingredients, setIngredients] = useState<IngredientLookup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadInvoice = async () => {
      try {
        setLoading(true)
        setError(null)
        const supabase = createClient()
        const tenantId = await resolveTenantId()

        const [invoiceData, supplierResult, ingredientResult] = await Promise.all([
          getInvoiceById(params.id),
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

        setInvoice(invoiceData)
        setDraft(createDraftFromInvoice(invoiceData))
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
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load invoice')
      } finally {
        setLoading(false)
      }
    }

    loadInvoice()
  }, [getInvoiceById, params.id])

  const refreshInvoice = async () => {
    const refreshed = await getInvoiceById(params.id)
    setInvoice(refreshed)
    if (refreshed) {
      setDraft(createDraftFromInvoice(refreshed))
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      const totals = recalculateInvoiceTotals(draft.items, draft.totalAmount)
      const response = await fetch('/api/invoices/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice?.id ?? params.id,
          supplier_name: draft.supplierName,
          supplier_id: draft.supplierId,
          supplier_match: draft.supplierMatch ?? null,
          invoice_number: draft.invoiceNumber,
          invoice_date: draft.invoiceDate,
          currency: draft.currency,
          notes: draft.notes,
          total_amount: totals.totalAmount,
          file_url: draft.fileUrl,
          file_type: draft.fileType,
          items: draft.items,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to save invoice')
      }

      toast.success('Invoice updated')
      setEditing(false)
      await refreshInvoice()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteInvoice(params.id)
      toast.success('Invoice deleted')
      router.push('/invoices')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete invoice')
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="h-8 w-48 animate-pulse rounded-full bg-slate-100" />
        <div className="mt-6 h-[32rem] animate-pulse rounded-3xl bg-slate-100" />
      </div>
    )
  }

  if (error && !invoice) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">
        {error}
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <FileText className="mx-auto h-12 w-12 text-slate-300" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">Invoice not found</h2>
        <p className="mt-2 text-sm text-slate-500">
          We could not find this invoice in the current tenant.
        </p>
        <button
          type="button"
          onClick={() => router.push('/invoices')}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to invoices
        </button>
      </div>
    )
  }

  if (editing) {
    return (
      <InvoiceEditor
        title={`Edit Invoice ${invoice.invoiceNumber ?? ''}`.trim()}
        subtitle="Update invoice details, adjust line items, and save the changes through the secure service-role API."
        draft={draft}
        onChange={setDraft}
        suppliers={suppliers}
        ingredients={ingredients}
        onSave={handleSave}
        onBack={() => setEditing(false)}
        saving={saving}
        saveLabel="Save changes"
        preview={
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Attachment preview
            </p>
            {invoice.fileUrl && invoice.fileType === 'pdf' ? (
              <iframe
                src={invoice.fileUrl}
                className="h-[28rem] w-full rounded-2xl border border-slate-200"
                title="Invoice preview"
              />
            ) : invoice.fileUrl && invoice.fileType === 'image' ? (
              <div className="relative h-[28rem] w-full overflow-hidden rounded-2xl">
                <Image
                  src={invoice.fileUrl}
                  alt="Invoice attachment"
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-[28rem] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                <div className="text-center">
                  <ImageIcon className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-500">
                    No file preview available
                  </p>
                </div>
              </div>
            )}
          </div>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push('/invoices')}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Edit3 className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-slate-900">
          {invoice.invoiceNumber ?? 'Invoice'}
        </h1>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1',
            statusStyles(invoice.ocrStatus)
          )}
        >
          {invoice.ocrStatus}
        </span>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-2xl font-semibold text-slate-900">Invoice details</h2>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Supplier</p>
                <a
                  href="/suppliers"
                  className="mt-1 inline-flex font-medium text-emerald-700 hover:underline"
                >
                  {invoice.supplier?.name ?? 'Unassigned'}
                </a>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Invoice date</p>
                <p className="mt-1 font-medium text-slate-900">{formatDate(invoice.invoiceDate)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Invoice number</p>
                <p className="mt-1 font-medium text-slate-900">
                  {invoice.invoiceNumber ?? 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Notes</p>
                <p className="mt-1 text-slate-600">{invoice.notes ?? 'No notes added'}</p>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Attached file
              </h2>
            </div>
            <div className="p-4">
              {invoice.fileUrl && invoice.fileType === 'pdf' ? (
                <iframe
                  src={invoice.fileUrl}
                  className="h-[32rem] w-full rounded-2xl border border-slate-200"
                  title="Invoice PDF preview"
                />
              ) : invoice.fileUrl && invoice.fileType === 'image' ? (
                <div className="relative h-[32rem] w-full overflow-hidden rounded-2xl">
                  <Image
                    src={invoice.fileUrl}
                    alt="Invoice attachment"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-[20rem] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                  <div className="text-center">
                    <ImageIcon className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 text-sm font-medium text-slate-500">
                      No file preview available
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-display text-2xl font-semibold text-slate-900">Invoice items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Description</th>
                    <th className="px-4 py-3 font-semibold">Qty</th>
                    <th className="px-4 py-3 font-semibold">Unit</th>
                    <th className="px-4 py-3 font-semibold">Unit price</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Ingredient</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{item.description}</td>
                      <td className="px-4 py-3 text-slate-600">{item.quantity}</td>
                      <td className="px-4 py-3 text-slate-600">{item.unit}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatCurrency(item.unitPrice, invoice.currency ?? 'EUR')}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {formatCurrency(item.totalPrice, invoice.currency ?? 'EUR')}
                      </td>
                      <td className="px-4 py-3">
                        {item.ingredientId ? (
                          <a
                            href={`/ingredients/${item.ingredientId}`}
                            className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:underline"
                          >
                            {item.ingredient?.name ?? item.ingredientId}
                          </a>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                            Unmatched
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Summary
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Items count</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{invoice.items.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total amount</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {formatCurrency(invoice.totalAmount ?? 0, invoice.currency ?? 'EUR')}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Imported</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  {formatDate(invoice.createdAt)}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          setShowDeleteConfirm(false)
          await handleDelete()
        }}
      />
    </div>
  )
}
