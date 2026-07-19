'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowUpDown, CalendarDays, ChevronLeft, ChevronRight, FileText, Layers, Lock, Plus, Search, Sparkles, UploadCloud, X } from 'lucide-react'
import { useInvoices, type InvoiceRecord } from '@/hooks/useInvoices'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { useSubscription } from '@/hooks/useSubscription'
import { cn } from '@/lib/utils'
import { CustomSelect } from '@/components/ui/CustomSelect'

type PeriodPreset = 'this-month' | 'last-month' | 'last-30-days' | 'last-90-days' | 'this-year' | 'custom'
type SortMode = 'newest' | 'oldest' | 'amount-high' | 'amount-low' | 'supplier-az'

const PERIOD_PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'last-30-days', label: 'Last 30 days' },
  { value: 'last-90-days', label: 'Last 90 days' },
  { value: 'this-year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
]

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getPresetRange(preset: Exclude<PeriodPreset, 'custom'>) {
  const today = new Date()
  const end = toDateInputValue(today)
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const startOfYear = new Date(today.getFullYear(), 0, 1)

  switch (preset) {
    case 'this-month':
      return { from: toDateInputValue(startOfMonth), to: end }
    case 'last-month': {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const to = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: toDateInputValue(from), to: toDateInputValue(to) }
    }
    case 'last-30-days': {
      const from = new Date(today)
      from.setDate(from.getDate() - 29)
      return { from: toDateInputValue(from), to: end }
    }
    case 'last-90-days': {
      const from = new Date(today)
      from.setDate(from.getDate() - 89)
      return { from: toDateInputValue(from), to: end }
    }
    case 'this-year':
      return { from: toDateInputValue(startOfYear), to: end }
  }
}

function formatPeriodLabel(from: string, to: string) {
  const format = new Intl.DateTimeFormat('en-IE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${format.format(new Date(`${from}T12:00:00`))} — ${format.format(new Date(`${to}T12:00:00`))}`
}

function parseInputDate(value: string) {
  return new Date(`${value}T12:00:00`)
}

function formatDateDisplay(value: string) {
  return new Intl.DateTimeFormat('en-IE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parseInputDate(value))
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, delta: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + delta)
  return next
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat('en-IE', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function buildCalendarDays(viewDate: Date) {
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const leadingDays = (firstDayOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7
  const cells: Array<Date | null> = []

  for (let index = 0; index < totalCells; index++) {
    const dayNumber = index - leadingDays + 1
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cells.push(null)
      continue
    }
    cells.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), dayNumber))
  }

  return cells
}

