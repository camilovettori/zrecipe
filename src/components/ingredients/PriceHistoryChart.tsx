'use client'

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

export interface PricePoint {
  id: string
  ingredient_id: string
  price: number
  unit: string
  currency: string
  effective_date: string
  invoice_id: string | null
  created_at: string
}

interface ChartPoint extends PricePoint {
  label: string
}

interface TooltipEntry {
  value: number
  payload: ChartPoint
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {format(new Date(point.effective_date), 'MMM d, yyyy')}
      </p>
      <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
        €{point.price.toFixed(2)} / {point.unit}
      </p>
      {point.invoice_id && (
        <p className="mt-0.5 font-mono text-xs text-slate-400">
          inv: {point.invoice_id.slice(0, 8)}…
        </p>
      )}
    </div>
  )
}

interface PriceHistoryChartProps {
  priceHistory: PricePoint[]
  unit: string
}

export default function PriceHistoryChart({ priceHistory, unit }: PriceHistoryChartProps) {
  if (priceHistory.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Price history will appear here as invoices are processed.
        </p>
      </div>
    )
  }

  const data: ChartPoint[] = priceHistory.map((p) => ({
    ...p,
    label: format(new Date(p.effective_date), 'MMM d'),
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v} ${unit}`}
          width={42}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="price"
          stroke="#059669"
          strokeWidth={2.5}
          dot={{ r: 4, fill: '#059669', strokeWidth: 0 }}
          activeDot={{ r: 6, fill: '#059669', strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
