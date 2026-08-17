import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveSubscriptionStatus, getEffectiveTier } from '@/lib/tenant'
import { getLimitsForTier } from '@/lib/subscription/limits'

export const runtime = 'nodejs'
export const maxDuration = 30

type RecipeSummary = {
  name: string
  totalCost: number
  sellingPrice: number
  margin: number
  foodCostPct: number
}

type InsightRequestBody = {
  recipes: RecipeSummary[]
  ingredientCount: number
  invoiceCount: number
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRequestSupabaseClient(request)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (admin.from('tenant_users') as any)
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tenant } = await (admin.from('tenants') as any)
      .select('subscription_status, plan_tier, is_comped, created_at')
      .eq('id', member.tenant_id)
      .single()

    const status = getEffectiveSubscriptionStatus(
      tenant?.subscription_status,
      tenant?.created_at ?? new Date().toISOString()
    )
    const tier = getEffectiveTier({
      subscription_status: status,
      plan_tier: tenant?.plan_tier,
      is_comped: tenant?.is_comped,
    })

    if (!getLimitsForTier(tier).canUseAIInsights) {
      return NextResponse.json({ error: 'Upgrade to Pro' }, { status: 403 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({})) as InsightRequestBody
    const { recipes = [], ingredientCount = 0, invoiceCount = 0 } = body

    if (!recipes.length) {
      return NextResponse.json({ error: 'No recipe data provided' }, { status: 400 })
    }

    const recipeLines = recipes
      .map(r =>
        `- ${r.name}: cost €${r.totalCost.toFixed(2)}, price €${r.sellingPrice.toFixed(2)}, margin ${r.margin.toFixed(1)}%, food cost ${r.foodCostPct.toFixed(1)}%`
      )
      .join('\n')

    const userMessage = `Business data:
- ${recipes.length} recipes, ${ingredientCount} ingredients, ${invoiceCount} invoices

Recipes:
${recipeLines}`

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system:
        'You are a food business cost analyst. Analyse the recipe data and provide 3-5 short actionable insights. Each insight has: type (positive/warning/tip), title (max 10 words), description (max 30 words). Respond in JSON only: [{"type":"...","title":"...","description":"..."}]',
      messages: [{ role: 'user', content: userMessage }],
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      return NextResponse.json({ error: 'No text response from AI' }, { status: 500 })
    }

    const cleaned = content.text
      .replace(/^```(?:json)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim()

    const insights = JSON.parse(cleaned)
    return NextResponse.json({ insights })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to generate insights'
    console.error('[reports/insights]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
