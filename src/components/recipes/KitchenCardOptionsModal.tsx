'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'
import {
  DEFAULT_KITCHEN_CARD_OPTIONS,
  buildKitchenCardHtml,
  loadKitchenCardOptions,
  saveKitchenCardOptions,
  pickSizeTier,
  TIER_ORDER,
  DENSE_MIN_SCALE,
  type KitchenCardData,
  type KitchenCardOptions,
  type KitchenCardOrientation,
  type ResolvedKitchenCardSizing,
  type SizeTier,
} from '@/lib/print/kitchenCard'
import { cn } from '@/lib/utils'

const MM_TO_PX = 3.7795275591
const PREVIEW_WIDTH = 760
// Binary-search steps for the continuous scale within the dense tier — each
// step is one hidden-iframe render+measure round trip. 5 steps narrows the
// [DENSE_MIN_SCALE, 1) range to ~0.006 of scale, far finer than a visible
// font-size difference, without piling up render round trips.
const SCALE_SEARCH_STEPS = 5
// scrollHeight/clientHeight can disagree by a sub-pixel on some engines even
// when content visually fits — this tolerance avoids a false "overflow".
const FIT_TOLERANCE_PX = 1

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

type FitOutcome = 'fits' | 'shrunk' | 'twoPages'

interface ResolvedFit {
  html: string
  outcome: FitOutcome
}

// Toggles worth naming when a card needs a second page — deliberately
// excludes Method and Ingredients, since suggesting a chef turn those off
// would defeat the point of a kitchen card. Ordered by rough size impact:
// a full duplicate ingredient list, then per-ingredient note text, then
// photos (portrait only — in landscape they live in their own column and
// never compete with .content-col for space), then the free-text notes box.
function suggestReductionToggles(
  data: KitchenCardData,
  options: KitchenCardOptions
): string[] {
  const candidates: Array<[weight: number, label: string]> = []
  if (options.includeShoppingList && data.ingredients.length > 0) {
    candidates.push([data.ingredients.length, 'Shopping list'])
  }
  if (options.includeIngredientNotes) {
    const noted = data.ingredients.filter((ing) => ing.notes.trim()).length
    if (noted > 0) candidates.push([noted, 'Ingredient notes'])
  }
  if (options.includePhotos && options.orientation === 'portrait' && data.imageUrls.filter(Boolean).length > 0) {
    candidates.push([3, 'Photos'])
  }
  if (options.includeNotes && data.description.trim()) {
    candidates.push([data.description.length / 40, 'Recipe Notes'])
  }
  return candidates
    .sort((a, b) => b[0] - a[0])
    .slice(0, 2)
    .map(([, label]) => label)
}

function waitForIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    iframe.onload = () => resolve()
  })
}

// Renders `html` into the hidden measuring iframe and reports whether the
// content fits within one page. Measures the same element buildKitchenCardHtml
// clips (.content-col for landscape, .portrait-content for portrait):
// scrollHeight always reports the element's true, unclipped content height
// regardless of its own overflow/height CSS, so this works whether or not
// the candidate HTML happens to already have overflow:hidden applied.
// Defensive fallback: if contentDocument is ever unreadable (it shouldn't be
// — srcdoc content is same-origin to the parent per spec), treat it as
// fitting rather than silently forcing every card down to the smallest tier.
async function measureFits(
  iframe: HTMLIFrameElement,
  html: string,
  orientation: KitchenCardOrientation
): Promise<boolean> {
  const loaded = waitForIframeLoad(iframe)
  iframe.srcdoc = html
  await loaded
  const doc = iframe.contentDocument
  if (!doc) return true
  const selector = orientation === 'landscape' ? '.content-col' : '.portrait-content'
  const el = doc.querySelector(selector) as HTMLElement | null
  if (!el) return true
  return el.scrollHeight <= el.clientHeight + FIT_TOLERANCE_PX
}

