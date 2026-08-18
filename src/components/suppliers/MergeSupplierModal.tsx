'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GitMerge, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPlanTierLabel } from '@/lib/stripe/plans'
import type { SupplierRecord } from '@/hooks/useSuppliers'
import { mergeSuppliers } from '@/lib/suppliers/mergeSuppliers'
import { toast } from '@/lib/toast'

interface Props {
  open: boolean
  loser: SupplierRecord | null
  suppliers: SupplierRecord[]
  onClose: () => void
  onMerged: () => Promise<void> | void
}

export default function MergeSupplierModal({ open, loser, suppliers, onClose, onMerged }: Props) {
  const [keeperId, setKeeperId] = useState('')
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const keeperOptions = useMemo(
    () => suppliers.filter((supplier) => supplier.id !== loser?.id),
    [loser?.id, suppliers]
  )

  useEffect(() => {
    if (!open || !loser) return
    const sameName = keeperOptions.find(
      (supplier) => supplier.name.trim().toLowerCase() === loser.name.trim().toLowerCase()
    )
    setKeeperId(sameName?.id ?? keeperOptions[0]?.id ?? '')
    setError(null)
  }, [keeperOptions, loser, open])

  const handleMerge = async () => {
    if (!loser || !keeperId || keeperId === loser.id) return

    setMerging(true)
    setError(null)
    try {
      const result = await mergeSuppliers({ keeperId, loserId: loser.id })
      if (!result.ok) {
        throw new Error(result.error ?? 'Unable to merge supplier')
      }

      toast.success(
        `Merged into ${suppliers.find((supplier) => supplier.id === keeperId)?.name ?? 'selected supplier'}`,
        { duration: 3200 }
      )
      await onMerged()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to merge supplier'
      setError(message)
      toast.error(message, { duration: 4000 })
    } finally {
      setMerging(false)
    }
  }

  return (
    <AnimatePresence>
      {open && loser && (
        <>
          <motion.div
            key="supplier-merge-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="supplier-merge-modal"
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">
                  Merge Supplier
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  Merge into another supplier
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close merge supplier modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">Source supplier</p>
                <p className="mt-1">{loser.name}</p>
                <p className="mt-1 text-xs text-amber-700">
                  This will move invoices, supplier codes and invoice memory into the keeper supplier.
                </p>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Merge into keeper supplier
                </span>
                <select
                  value={keeperId}
                  onChange={(event) => setKeeperId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-emerald-500"
                >
                  <option value="" disabled>
                    Select supplier to keep
                  </option>
                  {keeperOptions.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                      {supplier.invoiceCount > 0 ? ` — ${supplier.invoiceCount} invoice${supplier.invoiceCount !== 1 ? 's' : ''}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              {keeperId && keeperId !== loser.id && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-800">
                    Keeper: {suppliers.find((supplier) => supplier.id === keeperId)?.name ?? 'Selected supplier'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatPlanTierLabel('pro')} merge logic keeps the keeper supplier and transfers the loser into it.
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMerge}
                disabled={merging || !keeperId || keeperId === loser.id}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60'
                )}
              >
                {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
                Merge suppliers
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
