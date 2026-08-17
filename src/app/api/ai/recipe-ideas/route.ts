import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getEffectiveSubscriptionStatus, getEffectiveTier } from '@/lib/tenant'
import { getLimitsForTier } from '@/lib/subscription/limits'
import { logAIUsage } from '@/lib/ai/usage-logger'

export const runtime = 'nodejs'
export const maxDuration = 60

function buildPrompt(
  businessType: string,
  ingredients: Array<{ name: string }>,
  urgentIngredients: string[],
  style: string,
  count: number
): string {
  const ingredientList = ingredients.map((i) => i.name).join(', ')

  const urgentNote = urgentIngredients.length
    ? ` Prioritise these urgent ingredients: ${urgentIngredients.join(', ')}.`
    : ''

  const styleNote = style ? ` Style: ${style}.` : ''

  return `You are a chef consultant for a ${businessType}. Available ingredients: ${ingredientList}.${urgentNote}${styleNote}

Suggest exactly ${count} sellable recipes. Return ONLY a JSON array, no markdown:
[{"name":"","description":"","difficulty":"easy","prep_time_minutes":0,"cook_time_minutes":0,"yield_quantity":1,"yield_unit":"portions","category":"other","ingredients":[{"name":"","quantity":0,"unit":"g","available":true}],"instructions":[""],"tips":"","suggested_selling_price":0}]

Rules: difficulty=easy|medium|hard, category=bakery|dessert|breakfast|lunch|dinner|beverage|sauce|other, yield_unit=portions|units|kg|litres, ingredient unit=g|kg|ml|L|unit. Mark available=true if in the ingredient list above, false if not. Vary categories. Prices realistic for Ireland/EU in EUR. 3-5 instructions per recipe.`
}

type RecipeIdeasBody = {
  ingredient_ids?: unknown
  urgent_ingredients?: unknown
  business_type?: unknown
  style?: unknown
  count?: unknown
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRequestSupabaseClient(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = (await request.json().catch(() => ({}))) as RecipeIdeasBody

    const ingredient_ids = Array.isArray(rawBody.ingredient_ids)
      ? rawBody.ingredient_ids.filter((id): id is string => typeof id === 'string' && !!id.trim())
      : []

    const urgent_ingredients = Array.isArray(rawBody.urgent_ingredients)
      ? rawBody.urgent_ingredients.filter(
          (ingredient): ingredient is string =>
            typeof ingredient === 'string' && !!ingredient.trim()
        )
      : []

    const business_type =
      typeof rawBody.business_type === 'string' && rawBody.business_type.trim()
        ? rawBody.business_type.trim()
        : 'restaurant'

    const style =
      typeof rawBody.style === 'string' ? rawBody.style.trim() : ''

    const count =
      typeof rawBody.count === 'number' && Number.isFinite(rawBody.count) ? rawBody.count : 5

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

    const tenantId = member.tenant_id as string

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ingredientQuery = (admin.from('ingredients') as any)
      .select('id, name, current_price, price_unit, category')
      .eq('tenant_id', member.tenant_id)
      .order('name')

    if (ingredient_ids.length) {
      ingredientQuery = ingredientQuery.in('id', ingredient_ids)
    }

    const { data: ingredientsData, error: ingQueryError } = await ingredientQuery
    if (ingQueryError) {
      console.error('[AI-IDEAS] Ingredient query error:', ingQueryError.message)
      return NextResponse.json({ error: `Database error: ${ingQueryError.message}` }, { status: 500 })
    }
    const ingredients = ingredientsData ?? []

    if (!ingredients.length) {
      return NextResponse.json(
        { error: 'No ingredients found. Add some ingredients first.' },
        { status: 400 }
      )
    }

    // ── Subscription + AI usage limit check ───────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tenantInfo } = await (admin.from('tenants') as any)
      .select('subscription_status, plan_tier, is_comped, created_at')
      .eq('id', tenantId)
      .single()

    const subStatus = getEffectiveSubscriptionStatus(
      tenantInfo?.subscription_status,
      tenantInfo?.created_at ?? new Date().toISOString()
    )
    const tier = getEffectiveTier({
      subscription_status: subStatus,
      plan_tier: tenantInfo?.plan_tier,
      is_comped: tenantInfo?.is_comped,
    })
    const monthlyLimit = getLimitsForTier(tier).aiRecipeIdeasPerMonth

    if (monthlyLimit !== Infinity) {
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: usedCount } = await (admin.from('ai_usage') as any)
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('feature', 'recipe_ideas')
        .gte('used_at', startOfMonth)

      const used = usedCount ?? 0
      if (used >= monthlyLimit) {
        return NextResponse.json({
          error: 'limit_reached',
          message: `You've used ${used}/${monthlyLimit} AI recipe ideas this month. Upgrade to ${tier === 'starter' ? 'Pro' : 'Business'} for more.`,
          usage: { used, limit: monthlyLimit },
        }, { status: 429 })
      }
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const prompt = buildPrompt(business_type, ingredients, urgent_ingredients, style, count)

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })

    // Record rate-limit usage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from('ai_usage') as any).insert({ tenant_id: tenantId, feature: 'recipe_ideas' })
    // Log detailed token usage for analytics
    await logAIUsage({
      tenantId,
      userId: user.id,
      feature: 'recipe_ideas',
      inputTokens:  aiResponse.usage.input_tokens,
      outputTokens: aiResponse.usage.output_tokens,
      model: 'claude-sonnet-4-6',
    })

    const content = aiResponse.content[0]
    if (!content || content.type !== 'text') {
      return NextResponse.json({ error: 'No text response from AI' }, { status: 500 })
    }

    const cleaned = content.text
      .replace(/^```(?:json)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim()

    const recipes = JSON.parse(cleaned)

    return NextResponse.json({ recipes, ingredients })
  } catch (error: unknown) {
    console.error('[AI-IDEAS] FULL ERROR:', error)
    const message = error instanceof Error ? error.message : 'Failed to generate ideas'
    console.error('[AI-IDEAS] Error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
