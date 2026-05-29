import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import Papa from 'papaparse'
import { autoDetectCsvColumns } from '@/lib/invoices'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getEffectiveSubscriptionStatus } from '@/lib/tenant'
import { FREE_LIMITS, PRO_LIMITS } from '@/lib/subscription/limits'

export const runtime = 'nodejs'
export const maxDuration = 60

// ── Env diagnostic ─────────────────────────────────────────────────────────
console.log(
  '[extract] ANTHROPIC_API_KEY:',
  process.env.ANTHROPIC_API_KEY
    ? `SET (${process.env.ANTHROPIC_API_KEY.substring(0, 15)}…)`
    : 'NOT SET'
)

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

const EXTRACTION_PROMPT = `You are an invoice data extraction system. Extract structured data from this invoice text.

Return ONLY valid JSON, no markdown, no backticks, no explanation. The JSON must follow this exact structure:

{
  "supplier_name": "string",
  "invoice_number": "string",
  "invoice_date": "DD/MM/YYYY",
  "vat_rate": number or null,
  "vat_amount": number or null,
  "subtotal": number or null,
  "total": number,
  "items": [
    {
      "description": "string - clean product name without brand suffixes or size info",
      "quantity": number,
      "unit": "string - case/bag/pack/box/tub/bottle/carton/tray/block/unit/kg/L",
      "package_size": number or null,
      "package_unit": "kg/g/L/ml/unit" or null,
      "unit_price": number,
      "total": number
    }
  ]
}

Rules for extraction:
- description: Clean product name. Remove brand names (e.g., "COSUN", "CALLEBA", "BOYLANS", "DUER"), remove size info (e.g., "16kg", "2.5KG"), capitalize as Title Case
- quantity: Number of units/cases purchased
- unit: The purchase unit (case, bag, pack, box, etc.)
- package_size: The weight/volume per unit. If SIZE says "1 X 2.5KG" then package_size = 2.5. If "8 X 2.5KG" then package_size = 20 (8 × 2.5). If "1 X 25KG" then package_size = 25.
- package_unit: kg, g, L, ml, or unit
- unit_price: Price per single unit/case
- total: Total cost for this line (quantity × unit_price)
- Skip section headers, dashed lines, page numbers, footer text
- supplier_name: The company issuing the invoice (NOT the buyer)
- invoice_date: Convert any date format to DD/MM/YYYY

Invoice text:
`

async function extractWithClaude(text: string) {
  const anthropic = getAnthropic()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: EXTRACTION_PROMPT + text }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Claude returned no text content')

  const cleaned = content.text
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

  return {
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

    // ── PDF / text path — requires auth + AI usage limit ─────────────────────
    const text = typeof body?.text === 'string' ? body.text : ''
    if (!text.trim()) {
      return NextResponse.json({ error: 'Missing text content' }, { status: 400 })
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

      console.log('[extract] Sending to Claude, text length:', text.length)

      try {
        const result = await extractWithClaude(text)
        // Record usage after successful extraction
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin.from('ai_usage') as any).insert({ tenant_id: tenantId, feature: 'invoice_extract' })
        console.log('[extract] Claude succeeded, items:', result.items.length)
        return NextResponse.json(result)
      } catch (claudeErr) {
        const message = claudeErr instanceof Error ? claudeErr.message : 'AI extraction failed'
        console.error('[extract] Claude error:', message)
        return NextResponse.json(emptyForm(message))
      }
    }

    // No tenant found — still allow extraction but don't track usage
    console.log('[extract] No tenant, sending to Claude, text length:', text.length)
    try {
      const result = await extractWithClaude(text)
      console.log('[extract] Claude succeeded, items:', result.items.length)
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
