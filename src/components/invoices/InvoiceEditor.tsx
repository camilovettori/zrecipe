import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, CircleAlert, Plus, Search, Trash2, X } from 'lucide-react'
import {
  INVOICE_UNITS,
  PACKAGE_UNIT_OPTIONS,
  calculateCostPerBaseUnit,
  createEmptyInvoiceItem,
  type InvoiceFormState,
  type InvoiceLineItem,
  recalculateInvoiceTotals,
  recalculateItemTotal,
  scoreIngredientMatch,
} from '@/lib/invoices'
import type { IngredientLookup, SupplierLookup } from '@/hooks/useInvoices'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  subtitle?: string
  draft: InvoiceFormState
  onChange: (next: InvoiceFormState) => void
  suppliers: SupplierLookup[]
  ingredients: IngredientLookup[]
  onSave: () => void
  onBack: () => void
  saving?: boolean
  saveLabel?: string
  preview?: ReactNode
  allowEditing?: boolean
  showSummary?: boolean
  className?: string
}

type ComboboxOption = {
  id: string
  label: string
  subtitle?: string
}

type ComboboxStatus = 'idle' | 'pending' | 'selected'

// ── Generic searchable combobox (used for Supplier) ───────────────────────────

function SearchableCombobox({
  value,
  onChange,
  options,
  onSelect,
  onCreate,
  placeholder,
  createLabel = 'Create new',
  status = 'idle',
  badge,
}: {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  onSelect: (option: ComboboxOption) => void
  onCreate?: (value: string) => void
  placeholder: string
  createLabel?: string
  status?: ComboboxStatus
  badge?: string
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const trimmed = value.trim()
  const exactMatch = options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())

  const visible = useMemo(() => {
    if (!trimmed) return options.slice(0, 6)
    const q = trimmed.toLowerCase()
    return options
      .map((o) => ({ o, score: scoreIngredientMatch(q, o.label) }))
      .filter(({ o, score }) => score > 0 || o.label.toLowerCase().includes(q))
      .sort((a, b) => b.score - a.score)
      .map(({ o }) => o)
      .slice(0, 6)
  }, [options, trimmed])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const inputTone =
    status === 'selected'
      ? 'border-emerald-200 bg-emerald-50/50 focus:border-emerald-500 focus:ring-emerald-500/10'
      : status === 'pending'
        ? 'border-amber-200 bg-amber-50/40 focus:border-amber-500 focus:ring-amber-500/10'
        : 'border-slate-200 bg-white focus:border-emerald-500 focus:ring-emerald-500/10'

  const icon =
    status === 'selected' ? (
      <Check className="h-4 w-4 text-emerald-600" />
    ) : status === 'pending' ? (
      <CircleAlert className="h-4 w-4 text-amber-500" />
    ) : null

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          placeholder={placeholder}
          className={cn(
            'h-10 w-full rounded-xl border pl-10 text-sm outline-none transition focus:ring-4',
            badge ? 'pr-24' : 'pr-9',
            inputTone
          )}
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1.5">
          {badge && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              {badge}
            </span>
          )}
          {icon}
        </div>
      </div>

      {open && (visible.length > 0 || (trimmed && onCreate && !exactMatch)) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {visible.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(o); setOpen(false) }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{o.label}</p>
                {o.subtitle && <p className="truncate text-xs text-slate-500">{o.subtitle}</p>}
              </div>
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            </button>
          ))}

          {onCreate && trimmed && !exactMatch && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onCreate(trimmed); setOpen(false) }}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">{createLabel}: {trimmed}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Brand suggestion extractor ────────────────────────────────────────────────
const GENERIC_FIRST_WORDS = new Set([
  'the', 'fresh', 'organic', 'pure', 'premium', 'natural', 'whole', 'raw',
  'free', 'range', 'best', 'top', 'fine', 'extra', 'super', 'new',
])

