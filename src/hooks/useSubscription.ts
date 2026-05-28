'use client'

import { useEffect, useState } from 'react'
import { resolveTenantContext } from '@/hooks/useTenant'
import { getEffectiveSubscriptionStatus, TRIAL_PERIOD_DAYS } from '@/lib/tenant'
import { FREE_LIMITS, PRO_LIMITS, type SubscriptionLimits } from '@/lib/subscription/limits'

export interface SubscriptionState {
  isPro:          boolean  // active subscription
  isTrialing:     boolean  // within trial window
  isCanceled:     boolean
  isPastDue:      boolean
  hasFullAccess:  boolean  // isPro || isTrialing
  limits:         SubscriptionLimits
  daysLeft:       number   // trial days remaining (0 if not trialing)
  trialEndsAt:    Date | null
  loading:        boolean
}

const LOADING_STATE: SubscriptionState = {
  isPro:         false,
  isTrialing:    false,
  isCanceled:    false,
  isPastDue:     false,
  hasFullAccess: true,   // optimistic during load — avoids flashing locked UI
  limits:        PRO_LIMITS,
  daysLeft:      0,
  trialEndsAt:   null,
  loading:       true,
}

export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(LOADING_STATE)

  useEffect(() => {
    resolveTenantContext()
      .then((ctx) => {
        const status = getEffectiveSubscriptionStatus(
          ctx.tenant.subscriptionStatus,
          ctx.tenant.createdAt
        )

        const isPro      = status === 'active'
        const isTrialing = status === 'trialing'
        const isCanceled = status === 'canceled'
        const isPastDue  = status === 'past_due'
        const hasFullAccess = isPro || isTrialing

        const trialEndsAt = new Date(
          new Date(ctx.tenant.createdAt).getTime() +
          TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000
        )
        const daysLeft = isTrialing
          ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000))
          : 0

        setState({
          isPro,
          isTrialing,
          isCanceled,
          isPastDue,
          hasFullAccess,
          limits:      hasFullAccess ? PRO_LIMITS : FREE_LIMITS,
          daysLeft,
          trialEndsAt: isTrialing ? trialEndsAt : null,
          loading:     false,
        })
      })
      .catch(() => {
        // On error fail open — don't restrict access
        setState((s) => ({ ...s, hasFullAccess: true, limits: PRO_LIMITS, loading: false }))
      })
  }, [])

  return state
}
