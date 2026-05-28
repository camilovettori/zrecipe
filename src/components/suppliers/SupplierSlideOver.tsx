'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SupplierRecord } from '@/hooks/useSuppliers'

export interface SupplierFormValues {
  name: string
  email: string
  phone: string
  address: string
  notes: string
}

const EMPTY_VALUES: SupplierFormValues = {
  name: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
}

export default function SupplierSlideOver({
  open,
  supplier,
  onClose,
  onSave,
}: {
  open: boolean
  supplier: SupplierRecord | null
  onClose: () => void
  onSave: (values: SupplierFormValues) => Promise<void>
}) {
  const [values, setValues] = useState<SupplierFormValues>(EMPTY_VALUES)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues({
      name: supplier?.name ?? '',
      email: supplier?.email ?? '',
      phone: supplier?.phone ?? '',
      address: supplier?.address ?? '',
      notes: supplier?.notes ?? '',
    })
  }, [open, supplier])

  const updateField = (field: keyof SupplierFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      setSaving(true)
      await onSave(values)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="supplier-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            key="supplier-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">
                  Supplier
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  {supplier ? 'Edit Supplier' : 'Add Supplier'}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close supplier panel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Name</span>
                  <input
                    value={values.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                    placeholder="Supplier name"
                    required
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
                    <input
                      type="email"
                      value={values.email}
                      onChange={(event) => updateField('email', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                      placeholder="supplier@example.com"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Phone</span>
                    <input
                      value={values.phone}
                      onChange={(event) => updateField('phone', event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                      placeholder="+353..."
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Address</span>
                  <textarea
                    value={values.address}
                    onChange={(event) => updateField('address', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                    rows={3}
                    placeholder="Supplier address"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Notes</span>
                  <textarea
                    value={values.notes}
                    onChange={(event) => updateField('notes', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                    rows={4}
                    placeholder="Internal notes"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60'
                  )}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
