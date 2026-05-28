'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, FileText, UtensilsCrossed, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import type { RecipeRecord } from '@/hooks/useRecipes'
import { generateRecipePdf } from '@/lib/pdf/recipe-generator'

type PrintMode = 'full' | 'kitchen'

export default function PrintOptionsModal({
  open,
  onClose,
  recipe,
}: {
  open: boolean
  onClose: () => void
  recipe: RecipeRecord | null
}) {
  const [printing, setPrinting] = useState<PrintMode | null>(null)

  const handlePrint = async (mode: PrintMode) => {
    if (!recipe) return
    try {
      setPrinting(mode)
      await generateRecipePdf(recipe, mode)
      toast.success('Recipe PDF generated')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to generate PDF')
    } finally {
      setPrinting(null)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,820px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 shadow-2xl">
          <Dialog.Close
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close print modal"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>

          <div className="mb-5">
            <Dialog.Title className="font-display text-2xl font-semibold text-slate-900">
              Print Recipe
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-slate-500">
              Choose the print layout you want to generate.
            </Dialog.Description>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => handlePrint('full')}
              className="group rounded-3xl border border-slate-200 p-5 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition group-hover:bg-emerald-100">
                {printing === 'full' ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
              </div>
              <h3 className="text-base font-semibold text-slate-900">Full Report - With Costs</h3>
              <p className="mt-2 text-sm text-slate-500">
                Includes ingredient costs, labor, overhead, margin, and management details.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handlePrint('kitchen')}
              className="group rounded-3xl border border-slate-200 p-5 text-left transition hover:border-amber-300 hover:bg-amber-50/50"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 transition group-hover:bg-amber-100">
                {printing === 'kitchen' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <UtensilsCrossed className="h-5 w-5" />
                )}
              </div>
              <h3 className="text-base font-semibold text-slate-900">Kitchen Card - Recipe Only</h3>
              <p className="mt-2 text-sm text-slate-500">
                Clean recipe output with ingredients and instructions, without costs.
              </p>
            </button>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
