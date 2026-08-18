import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import Papa from 'papaparse'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getEffectiveSubscriptionStatus, getEffectiveTier, getTenantContext } from '@/lib/tenant'
import { getLimitsForTier } from '@/lib/subscription/limits'

export const runtime = 'nodejs'
export const maxDuration = 60

function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured')
  return new Anthropic({ apiKey: key })
}

function cleanJson(text: string) {
  return text
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim()
}

function parseNumber(value: unknown) {
  // Number('') is 0, not NaN — without this guard a genuinely blank CSV
  // cell would silently become a real €0 price/quantity instead of null.
  if (value === '' || value == null) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

// CSV columns come from PapaParse as '' for blank cells, never undefined —
// so a `??` chain across fallback columns can't skip a column that's
// present-but-blank in a given row. This treats blank/whitespace as absent.
function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) return value.trim()
  }
  return null
}

async function extractRowsFromText(text: string) {
  const anthropic = getAnthropic()
  const prompt = `You extract supplier price list rows for a food business.

Return ONLY valid JSON with this exact shape:
{
  "supplier_name": "string or null",
  "items": [
    {
      "ingredient_name": "string",
      "brand": "string or null",
      "category": "string or null",
      "supplier": "string or null",
      "package_price": number or null,
      "package_quantity": number or null,
      "package_unit": "kg|g|L|ml|unit|dozen or null",
      "price_unit": "kg|g|L|ml|unit|dozen or null",
      "needs_review": boolean,
      "notes": "string or null"
    }
  ]
}

Rules:
- Extract one row per product line.
- If the line is unclear, keep the row but mark needs_review true.
- Use the most likely category, but keep it null if unsure.
- package_price is the supplier/package price for one package.
- package_quantity and package_unit are the package size.
- price_unit is the normalized unit the business should use.
- Do not invent values.
- If supplier is mentioned on the page, include it.

Input:
${text}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Claude returned no text content')
  }

  const parsed = JSON.parse(cleanJson(content.text)) as {
    supplier_name?: string | null
    items?: Array<{
      ingredient_name?: string
      brand?: string | null
      category?: string | null
      supplier?: string | null
      package_price?: number | null
      package_quantity?: number | null
      package_unit?: string | null
      price_unit?: string | null
      needs_review?: boolean
      notes?: string | null
    }>
  }

  return {
    supplier_name: parsed.supplier_name ?? null,
    items: (parsed.items ?? []).map((item) => ({
      ingredient_name: item.ingredient_name ?? '',
      brand: item.brand ?? null,
      category: item.category ?? null,
      supplier: item.supplier ?? null,
      package_price: parseNumber(item.package_price),
      package_quantity: parseNumber(item.package_quantity),
      package_unit: item.package_unit ?? null,
      price_unit: item.price_unit ?? null,
      needs_review: Boolean(item.needs_review),
      notes: item.notes ?? null,
    })),
  }
}

async function extractRowsFromImage(imageBase64: string, mimeType: string) {
  const anthropic = getAnthropic()
  const mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' =
    mimeType === 'image/png' || mimeType === 'image/gif' || mimeType === 'image/webp'
      ? mimeType
      : 'image/jpeg'
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract supplier price list rows from this image. Return ONLY valid JSON in the same shape as the text extractor.',
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Claude returned no text content')
  }

  const parsed = JSON.parse(cleanJson(content.text)) as {
    supplier_name?: string | null
    items?: Array<{
      ingredient_name?: string
      brand?: string | null
      category?: string | null
      supplier?: string | null
      package_price?: number | null
      package_quantity?: number | null
      package_unit?: string | null
      price_unit?: string | null
      needs_review?: boolean
      notes?: string | null
    }>
  }

  return {
    supplier_name: parsed.supplier_name ?? null,
    items: (parsed.items ?? []).map((item) => ({
      ingredient_name: item.ingredient_name ?? '',
      brand: item.brand ?? null,
      category: item.category ?? null,
      supplier: item.supplier ?? null,
      package_price: parseNumber(item.package_price),
      package_quantity: parseNumber(item.package_quantity),
      package_unit: item.package_unit ?? null,
      price_unit: item.price_unit ?? null,
      needs_review: Boolean(item.needs_review),
      notes: item.notes ?? null,
    })),
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRequestSupabaseClient(request)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const context = await getTenantContext(supabase, user.id)
    if (!context) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const status = getEffectiveSubscriptionStatus(
      context.tenant.subscriptionStatus,
      context.tenant.createdAt
    )
    const tier = getEffectiveTier({
      subscriptionStatus: status,
      planTier: context.tenant.planTier,
      isComped: context.tenant.isComped,
    })
    if (!getLimitsForTier(tier).canImportSupplierPriceLists) {
      return NextResponse.json(
        { error: 'Supplier price-list import is a Pro feature.' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const kind = typeof body?.kind === 'string' ? body.kind : ''

    if (kind === 'csv') {
      const csv = typeof body?.csv === 'string' ? body.csv : ''
      if (!csv.trim()) {
        return NextResponse.json({ error: 'Missing CSV content' }, { status: 400 })
      }

      const parsed = Papa.parse<Record<string, string>>(csv, {
        header: true,
        skipEmptyLines: true,
      })

      const rows = (parsed.data ?? []).filter((row) => Object.keys(row).length > 0)

      const items = rows.map((row) => {
        const ingredientName = firstNonEmpty(
          row['Ingredient'],
          row['Ingredient Name'],
          row['Name'],
          row['Item'],
          row['Label Name'],
          row['Supplier Product Description'],
          row['Description']
        ) ?? ''
        const packagePrice = parseNumber(
          firstNonEmpty(row['Package Price'], row['Price'], row['Cost'], row['Supplier Price'])
        )
        const packageQuantity = parseNumber(
          firstNonEmpty(row['Package Quantity'], row['Quantity'], row['Purchase Weight'], row['Pack Size'], row['Size'])
        )
        return {
          ingredient_name: ingredientName,
          brand: row['Brand'] ?? null,
          category: row['Category'] ?? null,
          supplier: row['Supplier'] ?? null,
          package_price: packagePrice,
          package_quantity: packageQuantity,
          package_unit: firstNonEmpty(row['Package Unit'], row['Measure Unit'], row['Unit']),
          price_unit: firstNonEmpty(row['Price Unit'], row['Normalized Unit']),
          needs_review: !ingredientName || packagePrice == null,
          notes: row['Product Code'] ? `Code: ${row['Product Code']}` : null,
        }
      })

      return NextResponse.json({
        supplier_name: null, // CSV files don't have a supplier name — let the user set it in the UI
        items,
      })
    }

    if (kind === 'image') {
      const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : ''
      const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/jpeg'
      if (!imageBase64) {
        return NextResponse.json({ error: 'Missing image content' }, { status: 400 })
      }

      const result = await extractRowsFromImage(imageBase64, mimeType)
      return NextResponse.json(result)
    }

    const text = typeof body?.text === 'string' ? body.text : ''
    if (!text.trim()) {
      return NextResponse.json({ error: 'Missing text content' }, { status: 400 })
    }

    const result = await extractRowsFromText(text)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[ingredient supplier-import] unhandled:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to import supplier list' },
      { status: 500 }
    )
  }
}
