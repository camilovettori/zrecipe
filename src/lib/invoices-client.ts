import type { InvoiceFileType, InvoiceQuantitySource } from '@/lib/invoices'

export function fileTypeFromName(file: File): InvoiceFileType {
  if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (file.type.includes('csv') || file.name.toLowerCase().endsWith('.csv')) return 'csv'
  return 'image'
}

export function bytesToSize(size: number) {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(0)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

// Claude vision gets ALL pages up to this cap (not just page 1) — sending
// more than this risks both Claude's per-request token budget and Vercel's
// ~4.5MB Node serverless body limit once base64-encoded.
const MAX_VISION_PAGES = 5
// Stay under Vercel's Node body limit with headroom for the JSON envelope
// and the reconstructed text also in the payload.
const MAX_VISION_PAYLOAD_BYTES = 3.5 * 1024 * 1024

export async function extractPdfContent(file: File) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pageTexts: string[] = []
  const pageImages: string[] = []
  let renderedPayloadBytes = 0

  if (pdf.numPages > MAX_VISION_PAGES) {
    console.warn(
      `extractPdfContent: "${file.name}" has ${pdf.numPages} pages — only rendering the first ${MAX_VISION_PAGES} for AI extraction`
    )
  }

  try {
    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex)

      if (pageIndex <= MAX_VISION_PAGES && renderedPayloadBytes < MAX_VISION_PAYLOAD_BYTES) {
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = Math.min(2, 1400 / Math.max(baseViewport.width, 1))
        const previewViewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        if (context) {
          canvas.width = Math.ceil(previewViewport.width)
          canvas.height = Math.ceil(previewViewport.height)
          await page.render({ canvas, canvasContext: context, viewport: previewViewport }).promise
          const pageImageBase64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1] ?? ''
          canvas.width = 0
          canvas.height = 0

          if (pageImageBase64) {
            // base64 is ~4/3 the size of the raw bytes it encodes.
            const approxBytes = (pageImageBase64.length * 3) / 4
            if (renderedPayloadBytes + approxBytes > MAX_VISION_PAYLOAD_BYTES) {
              console.warn(
                `extractPdfContent: "${file.name}" — stopping at page ${pageIndex - 1} of ${MAX_VISION_PAGES}, rendered images hit the upload size budget`
              )
            } else {
              pageImages.push(pageImageBase64)
              renderedPayloadBytes += approxBytes
            }
          }
        }
      }

      const content = await page.getTextContent()
      const items = content.items as Array<{ str?: string; transform?: number[] }>
      const lines = items
        .map((item, index) => ({
          text: item.str ?? '',
          x: item.transform?.[4] ?? index,
          y: item.transform?.[5] ?? 0,
        }))
        .filter((item) => item.text.trim())
        .sort((a, b) => b.y - a.y || a.x - b.x)

      const pageLines: string[] = []
      let currentY: number | null = null
      let currentLine: string[] = []

      for (const item of lines) {
        const lineY = Math.round(item.y)
        if (currentY === null || Math.abs(lineY - currentY) <= 2) {
          currentLine.push(item.text)
        } else {
          const text = currentLine.join(' ').replace(/\s+/g, ' ').trim()
          if (text) pageLines.push(text)
          currentLine = [item.text]
        }
        currentY = lineY
      }

      const finalLine = currentLine.join(' ').replace(/\s+/g, ' ').trim()
      if (finalLine) pageLines.push(finalLine)
      if (pageLines.length > 0) pageTexts.push(pageLines.join('\n'))
    }
  } finally {
    await pdf.destroy()
  }

  return {
    text: pageTexts.join('\n'),
    pageImages,
    firstPageImageBase64: pageImages[0] ?? '',
  }
}

export async function extractPdfText(file: File) {
  const result = await extractPdfContent(file)
  return result.text
}

