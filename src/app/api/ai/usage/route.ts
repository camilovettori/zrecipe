import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getEffectiveSubscriptionStatus, getEffectiveTier } from '@/lib/tenant'
import { getLimitsForTier } from '@/lib/subscription/limits'

export const runtime = 'nodejs'

type TenantUserRow = {
  tenant_id: string
}

type TenantInfoRow = {
  subscription_status: string | null
  plan_tier: string | null
  is_comped: boolean | null
  created_at: string | null
}

type AiUsageCountRow = {
  count: number | null
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createRequestSupabaseClient(request)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: member } = (await admin
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()) as { data: TenantUserRow | null }

    if (!member) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const tenantId = member.tenant_id as string

    const { data: tenantInfo } = (await admin
      .from('tenants')
      .select('subscription_status, plan_tier, is_comped, created_at')
      .eq('id', tenantId)
      .single()) as { data: TenantInfoRow | null }

    const subStatus = getEffectiveSubscriptionStatus(
      tenantInfo?.subscription_status,
      tenantInfo?.created_at ?? new Date().toISOString()
    )
    const tier = getEffectiveTier({
      subscription_status: subStatus,
      plan_tier: tenantInfo?.plan_tier,
      is_comped: tenantInfo?.is_comped,
    })
    const isPro = tier === 'pro' || tier === 'business'
    const limits = getLimitsForTier(tier)

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

    const [{ count: ideasCount }, { count: extractsCount }] = (await Promise.all([
      admin
        .from('ai_usage')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('feature', 'recipe_ideas')
        .gte('used_at', startOfMonth),
      admin
        .from('ai_usage')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('feature', ['invoice_extract', 'recipe_extract'])
        .gte('used_at', startOfMonth),
    ])) as AiUsageCountRow[]

    // Infinity doesn't serialise over JSON — send null for unlimited
    return NextResponse.json({
      recipe_ideas: {
        used: ideasCount ?? 0,
        limit: limits.aiRecipeIdeasPerMonth === Infinity ? null : limits.aiRecipeIdeasPerMonth,
        isPro,
      },
      invoice_extracts: {
        used: extractsCount ?? 0,
        limit: limits.aiInvoiceExtractsPerMonth === Infinity ? null : limits.aiInvoiceExtractsPerMonth,
        isPro,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch usage'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
