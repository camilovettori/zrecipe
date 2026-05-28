export const ZRECIPE_PRO = {
  priceId: process.env.STRIPE_PRO_PRICE_ID ?? '',
  amount: 2500,
  currency: 'eur' as const,
  interval: 'month' as const,
  trialDays: 14,
}