function extractBrandSuggestion(description: string): string {
  const words = description.trim().split(/\s+/).slice(0, 2)
  for (const word of words) {
    const clean = word.toLowerCase().replace(/[^a-z]/g, '')
    if (clean && !GENERIC_FIRST_WORDS.has(clean)) return word
  }
  return ''
}

// ── Description combobox — merged description + ingredient matching ─────────────

function DescriptionCombobox({
  item,
  ingredients,
  onUpdate,
}: {
  item: InvoiceLineItem
  ingredients: IngredientLookup[]
  onUpdate: (patch: Partial<InvoiceLineItem>) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<{
    top?: number
    bottom?: number
    left: number
    width: number
  } | null>(null)
  const isMatched = Boolean(item.ingredientId || item.ingredientMatch)

  const suggestions = useMemo(() => {
    const q = item.description.trim().toLowerCase()
    if (!q) return []
    return ingredients
      .map((ing) => ({ ing, score: scoreIngredientMatch(q, ing.name) }))
      .filter(({ ing, score }) => score > 0 || ing.name.toLowerCase().includes(q))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ ing }) => ing)
  }, [ingredients, item.description])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const clickedInsideInput = rootRef.current?.contains(target)
      const clickedInsideDropdown = dropdownRef.current?.contains(target)
      if (!clickedInsideInput && !clickedInsideDropdown) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open) {
      setDropdownStyle(null)
      return
    }

    const updatePosition = () => {
      const inputEl = rootRef.current
      if (!inputEl) return

      const inputRect = inputEl.getBoundingClientRect()
      const spaceBelow = window.innerHeight - inputRect.bottom
      const openUpward = spaceBelow < 200

      setDropdownStyle({
        left: inputRect.left,
        width: inputRect.width,
        ...(openUpward
          ? { bottom: window.innerHeight - inputRect.top + 8 }
          : { top: inputRect.bottom + 8 }),
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, item.description])

  const selectIngredient = (ing: IngredientLookup) => {
    const patch: Partial<InvoiceLineItem> = {
      description:      ing.name,
      ingredientId:     ing.id,
      ingredientQuery:  ing.name,
      ingredientMatch:  { type: 'existing', id: ing.id, name: ing.name },
      createIngredient: false,
      newIngredientName: '',
    }
    // Auto-fill price from ingredient's current price
    if (ing.currentPrice != null && ing.currentPrice > 0) {
      patch.unitPrice = ing.currentPrice
    }
    onUpdate(patch)
    setOpen(false)
  }

  const createIngredient = (name: string) => {
    onUpdate({
      description:           name,
      ingredientId:          null,
      ingredientQuery:       name,
      ingredientMatch:       { type: 'create', name },
      createIngredient:      true,
      newIngredientName:     name,
      newIngredientBrand:    extractBrandSuggestion(name),
      newIngredientCategory: item.newIngredientCategory ?? 'Other',
      newIngredientUnit:     item.unit,
    })
    setOpen(false)
  }

  const clearMatch = () => {
    onUpdate({
      ingredientId:     null,
      ingredientMatch:  null,
      createIngredient: false,
      newIngredientName: '',
      ingredientQuery:  '',
    })
  }

  const isNew = item.ingredientMatch?.type === 'create'
  const isUnmatched = !isMatched && item.description.trim().length > 0

  return (
    <div ref={rootRef} className="relative w-full">
      <div
        className={cn(
          'flex h-10 items-center overflow-hidden rounded-xl border transition focus-within:ring-4',
          isMatched
            ? 'border-emerald-300 bg-emerald-50/50 focus-within:border-emerald-500 focus-within:ring-emerald-500/10'
            : isUnmatched
              ? 'border-amber-300 bg-amber-50/30 focus-within:border-amber-400 focus-within:ring-amber-400/10'
              : 'border-slate-200 bg-white focus-within:border-emerald-500 focus-within:ring-emerald-500/10'
        )}
      >
        <input
          value={item.description}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onUpdate({
              description:      e.target.value,
              ingredientQuery:  e.target.value,
              ingredientId:     null,
              ingredientMatch:  null,
              createIngredient: false,
            })
            setOpen(true)
          }}
          placeholder="Description"
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
        />
        {isMatched ? (
          <div className="flex shrink-0 items-center gap-1 pr-2">
            {isNew ? (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                New
              </span>
            ) : (
              <Check className="h-4 w-4 text-emerald-600" />
            )}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearMatch}
              title="Unlink ingredient"
              className="rounded-full p-0.5 text-slate-400 transition hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : isUnmatched ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(true)}
            title="No matching ingredient — click to search or create"
            className="shrink-0 pr-2.5 text-amber-500 transition hover:text-amber-600"
          >
            <CircleAlert className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Brand suggestion — shown inline when creating a new ingredient */}
      {isNew && (
        <input
          type="text"
          placeholder="Brand (optional, e.g. Lurpak)"
          value={item.newIngredientBrand ?? ''}
          onChange={(e) => onUpdate({ newIngredientBrand: e.target.value })}
          className="mt-1 h-7 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
        />
      )}

      {open &&
        dropdownStyle &&
        (suggestions.length > 0 || item.description.trim()) &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="fixed z-[999] max-h-[250px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
          >
            {suggestions.map((ing) => (
              <button
                key={ing.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectIngredient(ing)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900 dark:text-white">{ing.name}</p>
                  {ing.currentPrice != null && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      €{ing.currentPrice.toFixed(2)} / {ing.priceUnit ?? 'unit'}
                    </p>
                  )}
                </div>
              </button>
            ))}

            {item.description.trim() &&
              !suggestions.some((ing) => ing.name.toLowerCase() === item.description.trim().toLowerCase()) && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => createIngredient(item.description.trim())}
                  className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-slate-700"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="truncate">Create: {item.description.trim()}</span>
                </button>
              )}
          </div>,
          document.body
        )}
    </div>
  )
}

