import type { InvoiceFileType } from '@/lib/invoices'

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

export async function extractPdfText(file: File) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pageTexts: string[] = []

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex)
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
        if (text) {
          pageLines.push(text)
        }
        currentLine = [item.text]
      }
      currentY = lineY
    }

    const finalLine = currentLine.join(' ').replace(/\s+/g, ' ').trim()
    if (finalLine) {
      pageLines.push(finalLine)
    }

    if (pageLines.length > 0) {
      pageTexts.push(pageLines.join('\n'))
    }
  }

  return pageTexts.join('\n')
}

export type ExtractedInvoiceItem = {
  description: string
  brand?: string | null
  quantity: number
  unit: string
  packageSize?: number | null
  packageUnit?: string | null
  unitPrice: number
  total: number
}

export function normalizeExtractedItems(
  items: Array<
    | ExtractedInvoiceItem
    | {
        description?: string
        brand?: string | null
        quantity?: number
        unit?: string
        unit_price?: number
        unitPrice?: number
        total?: number
      }
  >
): ExtractedInvoiceItem[] {
  return items.map((item) => ({
      description: (item as { description?: string }).description ?? '',
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
