'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Search, Sparkles, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  type IngredientLookup,
  type InvoiceDraftInput,
  type InvoiceFileType,
  type InvoiceRecord,
  type SupplierLookup,
  useInvoices,
} from '@/hooks/useInvoices'
import { resolveTenantId } from '@/hooks/useTenant'
import { cn } from '@/lib/utils'

export interface OCRDraftRow {
  id: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
  ingredientId?: string | null
  createIngredient?: boolean
}

export interface OCRReviewData {
  supplierName: string
  supplierId?: string | null
  invoiceNumber?: string | null
  invoiceDate: string
  totalAmount?: number | null
  currency?: string | null
  fileUrl?: string | null
  fileType?: InvoiceFileType | null
  rawText?: string | null
  lineItems: OCRDraftRow[]
}

interface SearchableSelectProps<T extends { id: string; name: string }> {
  label: string
  value: string
  onValueChange: (value: string) => void
  items: T[]
  placeholder: string
  onCreate?: (value: string) => void
  allowCreate?: boolean
}

function SearchableSelect<T extends { id: string; name: string }>({
  label,
  value,
  onValueChange,
  items,
  placeholder,
  onCreate,
  allowCreate = false,
}: SearchableSelectProps<T>) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(value)
  }, [value])

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return items.slice(0, 6)
    return items.filter((item) => item.name.toLowerCase().includes(search)).slice(0, 6)
  }, [items, query])

  const exactMatch = items.some((item) => item.name.toLowerCase() === query.trim().toLowerCase())

  return (
    <div className="relative">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            onValueChange(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white px-10 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
        />
      </div>

      <AnimatePresence>
        {open && (filtered.length > 0 || (allowCreate && query.trim() && !exactMatch)) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="absolute z-20 mt-2 max-h-60 w-full overflow-auto rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setQuery(item.name)
                  onValueChange(item.name)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <span>{item.name}</span>
                {item.name.toLowerCase() === value.trim().toLowerCase() && (
                  <span className="text-xs text-emerald-600">Selected</span>
                )}
              </button>
            ))}

            {allowCreate && query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={() => onCreate?.(query.trim())}
                className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-left text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
              >
                <Plus className="h-4 w-4" />
                Create {query.trim()}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function currency(value: number, code = 'EUR') {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function buildInvoiceInput(draft: OCRReviewData, items: OCRDraftRow[]): InvoiceDraftInput {
  return {
    supplierId: draft.supplierId ?? null,
    supplierName: draft.supplierName,
    invoiceNumber: draft.invoiceNumber ?? null,
    invoiceDate: draft.invoiceDate,
    totalAmount:
      draft.totalAmount ??
      items.reduce((sum, item) => sum + Number(item.total || 0), 0),
    currency: draft.currency ?? 'EUR',
    fileUrl: draft.fileUrl ?? null,
    fileType: draft.fileType ?? null,
    notes: null,
    ocrRawData: {
      rawText: draft.rawText ?? '',
    },
    items: items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity || 0),
      unit: item.unit || 'unit',
      unitPrice: Number(item.unitPrice || 0),
      total: Number(item.total || 0),
      ingredientId: item.ingredientId ?? null,
      createIngredient: Boolean(item.createIngredient),
    })),
  }
}

