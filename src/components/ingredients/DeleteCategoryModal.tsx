'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'
import { CustomSelect } from '@/components/ui/CustomSelect'

interface DeleteCategoryModalProps {
  open: boolean
  categoryName: string
  count: number
  categories: string[]
  onClose: () => void
  onConfirm: (replacementCategory: string) => void | Promise<void>
}

export default function DeleteCategoryModal({
  open,
  categoryName,
  count,
  categories,
  onClose,
  onConfirm,
}: DeleteCategoryModalProps) {
  const [replacement, setReplacement] = useState('')
  const [loading, setLoading] = useState(false)

  const replacementOptions = categories.filter(
    (c) => c.toLowerCase() !== categoryName.toLowerCase()
  )

  const handleConfirm = async () => {
    if (!replacement) return
    setLoading(true)
    try {
      await onConfirm(replacement)
      setReplacement('')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setReplacement('')
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
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-white">
                Remove &ldquo;{categoryName}&rdquo;?
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                {count} ingredient{count !== 1 ? 's' : ''} currently use &ldquo;{categoryName}&rdquo;. Choose
                a category to move {count !== 1 ? 'them' : 'it'} to before removing &ldquo;{categoryName}
                &rdquo;.
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Move to
            </label>
            <CustomSelect
              value={replacement}
              onChange={setReplacement}
              placeholder="Select a replacement category…"
              options={replacementOptions.map((c) => ({ value: c, label: c }))}
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
              disabled={loading || !replacement}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Moving…' : 'Move & remove category'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
