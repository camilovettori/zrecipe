'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  ingredientName: string
  initialNote: string | null
  onSave: (note: string) => void
  onDelete: () => void
  onClose: () => void
}

const MAX_CHARS = 200

export function IngredientNoteModal({ open, ingredientName, initialNote, onSave, onDelete, onClose }: Props) {
  const [note, setNote] = useState(initialNote ?? '')

  useEffect(() => {
    if (open) setNote(initialNote ?? '')
  }, [open, initialNote])

  const handleSave = () => {
    const trimmed = note.trim()
    if (trimmed) onSave(trimmed)
    onClose()
  }

  const handleDelete = () => {
    onDelete()
    onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl outline-none">
          <div className="flex items-start justify-between border-b border-slate-100 p-5">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900">
                Ingredient note
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-slate-500">
                {ingredientName}
              </Dialog.Description>
            </div>
            <button
              onClick={onClose}
              className="ml-4 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5">
            <textarea
              rows={4}
              maxLength={MAX_CHARS}
              placeholder="e.g. sifted, room temperature, finely chopped..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white"
            />
            <div className="mt-1 text-right text-xs text-slate-400">
              {note.length}/{MAX_CHARS}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
            <div>
              {initialNote && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-sm text-red-600 transition hover:text-red-700"
                >
                  Delete note
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!note.trim()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
