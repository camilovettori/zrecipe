'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, UtensilsCrossed, Loader2, Tag, FileText } from 'lucide-react'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import type { RecipeRecord } from '@/hooks/useRecipes'
import { generateRecipePdf, type PrintMode } from '@/lib/pdf/recipe-generator'
import type { RecipeAllergenSummary } from '@/lib/allergens'

type PdfTenant = {
  labor_hourly_rate: number | null
  name: string | null
}

export default function PrintOptionsModal({
  open,
  onClose,
  recipe,
  allergens,
}: {
  open: boolean
  onClose: () => void
  recipe: RecipeRecord | null
  allergens?: RecipeAllergenSummary
}) {
  const [printing, setPrinting] = useState<PrintMode | null>(null)

  const loadTenantForPdf = async (): Promise<PdfTenant | null> => {
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user
    if (!user) return null

    const { data: tenantUser } = await supabase
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!tenantUser?.tenant_id) return null

    const { data: tenant } = await supabase
      .from('tenants')
      .select('labor_hourly_rate, name')
      .eq('id', tenantUser.tenant_id)
      .maybeSingle()

    return tenant ?? null
  }

  const handlePrint = async (mode: PrintMode) => {
    if (!recipe) return
    try {
      setPrinting(mode)
      const tenant = await loadTenantForPdf()
      await generateRecipePdf(recipe, mode, allergens, {
        includesCosts: mode === 'cost',
        tenant,
      })
      toast.success(
        mode === 'label'
          ? 'Product label downloaded'
          : mode === 'cost'
            ? 'Cost report downloaded'
            : 'Kitchen card downloaded'
      )
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 shadow-2xl">
          <Dialog.Close
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>

          <div className="mb-5">
            <Dialog.Title className="font-display text-xl font-semibold text-slate-900">
              Download PDF
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-slate-500">
              Choose the format to generate for <strong>{recipe?.name}</strong>.
            </Dialog.Description>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {/* Kitchen Card */}
            <button
              type="button"
              onClick={() => handlePrint('kitchen')}
              disabled={printing !== null}
              className="group flex flex-col gap-3 rounded-2xl border border-slate-200 p-5 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40 disabled:opacity-60"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 transition group-hover:bg-emerald-200">
                {printing === 'kitchen'
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : <UtensilsCrossed className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-semibold text-slate-900">Kitchen Card</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Kitchen-ready card with recipe photo, yield, ingredients, method steps, and allergen declaration.
                </p>
              </div>
            </button>

            {/* Cost Report */}
            <button
              type="button"
              onClick={() => handlePrint('cost')}
              disabled={printing !== null}
              className="group flex flex-col gap-3 rounded-2xl border border-slate-200 p-5 text-left transition hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-60"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600 transition group-hover:bg-blue-200">
                {printing === 'cost'
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : <FileText className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-semibold text-slate-900">Cost Report</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Includes ingredient costs, labor, overhead, waste, selling price, and margin summary.
                </p>
              </div>
            </button>

            {/* Product Label */}
            <button
              type="button"
              onClick={() => handlePrint('label')}
              disabled={printing !== null}
              className="group flex flex-col gap-3 rounded-2xl border border-slate-200 p-5 text-left transition hover:border-violet-300 hover:bg-violet-50/40 disabled:opacity-60"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-600 transition group-hover:bg-violet-200">
                {printing === 'label'
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : <Tag className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-semibold text-slate-900">Product Label</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Compact A5 label for packaging. Ingredients list with allergens in bold, date fields, and EU FIC compliance note.
                </p>
              </div>
            </button>
          </div>

          <div className="mt-5 flex justify-end">
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
