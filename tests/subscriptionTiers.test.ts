import test from 'node:test'
import assert from 'node:assert/strict'
import { getEffectiveTier, hasBrandingRights } from '../src/lib/tenant'
import {
  BUSINESS_LIMITS,
  PRO_LIMITS,
  STARTER_LIMITS,
  getLimitsForTier,
} from '../src/lib/subscription/limits'

test('trialing workspaces receive Pro access regardless of stored tier', () => {
  assert.equal(getEffectiveTier({ subscription_status: 'trialing', plan_tier: 'starter' }), 'pro')
})

test('active workspaces use their stored tier', () => {
  assert.equal(getEffectiveTier({ subscription_status: 'active', plan_tier: 'starter' }), 'starter')
  assert.equal(getEffectiveTier({ subscription_status: 'active', plan_tier: 'pro' }), 'pro')
  assert.equal(getEffectiveTier({ subscription_status: 'active', plan_tier: 'business' }), 'business')
})

test('inactive and delinquent workspaces fall back to Starter limits', () => {
  assert.equal(getEffectiveTier({ subscription_status: 'canceled', plan_tier: 'business' }), 'starter')
  assert.equal(getEffectiveTier({ subscription_status: 'past_due', plan_tier: 'pro' }), 'starter')
})

test('comped workspaces retain backward-compatible Pro access', () => {
  assert.equal(getEffectiveTier({ subscription_status: 'active', plan_tier: 'starter', is_comped: true }), 'pro')
})

test('tier limits match the subscription contract', () => {
  assert.equal(STARTER_LIMITS.maxRecipes, 25)
  assert.equal(STARTER_LIMITS.maxIngredients, 75)
  assert.equal(STARTER_LIMITS.canPrintKitchenCard, true)
  assert.equal(STARTER_LIMITS.canUploadInvoices, false)
  assert.equal(STARTER_LIMITS.canUseAIInsights, false)
  assert.equal(STARTER_LIMITS.canImportSupplierPriceLists, false)

  assert.equal(PRO_LIMITS.maxTeamMembers, 5)
  assert.equal(PRO_LIMITS.canUseReports, true)
  assert.equal(PRO_LIMITS.canUseAIInsights, true)
  assert.equal(PRO_LIMITS.canBulkImportInvoices, false)
  assert.equal(PRO_LIMITS.canImportSupplierPriceLists, true)
  assert.equal(PRO_LIMITS.aiInvoiceExtractsPerMonth, 50)

  assert.equal(BUSINESS_LIMITS.maxTeamMembers, 15)
  assert.equal(BUSINESS_LIMITS.canBulkImportInvoices, true)
  assert.equal(BUSINESS_LIMITS.aiRecipeIdeasPerMonth, Infinity)
  assert.equal(BUSINESS_LIMITS.aiInvoiceExtractsPerMonth, Infinity)

  assert.equal(getLimitsForTier('starter'), STARTER_LIMITS)
  assert.equal(getLimitsForTier('pro'), PRO_LIMITS)
  assert.equal(getLimitsForTier('business'), BUSINESS_LIMITS)
})

test('branding is limited to Pro-level access or comped accounts', () => {
  assert.equal(hasBrandingRights('active', false, 'starter'), false)
  assert.equal(hasBrandingRights('active', false, 'pro'), true)
  assert.equal(hasBrandingRights('active', false, 'business'), true)
  assert.equal(hasBrandingRights('trialing', false, 'starter'), true)
  assert.equal(hasBrandingRights('canceled', true, 'starter'), true)
})
