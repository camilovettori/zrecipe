import { NextRequest, NextResponse } from 'next/server'

type ParsedLineItem = {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
}

function normalizeNumber(value: string) {
  return Number.parseFloat(value.replace(/\s/g, '').replace(',', '.'))
}

function parseDateFromText(text: string) {
  const patterns = [
    /(?:invoice\s+date|date)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i,
    /(?:invoice\s+date|date)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(?:invoice\s+date|date)\s*[:\-]?\s*(\d{2}-\d{2}-\d{4})/i,
    /(\d{4}\/\d{2}\/\d{2})/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const raw = match[1]
      if (raw.includes('-') && raw.length === 10 && raw.indexOf('-') === 4) {
        return raw
      }

      const normalized = raw.replace(/\//g, '-')
      const parts = normalized.split('-')
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
        }
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
      }
    }
  }

  return new Date().toISOString().slice(0, 10)
}

function parseSupplierName(text: string, lines: string[]) {
  const supplierPatterns = [
    /(?:supplier|vendor|from)\s*[:\-]\s*(.+)/i,
    /(?:billed\s+from)\s*[:\-]\s*(.+)/i,
  ]

  for (const pattern of supplierPatterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return match[1].split(/\n|invoice\s+no|invoice\s+number|date/i)[0].trim()
    }
  }

  const firstMeaningfulLine = lines.find(
    (line) =>
      line.length > 2 &&
      !/invoice|date|total|qty|quantity|unit price|supplier|vendor/i.test(line)
  )

  return firstMeaningfulLine ?? 'Unknown supplier'
}

function parseInvoiceNumber(text: string) {
  const patterns = [
    /invoice\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    /(?:ref\.?|reference)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  return null
}

function parseTotalAmount(text: string) {
  const match =
    text.match(/(?:grand\s+total|total\s+due|amount\s+due|total)\s*[:\-]?\s*€?\$?([\d.,]+)/i) ??
    text.match(/€\s*([\d.,]+)/)

  if (match?.[1]) {
    return normalizeNumber(match[1])
  }

  return null
}

function parseLineItems(lines: string[]): ParsedLineItem[] {
  const items: ParsedLineItem[] = []

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s{2,}/g, ' ').trim()

    const standardMatch = line.match(
      /^(.*?)\s+(\d+(?:[.,]\d+)?)\s+([a-zA-Z]+)\s+([\d.,]+)\s+([\d.,]+)$/
    )
    const compactMatch = line.match(
      /^(.*?)\s+(\d+(?:[.,]\d+)?)\s+x\s+([\d.,]+)\s+([\d.,]+)\s*$/i
    )

    if (!standardMatch && !compactMatch) {
      continue
    }

    const descriptionPart = standardMatch?.[1] ?? compactMatch?.[1] ?? ''
    const quantityPart = standardMatch?.[2] ?? compactMatch?.[2] ?? '0'
    const unitPart = standardMatch?.[3] ?? 'unit'
    const unitPricePart = standardMatch?.[4] ?? compactMatch?.[3] ?? '0'
    const totalPart = standardMatch?.[5] ?? compactMatch?.[4] ?? '0'
    const quantity = normalizeNumber(quantityPart)
    const unitPrice = normalizeNumber(unitPricePart)
    const total = totalPart ? normalizeNumber(totalPart) : Number((quantity * unitPrice).toFixed(2))

    const description = descriptionPart
      .replace(/[\s|]+$/g, '')
      .replace(/^\d+\.?\s*/, '')
      .trim()

    if (!description || Number.isNaN(quantity) || Number.isNaN(unitPrice)) {
      continue
    }

    items.push({
      description,
      quantity,
      unit: unitPart,
      unitPrice,
      total,
    })
  }

  return items
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const textContent = typeof body?.text === 'string' ? body.text : ''

    if (!textContent.trim()) {
      return NextResponse.json(
        { message: 'Missing text content' },
        { status: 400 }
      )
    }

    const lines = textContent
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter(Boolean)

    const supplierName = parseSupplierName(textContent, lines)
    const invoiceNumber = parseInvoiceNumber(textContent)
    const invoiceDate = parseDateFromText(textContent)
    const lineItems = parseLineItems(lines)
    const totalAmount = parseTotalAmount(textContent)

    return NextResponse.json({
      supplierName,
      invoiceNumber,
      invoiceDate,
      totalAmount,
      currency: 'EUR',
      lineItems,
      rawText: textContent,
      confidence: lineItems.length > 0 ? 0.78 : 0.45,
    })
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Unable to parse invoice text',
      },
      { status: 500 }
    )
  }
}
