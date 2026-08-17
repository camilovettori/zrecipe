export const PLANS = {
  STARTER: {
    name: 'Starter',
    priceId: process.env.STRIPE_PRICE_STARTER ?? process.env.STRIPE_PRICE_ID_STARTER ?? '',
    amount: 900,
    currency: 'eur',
    interval: 'month' as const,
    trialDays: 14,
  },
  PRO: {
    name: 'Pro',
    priceId:
      process.env.STRIPE_PRICE_PRO ??
      process.env.STRIPE_PRICE_ID_PRO ??
      process.env.STRIPE_PRO_PRICE_ID ??
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID ??
      '',
    amount: 2500,
    currency: 'eur',
    interval: 'month' as const,
    trialDays: 14,
  },
  BUSINESS: {
    name: 'Business',
    priceId: process.env.STRIPE_PRICE_BUSINESS ?? process.env.STRIPE_PRICE_ID_BUSINESS ?? '',
    amount: 4500,
    currency: 'eur',
    interval: 'month' as const,
    trialDays: 14,
  },
} as const

export type PlanTier = 'starter' | 'pro' | 'business'

export function isPlanTier(value: unknown): value is PlanTier {
  return value === 'starter' || value === 'pro' || value === 'business'
}

export function getPlanForTier(tier: PlanTier) {
  return PLANS[tier.toUpperCase() as keyof typeof PLANS]
}

export function getTierFromPriceId(priceId: string | null | undefined): PlanTier {
  if (priceId && priceId === PLANS.BUSINESS.priceId) return 'business'
  if (priceId && priceId === PLANS.PRO.priceId) return 'pro'
  if (priceId && priceId === PLANS.STARTER.priceId) return 'starter'
  return 'starter'
}
