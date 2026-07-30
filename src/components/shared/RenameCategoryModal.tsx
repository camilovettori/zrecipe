'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Pencil, X } from 'lucide-react'

interface RenameCategoryModalProps {
  open: boolean
  categoryName: string
  onClose: () => void
  onConfirm: (newName: string) => void | Promise<void>
}

export default function RenameCategoryModal({
  open,
  categoryName,
  onClose,
  onConfirm,
}: RenameCategoryModalProps) {
  const [value, setValue] = useState(categoryName)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setValue(categoryName)
  }, [open, categoryName])

  const trimmed = value.trim()
  const unchanged = !trimmed || trimmed.toLowerCase() === categoryName.toLowerCase()

  const handleConfirm = async () => {
    if (unchanged) return
    setLoading(true)
    try {
      await onConfirm(trimmed)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Close
            onClick={handleClose}
            className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>

          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
              <Pencil className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-white">
                Rename &ldquo;{categoryName}&rdquo;
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                All items currently using this category will be updated to the new name.
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              New name
            </label>
            <input
              autoFocus
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleConfirm()
                }
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={loading}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || unchanged}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Renaming…' : 'Rename'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
