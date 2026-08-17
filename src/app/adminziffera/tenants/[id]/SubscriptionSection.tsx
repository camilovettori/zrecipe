'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  Gift, CheckCircle2, AlertTriangle, Info, XCircle, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPlanTierLabel, type PlanTier } from '@/lib/stripe/plans'
import { activateCompedPlan, revokeCompedPlan } from '@/app/adminziffera/actions'

interface Props {
  tenantId: string
  tenantName: string | null
  status: string
  isComped: boolean
  planTier: PlanTier
  daysLeft: number
  trialPct: number
  trialEndsFormatted: string
  updatedAtFormatted: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  cancelAt: string | null
}

export default function SubscriptionSection({
  tenantId,
  tenantName,
  status,
  isComped,
  planTier,
  daysLeft,
  trialPct,
  trialEndsFormatted,
  updatedAtFormatted,
  stripeCustomerId,
  stripeSubscriptionId,
  cancelAt,
}: Props) {
  const [modal, setModal] = useState<'activate' | 'revoke' | null>(null)
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const [selectedTier, setSelectedTier] = useState<PlanTier>(planTier)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  function handleActivate() {
    startTransition(async () => {
      try {
        await activateCompedPlan(tenantId, selectedTier)
        setModal(null)
        setToast({ ok: true, msg: `${formatPlanTierLabel(selectedTier)} access activated for free.` })
      } catch (err) {
        setToast({ ok: false, msg: err instanceof Error ? err.message : 'Failed to activate.' })
      }
    })
  }

  function handleRevoke() {
    startTransition(async () => {
      try {
        await revokeCompedPlan(tenantId)
        setModal(null)
        setToast({ ok: true, msg: 'Free access revoked — tenant reverted to trial.' })
      } catch (err) {
        setToast({ ok: false, msg: err instanceof Error ? err.message : 'Failed to revoke.' })
      }
    })
  }

  const canActivate = ['trialing', 'canceled', 'past_due'].includes(status)
  const canRevoke = status === 'active' && isComped
  const isPaying = status === 'active' && !isComped
  const displayTier = formatPlanTierLabel(planTier)

  return (
    <>
      {toast && (
        <div
          className={cn(
            'fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg',
            toast.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          )}
        >
          {toast.msg}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-base font-semibold text-slate-900">
              {modal === 'activate' ? 'Grant free access' : 'Revoke free access'}
            </h3>
            <p className="mb-6 text-sm text-slate-500">
              {modal === 'activate'
                ? `Choose which tier ${tenantName ?? 'this tenant'} should receive for free. The selected tier is stored on the tenant so the app knows exactly what was granted.`
                : `This will revoke the free access flag and return ${tenantName ?? 'this tenant'} to trial status.`}
            </p>

            {modal === 'activate' && (
              <div className="mb-5">
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Free tier</label>
                <select
                  value={selectedTier}
                  onChange={(e) => setSelectedTier(e.target.value as PlanTier)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="business">Business</option>
                </select>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setModal(null)}
                disabled={isPending}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              {modal === 'activate' ? (
                <button
                  onClick={handleActivate}
                  disabled={isPending}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isPending ? 'Activating…' : `Grant ${formatPlanTierLabel(selectedTier)} free`}
                </button>
              ) : (
                <button
                  onClick={handleRevoke}
                  disabled={isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {isPending ? 'Revoking…' : 'Revoke'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Subscription</h2>
            {isComped && status === 'active' && (
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                Comped · {displayTier}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canActivate && (
              <button
                onClick={() => {
                  setSelectedTier(planTier)
                  setModal('activate')
                }}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
              >
                <Gift className="h-3.5 w-3.5" />
                Grant free access
              </button>
            )}
            {canRevoke && (
              <button
                onClick={() => setModal('revoke')}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Revoke free access
              </button>
            )}
          </div>
        </div>

        <div className="p-5">
          {status === 'trialing' && (
            <div className="mb-5">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-500">Trial progress</span>
                <span className="font-medium text-amber-600">{daysLeft}d remaining</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${trialPct}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Trial ends {trialEndsFormatted}</p>
            </div>
          )}

          {status === 'past_due' ? (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-semibold text-red-700">Payment declined</p>
                <p className="text-xs text-red-500">
                  Failed around {updatedAtFormatted} — action required
                </p>
              </div>
            </div>
          ) : status === 'active' ? (
            <div className="mb-5 flex items-center gap-2.5 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              {isComped ? `Free ${displayTier} access — no billing` : 'Payment up to date'}
            </div>
          ) : status === 'trialing' ? (
            <div className="mb-5 flex items-center gap-2.5 text-sm text-slate-500">
              <Info className="h-4 w-4 shrink-0 text-slate-400" />
              No payment required during trial
            </div>
          ) : (
            <div className="mb-5 flex items-center gap-2.5 text-sm text-slate-400">
              <XCircle className="h-4 w-4 shrink-0" />
              Subscription ended
            </div>
          )}

          <div className="space-y-3">
            {status === 'active' && !isComped && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">MRR contribution</span>
                <span className="text-sm font-semibold text-emerald-600">€25/mo</span>
              </div>
            )}
            {status === 'active' && isComped && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">Free tier granted</span>
                <span className="text-sm font-semibold text-purple-700">{displayTier}</span>
              </div>
            )}
            {isPaying && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">Billing</span>
                <span className="text-sm text-slate-500">Paid via Stripe</span>
              </div>
            )}
            {stripeCustomerId && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Stripe customer</span>
                <a
                  href={`https://dashboard.stripe.com/customers/${stripeCustomerId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900"
                >
                  <span className="font-mono text-xs">{stripeCustomerId.slice(0, 22)}…</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {stripeSubscriptionId && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Subscription ID</span>
                <a
                  href={`https://dashboard.stripe.com/subscriptions/${stripeSubscriptionId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900"
                >
                  <span className="font-mono text-xs">{stripeSubscriptionId.slice(0, 22)}…</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {cancelAt && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">Cancels at</span>
                <span className="text-sm text-red-600">
                  {new Date(cancelAt).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
