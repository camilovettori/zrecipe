export interface SubscriptionLimits {
  maxRecipes:                number   // Infinity = unlimited
  canDeleteRecipes:          boolean
  canUploadInvoices:         boolean
  aiRecipeIdeasPerMonth:     number   // Infinity = unlimited
  aiInvoiceExtractsPerMonth: number   // Infinity = unlimited
  popupIntervalMinutes:      number   // 0 = never show popup
}

export const FREE_LIMITS: SubscriptionLimits = {
  maxRecipes:                5,
  canDeleteRecipes:          false,
  canUploadInvoices:         false,
  aiRecipeIdeasPerMonth:     5,
  aiInvoiceExtractsPerMonth: 5,
  popupIntervalMinutes:      15,
}

export const PRO_LIMITS: SubscriptionLimits = {
  maxRecipes:                Infinity,
  canDeleteRecipes:          true,
  canUploadInvoices:         true,
  aiRecipeIdeasPerMonth:     50,
  aiInvoiceExtractsPerMonth: Infinity,
  popupIntervalMinutes:      0,
}
