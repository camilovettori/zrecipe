'use client'

import { useEffect, useState } from 'react'
import { resolveTenantContext } from '@/hooks/useTenant'
import { getEffectiveSubscriptionStatus, getEffectiveTier, TRIAL_PERIOD_DAYS } from '@/lib/tenant'
import { getLimitsForTier, PRO_LIMITS, type SubscriptionLimits } from '@/lib/subscription/limits'
import type { PlanTier } from '@/lib/stripe/plans'

export interface SubscriptionState {
  isPro:              boolean  // Pro-level access (Pro, Business, or Pro trial)
  isBusiness:         boolean
  isTrialing:         boolean  // within trial window
  isCanceled:         boolean
  isPastDue:          boolean
  hasFullAccess:      boolean  // backward-compatible alias for Pro-level access
  hasBrandingRights:  boolean  // Pro/Business/trial or admin-comped
  customLogoUrl:      string | null
  limits:             SubscriptionLimits
  tier:               PlanTier
  daysLeft:           number   // trial days remaining (0 if not trialing)
  trialEndsAt:        Date | null
  loading:            boolean
}

const LOADING_STATE: SubscriptionState = {
  isPro:             false,
  isBusiness:        false,
  isTrialing:        false,
  isCanceled:        false,
  isPastDue:         false,
  hasFullAccess:     true,   // optimistic during load — avoids flashing locked UI
  hasBrandingRights: false,
  customLogoUrl:     null,
  limits:            PRO_LIMITS,
  tier:              'pro',
  daysLeft:          0,
  trialEndsAt:       null,
  loading:           true,
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

        const isTrialing = status === 'trialing'
        const isCanceled = status === 'canceled'
        const isPastDue  = status === 'past_due'
        const tier = getEffectiveTier({
          subscriptionStatus: status,
          planTier: ctx.tenant.planTier,
          isComped: ctx.tenant.isComped,
        })
        const limits = getLimitsForTier(tier)
        const isPro = tier === 'pro' || tier === 'business'
        const isBusiness = tier === 'business'
        const hasFullAccess = isPro

        const trialEndsAt = new Date(
          new Date(ctx.tenant.createdAt).getTime() +
          TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000
        )
        const daysLeft = isTrialing
          ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000))
          : 0

        setState({
          isPro,
          isBusiness,
          isTrialing,
          isCanceled,
          isPastDue,
          hasFullAccess,
          hasBrandingRights: ctx.tenant.isComped === true || limits.canUseBranding,
          customLogoUrl: ctx.tenant.customLogoUrl ?? null,
          limits,
          tier,
          daysLeft,
          trialEndsAt: isTrialing ? trialEndsAt : null,
          loading:     false,
        })
      })
      .catch(() => {
        // On error fail open — don't restrict access
        setState((s) => ({
          ...s,
          isPro: true,
          hasFullAccess: true,
          limits: PRO_LIMITS,
          tier: 'pro',
          loading: false,
        }))
      })
  }, [])

  return state
}
