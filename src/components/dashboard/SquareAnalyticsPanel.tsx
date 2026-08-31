'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart3, ChevronRight } from 'lucide-react'

type SquareStatus = {
  connected: boolean
  analytics?: {
    orderCount: number
    salesCents: number
    averageOrderCents: number
    currency: string
  }
}

function money(cents: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100)
}

export default function SquareAnalyticsPanel() {
  const [status, setStatus] = useState<SquareStatus | null>(null)

  useEffect(() => {
    fetch('/api/integrations/square/status', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data: SquareStatus | null) => setStatus(data))
      .catch(() => setStatus(null))
  }, [])

  if (!status) return null

  if (!status.connected) {
    return (
      <Link href="/settings/integrations/square" className="group flex items-center justify-between rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-4 transition hover:border-emerald-300 hover:bg-emerald-50/40">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">S</div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Add Square sales analytics</p>
            <p className="text-xs text-slate-500">Connect Square to compare POS sales with your recipe costs.</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
      </Link>
    )
  }

  const analytics = status.analytics
  return (
    <section className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">S</div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Square sales</p>
            <p className="text-xs text-slate-500">POS performance — last 30 days</p>
          </div>
        </div>
        <Link href="/settings/integrations/square" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800">
          Manage <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Sales', value: money(analytics?.salesCents ?? 0, analytics?.currency) },
          { label: 'Completed orders', value: String(analytics?.orderCount ?? 0) },
          { label: 'Average order', value: money(analytics?.averageOrderCents ?? 0, analytics?.currency) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-white bg-white/80 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-xs text-emerald-800">
        <BarChart3 className="h-3.5 w-3.5" />
        Recipe-to-sale profit matching will build on this imported sales data.
      </div>
    </section>
  )
}