export default function OCRReviewModal({
  open,
  draft,
  ingredients,
  suppliers,
  onClose,
  onSaved,
}: {
  open: boolean
  draft: OCRReviewData | null
  ingredients: IngredientLookup[]
  suppliers: SupplierLookup[]
  onClose: () => void
  onSaved: (invoice: InvoiceRecord) => void
}) {
  const [localDraft, setLocalDraft] = useState<OCRReviewData | null>(draft)
  const [supplierQuery, setSupplierQuery] = useState(draft?.supplierName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rowIngredientQueries, setRowIngredientQueries] = useState<Record<string, string>>({})
  const { createInvoiceWithItems, linkItemToIngredient } = useInvoices({
    autoLoad: false,
  })

  useEffect(() => {
    if (open) {
      setLocalDraft(draft)
      setSupplierQuery(draft?.supplierName ?? '')
      setRowIngredientQueries({})
      setError(null)
    }
  }, [draft, open])

  const selectedSupplier = useMemo(
    () =>
      suppliers.find(
        (supplier) => supplier.name.toLowerCase() === supplierQuery.trim().toLowerCase()
      ) ?? null,
    [supplierQuery, suppliers]
  )

  const totalAmount = useMemo(() => {
    if (!localDraft) return 0
    return localDraft.lineItems.reduce((sum, row) => sum + Number(row.total || 0), 0)
  }, [localDraft])

  const updateRow = (rowId: string, patch: Partial<OCRDraftRow>) => {
    setLocalDraft((current) => {
      if (!current) return current
      return {
        ...current,
        lineItems: current.lineItems.map((row) =>
          row.id === rowId ? { ...row, ...patch } : row
        ),
      }
    })
  }

  const createIngredientForRow = async (row: OCRDraftRow) => {
    const supabase = createClient()
    const tenantId = await resolveTenantId()
    const name = row.description.trim()
    if (!name) {
      throw new Error('Ingredient description is required.')
    }

    const { data, error: insertError } = await supabase
      .from('ingredients')
      .insert({
        tenant_id: tenantId,
        name,
        current_price: row.unitPrice,
        price_unit: row.unit,
        last_purchase_date: localDraft?.invoiceDate ?? new Date().toISOString().slice(0, 10),
      })
      .select('id, name, current_price, price_unit')
      .single()

    if (insertError || !data) {
      throw insertError ?? new Error('Unable to create ingredient')
    }

    return data as IngredientLookup
  }

  const createSupplierIfNeeded = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      throw new Error('Supplier is required.')
    }

    if (selectedSupplier) {
      return selectedSupplier
    }

    const supabase = createClient()
    const tenantId = await resolveTenantId()
    const { data, error: insertError } = await supabase
      .from('suppliers')
      .insert({
        tenant_id: tenantId,
        name: trimmed,
      })
      .select('id, name, contact_email, contact_phone, address')
      .single()

    if (insertError || !data) {
      throw insertError ?? new Error('Unable to create supplier')
    }

    return {
      id: data.id,
      name: data.name,
      contactEmail: data.contact_email ?? null,
      contactPhone: data.contact_phone ?? null,
      address: data.address ?? null,
    } satisfies SupplierLookup
  }

  const handleSave = async () => {
    if (!localDraft) return

    try {
      setSaving(true)
      setError(null)

      const supplier = await createSupplierIfNeeded(supplierQuery)
      const preparedRows: OCRDraftRow[] = []

      for (const row of localDraft.lineItems) {
        let ingredientId = row.ingredientId ?? null

        if (row.createIngredient && !ingredientId) {
          const ingredient = await createIngredientForRow(row)
          ingredientId = ingredient.id
        }

        preparedRows.push({ ...row, ingredientId })
      }

      const createdInvoice = await createInvoiceWithItems(
        buildInvoiceInput(
          {
            ...localDraft,
            supplierName: supplier.name,
            supplierId: supplier.id,
            totalAmount,
          },
          preparedRows
        )
      )

      for (let index = 0; index < createdInvoice.items.length; index += 1) {
        const createdItem = createdInvoice.items[index]
        const preparedRow = preparedRows[index]
        if (!createdItem || !preparedRow?.ingredientId) {
          continue
        }

        await linkItemToIngredient({
          invoiceItemId: createdItem.id,
          ingredientId: preparedRow.ingredientId,
          price: preparedRow.unitPrice,
          unit: preparedRow.unit,
          invoiceId: createdInvoice.id,
          supplierId: supplier.id,
          invoiceDate: localDraft.invoiceDate,
        })
      }

      onSaved(createdInvoice)
      onClose()
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Unable to save invoice'
      )
    } finally {
      setSaving(false)
    }
  }

  if (!open || !localDraft) {
    return null
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex bg-slate-950/85 backdrop-blur-sm"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 text-white">
              <div>
                <p className="text-sm text-white/60">Review extracted invoice</p>
                <h2 className="font-display text-2xl font-semibold">Confirm OCR data</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Close review modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 rounded-3xl bg-slate-50 p-4 shadow-2xl ring-1 ring-black/10 sm:p-6">
                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                  <SearchableSelect
                    label="Supplier"
                    value={supplierQuery}
                    onValueChange={setSupplierQuery}
                    items={suppliers}
                    placeholder="Search or create a supplier"
                    allowCreate
                    onCreate={(value) => setSupplierQuery(value)}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Invoice date
                      </label>
                      <input
                        type="date"
                        value={localDraft.invoiceDate}
                        onChange={(event) =>
                          setLocalDraft((current) =>
                            current
                              ? { ...current, invoiceDate: event.target.value }
                              : current
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Invoice number
                      </label>
                      <input
                        type="text"
                        value={localDraft.invoiceNumber ?? ''}
                        onChange={(event) =>
                          setLocalDraft((current) =>
                            current
                              ? { ...current, invoiceNumber: event.target.value }
                              : current
                          )
                        }
                        placeholder="INV-2026-001"
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Items
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {localDraft.lineItems.length}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Total
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {currency(totalAmount, localDraft.currency ?? 'EUR')}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      OCR status
                    </p>
                    <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                      <Sparkles className="h-4 w-4" />
                      Ready to save
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">Invoice items</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Edit the extracted values, match ingredients, or create new ones from a row.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Description</th>
                          <th className="px-4 py-3 font-semibold">Quantity</th>
                          <th className="px-4 py-3 font-semibold">Unit</th>
                          <th className="px-4 py-3 font-semibold">Unit price</th>
                          <th className="px-4 py-3 font-semibold">Total</th>
                          <th className="px-4 py-3 font-semibold">Match ingredient</th>
                          <th className="px-4 py-3 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {localDraft.lineItems.map((row) => {
                          const ingredientQuery =
                            rowIngredientQueries[row.id] ??
                            ingredients.find((ingredient) => ingredient.id === row.ingredientId)
                              ?.name ??
                            ''
                          const matchingIngredients = ingredients
                            .filter((ingredient) =>
                              ingredient.name.toLowerCase().includes(ingredientQuery.toLowerCase())
                            )
                            .slice(0, 6)

                          return (
                            <tr key={row.id} className="align-top">
                              <td className="px-4 py-3">
                                <input
                                  value={row.description}
                                  onChange={(event) =>
                                    updateRow(row.id, { description: event.target.value })
                                  }
                                  className="w-56 rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-emerald-500"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  step="0.001"
                                  value={row.quantity}
                                  onChange={(event) =>
                                    updateRow(row.id, {
                                      quantity: Number.parseFloat(event.target.value || '0'),
                                    })
                                  }
                                  className="w-24 rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-emerald-500"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  value={row.unit}
                                  onChange={(event) => updateRow(row.id, { unit: event.target.value })}
                                  className="w-24 rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-emerald-500"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={row.unitPrice}
                                  onChange={(event) =>
                                    updateRow(row.id, {
                                      unitPrice: Number.parseFloat(event.target.value || '0'),
                                    })
                                  }
                                  className="w-28 rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-emerald-500"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={row.total}
                                  onChange={(event) =>
                                    updateRow(row.id, {
                                      total: Number.parseFloat(event.target.value || '0'),
                                    })
                                  }
                                  className="w-28 rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-emerald-500"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="space-y-2">
                                  <input
                                    value={ingredientQuery}
                                    onChange={(event) => {
                                      setRowIngredientQueries((current) => ({
                                        ...current,
                                        [row.id]: event.target.value,
                                      }))
                                      updateRow(row.id, { ingredientId: null, createIngredient: false })
                                    }}
                                    placeholder="Search ingredients"
                                    className="w-64 rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-emerald-500"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    {matchingIngredients.map((ingredient) => (
                                      <button
                                        key={ingredient.id}
                                        type="button"
                                        onClick={() => {
                                          setRowIngredientQueries((current) => ({
                                            ...current,
                                            [row.id]: ingredient.name,
                                          }))
                                          updateRow(row.id, {
                                            ingredientId: ingredient.id,
                                            createIngredient: false,
                                          })
                                        }}
                                        className={cn(
                                          'rounded-full border px-3 py-1 text-xs transition',
                                          row.ingredientId === ingredient.id
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        )}
                                      >
                                        {ingredient.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateRow(row.id, {
                                        createIngredient: !row.createIngredient,
                                      })
                                    }
                                    className={cn(
                                      'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition',
                                      row.createIngredient
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    )}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    {row.createIngredient ? 'Creating' : 'Create ingredient'}
                                  </button>
                                  {row.ingredientId && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                                      Linked
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setLocalDraft((current) =>
                        current
                          ? {
                              ...current,
                              lineItems: [
                                ...current.lineItems,
                                {
                                  id: crypto.randomUUID(),
                                  description: '',
                                  quantity: 1,
                                  unit: 'unit',
                                  unitPrice: 0,
                                  total: 0,
                                },
                              ],
                            }
                          : current
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add row
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save Invoice
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
