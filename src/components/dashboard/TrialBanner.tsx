'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X, Zap, AlertTriangle, ShieldAlert } from 'lucide-react'

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive'

export interface TrialInfo {
  subscriptionStatus: SubscriptionStatus
  daysLeft: number
  daysTotal: number
}

const SESSION_KEY = 'trial-banner-dismissed'

export default function TrialBanner({ info }: { info: TrialInfo }) {
  const [visible, setVisible] = useState(false)

  const isExpired =
    info.subscriptionStatus !== 'active' && info.subscriptionStatus !== 'trialing'

  useEffect(() => {
    // Expired banner is never dismissible — always show
    if (isExpired) { setVisible(true); return }
    // For trial banner, respect session dismissal
    if (info.subscriptionStatus !== 'trialing') return
    const dismissed = typeof window !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1'
    if (!dismissed) setVisible(true)
  }, [info.subscriptionStatus, isExpired])

  if (!visible) return null

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setVisible(false)
  }

  // ── Expired ────────────────────────────────────────────────────────────────
  if (isExpired) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-900/40 dark:bg-red-900/20">
        <ShieldAlert className="h-5 w-5 shrink-0 text-red-500" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">
            Your Pro trial has ended. You&apos;re on the Free plan.
          </p>
          <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
            Subscribe to restore unlimited access to recipes, AI imports, and price tracking.
          </p>
        </div>
        <Link
          href="/settings/billing"
          className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500"
        >
          Subscribe to keep your data
        </Link>
      </div>
    )
  }

  // ── Active trial ───────────────────────────────────────────────────────────
  const isUrgent = info.daysLeft <= 3
  const elapsed = info.daysTotal - info.daysLeft
  const progressPct = Math.min(100, Math.round((elapsed / info.daysTotal) * 100))

  return (
    <div
      className={`relative overflow-hidden rounded-xl border px-5 py-4 ${
        isUrgent
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20'
          : 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 dark:border-emerald-800/40 dark:from-emerald-900/20 dark:to-teal-900/20'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            isUrgent
              ? 'bg-amber-100 dark:bg-amber-900/40'
              : 'bg-emerald-100 dark:bg-emerald-900/40'
          }`}
        >
          {isUrgent
            ? <AlertTriangle className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
            : <Zap className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />}
        </div>

        {/* Text + progress */}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${
            isUrgent
              ? 'text-amber-900 dark:text-amber-200'
              : 'text-emerald-900 dark:text-emerald-100'
          }`}>
            {isUrgent
              ? `⚠ Only ${info.daysLeft} day${info.daysLeft !== 1 ? 's' : ''} left on your Pro trial`
              : `🚀 You're on your ${info.daysTotal}-day Pro trial`}
          </p>
          <p className={`mt-0.5 text-xs ${
            isUrgent ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-300'
          }`}>
            {isUrgent
              ? 'Subscribe now to keep unlimited recipes, AI invoice imports, and price tracking.'
              : `${info.daysLeft} day${info.daysLeft !== 1 ? 's' : ''} left — unlock unlimited recipes, AI invoice imports, and price tracking.`}
          </p>

          {/* Progress bar */}
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/60 dark:bg-black/20">
            <div
              className={`h-1.5 rounded-full transition-all ${
                isUrgent ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Day {elapsed} of {info.daysTotal}
          </p>
        </div>

        {/* CTAs */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Link
            href="/settings/billing"
            className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors ${
              isUrgent
                ? 'bg-amber-500 hover:bg-amber-400'
                : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {isUrgent ? 'Subscribe to keep your data' : 'Subscribe now — €25/month'}
          </Link>
          <Link
            href="/settings/billing"
            className={`text-[11px] underline-offset-2 hover:underline ${
              isUrgent
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            See what&apos;s included
          </Link>
        </div>

        {/* Dismiss */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-600 dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