// The measure-then-decide loop: start from the existing heuristic tier (kept
// as the starting guess, not thrown away), step down through the remaining
// tiers if it overflows, then a continuous scale within 'dense' down to the
// floor, and only then allow a second page. Every candidate is actually
// rendered and measured in the hidden iframe — never assumed.
async function resolveKitchenCardFit(
  data: KitchenCardData,
  options: KitchenCardOptions,
  logoUrl: string,
  isCustomLogo: boolean,
  measureIframe: HTMLIFrameElement
): Promise<ResolvedFit> {
  const startTier = pickSizeTier(data, options)
  const startIdx = TIER_ORDER.indexOf(startTier)

  for (let i = startIdx; i < TIER_ORDER.length; i++) {
    const tier: SizeTier = TIER_ORDER[i]
    const sizing: ResolvedKitchenCardSizing = { tier, scale: 1, paginate: false }
    const html = buildKitchenCardHtml(data, options, logoUrl, isCustomLogo, sizing)
    if (await measureFits(measureIframe, html, options.orientation)) {
      return { html, outcome: tier === startTier ? 'fits' : 'shrunk' }
    }
  }

  // Dense at scale 1 still overflowed. Check the floor first: if even the
  // smallest legible size doesn't fit, no scale between will either (content
  // height is monotonic in font scale), so there's no point binary-searching.
  const floorSizing: ResolvedKitchenCardSizing = { tier: 'dense', scale: DENSE_MIN_SCALE, paginate: false }
  const floorHtml = buildKitchenCardHtml(data, options, logoUrl, isCustomLogo, floorSizing)
  const floorFits = await measureFits(measureIframe, floorHtml, options.orientation)

  if (!floorFits) {
    const sizing: ResolvedKitchenCardSizing = { tier: 'dense', scale: DENSE_MIN_SCALE, paginate: true }
    const html = buildKitchenCardHtml(data, options, logoUrl, isCustomLogo, sizing)
    return { html, outcome: 'twoPages' }
  }

  // Binary search for the largest scale in (DENSE_MIN_SCALE, 1) that still
  // fits — the floor is known to fit, scale 1 is known not to.
  let lo = DENSE_MIN_SCALE
  let hi = 1
  for (let step = 0; step < SCALE_SEARCH_STEPS; step++) {
    const mid = (lo + hi) / 2
    const sizing: ResolvedKitchenCardSizing = { tier: 'dense', scale: mid, paginate: false }
    const html = buildKitchenCardHtml(data, options, logoUrl, isCustomLogo, sizing)
    if (await measureFits(measureIframe, html, options.orientation)) {
      lo = mid
    } else {
      hi = mid
    }
  }

  const sizing: ResolvedKitchenCardSizing = { tier: 'dense', scale: lo, paginate: false }
  return { html: buildKitchenCardHtml(data, options, logoUrl, isCustomLogo, sizing), outcome: 'shrunk' }
}

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
  const measureIframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (open) setOptions(loadKitchenCardOptions())
  }, [open])

  // Custom logo (when the tenant has branding rights and uploaded one) always
  // takes priority; otherwise the ZRecipe logo shows — a blank header never
  // happens. See lib/tenant.ts hasBrandingRights() for the gating rule.
  const isCustomLogo = hasBrandingRights && !!customLogoUrl
  const resolvedLogoUrl = hasBrandingRights && customLogoUrl ? customLogoUrl : logoUrl

  // Cheap synchronous first paint using today's heuristic (no override) — the
  // measured/resolved result below replaces this once it's ready, so there's
  // never a blank preview while the hidden iframe does its render+measure
  // round trips. In the common case where the heuristic guess was already
  // right, `resolved.html` ends up byte-identical to this anyway.
  const [resolved, setResolved] = useState<ResolvedFit>(() => ({
    html: buildKitchenCardHtml(data, options, resolvedLogoUrl, isCustomLogo),
    outcome: 'fits',
  }))
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    if (!open) return
    const measureIframe = measureIframeRef.current
    if (!measureIframe) return

    let cancelled = false
    setResolving(true)
    resolveKitchenCardFit(data, options, resolvedLogoUrl, isCustomLogo, measureIframe).then((result) => {
      if (cancelled) return
      setResolved(result)
      setResolving(false)
    })

    return () => { cancelled = true }
  }, [open, data, options, resolvedLogoUrl, isCustomLogo])

  const html = resolved.html
  const fitOutcome = resolved.outcome

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

  const fitMessage = fitOutcome === 'twoPages'
    ? (() => {
        const suggestions = suggestReductionToggles(data, options)
        return suggestions.length > 0
          ? `This card needs 2 pages — turn off ${suggestions.join(' or ')} to fit one`
          : 'This card needs 2 pages to fit everything'
      })()
    : fitOutcome === 'shrunk'
      ? 'Text reduced to fit one page'
      : null

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

          {/* Hidden off-screen measuring instrument — same page pixel size as
              the real preview, used only to render candidate sizings and read
              their true scrollHeight. Never shown to the user. */}
          <iframe
            ref={measureIframeRef}
            title="Kitchen Card fit measurement"
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: 0,
              left: '-99999px',
              width: pageWidthPx,
              height: pageHeightPx,
              border: 'none',
              visibility: 'hidden',
            }}
          />

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
            <div className="flex items-center gap-2">
              <p className="text-xs text-slate-400">Remembers your last choices</p>
              {fitMessage && (
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium',
                    fitOutcome === 'twoPages'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-100 text-slate-500'
                  )}
                >
                  {fitMessage}
                </span>
              )}
            </div>
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
                disabled={resolving}
                className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resolving ? 'Checking fit…' : 'Print'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
