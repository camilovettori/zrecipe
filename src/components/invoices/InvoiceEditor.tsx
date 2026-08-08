import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, ChevronDown, CircleAlert, Plus, Search, Trash2, X } from 'lucide-react'
import {
  INVOICE_UNITS,
  PACKAGE_UNIT_OPTIONS,
  WEIGHT_VOLUME_IN_DESCRIPTION,
  createEmptyInvoiceItem,
  getDefaultIngredientPriceUnit,
  resolveInvoiceIngredientPricing,
  type InvoiceFormState,
  type InvoiceLineItem,
  recalculateInvoiceTotals,
  recalculateItemTotal,
  scoreIngredientMatch,
} from '@/lib/invoices'
import type { IngredientLookup, SupplierLookup } from '@/hooks/useInvoices'
import { cn } from '@/lib/utils'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { useIngredientCategories } from '@/hooks/useIngredientCategories'
import { DEFAULT_INGREDIENT_CATEGORIES } from '@/lib/constants/ingredient-categories'
import AllergenPicker from '@/components/ingredients/AllergenPicker'
import type { AllergenStatus, IngredientAllergen } from '@/lib/allergens'

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
  showHeader?: boolean
  showItemsTable?: boolean
  itemsLayout?: 'table' | 'review-cards'
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
// ── Description combobox — merged description + ingredient matching ─────────────

