'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'

interface ConfirmDeleteProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  itemName: string
  loading?: boolean
}

export default function ConfirmDelete({
  open,
  onClose,
  onConfirm,
  itemName,
  loading,
}: ConfirmDeleteProps) {
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
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-white">
                Delete &ldquo;{itemName}&rdquo;?
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                This action cannot be undone. All price history associated with this ingredient
                will also be removed.
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
            >
              {loading ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
