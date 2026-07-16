'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Briefcase, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'

interface LaborConfigModalProps {
  open: boolean
  initialJobTitle: string | null
  initialHourlyRate: number | null
  onSave: (jobTitle: string, hourlyRate: number) => void
  onClose: () => void
}

export default function LaborConfigModal({
  open,
  initialJobTitle,
  initialHourlyRate,
  onSave,
  onClose,
}: LaborConfigModalProps) {
  const [jobTitle, setJobTitle] = useState(initialJobTitle ?? '')
  const [hourlyRate, setHourlyRate] = useState(
    initialHourlyRate != null && initialHourlyRate > 0 ? String(initialHourlyRate) : ''
  )

  // Reset from the recipe's current values whenever the modal opens, and — only
  // when no rate has been configured yet — pre-fill with the tenant's default
  // as a starting suggestion.
  useEffect(() => {
    if (!open) return
    setJobTitle(initialJobTitle ?? '')

    if (initialHourlyRate != null && initialHourlyRate > 0) {
      setHourlyRate(String(initialHourlyRate))
      return
    }

    setHourlyRate('')
    resolveTenantId()
      .then(async (tenantId) => {
        const supabase = createClient()
        const { data } = await supabase
          .from('tenants')
          .select('labor_hourly_rate')
          .eq('id', tenantId)
          .maybeSingle()
        const tenantRate = Number(data?.labor_hourly_rate ?? 0)
        if (tenantRate > 0) setHourlyRate(String(tenantRate))
      })
      .catch(() => {})
  }, [open, initialJobTitle, initialHourlyRate])

  const parsedRate = Number.parseFloat(hourlyRate)
  const canSave = Number.isFinite(parsedRate) && parsedRate > 0

  const handleSave = () => {
    if (!canSave) return
    onSave(jobTitle.trim(), parsedRate)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Close
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>

          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <Briefcase className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-white">
                Configure Labor
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                Set who&apos;s making this and their hourly rate — used to calculate labor cost from prep
                time.
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Job title
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Baker, Chef, Kitchen porter..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Hourly rate (€/hr)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
