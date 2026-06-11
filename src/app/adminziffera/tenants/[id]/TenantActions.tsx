'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  MoreVertical, PauseCircle, PlayCircle, XCircle, Trash2,
  Loader2, TimerOff, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  suspendTenant, unsuspendTenant, cancelTenantSubscription, deleteTenant, endTrial,
} from '@/app/adminziffera/actions'

type RestoreOption = 'trialing' | 'active_comped' | 'active_stripe'
type ModalType = 'end_trial' | 'suspend' | 'unsuspend' | 'cancel' | 'delete' | null

interface Props {
  tenantId: string
  tenantName: string | null
  status: string
  isComped: boolean
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  trialDaysLeft: number
  recipeCount: number
  ingredientCount: number
  invoiceCount: number
  teamCount: number
}

function Spinner() {
  return <Loader2 className="h-3.5 w-3.5 animate-spin" />
}

export default function TenantActions({
  tenantId, tenantName, status, isComped,
  stripeCustomerId, stripeSubscriptionId, trialDaysLeft,
  recipeCount, ingredientCount, invoiceCount, teamCount,
}: Props) {
  const router = useRouter()
  const [open, setOpen]   = useState(false)
  const [modal, setModal] = useState<ModalType>(null)
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const [deleteInput, setDeleteInput]   = useState('')
  const [deleteError, setDeleteError]   = useState<string | null>(null)
  const [restoreTo, setRestoreTo]       = useState<RestoreOption>(trialDaysLeft > 0 ? 'trialing' : 'active_comped')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  // click-outside closes dropdown
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  function openModal(m: ModalType) { setOpen(false); setModal(m); setDeleteInput(''); setDeleteError(null) }
  function closeModal() { if (!isPending) { setModal(null); setDeleteError(null) } }

  // ── action handlers ────────────────────────────────────────────────────────
  function run(fn: () => Promise<void>, successMsg: string) {
    startTransition(async () => {
      try {
        await fn()
        setModal(null)
        setToast({ ok: true, msg: successMsg })
      } catch (err) {
        setToast({ ok: false, msg: err instanceof Error ? err.message : 'Action failed.' })
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteTenant(tenantId)
        router.push('/adminziffera/tenants')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete.'
        if (msg.includes('active Stripe subscription')) {
          setDeleteError(msg)
        } else {
          setModal(null)
          setToast({ ok: false, msg })
        }
      }
    })
  }

  // ── dropdown items ─────────────────────────────────────────────────────────
  const canEndTrial   = status === 'trialing'
  const canSuspend    = status === 'active' || status === 'trialing'
  const canUnsuspend  = status === 'suspended'
  const canCancel     = status === 'active'

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg',
          toast.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800',
        )}>
          {toast.msg}
        </div>
      )}

      {/* Dropdown trigger */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {/* Dropdown menu */}
        {open && (
          <div className="absolute right-0 top-10 z-30 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {canEndTrial && (
              <button
                onClick={() => openModal('end_trial')}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-slate-50"
              >
                <TimerOff className="h-4 w-4 shrink-0" />
                End trial early
              </button>
            )}
            {canSuspend && (
              <button
                onClick={() => openModal('suspend')}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-slate-50"
              >
                <PauseCircle className="h-4 w-4 shrink-0" />
                Suspend account
              </button>
            )}
            {canUnsuspend && (
              <button
                onClick={() => openModal('unsuspend')}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-600 hover:bg-slate-50"
              >
                <PlayCircle className="h-4 w-4 shrink-0" />
                Unsuspend account
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => openModal('cancel')}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-slate-50"
              >
                <XCircle className="h-4 w-4 shrink-0" />
                Cancel subscription
              </button>
            )}
            <div className="my-1 border-t border-slate-100" />
            <button
              onClick={() => openModal('delete')}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-slate-50"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              Delete tenant
            </button>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">

            {/* Modal — End trial */}
            {modal === 'end_trial' && (
              <>
                <div className="mb-4 flex justify-center">
                  <TimerOff className="h-12 w-12 text-amber-500" />
                </div>
                <h3 className="mb-2 text-center text-base font-semibold text-slate-900">
                  End trial for {tenantName ?? 'this tenant'}?
                </h3>
                <p className="mb-6 text-center text-sm text-slate-500">
                  This will immediately expire the trial. The tenant will need to subscribe to continue using ZRecipe.
                </p>
                <div className="flex justify-end gap-3">
                  <button onClick={closeModal} disabled={isPending} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                  <button
                    onClick={() => run(
                      () => endTrial(tenantId),
                      `Trial ended for ${tenantName ?? 'tenant'}.`
                    )}
                    disabled={isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {isPending && <Spinner />} End trial
                  </button>
                </div>
              </>
            )}

            {/* Modal A — Suspend */}
            {modal === 'suspend' && (
              <>
                <div className="mb-4 flex justify-center">
                  <PauseCircle className="h-12 w-12 text-amber-500" />
                </div>
                <h3 className="mb-2 text-center text-base font-semibold text-slate-900">
                  Suspend {tenantName ?? 'this tenant'}?
                </h3>
                <p className="mb-3 text-center text-sm text-slate-500">
                  This tenant will immediately lose access to ZRecipe. Their data will be preserved and they can be unsuspended at any time.
                </p>
                <ul className="mb-5 space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  <li>• User sees &quot;Account suspended&quot; when they try to log in</li>
                  <li>• All team members are locked out</li>
                  <li>• Data is preserved (recipes, ingredients, invoices)</li>
                </ul>
                <div className="flex justify-end gap-3">
                  <button onClick={closeModal} disabled={isPending} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                  <button
                    onClick={() => run(() => suspendTenant(tenantId), 'Account suspended.')}
                    disabled={isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {isPending && <Spinner />} Suspend account
                  </button>
                </div>
              </>
            )}

            {/* Modal B — Unsuspend */}
            {modal === 'unsuspend' && (
              <>
                <div className="mb-4 flex justify-center">
                  <PlayCircle className="h-12 w-12 text-emerald-500" />
                </div>
                <h3 className="mb-2 text-center text-base font-semibold text-slate-900">
                  Unsuspend {tenantName ?? 'this tenant'}?
                </h3>
                <p className="mb-4 text-center text-sm text-slate-500">
                  This will restore access immediately. The tenant will return to the status you select below.
                </p>
                <div className="mb-5">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">Restore to:</label>
                  <select
                    value={restoreTo}
                    onChange={(e) => setRestoreTo(e.target.value as RestoreOption)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {trialDaysLeft > 0 && <option value="trialing">Trial ({trialDaysLeft}d remaining)</option>}
                    <option value="active_comped">Active (comped — no billing)</option>
                    <option value="active_stripe">Active (requires Stripe setup)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={closeModal} disabled={isPending} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                  <button
                    onClick={() => run(() => unsuspendTenant(tenantId, restoreTo), 'Access restored.')}
                    disabled={isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isPending && <Spinner />} Restore access
                  </button>
                </div>
              </>
            )}

            {/* Modal C — Cancel subscription */}
            {modal === 'cancel' && (
              <>
                <div className="mb-4 flex justify-center">
                  <XCircle className="h-12 w-12 text-red-500" />
                </div>
                <h3 className="mb-2 text-center text-base font-semibold text-slate-900">
                  Cancel {tenantName ?? 'this tenant'}&apos;s subscription?
                </h3>
                <p className="mb-3 text-center text-sm text-slate-500">
                  {isComped
                    ? 'This is a comped account — canceling will revoke their free Pro access.'
                    : 'The tenant will lose Pro access. If this is a Stripe subscription, you should also cancel it in the Stripe Dashboard.'}
                </p>
                {!isComped && stripeSubscriptionId && (
                  <p className="mb-3 text-center text-sm">
                    <a
                      href={`https://dashboard.stripe.com/subscriptions/${stripeSubscriptionId}`}
                      target="_blank"
                      className="text-emerald-600 underline"
                    >
                      Open in Stripe Dashboard →
                    </a>
                  </p>
                )}
                {!isComped && (
                  <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                    Note: This only updates the status in ZRecipe. If the tenant has an active Stripe subscription, cancel it separately in Stripe to stop billing.
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <button onClick={closeModal} disabled={isPending} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                  <button
                    onClick={() => run(() => cancelTenantSubscription(tenantId), 'Subscription cancelled.')}
                    disabled={isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {isPending && <Spinner />} Cancel subscription
                  </button>
                </div>
              </>
            )}

            {/* Modal D — Delete */}
            {modal === 'delete' && (
              <>
                <div className="mb-4 flex justify-center">
                  <Trash2 className="h-12 w-12 text-red-500" />
                </div>
                <h3 className="mb-2 text-center text-base font-semibold text-slate-900">
                  Permanently delete {tenantName ?? 'this tenant'}?
                </h3>
                <p className="mb-3 text-center text-sm text-slate-500">
                  This action cannot be undone. All data associated with this tenant will be permanently deleted.
                </p>
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <p className="mb-1 font-semibold">The following will be permanently deleted:</p>
                  <ul className="space-y-0.5">
                    <li>• {recipeCount} recipe{recipeCount !== 1 ? 's' : ''}</li>
                    <li>• {ingredientCount} ingredient{ingredientCount !== 1 ? 's' : ''}</li>
                    <li>• {invoiceCount} invoice{invoiceCount !== 1 ? 's' : ''}</li>
                    <li>• {teamCount} team member{teamCount !== 1 ? 's' : ''} will lose access</li>
                  </ul>
                </div>
                {deleteError ? (
                  <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
                    <p className="mb-2 font-semibold">{deleteError}</p>
                    {stripeSubscriptionId && (
                      <a
                        href={`https://dashboard.stripe.com/subscriptions/${stripeSubscriptionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-red-700 underline hover:text-red-900"
                      >
                        Open subscription in Stripe Dashboard
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ) : stripeCustomerId ? (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                    This tenant has a Stripe customer record. Delete or archive it separately in the Stripe Dashboard.
                  </div>
                ) : null}
                <div className="mb-5">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Type the business name to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteInput}
                    onChange={(e) => setDeleteInput(e.target.value)}
                    placeholder={tenantName ?? 'Business name'}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={closeModal} disabled={isPending} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                  <button
                    onClick={handleDelete}
                    disabled={isPending || deleteInput !== (tenantName ?? '')}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isPending && <Spinner />} Delete permanently
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