// ── Package cost label ────────────────────────────────────────────────────────

function PackageCostLabel({
  item,
  ingredients,
}: {
  item: InvoiceLineItem
  ingredients: IngredientLookup[]
}) {
  const pricing = calculateCostPerBaseUnit(item.unitPrice, item.packageSize, item.packageUnit)
  if (!pricing) return <span className="text-xs text-slate-300">-</span>

  const existingMatch = item.ingredientMatch?.type === 'existing' ? item.ingredientMatch : null
  const linked = item.ingredientId
    ? ingredients.find((i) => i.id === item.ingredientId)
    : existingMatch
      ? ingredients.find((i) => i.id === existingMatch.id)
      : null

  const current = linked?.currentPrice ?? null
  const tone =
    current == null
      ? 'text-slate-500'
      : pricing.costPerBaseUnit < current
        ? 'text-emerald-700'
        : pricing.costPerBaseUnit > current
          ? 'text-rose-700'
          : 'text-slate-500'

  return (
    <span className={cn('text-xs font-medium', tone)}>
      {formatCurrency(pricing.costPerBaseUnit)}/{pricing.baseUnit}
    </span>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

// ── Main InvoiceEditor ────────────────────────────────────────────────────────

export default function InvoiceEditor({
  title,
  subtitle,
  draft,
  onChange,
  suppliers,
  ingredients,
  onSave,
  onBack,
  saving = false,
  saveLabel = 'Save Invoice',
  preview,
  allowEditing = true,
  showSummary = true,
  className,
}: Props) {
  const totals = recalculateInvoiceTotals(draft.items, draft.totalAmount)
  const effectiveSubtotal =
    Number.isFinite(draft.subtotalAmount ?? NaN) && draft.subtotalAmount != null
      ? draft.subtotalAmount
      : totals.subtotal
  const effectiveVat = Number.isFinite(draft.vatAmount ?? NaN) && draft.vatAmount != null
    ? draft.vatAmount
    : Number((totals.totalAmount - effectiveSubtotal).toFixed(2))
  const effectiveVatRate =
    Number.isFinite(draft.vatRate ?? NaN) && draft.vatRate != null
      ? draft.vatRate
      : effectiveSubtotal > 0 && effectiveVat > 0
        ? Number(((effectiveVat / effectiveSubtotal) * 100).toFixed(0))
        : null

  const updateDraft = (patch: Partial<InvoiceFormState>) => onChange({ ...draft, ...patch })

  const updateItem = (itemId: string, patch: Partial<InvoiceLineItem>) => {
    const items = draft.items.map((item) => {
      if (item.id !== itemId) return item
      const next = { ...item, ...patch }
      next.total = recalculateItemTotal(next)
      return next
    })
    updateDraft({ items, totalAmount: recalculateInvoiceTotals(items).subtotal })
  }

  const addRow = () => {
    const items = [...draft.items, createEmptyInvoiceItem()]
    updateDraft({ items, totalAmount: recalculateInvoiceTotals(items).subtotal })
  }

  const removeRow = (itemId: string) => {
    const items = draft.items.filter((item) => item.id !== itemId)
    updateDraft({ items, totalAmount: recalculateInvoiceTotals(items).subtotal })
  }

  const supplierOptions = suppliers.map((s) => ({
    id: s.id,
    label: s.name,
    subtitle: s.contactEmail ?? s.contactPhone ?? s.address ?? undefined,
  }))

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Invoices
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : saveLabel}
          </button>
        </div>
      </div>

      {preview}

      {/* Invoice metadata */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Supplier
            </span>
            {allowEditing ? (
              <SearchableCombobox
                value={draft.supplierName}
                onChange={(v) => updateDraft({ supplierName: v, supplierId: null, supplierMatch: null })}
                options={supplierOptions}
                onSelect={(o) =>
                  updateDraft({
                    supplierName: o.label,
                    supplierId: o.id,
                    supplierMatch: { type: 'existing', id: o.id, name: o.label },
                  })
                }
                onCreate={(v) =>
                  updateDraft({ supplierName: v, supplierId: null, supplierMatch: { type: 'create', name: v } })
                }
                placeholder="Search or create supplier"
                createLabel="Create supplier"
                status={draft.supplierMatch ? 'selected' : draft.supplierName.trim() ? 'pending' : 'idle'}
                badge={draft.supplierMatch?.type === 'create' ? 'New' : undefined}
              />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {draft.supplierName}
              </div>
            )}
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Invoice number
            </span>
            <input
              value={draft.invoiceNumber}
              onChange={(e) => updateDraft({ invoiceNumber: e.target.value })}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              placeholder="INV-001"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Invoice date
            </span>
            <input
              type="date"
              value={draft.invoiceDate}
              onChange={(e) => updateDraft({ invoiceDate: e.target.value })}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Currency
            </span>
            <select
              value={draft.currency}
              onChange={(e) => updateDraft({ currency: e.target.value })}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Notes
          </span>
          <textarea
            value={draft.notes}
            onChange={(e) => updateDraft({ notes: e.target.value })}
            rows={3}
            placeholder="Optional notes about the invoice"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
        </label>
      </section>

      {/* Line items */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-slate-900">Invoice items</h2>
            <p className="mt-1 text-sm text-slate-500">
              Type a description — matching ingredients appear as you type. Select to link, or leave unmatched.
            </p>
          </div>
          {/* Match summary — shows how many rows still need attention */}
          <div className="flex shrink-0 items-center gap-3">
            {(() => {
              const matched   = draft.items.filter((i) => Boolean(i.ingredientId || i.ingredientMatch)).length
              const unmatched = draft.items.filter((i) => !i.ingredientId && !i.ingredientMatch && i.description.trim()).length
              return (
                <>
                  {matched > 0 && (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      {matched} matched
                    </span>
                  )}
                  {unmatched > 0 && (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      {unmatched} unmatched
                    </span>
                  )}
                  {matched === 0 && unmatched === 0 && (
                    <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                      {draft.items.length} rows
                    </span>
                  )}
                </>
              )
            })()}
          </div>
        </div>

        <div className="overflow-x-auto">
          {/* Table is now 820px instead of 1180px — removed Match column */}
          <table className="min-w-[820px] table-fixed border-separate border-spacing-0 text-sm">
            <colgroup>
              <col style={{ width: '280px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '40px' }} />
            </colgroup>
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr className="h-11">
                <th className="border-b border-slate-200 px-3 font-semibold">Description</th>
                <th className="border-b border-slate-200 px-3 font-semibold">Qty</th>
                <th className="border-b border-slate-200 px-3 font-semibold">Unit</th>
                <th className="border-b border-slate-200 px-3 font-semibold">Pkg size</th>
                <th className="border-b border-slate-200 px-3 font-semibold">Price</th>
                <th className="border-b border-slate-200 px-3 font-semibold">Total</th>
                <th className="border-b border-slate-200 px-2 font-semibold" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="bg-white">
              {draft.items.map((item) => (
                <tr key={item.id} className="h-14 align-middle">
                  {/* Description — now a combobox with ingredient autocomplete */}
                  <td className="border-b border-slate-100 px-3 py-2">
                    <DescriptionCombobox
                      item={item}
                      ingredients={ingredients}
                      onUpdate={(patch) => updateItem(item.id, patch)}
                    />
                  </td>

                  <td className="border-b border-slate-100 px-3 py-2">
                    <input
                      type="number"
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, { quantity: Number.parseFloat(e.target.value || '0') })}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                    />
                  </td>

                  <td className="border-b border-slate-100 px-3 py-2">
                    <select
                      value={item.unit}
                      onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                    >
                      {INVOICE_UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </td>

                  <td className="border-b border-slate-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.001"
                        value={item.packageSize ?? ''}
                        onChange={(e) =>
                          updateItem(item.id, {
                            packageSize: e.target.value === '' ? null : Number.parseFloat(e.target.value || '0'),
                          })
                        }
                        className="h-10 w-[76px] rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                        placeholder="Size"
                      />
                      <select
                        value={item.packageUnit ?? 'kg'}
                        onChange={(e) => updateItem(item.id, { packageUnit: e.target.value })}
                        className="h-10 w-[64px] rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      >
                        {PACKAGE_UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </td>

                  <td className="border-b border-slate-100 px-3 py-2">
                    <div className="space-y-1">
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateItem(item.id, { unitPrice: Number.parseFloat(e.target.value || '0') })
                        }
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      />
                      <PackageCostLabel item={item} ingredients={ingredients} />
                    </div>
                  </td>

                  <td className="border-b border-slate-100 px-3 py-2">
                    <div className="inline-flex h-10 w-full items-center rounded-xl bg-slate-50 px-3 font-medium text-slate-900">
                      {formatCurrency(item.total)}
                    </div>
                  </td>

                  <td className="border-b border-slate-100 px-2 py-2">
                    <button
                      type="button"
                      onClick={() => removeRow(item.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100"
                      aria-label="Delete row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Add row
          </button>

          {showSummary && (
            <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Items</p>
                <p className="mt-1 font-semibold text-slate-900">{totals.itemCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Subtotal (exc. VAT)</p>
                <p className="mt-1 font-semibold text-slate-900">{formatCurrency(effectiveSubtotal)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {effectiveVatRate != null ? `VAT (${effectiveVatRate}%)` : 'VAT'}
                </p>
                <p className="mt-1 font-semibold text-slate-900">{formatCurrency(effectiveVat)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total (inc. VAT)</p>
                <input
                  type="number"
                  step="0.01"
                  value={draft.totalAmount}
                  onChange={(e) =>
                    updateDraft({
                      totalAmount: Number.parseFloat(e.target.value || `${effectiveSubtotal}`),
                    })
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

