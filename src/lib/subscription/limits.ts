export interface SubscriptionLimits {
  maxRecipes:            number   // Infinity = unlimited
  canDeleteRecipes:      boolean
  canUploadInvoices:     boolean
  popupIntervalMinutes:  number   // 0 = never show popup
}

export const FREE_LIMITS: SubscriptionLimits = {
  maxRecipes:           5,
  canDeleteRecipes:     false,
  canUploadInvoices:    false,
  popupIntervalMinutes: 15,
}

export const PRO_LIMITS: SubscriptionLimits = {
  maxRecipes:           Infinity,
  canDeleteRecipes:     true,
  canUploadInvoices:    true,
  popupIntervalMinutes: 0,
}
