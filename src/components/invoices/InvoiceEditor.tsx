import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, CircleAlert, Plus, Search, Trash2 } from 'lucide-react'
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
  const exactMatch = options.some((option) => option.label.toLowerCase() === trimmed.toLowerCase())

  const visible = useMemo(() => {
    if (!trimmed) {
      return options.slice(0, 6)
    }

    const search = trimmed.toLowerCase()
    return options
      .map((option) => ({
        option,
        score: scoreIngredientMatch(search, option.label),
      }))
      .filter(({ option, score }) => score > 0 || option.label.toLowerCase().includes(search))
      .sort((a, b) => b.score - a.score)
      .map(({ option }) => option)
      .slice(0, 6)
  }, [options, trimmed])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
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
    ) : (
      <ChevronDown className="h-4 w-4 text-slate-300" />
    )

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
          }}
          placeholder={placeholder}
          className={cn(
            'h-10 w-full rounded-xl border pl-10 text-sm outline-none transition',
            badge ? 'pr-24' : 'pr-9',
            inputTone
          )}
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1.5">
          {badge ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              {badge}
            </span>
          ) : null}
          {icon}
        </div>
      </div>

      {open && (visible.length > 0 || (trimmed && onCreate && !exactMatch)) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {visible.map((option) => (
            <button
              key={option.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{option.label}</p>
                {option.subtitle && <p className="truncate text-xs text-slate-500">{option.subtitle}</p>}
              </div>
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            </button>
          ))}

          {onCreate && trimmed && !exactMatch && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCreate(trimmed)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {createLabel}: {trimmed}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function IngredientMatchCell({
  item,
  ingredients,
  onUpdate,
}: {
  item: InvoiceLineItem
  ingredients: IngredientLookup[]
  onUpdate: (patch: Partial<InvoiceLineItem>) => void
}) {
  const ingredientQuery = item.ingredientQuery ?? item.description
  const matches = ingredients
    .map((ingredient) => ({
      ingredient,
      score: scoreIngredientMatch(ingredientQuery, ingredient.name),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  const options = matches.map(({ ingredient }) => ({
    id: ingredient.id,
    label: ingredient.name,
    subtitle:
      ingredient.currentPrice != null
        ? `€${ingredient.currentPrice.toFixed(2)} / ${ingredient.priceUnit ?? 'unit'}`
        : ingredient.priceUnit ?? 'unit',
  }))

  const hasMatch = Boolean(item.ingredientMatch || item.ingredientId)
  const isCreated = item.ingredientMatch?.type === 'create'
  const status: ComboboxStatus = hasMatch ? 'selected' : ingredientQuery.trim() ? 'pending' : 'idle'

  return (
    <div className="w-full max-w-[200px]">
      <SearchableCombobox
        value={item.ingredientQuery ?? ''}
        onChange={(value) =>
          onUpdate({
            ingredientQuery: value,
            ingredientId: null,
            ingredientMatch: null,
            createIngredient: false,
          })
        }
        options={options}
        onSelect={(option) => {
          const selected = ingredients.find((ingredient) => ingredient.id === option.id)
          if (!selected) return
          onUpdate({
            ingredientId: selected.id,
            ingredientQuery: selected.name,
            ingredientMatch: { type: 'existing', id: selected.id, name: selected.name },
            createIngredient: false,
            newIngredientName: '',
          })
        }}
        onCreate={(value) =>
          onUpdate({
            createIngredient: true,
            newIngredientName: value,
            ingredientId: null,
            ingredientQuery: value,
            ingredientMatch: { type: 'create', name: value },
            newIngredientCategory: item.newIngredientCategory ?? 'Other',
            newIngredientUnit: item.unit,
          })
        }
        placeholder="Search or create..."
        createLabel="Create"
        status={status}
        badge={isCreated ? 'New' : undefined}
      />
    </div>
  )
}

function PackageCostLabel({
  item,
  ingredients,
}: {
  item: InvoiceLineItem
  ingredients: IngredientLookup[]
}) {
  const pricing = calculateCostPerBaseUnit(item.unitPrice, item.packageSize, item.packageUnit)
  if (!pricing) {
    return <span className="text-xs text-slate-300">-</span>
  }

  const existingMatch = item.ingredientMatch?.type === 'existing' ? item.ingredientMatch : null
  const linkedIngredient = item.ingredientId
    ? ingredients.find((ingredient) => ingredient.id === item.ingredientId)
    : existingMatch
      ? ingredients.find((ingredient) => ingredient.id === existingMatch.id)
      : null

  const currentPrice = linkedIngredient?.currentPrice ?? null
  const tone =
    currentPrice == null
      ? 'text-slate-500'
      : pricing.costPerBaseUnit < currentPrice
        ? 'text-emerald-700'
        : pricing.costPerBaseUnit > currentPrice
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
  const effectiveVat =
    Number.isFinite(draft.vatAmount ?? NaN) && draft.vatAmount != null
      ? draft.vatAmount
      : Number((totals.totalAmount - effectiveSubtotal).toFixed(2))
  const effectiveVatRate =
    Number.isFinite(draft.vatRate ?? NaN) && draft.vatRate != null
      ? draft.vatRate
      : effectiveSubtotal > 0 && effectiveVat > 0
        ? Number(((effectiveVat / effectiveSubtotal) * 100).toFixed(0))
        : null

  const updateDraft = (patch: Partial<InvoiceFormState>) => {
    onChange({
      ...draft,
      ...patch,
    })
  }

  const updateItem = (itemId: string, patch: Partial<InvoiceLineItem>) => {
    const items = draft.items.map((item) => {
      if (item.id !== itemId) return item
      const nextItem = { ...item, ...patch }
      nextItem.total = recalculateItemTotal(nextItem)
      return nextItem
    })
    updateDraft({ items, totalAmount: recalculateInvoiceTotals(items).subtotal })
  }

  const addRow = () => {
    const nextItem = createEmptyInvoiceItem()
    const items = [...draft.items, nextItem]
    updateDraft({ items, totalAmount: recalculateInvoiceTotals(items).subtotal })
  }

  const removeRow = (itemId: string) => {
    const items = draft.items.filter((item) => item.id !== itemId)
    updateDraft({ items, totalAmount: recalculateInvoiceTotals(items).subtotal })
  }

  const supplierOptions = suppliers.map((supplier) => ({
    id: supplier.id,
    label: supplier.name,
    subtitle: supplier.contactEmail ?? supplier.contactPhone ?? supplier.address ?? undefined,
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

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Supplier
            </span>
            {allowEditing ? (
              <SearchableCombobox
                value={draft.supplierName}
                onChange={(value) =>
                  updateDraft({ supplierName: value, supplierId: null, supplierMatch: null })
                }
                options={supplierOptions}
                onSelect={(option) =>
                  updateDraft({
                    supplierName: option.label,
                    supplierId: option.id,
                    supplierMatch: { type: 'existing', id: option.id, name: option.label },
                  })
                }
                onCreate={(value) =>
                  updateDraft({
                    supplierName: value,
                    supplierId: null,
                    supplierMatch: { type: 'create', name: value },
                  })
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
              onChange={(event) => updateDraft({ invoiceNumber: event.target.value })}
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
              onChange={(event) => updateDraft({ invoiceDate: event.target.value })}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Currency
            </span>
            <select
              value={draft.currency}
              onChange={(event) => updateDraft({ currency: event.target.value })}
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
            onChange={(event) => updateDraft({ notes: event.target.value })}
            rows={3}
            placeholder="Optional notes about the invoice"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
        </label>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-slate-900">Invoice items</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search for ingredients, create new ones inline, or leave a row unmatched for now.
            </p>
          </div>
          <div className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
            {draft.items.length} rows
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1180px] table-fixed border-separate border-spacing-0 text-sm">
            <colgroup>
              <col style={{ width: '240px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '200px' }} />
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
                <th className="border-b border-slate-200 px-3 font-semibold">Match</th>
                <th className="border-b border-slate-200 px-2 font-semibold" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="bg-white">
              {draft.items.map((item) => (
                <tr key={item.id} className="h-14 align-middle">
                  <td className="border-b border-slate-100 px-3 py-2">
                    <input
                      value={item.description}
                      onChange={(event) =>
                        updateItem(item.id, {
                          description: event.target.value,
                          ingredientQuery: event.target.value,
                        })
                      }
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      placeholder="Description"
                    />
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    <input
                      type="number"
                      step="0.001"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(item.id, {
                          quantity: Number.parseFloat(event.target.value || '0'),
                        })
                      }
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                    />
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    <select
                      value={item.unit}
                      onChange={(event) => updateItem(item.id, { unit: event.target.value })}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                    >
                      {INVOICE_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.001"
                        value={item.packageSize ?? ''}
                        onChange={(event) =>
                          updateItem(item.id, {
                            packageSize:
                              event.target.value === ''
                                ? null
                                : Number.parseFloat(event.target.value || '0'),
                          })
                        }
                        className="h-10 w-[80px] rounded-xl border border-slate-200 bg-white px-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                        placeholder="Size"
                      />
                      <select
                        value={item.packageUnit ?? 'kg'}
                        onChange={(event) =>
                          updateItem(item.id, { packageUnit: event.target.value })
                        }
                        className="h-10 w-[68px] rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      >
                        {PACKAGE_UNIT_OPTIONS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
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
                        onChange={(event) =>
                          updateItem(item.id, {
                            unitPrice: Number.parseFloat(event.target.value || '0'),
                          })
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
                  <td className="border-b border-slate-100 px-3 py-2">
                    <IngredientMatchCell
                      item={item}
                      ingredients={ingredients}
                      onUpdate={(patch) => updateItem(item.id, patch)}
                    />
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2">
                    <button
                      type="button"
                      onClick={() => removeRow(item.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100"
                      aria-label="Delete row"
                      title="Delete row"
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
                <p className="text-xs uppercase tracking-wide text-slate-500">Items count</p>
                <p className="mt-1 font-semibold text-slate-900">{totals.itemCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Subtotal (exc. VAT)</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {formatCurrency(effectiveSubtotal)}
                </p>
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
                  onChange={(event) =>
                    updateDraft({
                      totalAmount: Number.parseFloat(event.target.value || `${effectiveSubtotal}`),
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
