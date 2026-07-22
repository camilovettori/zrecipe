'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import { ArrowDownRight, ArrowUpRight, Minus, FileText, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

type JoinedSupplier = { name: string | null }
type JoinedInvoice = {
  id?: string | null
  invoice_number?: string | null
  supplier?: JoinedSupplier | JoinedSupplier[] | null
}

export interface PricePoint {
  id: string
  ingredient_id: string
  price: number
  unit: string
  brand?: string | null
  is_selected_price?: boolean
  recorded_at?: string | null
  effective_date?: string | null
  invoice_id: string | null
  created_at?: string | null
  invoice?: JoinedInvoice | JoinedInvoice[] | null
}

interface ChartPoint extends PricePoint {
  label: string
  displayPrice: number
  displayUnit: string
}

interface TooltipEntry {
  value: number
  payload: ChartPoint
}

function resolveDate(point: PricePoint) {
  return point.recorded_at ?? point.effective_date ?? point.created_at ?? new Date().toISOString()
}

function normalizePrice(point: PricePoint, fallbackUnit: string) {
  const unit = (point.unit ?? fallbackUnit ?? 'unit').toLowerCase()

  if (unit === 'kg') return { price: point.price, displayUnit: 'kg' }
  if (unit === 'g') return { price: point.price * 1000, displayUnit: 'kg' }
  if (unit === 'lb') return { price: point.price * 2.20462, displayUnit: 'kg' }
  if (unit === 'oz') return { price: point.price * 35.27396, displayUnit: 'kg' }

  return { price: point.price, displayUnit: point.unit || fallbackUnit || 'unit' }
}

function resolveInvoice(point: PricePoint) {
  return Array.isArray(point.invoice) ? point.invoice[0] : point.invoice
}

function resolveSupplierName(point: PricePoint) {
  const invoice = resolveInvoice(point)
  const supplier = Array.isArray(invoice?.supplier) ? invoice?.supplier[0] : invoice?.supplier
  return supplier?.name ?? null
}

function resolveInvoiceLabel(point: PricePoint) {
  const invoice = resolveInvoice(point)
  return invoice?.invoice_number ?? point.invoice_id?.slice(0, 8) ?? null
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  const supplierName = resolveSupplierName(point)
  const invoiceLabel = resolveInvoiceLabel(point)

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {format(new Date(resolveDate(point)), 'MMM d, yyyy')}
      </p>
      <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
        {'\u20ac'}{point.displayPrice.toFixed(2)} / {point.displayUnit}
      </p>
      {point.brand && (
        <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          {point.brand}
        </p>
      )}
      {supplierName && (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {supplierName}
        </p>
      )}
      {point.invoice_id && invoiceLabel && (
        <p className="mt-0.5 font-mono text-xs text-slate-400">
          inv: {invoiceLabel}
        </p>
      )}
    </div>
  )
}

interface PriceHistoryChartProps {
  priceHistory: PricePoint[]
  unit: string
  ingredientId?: string
  onSelectionChange?: (historyId: string | null) => void | Promise<void>
}