function DateFieldPopover({
  label,
  value,
  open,
  onOpenChange,
  onChange,
  minValue,
  maxValue,
  containerRef,
}: {
  label: string
  value: string
  open: boolean
  onOpenChange: (next: boolean) => void
  onChange: (next: string) => void
  minValue?: string
  maxValue?: string
  containerRef: RefObject<HTMLDivElement>
}) {
  const [cursorMonth, setCursorMonth] = useState(() =>
    startOfMonth(value ? parseInputDate(value) : new Date())
  )
  const [openUpward, setOpenUpward] = useState(false)
  const todayValue = toDateInputValue(new Date())
  const cells = useMemo(() => buildCalendarDays(cursorMonth), [cursorMonth])

  useEffect(() => {
    if (!open) return
    const current = value ? parseInputDate(value) : new Date()
    setCursorMonth(startOfMonth(current))

    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setOpenUpward(window.innerHeight - rect.bottom < 400)
    }
  }, [containerRef, open, value])

  const isDisabled = (dayValue: string) => {
    if (minValue && dayValue < minValue) return true
    if (maxValue && dayValue > maxValue) return true
    return false
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          'flex h-11 w-full items-center justify-between rounded-2xl border px-4 text-left text-sm outline-none transition',
          open
            ? 'border-emerald-500 bg-white ring-4 ring-emerald-500/10'
            : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
        )}
      >
        <span className={cn('truncate', value ? 'text-slate-800' : 'text-slate-400')}>
          {value ? formatDateDisplay(value) : 'Pick a date'}
        </span>
        <CalendarDays className={cn('h-4 w-4 flex-shrink-0', open ? 'text-emerald-500' : 'text-slate-400')} />
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 w-[320px] rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-200/70',
            openUpward ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCursorMonth((current) => addMonths(current, -1))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold text-slate-900">
              {formatMonthTitle(cursorMonth)}
            </p>
            <button
              type="button"
              onClick={() => setCursorMonth((current) => addMonths(current, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1">
            {cells.map((cell, index) => {
              if (!cell) {
                return <div key={`empty-${index}`} className="h-10 rounded-xl" />
              }

              const dayValue = toDateInputValue(cell)
              const selected = dayValue === value
              const today = dayValue === todayValue
              const disabled = isDisabled(dayValue)

              return (
                <button
                  key={dayValue}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(dayValue)
                    onOpenChange(false)
                  }}
                  className={cn(
                    'flex h-10 items-center justify-center rounded-xl text-sm transition',
                    selected
                      ? 'bg-emerald-600 font-semibold text-white shadow-sm'
                      : today
                        ? 'bg-emerald-50 font-medium text-emerald-700'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900',
                    disabled && 'cursor-not-allowed opacity-30 hover:bg-transparent'
                  )}
                >
                  {cell.getDate()}
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              type="button"
              disabled={isDisabled(todayValue)}
              onClick={() => {
                onChange(todayValue)
                onOpenChange(false)
              }}
              className="text-xs font-semibold text-emerald-600 transition hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function statusStyles(status: InvoiceRecord['ocrStatus']) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'failed') return 'bg-red-50 text-red-700 ring-red-200'
  return 'bg-amber-50 text-amber-700 ring-amber-200'
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center shadow-sm">
      <div className="rounded-3xl bg-emerald-50 p-5 text-emerald-600">
        <FileText className="h-12 w-12" />
      </div>
      <h3 className="mt-6 font-display text-2xl font-semibold text-slate-900">{title}</h3>
      <p className="mt-3 max-w-xl text-sm text-slate-500">{description}</p>
    </div>
  )
}

export default function InvoicesPage() {
  const router = useRouter()
  const { invoices, loading, error } = useInvoices()
  const { limits } = useSubscription()
  const canImportInvoices = limits.canUploadInvoices
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this-month')
  const [periodFrom, setPeriodFrom] = useState(() => {
    const preset = getPresetRange('this-month')
    return preset.from
  })
  const [periodTo, setPeriodTo] = useState(() => {
    const preset = getPresetRange('this-month')
    return preset.to
  })
  const [fromPickerOpen, setFromPickerOpen] = useState(false)
  const [toPickerOpen, setToPickerOpen] = useState(false)
  const fromPickerRef = useRef<HTMLDivElement>(null)
  const toPickerRef = useRef<HTMLDivElement>(null)
  const [ingredientCount, setIngredientCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadIngredientCount = async () => {
      try {
        const supabase = createClient()
        const tenantId = await resolveTenantId()
        const { count } = await supabase
          .from('ingredients')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
        if (!cancelled) setIngredientCount(count ?? 0)
      } catch {
        // Non-critical — the onboarding banner just won't show.
      }
    }
    loadIngredientCount()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      const insideFrom = fromPickerRef.current?.contains(target)
      const insideTo = toPickerRef.current?.contains(target)

      if (!insideFrom) setFromPickerOpen(false)
      if (!insideTo) setToPickerOpen(false)
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const periodInvoices = useMemo(() => {
    const fromTime = new Date(`${periodFrom}T00:00:00`).getTime()
    const toTime = new Date(`${periodTo}T23:59:59.999`).getTime()
    return invoices.filter((invoice) => {
      const time = new Date(invoice.invoiceDate).getTime()
      return time >= fromTime && time <= toTime
    })
  }, [invoices, periodFrom, periodTo])

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase()
    let result = [...periodInvoices]

    if (query) {
      result = result.filter((invoice) => {
        const invoiceNumber = invoice.invoiceNumber?.toLowerCase() ?? ''
        const supplierName = invoice.supplier?.name.toLowerCase() ?? ''
        return invoiceNumber.includes(query) || supplierName.includes(query)
      })
    }

    switch (sortMode) {
      case 'oldest':
        return result.sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime())
      case 'amount-high':
        return result.sort((a, b) => (b.totalAmount ?? 0) - (a.totalAmount ?? 0))
      case 'amount-low':
        return result.sort((a, b) => (a.totalAmount ?? 0) - (b.totalAmount ?? 0))
      case 'supplier-az':
        return result.sort((a, b) => (a.supplier?.name ?? '').localeCompare(b.supplier?.name ?? ''))
      case 'newest':
      default:
        return result.sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
    }
  }, [periodInvoices, search, sortMode])

  const summary = useMemo(() => {
    const totalInvoices = filteredInvoices.length
    const totalSpend = filteredInvoices.reduce((sum, invoice) => sum + (invoice.totalAmount ?? 0), 0)
    const averageInvoiceValue = totalInvoices > 0 ? totalSpend / totalInvoices : 0

    return { totalInvoices, totalSpend, averageInvoiceValue }
  }, [filteredInvoices])

  const periodLabel = useMemo(() => {
    if (periodPreset === 'this-month') return 'This month'
    if (periodPreset === 'last-month') return 'Last month'
    if (periodPreset === 'last-30-days') return 'Last 30 days'
    if (periodPreset === 'last-90-days') return 'Last 90 days'
    if (periodPreset === 'this-year') return 'This year'
    return formatPeriodLabel(periodFrom, periodTo)
  }, [periodFrom, periodPreset, periodTo])

  const hasAnyInvoicesInPeriod = periodInvoices.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Invoices
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">
            Invoices
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Track every supplier bill, import PDFs or CSVs, and manage invoices in one place.
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => canImportInvoices && router.push('/invoices/import')}
              disabled={!canImportInvoices}
              title={!canImportInvoices ? 'Invoice import is a Pro feature' : undefined}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition',
                canImportInvoices ? 'bg-emerald-600 hover:bg-emerald-500' : 'cursor-not-allowed bg-slate-400'
              )}
            >
              {canImportInvoices ? <UploadCloud className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              Import Invoice
            </button>
            <button
              type="button"
              onClick={() => canImportInvoices && router.push('/invoices/import-bulk')}
              disabled={!canImportInvoices}
              title={!canImportInvoices ? 'Invoice import is a Pro feature' : undefined}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition',
                canImportInvoices
                  ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
              )}
            >
              {canImportInvoices ? <Layers className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              Import Multiple
            </button>
            <button
              type="button"
              onClick={() => router.push('/invoices/new')}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Manual Entry
            </button>
          </div>
          {!canImportInvoices && (
            <p className="text-right text-xs text-slate-500">
              Invoice import requires Pro.{' '}
              <a href="/settings/billing" className="font-medium text-emerald-600 hover:underline">Upgrade</a>
            </p>
          )}
        </div>
      </div>

      {ingredientCount === 0 && (
        <div className="flex flex-col gap-4 rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-100 p-2.5 text-emerald-700">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-base font-semibold text-slate-900">New here?</p>
              <p className="mt-1 max-w-xl text-sm text-slate-600">
                Skip adding ingredients one by one. Import several invoices at once and AI will build your
                ingredient library — you review everything before it&apos;s saved.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => canImportInvoices && router.push('/invoices/import-bulk')}
              disabled={!canImportInvoices}
              title={!canImportInvoices ? 'Invoice import is a Pro feature' : undefined}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition',
                canImportInvoices ? 'bg-emerald-600 hover:bg-emerald-500' : 'cursor-not-allowed bg-slate-400'
              )}
            >
              {canImportInvoices ? <Layers className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              Import multiple invoices
            </button>
            {!canImportInvoices && (
              <p className="text-xs text-slate-500">
                Requires Pro.{' '}
                <a href="/settings/billing" className="font-medium text-emerald-600 hover:underline">Upgrade</a>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by invoice # or supplier"
            className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
          />
        </div>

        <label className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-sm text-slate-500 ring-1 ring-slate-200">
          <ArrowUpDown className="h-4 w-4" />
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="bg-transparent outline-none"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amount-high">Amount high</option>
            <option value="amount-low">Amount low</option>
            <option value="supplier-az">Supplier A-Z</option>
          </select>
        </label>

        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
          <FileText className="h-4 w-4" />
          {filteredInvoices.length} invoices
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1.15fr_1fr_1fr]">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Period
            </span>
            <CustomSelect
              value={periodPreset}
              onChange={(next) => {
                const preset = next as PeriodPreset
                setPeriodPreset(preset)
                if (preset !== 'custom') {
                  const range = getPresetRange(preset)
                  if (range) {
                    setPeriodFrom(range.from)
                    setPeriodTo(range.to)
                  }
                }
              }}
              options={PERIOD_PRESETS.map((preset) => ({
                value: preset.value,
                label: preset.label,
              }))}
              className="w-full"
            />
          </label>

          <DateFieldPopover
            label="From"
            value={periodFrom}
            open={fromPickerOpen}
            onOpenChange={(next) => {
              setFromPickerOpen(next)
              if (next) setToPickerOpen(false)
            }}
            onChange={(next) => {
              setPeriodPreset('custom')
              setPeriodFrom(next)
              if (periodTo < next) setPeriodTo(next)
            }}
            maxValue={periodTo}
            containerRef={fromPickerRef}
          />

          <DateFieldPopover
            label="To"
            value={periodTo}
            open={toPickerOpen}
            onOpenChange={(next) => {
              setToPickerOpen(next)
              if (next) setFromPickerOpen(false)
            }}
            onChange={(next) => {
              setPeriodPreset('custom')
              setPeriodTo(next)
              if (periodFrom > next) setPeriodFrom(next)
            }}
            minValue={periodFrom}
            containerRef={toPickerRef}
          />
        </div>
      </div>

      <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Selected period
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">{periodLabel}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Total invoices
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {summary.totalInvoices}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Total spend
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatCurrency(summary.totalSpend)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Average value
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatCurrency(summary.averageInvoiceValue)}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid grid-cols-6 gap-4 p-4">
                {Array.from({ length: 6 }).map((__, cell) => (
                  <div key={cell} className="h-10 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <EmptyState
          title={hasAnyInvoicesInPeriod ? 'No invoices match your search' : 'No invoices found for this period'}
          description={
            hasAnyInvoicesInPeriod
              ? 'Try a different search term or adjust the date range.'
              : 'Try a wider date range or import a new invoice.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Date</th>
                  <th className="px-5 py-4 font-semibold">Invoice #</th>
                  <th className="px-5 py-4 font-semibold">Supplier</th>
                  <th className="px-5 py-4 font-semibold">Items Count</th>
                  <th className="px-5 py-4 font-semibold">Total (€)</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredInvoices.map((invoice, index) => (
                  <motion.tr
                    key={invoice.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/invoices/${invoice.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        router.push(`/invoices/${invoice.id}`)
                      }
                    }}
                    className="cursor-pointer transition hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {formatDate(invoice.invoiceDate)}
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-900">
                      {invoice.invoiceNumber ?? 'N/A'}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {invoice.supplier?.name ?? 'Unassigned'}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {invoice.items.length}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                      {formatCurrency(invoice.totalAmount ?? 0, invoice.currency ?? 'EUR')}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1',
                          statusStyles(invoice.ocrStatus)
                        )}
                      >
                        {invoice.ocrStatus}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
