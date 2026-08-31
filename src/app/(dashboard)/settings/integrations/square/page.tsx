'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Store,
  Tags,
  Unplug,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import { useSubscription } from '@/hooks/useSubscription'
import EmptyState from '@/components/shared/EmptyState'

type SquareStatus = {
  connected: boolean
  configured: boolean
  connection?: {
    merchantName: string | null
    merchantId: string
    locations: Array<{ id: string; name: string }>
    lastSyncedAt: string | null
    lastSyncStatus: 'never' | 'success' | 'failed'
    lastSyncError: string | null
  }
  analytics?: {
    periodDays: number
    orderCount: number
    salesCents: number
    averageOrderCents: number
    currency: string
  }
  error?: string
}

function formatMoney(cents: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not synced yet'
  return new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default function SquareIntegrationSettingsPage() {
  const [status, setStatus] = useState<SquareStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const { limits, loading: subscriptionLoading } = useSubscription()

  const loadStatus = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/integrations/square/status', { cache: 'no-store' })
      const data = await response.json().catch(() => ({})) as SquareStatus
      if (!response.ok) throw new Error(data.error || 'Unable to load Square integration.')
      setStatus(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load Square integration.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (subscriptionLoading) return
    if (!limits.canUseSquareIntegration) {
      setLoading(false)
      return
    }
    const params = new URLSearchParams(window.location.search)
    const error = params.get('square_error')
    const connected = params.get('square_connected')
    if (error) toast.error(error)
    if (connected) toast.success('Square connected. Import your recent sales to start analytics.')
    if (error || connected) window.history.replaceState({}, '', '/settings/integrations/square')
    void loadStatus()
  }, [subscriptionLoading, limits.canUseSquareIntegration])

  const startConnect = () => {
    window.location.assign('/api/integrations/square/connect')
  }

  const sync = async () => {
    try {
      setSyncing(true)
      const response = await fetch('/api/integrations/square/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookbackDays: 90 }),
      })
      const data = await response.json().catch(() => ({})) as { imported?: number; error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to import Square sales.')
      toast.success(`${data.imported ?? 0} Square sale${data.imported === 1 ? '' : 's'} synchronized`)
      await loadStatus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to import Square sales.')
    } finally {
      setSyncing(false)
    }
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect Square? Imported sales data will be removed from ZRecipe analytics.')) return
    try {
      setDisconnecting(true)
      const response = await fetch('/api/integrations/square/disconnect', { method: 'POST' })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to disconnect Square.')
      toast.success('Square disconnected and imported sales removed.')
      await loadStatus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to disconnect Square.')
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading || subscriptionLoading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
  }

  if (!limits.canUseSquareIntegration) {
    return (
      <div className="mx-auto max-w-4xl pb-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <EmptyState
            icon={Lock}
            title="Square POS is a Pro feature"
            description="Upgrade to Pro or Business to connect Square sales analytics."
            action={{ label: 'View plans', onClick: () => window.location.assign('/settings/billing') }}
          />
        </div>
      </div>
    )
  }

  const analytics = status?.analytics
  const connection = status?.connection

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <Link href="/settings" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            <Store className="h-3.5 w-3.5" />
            POS Integration
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">Square sales</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Connect Square to bring your POS sales into ZRecipe. Sales totals and item data power a clearer picture of revenue, order value and recipe profitability.
          </p>
        </div>
        {status?.connected ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Connected
          </span>
        ) : null}
      </div>

      {!status?.configured && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="text-sm font-semibold text-amber-950">Square credentials still need to be configured</h2>
              <p className="mt-1 text-sm leading-6 text-amber-900/80">
                Add the Square application ID, secret and encryption key to the production environment, then register the callback URL shown in the deployment notes. No sales data can be connected until this is done.
              </p>
            </div>
          </div>
        </section>
      )}

      {!status?.connected ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white">S</div>
              <div>
                <h2 className="font-semibold text-slate-900">Connect your Square account</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">You will sign in with Square and choose the account ZRecipe can read. We request read-only access to orders, payments, items and merchant profile.</p>
              </div>
            </div>
            <button onClick={startConnect} disabled={!status?.configured} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
              <Link2 className="h-4 w-4" />
              Connect Square
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Connected account</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{connection?.merchantName || 'Square merchant'}</h2>
                <p className="mt-1 text-sm text-slate-500">{connection?.locations?.length ?? 0} active location{connection?.locations?.length === 1 ? '' : 's'} · Last sync: {formatDate(connection?.lastSyncedAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={sync} disabled={syncing} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
                  <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing sales…' : 'Sync last 90 days'}
                </button>
                <Link href="/settings/integrations/square/mapping" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                  <Tags className="h-4 w-4" />
                  Map items to recipes
                </Link>
                <button onClick={disconnect} disabled={disconnecting} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60">
                  {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                  Disconnect
                </button>
              </div>
            </div>
            {connection?.lastSyncStatus === 'failed' && connection.lastSyncError ? (
              <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">Last sync failed: {connection.lastSyncError}</p>
            ) : null}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-900">Square sales — last 30 days</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['Sales', formatMoney(analytics?.salesCents ?? 0, analytics?.currency)],
                ['Completed orders', String(analytics?.orderCount ?? 0)],
                ['Average order', formatMoney(analytics?.averageOrderCents ?? 0, analytics?.currency)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <p className="text-xs leading-5 text-slate-400">Sales are read-only. ZRecipe never creates charges, refunds or edits orders in your Square account.</p>
        </>
      )}
    </div>
  )
}
