import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import Papa from 'papaparse'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getEffectiveSubscriptionStatus, getEffectiveTier } from '@/lib/tenant'
import { getLimitsForTier } from '@/lib/subscription/limits'
import { logAIUsage } from '@/lib/ai/usage-logger'

export const runtime = 'nodejs'
export const maxDuration = 60

function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured')
  return new Anthropic({ apiKey: key })
}

const schema = z.object({
  kind: z.enum(['pdf', 'image', 'csv']),
  fileName: z.string().min(1),
  text: z.string().optional(),
  imageBase64: z.string().optional(),
  mimeType: z.string().optional(),
  csv: z.string().optional(),
})

type ClaudeUsage = { inputTokens: number; outputTokens: number }

type ExtractedRecipe = {
  usage: ClaudeUsage
  recipe_name: string
  prep_time_minutes: number | null
  cook_time_minutes: number | null
  yield_quantity: number | null
  yield_unit: string | null
  ingredients: Array<{ name: string; quantity: number | null; unit: string | null }>
}

const SYSTEM_PROMPT =
  'You are a professional recipe transcription assistant. Extract ONLY the following fields from the provided recipe source, and respond as strict JSON matching the schema. Do not invent data. If a field is not present in the source, return null (or an empty array for ingredients). You can read Portuguese, English, and multilingual recipe notes.'

const TEXT_INSTRUCTION = `Extract from this recipe:
- recipe_name (string)
- prep_time_minutes (number | null)
- cook_time_minutes (number | null)
- yield_quantity (number | null) — e.g. 12 for '12 cookies'
- yield_unit (string | null) — e.g. 'cookies', 'portions', 'cake'
- ingredients: array of {
    name: string,
    quantity: number | null,
    unit: string | null
  }

Do NOT extract brand names. Ingredient identity is name only. If a brand name appears in
the source (e.g. 'Kerrygold butter'), extract only the ingredient name ('butter').
Normalize common unit abbreviations: grams→g, kilogram→kg, millilitre→ml, litre→L, tablespoon→tbsp, teaspoon→tsp.
DO NOT extract prices, costs, or supplier info. This is a RECIPE, not an invoice. Only ingredients and their quantities.
Handwritten source is welcome — do your best to read messy handwriting. If truly illegible, return name as your best guess with a trailing '?' character so the user knows to review.

Return ONLY valid JSON in this exact shape:
{
  "recipe_name": "string",
  "prep_time_minutes": null,
  "cook_time_minutes": null,
  "yield_quantity": null,
  "yield_unit": null,
  "ingredients": [
    { "name": "string", "quantity": 1, "unit": "g" }
  ]
}`

function cleanJson(raw: string) {
  return raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
}

function normalizeUnit(unit: string | null | undefined) {
  if (!unit) return null
  const lower = unit.trim().toLowerCase()
  if (['gram', 'grams', 'gr', 'g.'].includes(lower)) return 'g'
  if (['kilogram', 'kilograms', 'kgs'].includes(lower)) return 'kg'
  if (['milliliter', 'milliliters', 'millilitre', 'millilitres'].includes(lower)) return 'ml'
  if (['liter', 'liters', 'litre', 'litres', 'l'].includes(lower)) return 'L'
  if (['tablespoon', 'tablespoons', 'tbsp.'].includes(lower)) return 'tbsp'
  if (['teaspoon', 'teaspoons', 'tsp.'].includes(lower)) return 'tsp'
  if (['units', 'each', 'ea'].includes(lower)) return 'unit'
  return unit.trim()
}

function parseRecipe(rawText: string, usage: ClaudeUsage): ExtractedRecipe {
  const parsed = JSON.parse(cleanJson(rawText)) as {
    recipe_name?: string | null
    prep_time_minutes?: number | null
    cook_time_minutes?: number | null
    yield_quantity?: number | null
    yield_unit?: string | null
    ingredients?: Array<{ name?: string | null; quantity?: number | null; unit?: string | null }>
  }

  return {
    usage,
    recipe_name: parsed.recipe_name ?? '',
    prep_time_minutes: parsed.prep_time_minutes ?? null,
    cook_time_minutes: parsed.cook_time_minutes ?? null,
    yield_quantity: parsed.yield_quantity ?? null,
    yield_unit: parsed.yield_unit ?? null,
    ingredients: (parsed.ingredients ?? [])
      .map((item) => ({
        name: String(item.name ?? '').trim(),
        quantity: item.quantity == null ? null : Number(item.quantity),
        unit: normalizeUnit(item.unit),
      }))
      .filter((item) => item.name.length > 0),
  }
}

