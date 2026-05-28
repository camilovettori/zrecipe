'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Edit3,
  Trash2,
  Save,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  type IngredientLookup,
  type InvoiceRecord,
  type SupplierLookup,
  useInvoices,
} from '@/hooks/useInvoices'
import { resolveTenantId } from '@/hooks/useTenant'

interface InvoicePageProps {
  params: {
    id: string
  }
}

interface InvoiceDraftState {
  invoiceNumber: string
  invoiceDate: string
  supplierId: string | null
  totalAmount: number
  fileUrl: string | null
  fileType: InvoiceRecord['fileType']
  items: Array<{
    id: string
    description: string
    quantity: number
    unit: string
    unitPrice: number
    totalPrice: number
    ingredientId: string | null
  }>
}

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

function ConfirmDeleteDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 16 }}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function InvoiceDetailPage({ params }: InvoicePageProps) {
  const router = useRouter()
  const { getInvoiceById, deleteInvoice, linkItemToIngredient } = useInvoices({
    autoLoad: false,
  })
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierLookup[]>([])
  const [ingredients, setIngredients] = useState<IngredientLookup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<InvoiceDraftState | null>(null)

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

        setInvoice(invoiceData)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load invoice')
      } finally {
        setLoading(false)
      }
    }

    loadInvoice()
  }, [getInvoiceById, params.id])

  useEffect(() => {
    if (!invoice) {
      setDraft(null)
      return
    }

    setDraft({
      invoiceNumber: invoice.invoiceNumber ?? '',
      invoiceDate: invoice.invoiceDate,
      supplierId: invoice.supplierId ?? null,
      totalAmount: invoice.totalAmount ?? 0,
      fileUrl: invoice.fileUrl ?? null,
      fileType: invoice.fileType,
      items: invoice.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        ingredientId: item.ingredientId ?? null,
      })),
    })
  }, [invoice])

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === draft?.supplierId) ?? invoice?.supplier ?? null,
    [draft?.supplierId, invoice?.supplier, suppliers]
  )

  const totalAmount = draft?.items.reduce((sum, item) => sum + item.totalPrice, 0) ?? 0

  const updateItem = (itemId: string, patch: Partial<InvoiceDraftState['items'][number]>) => {
    setDraft((current) => {
      if (!current) return current
      const items = current.items.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item
      )
      return {
        ...current,
        items,
        totalAmount: items.reduce((sum, item) => sum + item.totalPrice, 0),
      }
    })
  }

  const handleSave = async () => {
    if (!invoice || !draft) return

    try {
      setSaving(true)
      setError(null)

      const supabase = createClient()
      await supabase
        .from('invoices')
        .update({
          supplier_id: draft.supplierId,
          invoice_number: draft.invoiceNumber || null,
          invoice_date: draft.invoiceDate,
          total_amount: draft.totalAmount,
          file_url: draft.fileUrl,
          file_type: draft.fileType,
        })
        .eq('id', invoice.id)

      for (const item of draft.items) {
        await supabase
          .from('invoice_items')
          .update({
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
            ingredient_id: item.ingredientId,
          })
          .eq('id', item.id)

        if (item.ingredientId) {
          await linkItemToIngredient({
            invoiceItemId: item.id,
            ingredientId: item.ingredientId,
            price: item.unitPrice,
            unit: item.unit,
            invoiceId: invoice.id,
            supplierId: draft.supplierId,
            invoiceDate: draft.invoiceDate,
          })
        }
      }

      const refreshed = await getInvoiceById(invoice.id)
      setInvoice(refreshed)
      setEditing(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!invoice) return

    try {
      await deleteInvoice(invoice.id)
      router.push('/invoices')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete invoice')
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="h-8 w-48 animate-pulse rounded-full bg-slate-100" />
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="h-56 animate-pulse rounded-3xl bg-slate-100" />
            <div className="h-80 animate-pulse rounded-3xl bg-slate-100" />
          </div>
          <div className="h-[34rem] animate-pulse rounded-3xl bg-slate-100" />
        </div>
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

  if (!invoice || !draft) {
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
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setDraft({
                    invoiceNumber: invoice.invoiceNumber ?? '',
                    invoiceDate: invoice.invoiceDate,
                    supplierId: invoice.supplierId ?? null,
                    totalAmount: invoice.totalAmount ?? 0,
                    fileUrl: invoice.fileUrl ?? null,
                    fileType: invoice.fileType,
                    items: invoice.items.map((item) => ({
                      id: item.id,
                      description: item.description,
                      quantity: item.quantity,
                      unit: item.unit,
                      unitPrice: item.unitPrice,
                      totalPrice: item.totalPrice,
                      ingredientId: item.ingredientId ?? null,
                    })),
                  })
                }}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Edit3 className="h-4 w-4" />
              Edit mode
            </button>
          )}
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

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm text-slate-500">Invoice date</p>
                {editing ? (
                  <input
                    type="date"
                    value={draft.invoiceDate}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, invoiceDate: event.target.value } : current
                      )
                    }
                    className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
                  />
                ) : (
                  <h1 className="font-display text-3xl font-semibold text-slate-900">
                    {formatDate(invoice.invoiceDate)}
                  </h1>
                )}
              </div>

              <div className="text-right">
                <p className="text-sm text-slate-500">Invoice number</p>
                {editing ? (
                  <input
                    value={draft.invoiceNumber}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, invoiceNumber: event.target.value }
                          : current
                      )
                    }
                    className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
                  />
                ) : (
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {invoice.invoiceNumber ?? 'N/A'}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Supplier
                </p>
                {editing ? (
                  <select
                    value={draft.supplierId ?? ''}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              supplierId: event.target.value || null,
                            }
                          : current
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
                  >
                    <option value="">Unassigned</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {selectedSupplier?.name ?? 'Unassigned'}
                  </p>
                )}
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total amount
                </p>
                {editing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={draft.totalAmount}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, totalAmount: Number.parseFloat(event.target.value || '0') }
                          : current
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
                  />
                ) : (
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCurrency(invoice.totalAmount ?? totalAmount)}
                  </p>
                )}
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </p>
                <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                  {invoice.ocrStatus}
                </span>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold text-slate-900">
                  Line items
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Match each row back to an ingredient and keep pricing current.
                </p>
              </div>
              <div className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                {draft.items.length} rows
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
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
                <tbody className="divide-y divide-slate-100">
                  {draft.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        {editing ? (
                          <input
                            value={item.description}
                            onChange={(event) =>
                              updateItem(item.id, { description: event.target.value })
                            }
                            className="w-56 rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-emerald-500"
                          />
                        ) : (
                          <span className="font-medium text-slate-900">{item.description}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editing ? (
                          <input
                            type="number"
                            step="0.001"
                            value={item.quantity}
                            onChange={(event) =>
                              updateItem(item.id, {
                                quantity: Number.parseFloat(event.target.value || '0'),
                              })
                            }
                            className="w-24 rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-emerald-500"
                          />
                        ) : (
                          <span>{item.quantity}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editing ? (
                          <input
                            value={item.unit}
                            onChange={(event) => updateItem(item.id, { unit: event.target.value })}
                            className="w-24 rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-emerald-500"
                          />
                        ) : (
                          <span>{item.unit}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(event) =>
                              updateItem(item.id, {
                                unitPrice: Number.parseFloat(event.target.value || '0'),
                              })
                            }
                            className="w-28 rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-emerald-500"
                          />
                        ) : (
                          <span>{formatCurrency(item.unitPrice)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={item.totalPrice}
                            onChange={(event) =>
                              updateItem(item.id, {
                                totalPrice: Number.parseFloat(event.target.value || '0'),
                              })
                            }
                            className="w-28 rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-emerald-500"
                          />
                        ) : (
                          <span className="font-medium text-slate-900">
                            {formatCurrency(item.totalPrice)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editing ? (
                          <select
                            value={item.ingredientId ?? ''}
                            onChange={(event) =>
                              updateItem(item.id, {
                                ingredientId: event.target.value || null,
                              })
                            }
                            className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 outline-none transition focus:border-emerald-500"
                          >
                            <option value="">No ingredient</option>
                            {ingredients.map((ingredient) => (
                              <option key={ingredient.id} value={ingredient.id}>
                                {ingredient.name}
                              </option>
                            ))}
                          </select>
                        ) : item.ingredientId ? (
                          <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            {ingredients.find((ingredient) => ingredient.id === item.ingredientId)
                              ?.name ?? item.ingredientId}
                          </span>
                        ) : (
                          <span className="text-slate-400">Unmatched</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.section>
        </div>

        <motion.aside
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="space-y-6"
        >
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Attached file
              </h2>
            </div>
            <div className="p-4">
              {invoice.fileUrl && invoice.fileType === 'pdf' ? (
                <iframe
                  src={invoice.fileUrl}
                  className="h-[28rem] w-full rounded-2xl border border-slate-200"
                  title="Invoice PDF preview"
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

              {invoice.fileUrl && (
                <a
                  href={invoice.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 transition hover:text-emerald-600"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open attachment
                </a>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Supplier info
            </h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Supplier</p>
                <p className="mt-1 font-medium text-slate-900">
                  {selectedSupplier?.name ?? invoice.supplier?.name ?? 'Unassigned'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Contact</p>
                <p className="mt-1">
                  {selectedSupplier?.contactEmail ??
                    invoice.supplier?.contactEmail ??
                    'No contact email'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Phone</p>
                <p className="mt-1">
                  {selectedSupplier?.contactPhone ??
                    invoice.supplier?.contactPhone ??
                    'No phone number'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Address</p>
                <p className="mt-1">
                  {selectedSupplier?.address ?? invoice.supplier?.address ?? 'No address'}
                </p>
              </div>
            </div>
          </section>
        </motion.aside>
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