export function DescriptionCombobox({
  item,
  ingredients,
  onUpdate,
  categories = DEFAULT_INGREDIENT_CATEGORIES,
}: {
  item: InvoiceLineItem
  ingredients: IngredientLookup[]
  onUpdate: (patch: Partial<InvoiceLineItem>) => void
  categories?: string[]
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
      .map((ing) => ({
        ing,
        score: Math.max(
          scoreIngredientMatch(q, ing.name),
          ing.brand ? scoreIngredientMatch(q, ing.brand) : 0
        ),
      }))
      .filter(({ ing, score }) => score > 0 || ing.name.toLowerCase().includes(q) || ing.brand?.toLowerCase().includes(q))
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
      newIngredientBrand: item.newIngredientBrand || ing.brand || '',
      newIngredientUnit:
        ing.priceUnit ??
        getDefaultIngredientPriceUnit(
          item.packageSize && item.packageUnit ? item.packageUnit : item.unit
        ) ??
        item.unit,
      reviewAllergens: ing.allergens ?? [],
      allergensChanged: false,
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
      newIngredientBrand:    item.newIngredientBrand ?? '',
      newIngredientCategory: item.newIngredientCategory ?? 'Other',
      newIngredientUnit:
        getDefaultIngredientPriceUnit(
          item.packageSize && item.packageUnit ? item.packageUnit : item.unit
        ) ?? item.unit,
      reviewAllergens:       [],
      allergensChanged:      false,
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
      reviewAllergens:  [],
      allergensChanged: false,
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
            {isNew && item.needs_verification && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                <AlertTriangle className="h-3 w-3" />
                Add price
              </span>
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

      {/* Brand for this purchase — captured per line item so price history can track it, even for existing ingredients */}
      {item.description.trim() && (
        <div className="mt-1 space-y-1">
          {item.extractedDescriptionOriginal &&
            item.extractedDescriptionOriginal.trim() !== item.description.trim() && (
              <p className="truncate px-1 text-[10px] text-slate-500" title={item.extractedDescriptionOriginal}>
                Invoice text: {item.extractedDescriptionOriginal}
              </p>
            )}
          <input
            type="text"
            placeholder="Brand from invoice (optional)"
            value={item.newIngredientBrand ?? ''}
            onChange={(e) => onUpdate({ newIngredientBrand: e.target.value })}
            className="h-7 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
          />
        </div>
      )}

      {item.createIngredient && (
        <div className="mt-1.5">
          <CustomSelect
            value={item.newIngredientCategory ?? 'Other'}
            onChange={(v) => onUpdate({ newIngredientCategory: v })}
            options={categories.map((c) => ({ value: c, label: c }))}
            placeholder="Category"
            size="sm"
          />
        </div>
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
                  {ing.brand && <p className="truncate text-xs text-emerald-600">{ing.brand}</p>}
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
  const existingMatch = item.ingredientMatch?.type === 'existing' ? item.ingredientMatch : null
  const linked = item.ingredientId
    ? ingredients.find((i) => i.id === item.ingredientId)
    : existingMatch
      ? ingredients.find((i) => i.id === existingMatch.id)
      : null
  const pricing = resolveInvoiceIngredientPricing({
    unitPrice: item.unitPrice,
    lineTotal: item.total,
    quantity: item.quantity,
    invoiceUnit: item.unit,
    packageSize: item.packageSize,
    packageUnit: item.packageUnit,
    targetUnit: linked?.priceUnit ?? item.newIngredientUnit,
  })

  if (!pricing.valid || pricing.normalizedPrice == null || !pricing.normalizedUnit) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700"
        title={pricing.warning ?? 'Needs review'}
      >
        <AlertTriangle className="h-3 w-3 shrink-0" />
        Needs review
      </span>
    )
  }

  const current = linked?.currentPrice ?? null
  const tone =
    current == null
      ? 'text-slate-500'
      : pricing.normalizedPrice < current
        ? 'text-emerald-700'
        : pricing.normalizedPrice > current
          ? 'text-rose-700'
          : 'text-slate-500'

  return (
    <span className={cn('text-xs font-medium', tone)}>
      Ingredient: {formatCurrency(pricing.normalizedPrice)}/{pricing.normalizedUnit}
    </span>
  )
}

function AllergenReview({
  item,
  onUpdate,
}: {
  item: InvoiceLineItem
  onUpdate: (patch: Partial<InvoiceLineItem>) => void
}) {
  const isResolved = Boolean(item.ingredientId || item.ingredientMatch)
  if (!isResolved) return null

  const selection = item.reviewAllergens ?? []
  const value = selection.reduce<Record<number, AllergenStatus>>((result, allergen) => {
    result[allergen.allergenId] = allergen.status
    return result
  }, {})
  const contains = selection.filter((allergen) => allergen.status === 'contains').length
  const mayContain = selection.filter((allergen) => allergen.status === 'may_contain').length

  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-medium text-slate-600">
        <span className="flex items-center gap-2">
          Allergens
          {contains > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              {contains} contains
            </span>
          )}
          {mayContain > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {mayContain} may contain
            </span>
          )}
          {selection.length === 0 && <span className="text-slate-400">None declared</span>}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-200 bg-white px-3 py-3">
        <AllergenPicker
          value={value}
          onChange={(next) => {
            const reviewAllergens: IngredientAllergen[] = Object.entries(next).map(
              ([allergenId, status]) => ({ allergenId: Number(allergenId), status })
            )
            onUpdate({ reviewAllergens, allergensChanged: true })
          }}
        />
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
          Changes apply to the linked ingredient, not to the invoice total.
        </p>
      </div>
    </details>
  )
}

