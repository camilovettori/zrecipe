import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import Papa from 'papaparse'
import { autoDetectCsvColumns } from '@/lib/invoices'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getEffectiveSubscriptionStatus } from '@/lib/tenant'
import { FREE_LIMITS, PRO_LIMITS } from '@/lib/subscription/limits'
import { logAIUsage } from '@/lib/ai/usage-logger'

export const runtime = 'nodejs'
export const maxDuration = 60

// ── Shared Anthropic client ────────────────────────────────────────────────

function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured')
  return new Anthropic({ apiKey: key })
}

// ── Date normalisation ──────────────────────────────────────────────────────

function normaliseDateForInput(date: string | null | undefined): string {
  if (!date) return new Date().toISOString().slice(0, 10)
  const ddmmyyyy = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parsed = new Date(date)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

// ── Claude extraction ──────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are an invoice data extraction system for food service businesses (bakeries, restaurants, cafés). Extract structured data from this invoice text.

Return ONLY valid JSON, no markdown, no backticks, no explanation. The JSON must follow this exact structure:

{
  "supplier_name": "string - the company ISSUING the invoice, not the buyer",
  "invoice_number": "string",
  "invoice_date": "DD/MM/YYYY",
  "vat_rate": number or null,
  "vat_amount": number or null,
  "subtotal": number or null,
  "total": number,
  "items": [
    {
      "description": "string",
      "quantity": number,
      "unit": "string",
      "package_size": number or null,
      "package_unit": "string or null",
      "unit_price": number,
      "total": number
    }
  ]
}

FIELD RULES:

description:
- Clean product name in Title Case
- Remove supplier brand prefixes (e.g., "COSUN", "CALLEBA", "KTC", "MC DOUGALLS", "NEWFORGE", "LAKELAND", "GEM")
- Remove size/weight info that belongs in package_size (e.g., "10KG", "500ML", "250G")
- Keep the actual product identity (e.g., "Butter Salted", "Coconut Oil Pure", "Muffin Case Standard")

quantity:
- The number of PURCHASE UNITS ordered (cases, bags, packs, boxes, etc.)
- This is the "Ordered" or "Qty" column on the invoice
- Example: if invoice says "Ordered: 4" for muffin cases → quantity = 4

unit:
- The PURCHASE unit: case, bag, pack, box, tub, bottle, carton, tray, block, unit, kg, L
- This is how the supplier sells it, NOT the individual items inside

package_size:
- The NET WEIGHT or NET VOLUME contained in ONE purchase unit
- If the invoice shows "250G" and pack contains 40 blocks: package_size = 10 (40 × 250g = 10kg), package_unit = "kg"
- If the invoice shows "500ML" and pack contains 6 bottles: package_size = 3000 or 3, package_unit = "ml" or "L"
- If the invoice shows "10KG" for a single bag: package_size = 10, package_unit = "kg"
- For countable non-weight items (muffin cases, cups, lids): package_size = count per pack (e.g., 480), package_unit = "unit"

package_unit:
- kg, g, L, ml, or unit
- Use "unit" for countable items without weight (cases, cups, napkins, etc.)

unit_price:
- CRITICAL: This is ALWAYS the price for ONE PURCHASE UNIT (one case, one bag, one pack)
- NEVER divide by the number of items inside the pack
- If invoice shows: "Muffin Case 480s, Qty: 4, Price: 15.00, Value: 60.00" → unit_price = 15.00 (price per pack), NOT 0.03125 (price per individual muffin case)
- If invoice shows: "Butter 250G, Pack: 40, Qty: 2, Price: 63.33, Value: 126.66" → unit_price = 63.33 (price per case of 40), NOT 1.58 (price per butter block)
- VERIFY: quantity × unit_price should approximately equal total (allowing for rounding)

total:
- Total cost for this line item
- Should equal quantity × unit_price (verify this)

VALIDATION:
- For each item, check that quantity × unit_price ≈ total (within rounding tolerance)
- If the math doesn't add up, re-examine which number is the quantity and which is the price
- Skip section headers ("FOODS", "NON FOODS"), dashed lines, page numbers, footer text
- Skip items with zero value unless they have a valid price

COMMON INVOICE FORMATS:
Cash & Carry invoices (Elliotts, Musgrave, BWG, etc.) have columns like:
Code | Description | Pack | Ordered | Supplied | Price | Value | VAT

CRITICAL COLUMN MAPPING:
- "Pack" column = items per pack (e.g., 480 muffin cases per pack) → this goes in package_size
- "Ordered" column = number of packs purchased → this goes in quantity
- "Price" column = price PER PACK → this goes in unit_price
- "Value" column = total cost (Ordered × Price) → this goes in total

Example from a real Elliotts invoice:
MC DOUGALLS STD MUFFIN CASE 480S 90G | Pack: 480 | Ordered: 4 | Price: 15.00 | Value: 60.00

CORRECT extraction:
- description: "Muffin Case Standard"
- quantity: 4 (from Ordered column)
- unit: "pack"
- package_size: 480 (from Pack column)
- package_unit: "unit"
- unit_price: 15.00 (from Price column — per pack, NOT per individual muffin case)
- total: 60.00 (from Value column — 4 × 15.00)

WRONG extraction:
- quantity: 480 ← NO, this is the Pack column, not quantity
- unit_price: 0.03125 ← NO, never divide Price by Pack
- total: 0.00 ← NO, this means the math was wrong

ANOTHER EXAMPLE:
COCONUT OIL PURE KTC 500ML | Pack: 12 | Ordered: 2 | Price: 39.67 | Value: 79.34
CORRECT: quantity=2, unit="case", package_size=6000, package_unit="ml", unit_price=39.67, total=79.34

FINAL VALIDATION RULE:
After extracting all items, verify: SUM of all item totals should approximately equal the invoice subtotal/total goods. If it doesn't, one or more items have wrong values — recheck them.

Invoice text:
`

type ClaudeUsage = { inputTokens: number; outputTokens: number }

function parseAndValidateExtraction(rawText: string, usage: ClaudeUsage) {
  const cleaned = rawText
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim()

  const parsed = JSON.parse(cleaned) as {
    supplier_name?: string
    invoice_number?: string | null
    invoice_date?: string | null
    vat_rate?: number | null
    vat_amount?: number | null
    subtotal?: number | null
    total?: number | null
    items?: Array<{
      description?: string
      quantity?: number
      unit?: string
      package_size?: number | null
      package_unit?: string | null
      unit_price?: number
      total?: number
    }>
  }

  // Validate and auto-correct item prices before returning
  if (Array.isArray(parsed.items)) {
    for (const item of parsed.items) {
      const qty   = Number(item.quantity ?? 1) || 1
      const price = Number(item.unit_price ?? 0)
      const total = Number(item.total ?? 0)
      const calculatedTotal = qty * price

      // Fix zero totals when price and quantity are both valid
      if (total === 0 && price > 0) {
        item.total = Number((calculatedTotal).toFixed(2))
        console.warn(`[extract] Fixed zero total for "${item.description}": ${item.total}`)
      }

      // If qty × price is off from the reported total by >10%, correct unit_price from total/qty
      const reportedTotal = Number(item.total ?? 0)
      if (reportedTotal > 0 && Math.abs(calculatedTotal - reportedTotal) / reportedTotal > 0.1) {
        const corrected = Number((reportedTotal / qty).toFixed(4))
        console.warn(
          `[extract] Price mismatch for "${item.description}": ` +
          `${qty} × ${price} = ${calculatedTotal.toFixed(2)}, total = ${reportedTotal} → correcting unit_price to ${corrected}`
        )
        item.unit_price = corrected
      }
    }
  }

  return {
    usage,
    supplier_name:   parsed.supplier_name ?? 'Unknown Supplier',
    invoice_number:  parsed.invoice_number ?? null,
    invoice_date:    normaliseDateForInput(parsed.invoice_date),
    vat_rate:        parsed.vat_rate ?? null,
    vat_amount:      parsed.vat_amount ?? null,
    subtotal_amount: parsed.subtotal ?? null,
    total_amount:    parsed.total ?? null,
    items: (parsed.items ?? []).map((item) => ({
      description:  item.description ?? '',
      quantity:     Number(item.quantity ?? 1) || 1,
      unit:         item.unit ?? 'unit',
      package_size: item.package_size ?? null,
      package_unit: item.package_unit ?? null,
      unit_price:   Number(item.unit_price ?? 0) || 0,
      total:        Number(item.total ?? 0) || 0,
    })),
  }
}

async function extractWithClaude(text: string) {
  const anthropic = getAnthropic()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: EXTRACTION_PROMPT + text }],
  })

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Claude returned no text content')

  return parseAndValidateExtraction(content.text, usage)
}

const VISION_INSTRUCTION =
  'Read the attached invoice image and extract the data as specified above. Return ONLY the JSON.'

async function extractInvoiceWithVision(imageBase64: string, mimeType: string) {
  const anthropic = getAnthropic()
  const allowedMediaTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
  const mediaType = (allowedMediaTypes as readonly string[]).includes(mimeType)
    ? (mimeType as (typeof allowedMediaTypes)[number])
    : 'image/jpeg'

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: EXTRACTION_PROMPT.replace(/Invoice text:\s*$/, VISION_INSTRUCTION) },
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        ],
      },
    ],
  })

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Claude returned no text content')

  return parseAndValidateExtraction(content.text, usage)
}

// ── Shared empty-form response (manual entry fallback) ─────────────────────

function emptyForm(error?: string, extra?: Record<string, unknown>) {
  return {
    ...(error ? { error } : {}),
    ...extra,
    supplier_name:  '',
    invoice_number: null,
    invoice_date:   new Date().toISOString().slice(0, 10),
    total_amount:   null,
    items:          [],
  }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const kind = typeof body?.kind === 'string' ? body.kind : ''

    // ── CSV path — no AI, no auth required ───────────────────────────────────
    if (kind === 'csv') {
      const csv = typeof body?.csv === 'string' ? body.csv : ''
      if (!csv.trim()) {
        return NextResponse.json({ error: 'Missing CSV content' }, { status: 400 })
      }

      const parsed = Papa.parse<Record<string, string>>(csv, {
        header: true,
        skipEmptyLines: true,
      })

      const rows    = (parsed.data ?? []).filter((row) => Object.keys(row).length > 0)
      const headers = parsed.meta.fields ?? Object.keys(rows[0] ?? {})
      const columnMap = autoDetectCsvColumns(headers)

      const items = rows.map((row) => {
        const description = row[columnMap.description] ?? row.Description ?? row.Item ?? ''
        const quantity    = Number.parseFloat(row[columnMap.quantity] ?? row.Quantity ?? '1') || 1
        const unit        = row[columnMap.unit] ?? row.Unit ?? 'unit'
        const unitPrice   = Number.parseFloat(row[columnMap.unitPrice] ?? row['Unit Price'] ?? '0') || 0
        const total       = Number.parseFloat(row[columnMap.total] ?? row.Total ?? `${quantity * unitPrice}`) || quantity * unitPrice
        return { description, quantity, unit, unit_price: unitPrice, total }
      })

      return NextResponse.json({
        supplier_name:  typeof body?.fileName === 'string' ? body.fileName : 'CSV import',
        invoice_number: null,
        invoice_date:   new Date().toISOString().slice(0, 10),
        total_amount:   items.reduce((sum, item) => sum + item.total, 0),
        items,
        column_map:     columnMap,
        headers,
        rows:           rows.slice(0, 5),
      })
    }

    // ── PDF / text / image path — requires auth + AI usage limit ─────────────
    let runExtraction: () => ReturnType<typeof extractWithClaude>

    if (kind === 'image') {
      const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : ''
      const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/jpeg'
      if (!imageBase64.trim()) {
        return NextResponse.json({ error: 'Missing image content' }, { status: 400 })
      }
      runExtraction = () => extractInvoiceWithVision(imageBase64, mimeType)
    } else {
      const text = typeof body?.text === 'string' ? body.text : ''
      if (!text.trim()) {
        return NextResponse.json({ error: 'Missing text content' }, { status: 400 })
      }
      runExtraction = () => extractWithClaude(text)
    }

    // Auth
    const supabase = createRequestSupabaseClient(request)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Tenant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (admin.from('tenant_users') as any)
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    const tenantId = member?.tenant_id as string | undefined

    // Subscription + usage limit (only enforce if we have a tenant)
    if (tenantId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tenantInfo } = await (admin.from('tenants') as any)
        .select('subscription_status, created_at')
        .eq('id', tenantId)
        .single()

      const subStatus = getEffectiveSubscriptionStatus(
        tenantInfo?.subscription_status,
        tenantInfo?.created_at ?? new Date().toISOString()
      )
      const isPro = subStatus === 'active' || subStatus === 'trialing'
      const monthlyLimit = isPro
        ? PRO_LIMITS.aiInvoiceExtractsPerMonth
        : FREE_LIMITS.aiInvoiceExtractsPerMonth

      if (monthlyLimit !== Infinity) {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count: usedCount } = await (admin.from('ai_usage') as any)
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('feature', 'invoice_extract')
          .gte('used_at', startOfMonth)

        const used = usedCount ?? 0
        if (used >= monthlyLimit) {
          return NextResponse.json(
            emptyForm(
              'AI extraction limit reached. You can still enter invoices manually.',
              { limitReached: true }
            )
          )
        }
      }

      try {
        const result = await runExtraction()
        // Record rate-limit usage
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin.from('ai_usage') as any).insert({ tenant_id: tenantId, feature: 'invoice_extract' })
        // Log detailed token usage for analytics
        await logAIUsage({
          tenantId,
          userId: user.id,
          feature: 'invoice_extract',
          inputTokens:  result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          model: 'claude-sonnet-4-6',
        })
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { usage: _u, ...responseData } = result
        return NextResponse.json(responseData)
      } catch (claudeErr) {
        const message = claudeErr instanceof Error ? claudeErr.message : 'AI extraction failed'
        console.error('[extract] Claude error:', message)
        return NextResponse.json(emptyForm(message))
      }
    }

    // No tenant found — still allow extraction but don't track usage
    try {
      const result = await runExtraction()
      return NextResponse.json(result)
    } catch (claudeErr) {
      const message = claudeErr instanceof Error ? claudeErr.message : 'AI extraction failed'
      console.error('[extract] Claude error:', message)
      return NextResponse.json(emptyForm(message))
    }
  } catch (error) {
    console.error('[extract] Unhandled error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to extract invoice data' },
      { status: 500 }
    )
  }
}
