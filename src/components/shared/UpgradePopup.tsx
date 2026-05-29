'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Zap } from 'lucide-react'
import { useSubscription } from '@/hooks/useSubscription'

const LS_POPUP_KEY    = 'zrecipe-upgrade-popup-ts'
const LS_BANNER_KEY   = 'zrecipe-upgrade-banner-dismissed'
const POPUP_INTERVAL  = 15 * 60 * 1000 // 15 minutes in ms

const FEATURES = [
  'Unlimited recipes',
  'Invoice import (PDF, CSV) with AI',
  'Full recipe management (create, edit, delete)',
  '50 AI recipe ideas / month',
  'Unlimited AI invoice extractions',
  'PDF export with costs',
]

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  )
}

async function startCheckout(setLoading: (v: boolean) => void) {
  setLoading(true)
  try {
    const res  = await fetch('/api/billing/checkout', { method: 'POST' })
    const data = await res.json() as { url?: string }
    if (data.url) window.location.href = data.url
  } finally {
    setLoading(false)
  }
}

// ── Upgrade banner (dismissible, shown at page top) ───────────────────────────

export function UpgradeBanner() {
  const { hasFullAccess, isTrialing, daysLeft, loading } = useSubscription()
  const [dismissed, setDismissed] = useState(true) // start hidden to avoid flash
  const [checkingOut, setCheckingOut] = useState(false)

  useEffect(() => {
    if (!loading && !hasFullAccess) {
      const wasDismissed = sessionStorage.getItem(LS_BANNER_KEY) === '1'
      setDismissed(wasDismissed)
    }
  }, [loading, hasFullAccess])

  if (loading || hasFullAccess || dismissed) return null

  const label = isTrialing
    ? `Your trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`
    : "You're on the free plan. Upgrade to Pro for unlimited access."

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-emerald-600 px-4 py-2.5 text-white">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Zap className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => startCheckout(setCheckingOut)}
          disabled={checkingOut}
          className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
        >
          {checkingOut ? 'Redirecting…' : 'Upgrade Now'}
        </button>
        <button
          onClick={() => {
            sessionStorage.setItem(LS_BANNER_KEY, '1')
            setDismissed(true)
          }}
          aria-label="Dismiss"
          className="text-emerald-100 transition hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Upgrade popup (modal, every 15 min) ───────────────────────────────────────

export default function UpgradePopup() {
  const { hasFullAccess, loading } = useSubscription()
  const [open, setOpen]           = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)

  useEffect(() => {
    if (loading || hasFullAccess) return

    const lastShown = Number(localStorage.getItem(LS_POPUP_KEY) ?? '0')
    if (Date.now() - lastShown > POPUP_INTERVAL) {
      // Small delay so the page finishes rendering first
      const t = setTimeout(() => {
        setOpen(true)
        localStorage.setItem(LS_POPUP_KEY, String(Date.now()))
      }, 800)
      return () => clearTimeout(t)
    }
  }, [loading, hasFullAccess])

  const dismiss = () => setOpen(false)

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={dismiss}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 24 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-800"
          >
            {/* Close */}
            <button
              onClick={dismiss}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header */}
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-200">
                <span className="font-display text-2xl font-bold text-white">Z</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-700">
                ZRecipe Pro
              </div>
              <h2 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
                Unlock the full power of ZRecipe
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Your free trial has ended. Upgrade to keep using all features.
              </p>
            </div>

            {/* Features */}
            <ul className="mt-6 space-y-2.5">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>

            {/* Price + CTA */}
            <div className="mt-8">
              <p className="mb-4 text-center text-sm text-slate-500 dark:text-slate-400">
                <span className="text-3xl font-bold text-slate-900 dark:text-white">€25</span>
                {' '}/month
              </p>
              <button
                onClick={() => startCheckout(setCheckingOut)}
                disabled={checkingOut}
                className="w-full rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {checkingOut ? 'Redirecting…' : 'Start Pro Subscription'}
              </button>
              <button
                onClick={dismiss}
                className="mt-3 w-full text-center text-xs text-slate-400 transition hover:text-slate-600"
              >
                Maybe later
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