function ReviewItemCard({
  item,
  index,
  ingredients,
  categories,
  onUpdate,
  onRemove,
}: {
  item: InvoiceLineItem
  index: number
  ingredients: IngredientLookup[]
  categories: string[]
  onUpdate: (patch: Partial<InvoiceLineItem>) => void
  onRemove: () => void
}) {
  const isMatched = Boolean(item.ingredientId || item.ingredientMatch?.type === 'existing')
  const isNew = item.ingredientMatch?.type === 'create' || item.createIngredient
  const needsReview = Boolean(item.needs_verification || (!isMatched && !isNew))

  return (
    <article
      className={cn(
        'rounded-2xl border bg-white p-4 transition-shadow hover:shadow-sm',
        needsReview ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200'
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Item {index + 1}
          </span>
          {isMatched && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Matched
            </span>
          )}
          {isNew && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              New ingredient
            </span>
          )}
          {needsReview && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              <AlertTriangle className="h-3 w-3" />
              Needs review
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 transition hover:bg-red-100"
          aria-label={`Delete item ${index + 1}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(170px,0.8fr)]">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Description / ingredient match
          </label>
          <DescriptionCombobox
            item={item}
            ingredients={ingredients}
            onUpdate={onUpdate}
            categories={categories}
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Product code
          </span>
          <input
            value={item.product_code ?? ''}
            onChange={(event) => onUpdate({ product_code: event.target.value || null })}
            placeholder="Not shown"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Qty</span>
          <input
            type="number"
            step="0.001"
            value={item.quantity}
            onChange={(event) => onUpdate({ quantity: Number.parseFloat(event.target.value || '0') })}
            className="h-10 w-full min-w-[90px] rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Purchase unit</span>
          <CustomSelect
            value={item.unit}
            onChange={(value) => onUpdate({
              unit: value,
              newIngredientUnit:
                item.packageSize && item.packageUnit
                  ? item.newIngredientUnit
                  : getDefaultIngredientPriceUnit(value) ?? item.newIngredientUnit,
            })}
            options={INVOICE_UNITS.map((unit) => ({ value: unit, label: unit }))}
            size="sm"
          />
        </label>
        <div className="min-w-0 sm:col-span-2 xl:col-span-2">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Package size</span>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(96px,0.75fr)] gap-2">
            <input
              type="number"
              step="0.001"
              value={item.packageSize ?? ''}
              onChange={(event) => onUpdate({
                packageSize: event.target.value === '' ? null : Number.parseFloat(event.target.value || '0'),
              })}
              placeholder="Size"
              className="h-10 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            />
            <CustomSelect
              value={item.packageUnit ?? ''}
              onChange={(value) => onUpdate({
                packageUnit: value || null,
                newIngredientUnit: getDefaultIngredientPriceUnit(value) ?? item.newIngredientUnit,
              })}
              options={[
                { value: '', label: 'Unit?' },
                ...PACKAGE_UNIT_OPTIONS.map((unit) => ({ value: unit, label: unit })),
              ]}
              className="min-w-0"
              size="sm"
            />
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Invoice price</span>
          <input
            type="number"
            step="0.01"
            value={item.unitPrice}
            onChange={(event) => onUpdate({ unitPrice: Number.parseFloat(event.target.value || '0') })}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
          <div className="mt-1"><PackageCostLabel item={item} ingredients={ingredients} /></div>
        </label>
        <div>
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Line total</span>
          <div className="flex h-10 items-center rounded-xl bg-slate-50 px-3 text-sm font-semibold text-slate-900">
            {formatCurrency(item.total)}
          </div>
        </div>
      </div>

      {(item.quantitySource || item.rawSizeText) && (
        <div className={cn(
          'mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border px-3 py-2 text-xs',
          item.normalizedPriceConfidence === 'review' || item.quantitySource === 'MULTIPLE' || item.quantitySource === 'UNKNOWN'
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-slate-200 bg-slate-50/70 text-slate-600'
        )}>
          <span>
            Invoice quantity source:{' '}
            <strong className="font-semibold text-slate-800">
              {item.quantitySource ?? 'UNKNOWN'}
            </strong>
          </span>
          {item.rawSizeText && (
            <span>
              Pack format: <strong className="font-semibold text-slate-800">{item.rawSizeText}</strong>
            </span>
          )}
          {item.packageSize != null && item.packageUnit && (
            <span>
              Package size used:{' '}
              <strong className="font-semibold text-slate-800">
                {item.packageSize} {item.packageUnit}
              </strong>
            </span>
          )}
        </div>
      )}

      {(item.quantitySource === 'UNITS' || item.quantitySource === 'EACH') &&
        (item.extractedCasePackCount ?? 0) > 1 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Quantity source is {item.quantitySource}, but the pack format contains {item.rawSizeText}.
            ZRecipe will use {item.extractedUnitSize} {item.extractedUnitMeasure} per unit, not the case total.
          </p>
        )}

      {item.needsReviewReason && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {item.needsReviewReason}
        </p>
      )}

      {item.warnings?.map((warning, index) => (
        <p key={index} className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {warning}
        </p>
      ))}

      {item.packageSize == null && WEIGHT_VOLUME_IN_DESCRIPTION.test(item.description) && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          The invoice description mentions a weight or volume. Confirm the package size before saving.
        </p>
      )}

      <div className="mt-3">
        <AllergenReview item={item} onUpdate={onUpdate} />
      </div>
    </article>
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
  showHeader = true,
  showItemsTable = true,
  itemsLayout = 'table',
  className,
}: Props) {
  const { categories } = useIngredientCategories()
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

  // ── Supplier product-code lookup ──────────────────────────────────────
  // A (supplier, product_code) match is definitive — stronger than any name
  // match — so it's loaded once per tenant and applied whenever the item's
  // code or the selected supplier changes, ahead of/overriding fuzzy name
  // matching done elsewhere in the invoice pipeline.
  const supplierCodesRef = useRef<
    Array<{ ingredient_id: string; supplier_id: string; product_code: string }>
  >([])
  const [supplierCodesLoaded, setSupplierCodesLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadSupplierCodes = async () => {
      try {
        const supabase = createClient()
        const tenantId = await resolveTenantId()
        const { data } = await supabase
          .from('ingredient_supplier_codes')
          .select('ingredient_id, supplier_id, product_code')
          .eq('tenant_id', tenantId)

        if (!cancelled) {
          supplierCodesRef.current = data ?? []
          setSupplierCodesLoaded(true)
        }
      } catch (error) {
        console.error('[InvoiceEditor] supplier code lookup failed:', error)
      }
    }

    loadSupplierCodes()
    return () => {
      cancelled = true
    }
  }, [])

  const itemCodeSignature = draft.items.map((item) => `${item.id}:${item.product_code ?? ''}`).join('|')

  useEffect(() => {
    if (!draft.supplierId || !supplierCodesLoaded) return
    const codes = supplierCodesRef.current
    if (codes.length === 0) return

    let changed = false
    const nextItems = draft.items.map((item) => {
      if (!item.product_code) return item

      const codeMatch = codes.find(
        (sc) => sc.supplier_id === draft.supplierId && sc.product_code === item.product_code
      )
      if (!codeMatch || item.ingredientId === codeMatch.ingredient_id) return item

      changed = true
      const matchedIngredient = ingredients.find((ing) => ing.id === codeMatch.ingredient_id)
      const matchedIngredientName = matchedIngredient?.name ?? item.description

      return {
        ...item,
        ingredientId: codeMatch.ingredient_id,
        ingredientMatch: {
          type: 'existing' as const,
          id: codeMatch.ingredient_id,
          name: matchedIngredientName,
        },
        ingredientQuery: matchedIngredientName,
        createIngredient: false,
        reviewAllergens: matchedIngredient?.allergens ?? [],
        allergensChanged: false,
      }
    })

    if (changed) {
      updateDraft({ items: nextItems, totalAmount: recalculateInvoiceTotals(nextItems).subtotal })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.supplierId, supplierCodesLoaded, itemCodeSignature, ingredients])

  const updateItem = (itemId: string, patch: Partial<InvoiceLineItem>) => {
    const items = draft.items.map((item) => {
      if (item.id !== itemId) return item
      const next = { ...item, ...patch }
      if (
        'quantity' in patch ||
        'unit' in patch ||
        'packageSize' in patch ||
        'packageUnit' in patch
      ) {
        next.quantityInterpretationConfirmed = true
        next.normalizedPriceConfidence = 'high'
        next.needsReviewReason = null
      }
      // Only recalculate when the user actually edits quantity or unit
      // price. Every other patch — matching an ingredient, editing the
      // description, confirming allergens — must never touch invoice price
      // data. Recalculating unconditionally here previously clobbered a
      // correct AI-extracted total (e.g. qty x package_size x unit_price)
      // down to the naive qty x unitPrice the moment a match was selected.
      if ('quantity' in patch || 'unitPrice' in patch) {
        next.total = recalculateItemTotal(next)
      }
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
      {showHeader && (
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
      )}

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
            <CustomSelect
              value={draft.currency}
              onChange={(v) => updateDraft({ currency: v })}
              options={[
                { value: 'EUR', label: 'EUR' },
                { value: 'USD', label: 'USD' },
                { value: 'GBP', label: 'GBP' },
              ]}
            />
          </label>

          {/* Items table (and its footer Total input) is hidden in this instance — surface Total here instead */}
          {!showItemsTable && (
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total (inc. VAT)
              </span>
              <input
                type="number"
                step="0.01"
                value={draft.totalAmount}
                onChange={(e) => updateDraft({ totalAmount: Number.parseFloat(e.target.value || '0') })}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
            </label>
          )}
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
      {showItemsTable && (
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

        {itemsLayout === 'review-cards' ? (
          <div className="space-y-3 p-4">
            {draft.items.map((item, index) => (
              <ReviewItemCard
                key={item.id}
                item={item}
                index={index}
                ingredients={ingredients}
                categories={categories}
                onUpdate={(patch) => updateItem(item.id, patch)}
                onRemove={() => removeRow(item.id)}
              />
            ))}
          </div>
        ) : (
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
                <th className="border-b border-slate-200 px-3 font-semibold">Invoice price</th>
                <th className="border-b border-slate-200 px-3 font-semibold">Line total</th>
                <th className="border-b border-slate-200 px-2 font-semibold" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="bg-white">
              {draft.items.map((item) => {
                // Amber accent for AI-flagged new-ingredient rows — same
                // visual language as the ingredient list's "Add price" pill.
                const flaggedNew = Boolean(item.needs_verification && item.ingredientMatch?.type === 'create')
                return (
                <tr key={item.id} className={cn('h-14 align-middle', flaggedNew && 'bg-amber-50/40')}>
                  {/* Description — now a combobox with ingredient autocomplete */}
                  <td className={cn('border-b border-slate-100 px-3 py-2', flaggedNew && 'border-l-4 border-l-amber-400')}>
                    <DescriptionCombobox
                      item={item}
                      ingredients={ingredients}
                      onUpdate={(patch) => updateItem(item.id, patch)}
                      categories={categories}
                    />
                    {item.product_code && (
                      <p className="mt-0.5 text-xs text-slate-400 truncate">
                        Code: {item.product_code}
                      </p>
                    )}
                    <div className="mt-1.5">
                      <AllergenReview
                        item={item}
                        onUpdate={(patch) => updateItem(item.id, patch)}
                      />
                    </div>
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
                    <CustomSelect
                      value={item.unit}
                      onChange={(v) =>
                        updateItem(item.id, {
                          unit: v,
                          newIngredientUnit:
                            item.packageSize && item.packageUnit
                              ? item.newIngredientUnit
                              : getDefaultIngredientPriceUnit(v) ?? item.newIngredientUnit,
                        })
                      }
                      options={INVOICE_UNITS.map((u) => ({ value: u, label: u }))}
                      size="sm"
                    />
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
                      <CustomSelect
                        value={item.packageUnit ?? ''}
                        onChange={(v) =>
                          updateItem(item.id, {
                            packageUnit: v || null,
                            newIngredientUnit:
                              getDefaultIngredientPriceUnit(v) ?? item.newIngredientUnit,
                          })
                        }
                        options={[
                          { value: '', label: 'Unit?' },
                          ...PACKAGE_UNIT_OPTIONS.map((u) => ({ value: u, label: u })),
                        ]}
                        size="sm"
                        className="w-[80px]"
                      />
                    </div>
                    {item.packageSize == null && WEIGHT_VOLUME_IN_DESCRIPTION.test(item.description) && (
                      <p
                        className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-600"
                        title="The description looks like it includes a pack weight/volume — if package size is left empty, the price will be treated as per whole unit instead of per kg/L."
                      >
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        This description mentions a weight — check if package size is set.
                      </p>
                    )}
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
                )
              })}
            </tbody>
          </table>
        </div>
        )}

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
      )}
    </div>
  )
}