async function extractRecipeFromText(text: string) {
  const anthropic = getAnthropic()
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `${TEXT_INSTRUCTION}\n\nRecipe source:\n${text}` }],
  })

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Claude returned no text content')
  return parseRecipe(content.text, usage)
}

async function extractRecipeFromImage(imageBase64: string, mimeType: string) {
  const anthropic = getAnthropic()
  const allowedMediaTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
  const mediaType = (allowedMediaTypes as readonly string[]).includes(mimeType)
    ? (mimeType as (typeof allowedMediaTypes)[number])
    : 'image/jpeg'

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: TEXT_INSTRUCTION },
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        ],
      },
    ],
  })

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Claude returned no text content')
  return parseRecipe(content.text, usage)
}

function csvToText(csv: string) {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
  const headers = parsed.meta.fields ?? []
  const rows = (parsed.data ?? []).filter((row) => Object.keys(row).length > 0)
  if (headers.length === 0) return csv
  return [
    `Headers: ${headers.join(', ')}`,
    ...rows.map((row, index) => `Row ${index + 1}: ${headers.map((h) => `${h}: ${row[h] ?? ''}`).join(' | ')}`),
  ].join('\n')
}

function emptyRecipe(error?: string, extra?: Record<string, unknown>) {
  return {
    ...(error ? { error } : {}),
    ...extra,
    recipe_name: '',
    prep_time_minutes: null,
    cook_time_minutes: null,
    yield_quantity: null,
    yield_unit: null,
    ingredients: [],
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json().catch(() => ({})))

    let runExtraction: () => Promise<ExtractedRecipe>
    if (body.kind === 'image') {
      if (!body.imageBase64?.trim()) return NextResponse.json({ error: 'Missing image content' }, { status: 400 })
      runExtraction = () => extractRecipeFromImage(body.imageBase64!, body.mimeType ?? 'image/jpeg')
    } else if (body.kind === 'csv') {
      if (!body.csv?.trim()) return NextResponse.json({ error: 'Missing CSV content' }, { status: 400 })
      runExtraction = () => extractRecipeFromText(csvToText(body.csv!))
    } else {
      if (!body.text?.trim()) return NextResponse.json({ error: 'Missing text content' }, { status: 400 })
      runExtraction = () => extractRecipeFromText(body.text!)
    }

    const supabase = createRequestSupabaseClient(request)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (admin.from('tenant_users') as any)
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    const tenantId = member?.tenant_id as string | undefined

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    if (tenantId) {
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
      const limits = getLimitsForTier(tier)
      if (!limits.canUploadInvoices) {
        return NextResponse.json(emptyRecipe('AI recipe import is a Pro feature.', { limitReached: true }), { status: 403 })
      }

      const monthlyLimit = limits.aiInvoiceExtractsPerMonth
      if (monthlyLimit !== Infinity) {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count: usedCount } = await (admin.from('ai_usage') as any)
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('feature', ['invoice_extract', 'recipe_extract'])
          .gte('used_at', startOfMonth)
        if ((usedCount ?? 0) >= monthlyLimit) {
          return NextResponse.json(
            emptyRecipe('AI import limit reached. Upgrade to Business for unlimited AI imports.', { limitReached: true }),
            { status: 429 }
          )
        }
      }

      const result = await runExtraction()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from('ai_usage') as any).insert({ tenant_id: tenantId, feature: 'recipe_extract' })
      await logAIUsage({
        tenantId,
        userId: user.id,
        feature: 'recipe_extract',
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        model: 'claude-sonnet-4-6',
        metadata: { fileName: body.fileName, kind: body.kind },
      })
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { usage: _usage, ...responseData } = result
      return NextResponse.json(responseData)
    }

    const result = await runExtraction()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { usage: _usage, ...responseData } = result
    return NextResponse.json(responseData)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to extract recipe data'
    console.error('[recipes/extract] error:', message)
    return NextResponse.json(emptyRecipe(message), { status: 500 })
  }
}