export default function PriceHistoryChart({ priceHistory, unit, ingredientId, onSelectionChange }: PriceHistoryChartProps) {
  const router = useRouter()
  const [showAll, setShowAll] = useState(false)
  const ordered = useMemo(
    () =>
      [...priceHistory].sort(
        (a, b) => new Date(resolveDate(a)).getTime() - new Date(resolveDate(b)).getTime()
      ),
    [priceHistory]
  )

  const data: ChartPoint[] = useMemo(
    () =>
      ordered.map((p) => {
        const normalized = normalizePrice(p, unit)
        return {
          ...p,
          label: format(new Date(resolveDate(p)), 'MMM d'),
          displayPrice: normalized.price,
          displayUnit: normalized.displayUnit,
        }
      }),
    [ordered, unit]
  )

  if (data.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Price history will appear here as invoices are processed.
        </p>
      </div>
    )
  }

  const latest = data[data.length - 1]
  const previous = data[data.length - 2]
  const trend =
    latest && previous
      ? latest.displayPrice > previous.displayPrice
        ? { label: 'Up', tone: 'text-red-700 bg-red-50', Icon: ArrowUpRight }
        : latest.displayPrice < previous.displayPrice
          ? { label: 'Down', tone: 'text-emerald-700 bg-emerald-50', Icon: ArrowDownRight }
          : { label: 'Flat', tone: 'text-slate-600 bg-slate-100', Icon: Minus }
      : null

  const allEntriesReversed = [...data].reverse()
  const recentEntries = showAll ? allEntriesReversed : allEntriesReversed.slice(0, 3)
  const hasMore = allEntriesReversed.length > 3
  const selectionEnabled = Boolean(ingredientId && onSelectionChange)
  const selectedId = data.find((p) => p.is_selected_price)?.id ?? null
  const latestId = latest?.id ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Trend</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {latest ? `\u20ac${latest.displayPrice.toFixed(2)} / ${latest.displayUnit}` : 'No trend data'}
          </p>
        </div>
        {trend && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${trend.tone}`}>
            <trend.Icon className="h-3.5 w-3.5" />
            {trend.label}
          </span>
        )}
      </div>

      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="displayPrice"
              stroke="#059669"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: '#059669', strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={cn('space-y-2', showAll && 'max-h-80 overflow-y-auto pr-1')}>
        {recentEntries.map((point) => {
          const date = format(new Date(resolveDate(point)), 'MMM d, yyyy')
          const fromInvoice = Boolean(point.invoice_id)
          const supplierName = resolveSupplierName(point)
          const invoiceLabel = resolveInvoiceLabel(point)

          const isSelected = point.id === selectedId
          const isLatestFallback = selectedId === null && point.id === latestId

          return (
            <div
              key={point.id}
              className="flex w-full items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"
            >
              {selectionEnabled && (
                <input
                  type="radio"
                  name={`price-select-${ingredientId}`}
                  checked={isSelected}
                  onChange={() => onSelectionChange!(point.id)}
                  className="h-3.5 w-3.5 shrink-0 accent-emerald-600"
                  aria-label={`Use ${date} purchase as the selected price`}
                />
              )}
              <button
                type="button"
                disabled={!point.invoice_id}
                onClick={() => {
                  if (point.invoice_id) router.push(`/invoices/${point.invoice_id}`)
                }}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left transition-colors enabled:cursor-pointer enabled:hover:bg-slate-100 disabled:cursor-default dark:enabled:hover:bg-slate-700/60"
              >
              <span
                title={fromInvoice ? 'From invoice' : 'Manual edit'}
                className="shrink-0 text-slate-400 dark:text-slate-500"
              >
                {fromInvoice
                  ? <FileText className="h-3.5 w-3.5" />
                  : <Pencil className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  {date}
                  {point.brand && (
                    <span className="truncate rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      {point.brand}
                    </span>
                  )}
                </span>
                {(supplierName || invoiceLabel) && (
                  <span className="block truncate text-xs text-slate-400 dark:text-slate-500">
                    {supplierName ?? 'Invoice'}{invoiceLabel ? ` · ${invoiceLabel}` : ''}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-semibold text-slate-900 dark:text-white">
                {'\u20ac'}{point.displayPrice.toFixed(2)} / {point.displayUnit}
              </span>
              </button>
              {isSelected && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                  Selected
                </span>
              )}
              {isLatestFallback && (
                <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  Latest
                </span>
              )}
            </div>
          )
        })}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full rounded-lg py-1.5 text-center text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
        >
          {showAll ? 'Show less' : `Show all ${allEntriesReversed.length} entries`}
        </button>
      )}

      {selectionEnabled && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            Recipes use the selected price. If none is selected, we use the most recent purchase.
          </p>
          {selectedId && (
            <button
              type="button"
              onClick={() => onSelectionChange!(null)}
              className="shrink-0 text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline dark:hover:text-slate-300"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  )
}
