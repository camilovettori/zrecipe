import type { PlanTier } from '@/lib/stripe/plans'

export interface SubscriptionLimits {
  maxRecipes: number
  maxIngredients: number
  maxTeamMembers: number
  canDeleteRecipes: boolean
  canUploadInvoices: boolean
  canUseYieldFactor: boolean
  canUseBatchMultiplier: boolean
  canPrintLabels: boolean
  canPrintKitchenCard: boolean
  canUseBranding: boolean
  canUseReports: boolean
  canUseAIInsights: boolean
  canUsePriceSimulator: boolean
  canSubstituteAcrossRecipes: boolean
  canBulkImportInvoices: boolean
  canImportSupplierPriceLists: boolean
  canUseSupplierCodes: boolean
  aiRecipeIdeasPerMonth: number
  aiInvoiceExtractsPerMonth: number
  popupIntervalMinutes: number
}

export const STARTER_LIMITS: SubscriptionLimits = {
  maxRecipes: 25,
  maxIngredients: 75,
  maxTeamMembers: 1,
  canDeleteRecipes: true,
  canUploadInvoices: false,
  canUseYieldFactor: false,
  canUseBatchMultiplier: false,
  canPrintLabels: false,
  canPrintKitchenCard: true,
  canUseBranding: false,
  canUseReports: false,
  canUseAIInsights: false,
  canUsePriceSimulator: false,
  canSubstituteAcrossRecipes: false,
  canBulkImportInvoices: false,
  canImportSupplierPriceLists: false,
  canUseSupplierCodes: false,
  aiRecipeIdeasPerMonth: 5,
  aiInvoiceExtractsPerMonth: 0,
  popupIntervalMinutes: 10,
}

export const PRO_LIMITS: SubscriptionLimits = {
  maxRecipes: Infinity,
  maxIngredients: Infinity,
  maxTeamMembers: 5,
  canDeleteRecipes: true,
  canUploadInvoices: true,
  canUseYieldFactor: true,
  canUseBatchMultiplier: true,
  canPrintLabels: true,
  canPrintKitchenCard: true,
  canUseBranding: true,
  canUseReports: true,
  canUseAIInsights: true,
  canUsePriceSimulator: true,
  canSubstituteAcrossRecipes: true,
  canBulkImportInvoices: false,
  canImportSupplierPriceLists: true,
  canUseSupplierCodes: true,
  aiRecipeIdeasPerMonth: 50,
  aiInvoiceExtractsPerMonth: 50,
  popupIntervalMinutes: Infinity,
}

export const BUSINESS_LIMITS: SubscriptionLimits = {
  ...PRO_LIMITS,
  maxTeamMembers: 15,
  canBulkImportInvoices: true,
  aiRecipeIdeasPerMonth: Infinity,
  aiInvoiceExtractsPerMonth: Infinity,
  popupIntervalMinutes: Infinity,
}

export function getLimitsForTier(tier: PlanTier): SubscriptionLimits {
  switch (tier) {
    case 'business':
      return BUSINESS_LIMITS
    case 'pro':
      return PRO_LIMITS
    case 'starter':
    default:
      return STARTER_LIMITS
  }
}
