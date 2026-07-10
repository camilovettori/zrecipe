'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import {
  DEFAULT_KITCHEN_CARD_OPTIONS,
  buildKitchenCardHtml,
  loadKitchenCardOptions,
  saveKitchenCardOptions,
  type KitchenCardData,
  type KitchenCardOptions,
  type KitchenCardOrientation,
} from '@/lib/print/kitchenCard'
import { cn } from '@/lib/utils'

const MM_TO_PX = 3.7795275591
const PREVIEW_WIDTH = 760

const INCLUDE_TOGGLES: Array<{ key: keyof KitchenCardOptions; label: string }> = [
  { key: 'includeMetaBar', label: 'Recipe info bar' },
  { key: 'includePhotos', label: 'Photos (up to 8)' },
  { key: 'includeIngredients', label: 'Ingredients + qty' },
  { key: 'includeIngredientNotes', label: 'Ingredient notes' },
  { key: 'includeMethod', label: 'Method' },
  { key: 'includeNotes', label: 'Recipe Notes' },
  { key: 'includeAllergens', label: 'Allergens' },
  { key: 'includeShoppingList', label: 'Shopping list' },
]

export default function KitchenCardOptionsModal({
  open,
  onClose,
  data,
  logoUrl,
}: {
  open: boolean
  onClose: () => void
  data: KitchenCardData
  logoUrl: string
}) {
  const [options, setOptions] = useState<KitchenCardOptions>(DEFAULT_KITCHEN_CARD_OPTIONS)
  const { hasBrandingRights, customLogoUrl } = useSubscription()

  useEffect(() => {
    if (open) setOptions(loadKitchenCardOptions())
  }, [open])

  // Custom logo (when the tenant has branding rights and uploaded one) always
  // takes priority; otherwise the ZRecipe logo shows — a blank header never
  // happens. See lib/tenant.ts hasBrandingRights() for the gating rule.
  const isCustomLogo = hasBrandingRights && !!customLogoUrl
  const resolvedLogoUrl = hasBrandingRights && customLogoUrl ? customLogoUrl : logoUrl

  const html = useMemo(
    () => buildKitchenCardHtml(data, options, resolvedLogoUrl, isCustomLogo),
    [data, options, resolvedLogoUrl, isCustomLogo]
  )

  const pageWidthMm = options.orientation === 'landscape' ? 297 : 210
  const pageHeightMm = options.orientation === 'landscape' ? 210 : 297
  const pageWidthPx = pageWidthMm * MM_TO_PX
  const pageHeightPx = pageHeightMm * MM_TO_PX
  const scale = PREVIEW_WIDTH / pageWidthPx

  const setOrientation = (orientation: KitchenCardOrientation) =>
    setOptions((prev) => ({ ...prev, orientation }))

  const toggle = (key: keyof KitchenCardOptions) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))

  const handlePrint = useCallback(() => {
    saveKitchenCardOptions(options)
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
    onClose()
  }, [options, html, onClose])

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[97vw] max-w-[1200px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-slate-100 p-5">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900">
                Kitchen Card Options
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-slate-500">
                Choose what appears on <strong>{data.name}</strong>&apos;s kitchen card.
              </Dialog.Description>
            </div>
            <button
              onClick={onClose}
              className="ml-4 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-6 overflow-auto p-5 sm:flex-row">
            {/* ── Left pane: options ── */}
            <div className="w-full shrink-0 space-y-5 sm:w-44">
              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Orientation
                </span>
                <div className="flex rounded-lg bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setOrientation('landscape')}
                    className={cn(
                      'flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                      options.orientation === 'landscape'
                        ? 'bg-white text-emerald-600 shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    )}
                  >
                    Landscape
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientation('portrait')}
                    className={cn(
                      'flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                      options.orientation === 'portrait'
                        ? 'bg-white text-emerald-600 shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    )}
                  >
                    Portrait
                  </button>
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Include
                </span>
                <div className="space-y-2">
                  {INCLUDE_TOGGLES.map(({ key, label }) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(options[key])}
                        onChange={() => toggle(key)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 outline-none focus:ring-emerald-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Right pane: live preview ── */}
            <div className="flex flex-1 items-start justify-center rounded-xl bg-slate-100 p-4">
              <div
                style={{ width: PREVIEW_WIDTH, height: pageHeightPx * scale }}
                className="overflow-hidden rounded-md bg-white shadow-md"
              >
                <iframe
                  srcDoc={html}
                  title="Kitchen Card preview"
                  style={{
                    width: pageWidthPx,
                    height: pageHeightPx,
                    border: 'none',
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
            <p className="text-xs text-slate-400">Remembers your last choices</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Print
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
