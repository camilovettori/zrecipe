'use client'

import { useMemo, useState } from 'react'
import { Plus, Search, Truck, Pencil, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import EmptyState from '@/components/shared/EmptyState'
import SupplierSlideOver from '@/components/suppliers/SupplierSlideOver'
import { useSuppliers, type SupplierRecord } from '@/hooks/useSuppliers'
import { cn } from '@/lib/utils'

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export default function SuppliersPage() {
  const { suppliers, loading, error, createSupplier, updateSupplier, deleteSupplier } =
    useSuppliers()
  const [query, setQuery] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null)
  const [saving, setSaving] = useState(false)

  const filteredSuppliers = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return suppliers
    return suppliers.filter((supplier) => supplier.name.toLowerCase().includes(search))
  }, [query, suppliers])

  const openCreate = () => {
    setEditingSupplier(null)
    setPanelOpen(true)
  }

  const openEdit = (supplier: SupplierRecord) => {
    setEditingSupplier(supplier)
    setPanelOpen(true)
  }

  const handleSave = async (values: {
    name: string
    email: string
    phone: string
    address: string
    notes: string
    quantityInThousands: boolean
  }) => {
    try {
      setSaving(true)
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, {
          name: values.name,
          email: values.email || null,
          phone: values.phone || null,
          address: values.address || null,
          notes: values.notes || null,
          quantityInThousands: values.quantityInThousands,
        })
        toast.success('Supplier updated')
      } else {
        await createSupplier({
          name: values.name,
          email: values.email || null,
          phone: values.phone || null,
          address: values.address || null,
          notes: values.notes || null,
          quantityInThousands: values.quantityInThousands,
        })
        toast.success('Supplier created')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save supplier')
      throw err
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (supplier: SupplierRecord) => {
    const confirmed = window.confirm(`Delete ${supplier.name}? This cannot be undone.`)
    if (!confirmed) return

    try {
      await deleteSupplier(supplier.id)
      toast.success('Supplier deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete supplier')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            <Truck className="h-3.5 w-3.5" />
            Suppliers
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">
            Suppliers
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Track suppliers, invoices, and contact details from one lightweight hub.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" />
          Add Supplier
        </button>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search suppliers..."
            className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
          />
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
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="grid grid-cols-[1.6fr_1fr_1fr_0.8fr_1fr_0.7fr] gap-4 p-4"
              >
                <div className="h-5 w-40 animate-pulse rounded bg-slate-100" />
                <div className="h-5 w-36 animate-pulse rounded bg-slate-100" />
                <div className="h-5 w-28 animate-pulse rounded bg-slate-100" />
                <div className="h-5 w-24 animate-pulse rounded bg-slate-100" />
                <div className="h-5 w-28 animate-pulse rounded bg-slate-100" />
                <div className="h-5 w-20 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={query.trim() ? 'No suppliers found' : 'Add your first supplier'}
          description={
            query.trim()
              ? 'Try a different search term.'
              : 'Keep supplier contact details and invoice history in one place.'
          }
          action={
            !query.trim()
              ? { label: 'Add Supplier', onClick: openCreate }
              : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Name</th>
                  <th className="px-5 py-4 font-semibold">Email</th>
                  <th className="px-5 py-4 font-semibold">Phone</th>
                  <th className="px-5 py-4 font-semibold">Invoices</th>
                  <th className="px-5 py-4 font-semibold">Last invoice date</th>
                  <th className="px-5 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredSuppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="cursor-pointer transition hover:bg-slate-50"
                    onClick={() => openEdit(supplier)}
                  >
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-medium text-slate-900">{supplier.name}</p>
                        <p className="text-xs text-slate-500">{supplier.notes || 'No notes'}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {supplier.email || '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {supplier.phone || '—'}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                      {supplier.invoiceCount}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {formatDate(supplier.lastInvoiceDate)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            openEdit(supplier)
                          }}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleDelete(supplier)
                          }}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100'
                          )}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SupplierSlideOver
        open={panelOpen}
        supplier={editingSupplier}
        onClose={() => setPanelOpen(false)}
        onSave={async (values) => {
          if (saving) return
          await handleSave(values)
        }}
      />
    </div>
  )
}