export type ExtractedInvoiceItem = {
  description: string
  product_code?: string | null
  brand?: string | null
  quantity: number
  unit: string
  packageSize?: number | null
  packageUnit?: string | null
  unitPrice: number
  total: number
  originalDescription?: string | null
  rawQuantityColumns?: Record<string, number | null>
  rawCasesQuantity?: number | null
  rawUnitsQuantity?: number | null
  rawSizeText?: string | null
  extractedCasePackCount?: number | null
  extractedUnitSize?: number | null
  extractedUnitMeasure?: string | null
  quantitySource?: InvoiceQuantitySource
  normalizedPriceConfidence?: 'high' | 'review'
  needsReviewReason?: string | null
  supplierRawText?: string | null
  warnings?: string[]
}

export function normalizeExtractedItems(
  items: Array<
    | ExtractedInvoiceItem
    | {
        description?: string
        product_code?: string | null
        brand?: string | null
        quantity?: number
        unit?: string
        unit_price?: number
        unitPrice?: number
        total?: number
        original_description?: string | null
        raw_quantity_columns?: Record<string, number | null>
        raw_cases_quantity?: number | null
        raw_units_quantity?: number | null
        raw_size_text?: string | null
        extracted_case_pack_count?: number | null
        extracted_unit_size?: number | null
        extracted_unit_measure?: string | null
        quantity_source?: InvoiceQuantitySource
        normalized_price_confidence?: 'high' | 'review'
        needs_review_reason?: string | null
        supplier_raw_text?: string | null
      }
  >
): ExtractedInvoiceItem[] {
  return items.map((item) => ({
      description: (item as { description?: string }).description ?? '',
      originalDescription: (item as { original_description?: string | null }).original_description ?? null,
      rawQuantityColumns: (item as { raw_quantity_columns?: Record<string, number | null> }).raw_quantity_columns ?? {},
      product_code: (item as { product_code?: string | null }).product_code?.trim() || null,
      brand: (item as { brand?: string | null }).brand?.trim() || null,
      quantity: Number((item as { quantity?: number }).quantity ?? 1) || 1,
      unit: (item as { unit?: string }).unit ?? 'unit',
      packageSize:
        (item as { packageSize?: number | null; package_size?: number | null }).packageSize ??
        (item as { packageSize?: number | null; package_size?: number | null }).package_size ??
        null,
      packageUnit:
        (item as { packageUnit?: string | null; package_unit?: string | null }).packageUnit ??
        (item as { packageUnit?: string | null; package_unit?: string | null }).package_unit ??
        null,
      unitPrice:
        Number(
          (item as { unitPrice?: number; unit_price?: number }).unitPrice ??
          (item as { unitPrice?: number; unit_price?: number }).unit_price ??
          0
      ) || 0,
    rawCasesQuantity: (item as { raw_cases_quantity?: number | null }).raw_cases_quantity ?? null,
    rawUnitsQuantity: (item as { raw_units_quantity?: number | null }).raw_units_quantity ?? null,
    rawSizeText: (item as { raw_size_text?: string | null }).raw_size_text ?? null,
    extractedCasePackCount: (item as { extracted_case_pack_count?: number | null }).extracted_case_pack_count ?? null,
    extractedUnitSize: (item as { extracted_unit_size?: number | null }).extracted_unit_size ?? null,
    extractedUnitMeasure: (item as { extracted_unit_measure?: string | null }).extracted_unit_measure ?? null,
    quantitySource: (item as { quantity_source?: InvoiceQuantitySource }).quantity_source,
    normalizedPriceConfidence: (item as { normalized_price_confidence?: 'high' | 'review' }).normalized_price_confidence,
    needsReviewReason: (item as { needs_review_reason?: string | null }).needs_review_reason ?? null,
    supplierRawText: (item as { supplier_raw_text?: string | null }).supplier_raw_text ?? null,
    total:
      Number((item as { total?: number }).total ?? 0) ||
      Number(
        (
          Number((item as { quantity?: number }).quantity ?? 1) *
          Number(
            (item as { unitPrice?: number; unit_price?: number }).unitPrice ??
              (item as { unitPrice?: number; unit_price?: number }).unit_price ??
              0
          )
        ).toFixed(2)
      ),
  }))
}
