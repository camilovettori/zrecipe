// Kitchen Card: options persistence + printable HTML builder.
//
// The same HTML string produced here is used both for the live preview
// (rendered into a scaled <iframe srcDoc>) and for the actual print window,
// so the preview is a pixel-accurate mirror of what gets printed.

export type KitchenCardOrientation = 'landscape' | 'portrait'

export interface KitchenCardOptions {
  orientation: KitchenCardOrientation
  includePhotos: boolean
  includeIngredients: boolean
  includeIngredientNotes: boolean
  includeMethod: boolean
  includeNotes: boolean
  includeAllergens: boolean
  includeShoppingList: boolean
  includeMetaBar: boolean
}

export const DEFAULT_KITCHEN_CARD_OPTIONS: KitchenCardOptions = {
  orientation: 'landscape',
  includePhotos: true,
  includeIngredients: true,
  includeIngredientNotes: true,
  includeMethod: true,
  includeNotes: true,
  includeAllergens: true,
  includeShoppingList: false,
  includeMetaBar: true,
}

const STORAGE_KEY = 'zrecipe:kitchenCardOptions'
const LANDSCAPE_PHOTO_MAX_HEIGHT_MM = 132
const PORTRAIT_PHOTO_MAX_HEIGHT_MM = 72

export function loadKitchenCardOptions(): KitchenCardOptions {
  if (typeof window === 'undefined') return DEFAULT_KITCHEN_CARD_OPTIONS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_KITCHEN_CARD_OPTIONS
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_KITCHEN_CARD_OPTIONS, ...parsed }
  } catch {
    return DEFAULT_KITCHEN_CARD_OPTIONS
  }
}

export function saveKitchenCardOptions(options: KitchenCardOptions) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
  } catch {
    // ignore storage failures (private browsing, quota, etc.)
  }
}

export interface KitchenCardIngredientLine {
  name: string
  quantity: string
  unit: string
  notes: string
}

export interface KitchenCardData {
  name: string
  category: string
  yieldQuantity: number
  yieldUnit: string
  prepTimeMinutes: number
  cookTimeMinutes: number
  imageUrls: string[]
  description: string
  ingredients: KitchenCardIngredientLine[]
  instructions: string[]
  allergensContains: string[]
  allergensMayContain: string[]
  batchLabel?: string | null
  batchMultiplier: number
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Deterministic, gap-free collage layouts for 1-8 photos. Each entry gives
// the grid dimensions and which image (if any) spans two cells so every
// cell in the grid is filled — no empty leftover cells regardless of count.
function collageLayout(count: number): { cols: number; rows: number; spanFirstRow?: boolean; spanLastCol?: boolean } {
  switch (count) {
    case 1: return { cols: 1, rows: 1 }
    case 2: return { cols: 1, rows: 2 }
    case 3: return { cols: 2, rows: 2, spanFirstRow: true } // first image spans both rows (tall, col 1); 2 & 3 stack in col 2
    case 4: return { cols: 2, rows: 2 }
    case 5: return { cols: 2, rows: 3, spanLastCol: true } // last image spans both columns (full-width bottom row)
    case 6: return { cols: 2, rows: 3 }
    case 7: return { cols: 2, rows: 4, spanLastCol: true } // last image spans both columns (full-width bottom row)
    default: return { cols: 2, rows: 4 } // 8
  }
}

// Renders a tight, gap-free photo collage. `fillHeight` makes the grid stretch
// to 100% of its (flex-stretched) container — used for the landscape left
// column, which fills the available page height up to its CSS cap. For the
// portrait top strip, pass a fixed millimetre height so printing is stable.
function photoGrid(images: string[], fillHeight: boolean, fixedHeightMm?: number): string {
  if (images.length === 0) return ''
  const { cols, rows, spanFirstRow, spanLastCol } = collageLayout(images.length)
  const cells = images
    .map((src, i) => {
      const isFirst = i === 0
      const isLast = i === images.length - 1
      const span = (spanFirstRow && isFirst) ? 'grid-row:span 2;' : (spanLastCol && isLast) ? 'grid-column:span 2;' : ''
      return `<img src="${esc(src)}" style="${span}" />`
    })
    .join('')
  const sizeStyle = fillHeight
    ? 'height:100%;width:100%;'
    : `height:${fixedHeightMm ?? PORTRAIT_PHOTO_MAX_HEIGHT_MM}mm;max-height:${PORTRAIT_PHOTO_MAX_HEIGHT_MM}mm;width:100%;margin-bottom:12px;`
  return `<div class="photo-grid" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);${sizeStyle}">${cells}</div>`
}

function allergenBox(contains: string[], mayContain: string[]): string {
  const hasAny = contains.length > 0 || mayContain.length > 0
  if (!hasAny) {
    return `<div class="allergen-box"><p class="allergen-title">Allergen Declaration</p><p class="allergen-none">No allergens declared</p></div>`
  }
  return `<div class="allergen-box">
    <p class="allergen-title">Allergen Declaration</p>
    ${contains.length > 0 ? `<p class="allergen-contains">CONTAINS: ${esc(contains.join(', ').toUpperCase())}</p>` : ''}
    ${mayContain.length > 0 ? `<p class="allergen-may">May contain: ${esc(mayContain.join(', ').toUpperCase())}</p>` : ''}
  </div>`
}

function ingredientsTable(ingredients: KitchenCardIngredientLine[], includeNotes: boolean): string {
  const rows = ingredients
    .map(
      (ing) => `<tr>
        <td class="ing-name">${esc(ing.name)}</td>
        ${includeNotes ? `<td class="ing-notes">${esc(ing.notes)}</td>` : ''}
        <td class="ing-qty">${esc(ing.quantity)} ${esc(ing.unit)}</td>
      </tr>`
    )
    .join('')
  return `<table class="ingredients">
    <thead><tr>
      <th style="width:${includeNotes ? '42%' : '65%'};">Ingredient</th>
      ${includeNotes ? '<th style="width:33%;">Notes</th>' : ''}
      <th style="width:25%;text-align:right;">Quantity</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function notesOnlyList(ingredients: KitchenCardIngredientLine[]): string {
  const items = ingredients
    .filter((ing) => ing.notes.trim())
    .map((ing) => `<li>${esc(ing.notes)}</li>`)
    .join('')
  return `<ul class="notes-list">${items}</ul>`
}

// Renders the Ingredients area, handling the interaction between the
// "Ingredients + qty" and "Ingredient notes" toggles:
//  - both on / qty only  -> full table (with or without a notes column)
//  - notes only          -> a plain list of just the note text, styled
//                           like the ingredient list, skipping unnoted lines
//  - neither             -> nothing
function ingredientsSection(ingredients: KitchenCardIngredientLine[], includeIngredients: boolean, includeNotes: boolean): string {
  if (includeIngredients) {
    if (ingredients.length === 0) return ''
    return `<p class="section-title">Ingredients</p>${ingredientsTable(ingredients, includeNotes)}`
  }
  if (includeNotes) {
    const noted = ingredients.filter((ing) => ing.notes.trim())
    if (noted.length === 0) return ''
    return `<p class="section-title">Ingredients</p>${notesOnlyList(noted)}`
  }
  return ''
}

function shoppingListSection(ingredients: KitchenCardIngredientLine[], batchMultiplier: number): string {
  if (ingredients.length === 0) return ''
  const hint = batchMultiplier > 1
    ? `<span class="shopping-hint"> — for ${batchMultiplier} batches</span>`
    : ''
  const rows = ingredients
    .map(
      (ing) => `<div class="shopping-row">
        <span class="shopping-check"></span>
        <span class="shopping-name">${esc(ing.name)}</span>
        <span class="shopping-qty">${esc(ing.quantity)} ${esc(ing.unit)}</span>
      </div>`
    )
    .join('')
  return `<p class="section-title">Shopping List${hint}</p><div class="shopping-list">${rows}</div>`
}

function methodList(steps: string[]): string {
  return `<ol class="method">${steps.map((s, i) => `<li><strong>${i + 1}.</strong> ${esc(s)}</li>`).join('')}</ol>`
}

function notesBox(text: string): string {
  return `<div class="notes-box"><p class="notes-title">Recipe Notes</p><p class="notes-text">${esc(text)}</p></div>`
}

// ── Adaptive text sizing ────────────────────────────────────────────────────
//
// Option A (content-tiered sizing): fewer enabled sections / less text means
// LARGER, bolder type — kitchen staff read these from arm's length or across
// a counter, so "few sections" must look genuinely big, not just slightly
// bigger than normal. More sections / more text scales down so everything
// still fits on one page, with a readability floor (~12-13px) even at the
// densest tier. Three tiers, chosen from a rough content score (section
// count + ingredient/step/character volume) — deliberately a heuristic, not
// pixel-exact fitting, per the reliability requirement for this print/PDF
// context. Photos are excluded from the score: they fill their own area
// (collage layout) and don't compete with text for space.
//
// Hierarchy is preserved in every tier (title > section label > body >
// secondary/notes text).
type SizeTier = 'spacious' | 'normal' | 'dense'

interface TierSizes {
  title: number
  badge: number
  sectionTitle: number
  tableHeader: number
  ingName: number
  ingNotes: number
  methodLi: number
  methodLineHeight: number
  notesListLi: number
  notesText: number
  notesTitle: number
  allergenTitle: number
  allergenContains: number
  allergenMay: number
  shoppingName: number
  sectionMarginTop: number
}

const SIZE_TIERS: Record<SizeTier, TierSizes> = {
  // Few sections active, lots of empty space — go big and bold.
  spacious: {
    title: 42, badge: 14, sectionTitle: 22, tableHeader: 13,
    ingName: 20, ingNotes: 15, methodLi: 19, methodLineHeight: 1.6,
    notesListLi: 20, notesText: 20, notesTitle: 15,
    allergenTitle: 15, allergenContains: 19, allergenMay: 16,
    shoppingName: 19, sectionMarginTop: 26,
  },
  // A moderate mix of sections — comfortable, clearly readable.
  normal: {
    title: 32, badge: 12, sectionTitle: 16, tableHeader: 11,
    ingName: 16, ingNotes: 13, methodLi: 15, methodLineHeight: 1.55,
    notesListLi: 16, notesText: 16, notesTitle: 12,
    allergenTitle: 12, allergenContains: 15, allergenMay: 13,
    shoppingName: 15, sectionMarginTop: 18,
  },
  // Every section enabled, lots of content — scale down only enough to fit
  // one page; body text still never drops below ~12-13px.
  dense: {
    title: 24, badge: 10.5, sectionTitle: 12, tableHeader: 9.5,
    ingName: 13, ingNotes: 11, methodLi: 12.5, methodLineHeight: 1.45,
    notesListLi: 13, notesText: 12.5, notesTitle: 9.5,
    allergenTitle: 9.5, allergenContains: 12.5, allergenMay: 11.5,
    shoppingName: 12.5, sectionMarginTop: 12,
  },
}

// Rough content volume: section presence + item/step/character counts.
// Thresholds are calibrated so "just ingredients + notes" lands spacious and
// "everything enabled" lands dense — see verification renders.
function estimateContentScore(data: KitchenCardData, options: KitchenCardOptions): number {
  let score = options.includeMetaBar ? 1 : 0

  if (options.includeIngredients) {
    score += data.ingredients.length * 1.2
  } else if (options.includeIngredientNotes) {
    score += data.ingredients.filter((ing) => ing.notes.trim()).length * 1.2
  }

  if (options.includeMethod && data.instructions.length > 0) {
    const totalChars = data.instructions.join(' ').length
    score += data.instructions.length * 1.5 + totalChars / 60
  }

  if (options.includeNotes && data.description.trim()) {
    score += 2 + data.description.length / 80
  }

  if (options.includeAllergens) {
    score += 1.5 + (data.allergensContains.length + data.allergensMayContain.length) * 0.4
  }

  if (options.includeShoppingList) {
    score += data.ingredients.length * 1.2
  }

  return score
}

function pickSizeTier(data: KitchenCardData, options: KitchenCardOptions): SizeTier {
  const score = estimateContentScore(data, options)
  if (score <= 16) return 'spacious'
  if (score <= 34) return 'normal'
  return 'dense'
}

function buildBaseStyle(sizes: TierSizes): string {
  const sectionMarginBottom = Math.round(sizes.sectionMarginTop * 0.43)
  return `
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { height:100%; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#1e293b; }
  .page { padding:28px; display:flex; flex-direction:column; overflow:hidden; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; flex-shrink:0; border-bottom:3px solid #059669; padding-bottom:14px; margin-bottom:16px; }
  .title { font-size:${sizes.title}px; font-weight:800; line-height:1.15; }
  .meta { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
  .badge { font-size:${sizes.badge}px; padding:3px 10px; border-radius:20px; background:#f1f5f9; color:#475569; font-weight:600; border:1px solid #e2e8f0; }
  .badge-cat { background:#ecfdf5; color:#059669; border-color:#6ee7b7; }
  .brand { text-align:right; flex-shrink:0; }
  .brand img { height:30px; object-fit:contain; display:block; margin-left:auto; }
  .brand .sub { font-size:9px; color:#94a3b8; margin-top:2px; }
  .section-title { font-size:${sizes.sectionTitle}px; font-weight:800; text-transform:uppercase; letter-spacing:1.2px; color:#94a3b8; margin:${sizes.sectionMarginTop}px 0 ${sectionMarginBottom}px; }
  .photo-grid { display:grid; gap:6px; overflow:hidden; min-height:0; break-inside:avoid; page-break-inside:avoid; }
  .photo-grid img { width:100%; height:100%; min-height:0; min-width:0; object-fit:cover; border-radius:8px; display:block; }
  table.ingredients { width:100%; border-collapse:collapse; }
  table.ingredients th { text-align:left; font-size:${sizes.tableHeader}px; text-transform:uppercase; letter-spacing:0.8px; color:#94a3b8; padding:6px 8px; border-bottom:2px solid #e5e7eb; }
  table.ingredients td { padding:7px 8px; border-bottom:1px solid #f1f5f9; font-size:${sizes.ingName}px; vertical-align:top; }
  .ing-name { font-weight:600; }
  .ing-notes { font-size:${sizes.ingNotes}px; color:#64748b; font-style:italic; }
  .ing-qty { text-align:right; font-weight:600; white-space:nowrap; }
  ol.method { list-style:none; padding:0; }
  ol.method li { font-size:${sizes.methodLi}px; line-height:${sizes.methodLineHeight}; margin-bottom:7px; }
  ul.notes-list { list-style:none; padding:0; margin:0; }
  ul.notes-list li { position:relative; padding-left:14px; font-size:${sizes.notesListLi}px; font-weight:600; color:#1e293b; margin-bottom:7px; line-height:1.4; }
  ul.notes-list li::before { content:'•'; position:absolute; left:0; color:#059669; font-weight:700; }
  .notes-box { margin-top:10px; padding:10px 12px; border-radius:8px; border:1px dashed #cbd5e1; background:#f8fafc; }
  .notes-title { font-size:${sizes.notesTitle}px; font-weight:800; letter-spacing:1px; color:#64748b; text-transform:uppercase; margin-bottom:4px; }
  .notes-text { font-size:${sizes.notesText}px; color:#334155; line-height:1.5; white-space:pre-line; }
  .allergen-box { margin-top:10px; padding:10px 12px; border-radius:8px; border:1px solid #fca5a5; background:#fef2f2; }
  .allergen-title { font-size:${sizes.allergenTitle}px; font-weight:800; letter-spacing:1px; color:#dc2626; text-transform:uppercase; margin-bottom:4px; }
  .allergen-contains { font-size:${sizes.allergenContains}px; font-weight:700; color:#991b1b; margin-bottom:2px; }
  .allergen-may { font-size:${sizes.allergenMay}px; color:#d97706; }
  .allergen-none { font-size:${sizes.allergenMay}px; color:#94a3b8; font-style:italic; }
  .shopping-hint { text-transform:none; font-weight:600; letter-spacing:normal; color:#94a3b8; }
  .shopping-list { display:flex; flex-direction:column; }
  .shopping-row { display:flex; align-items:center; gap:9px; padding:6px 2px; border-bottom:1px solid #f1f5f9; }
  .shopping-check { width:13px; height:13px; border:1.5px solid #94a3b8; border-radius:3px; flex-shrink:0; }
  .shopping-name { flex:1; font-size:${sizes.shoppingName}px; font-weight:600; }
  .shopping-qty { font-size:${sizes.shoppingName}px; font-weight:600; white-space:nowrap; }
  .footer { margin-top:auto; padding-top:10px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; flex-shrink:0; font-size:9.5px; color:#94a3b8; }
  .print-btn { position:fixed; bottom:20px; right:20px; background:#059669; color:#fff; border:none; padding:12px 24px; border-radius:12px; font-size:14px; font-weight:600; cursor:pointer; }
  @media print { .no-print { display:none !important; } }
`
}

export function buildKitchenCardHtml(
  data: KitchenCardData,
  options: KitchenCardOptions,
  logoUrl: string,
  isCustomLogo = false
): string {
  const images = data.imageUrls.filter(Boolean).slice(0, 8)
  const sizeTier = pickSizeTier(data, options)
  const baseStyle = buildBaseStyle(SIZE_TIERS[sizeTier])
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const yieldUnitTrimmed = (data.yieldUnit ?? '').trim()
  const isGenericUnit = !yieldUnitTrimmed || ['unit', 'units'].includes(yieldUnitTrimmed.toLowerCase())
  const yieldBadge = isGenericUnit ? `Yield: ${data.yieldQuantity}` : `Yield: ${data.yieldQuantity} ${yieldUnitTrimmed}`
  const hasMethod = options.includeMethod && data.instructions.length > 0
  const hasNotes = options.includeNotes && !!data.description.trim()
  const hasPhotos = options.includePhotos && images.length > 0
  const ingredientsHtml = ingredientsSection(data.ingredients, options.includeIngredients, options.includeIngredientNotes)
  const shoppingListHtml = options.includeShoppingList ? shoppingListSection(data.ingredients, data.batchMultiplier) : ''

  const header = `<div class="header">
    <div>
      <h1 class="title">${esc(data.name)}</h1>
      ${options.includeMetaBar ? `<div class="meta">
        ${data.category ? `<span class="badge badge-cat">${esc(data.category)}</span>` : ''}
        <span class="badge">${esc(yieldBadge)}</span>
        ${data.batchLabel ? `<span class="badge">${esc(data.batchLabel)}</span>` : ''}
        ${data.prepTimeMinutes > 0 ? `<span class="badge">Prep ${data.prepTimeMinutes} min</span>` : ''}
        ${data.cookTimeMinutes > 0 ? `<span class="badge">Cook ${data.cookTimeMinutes} min</span>` : ''}
      </div>` : ''}
    </div>
    <div class="brand">
      <img src="${esc(logoUrl)}" alt="${isCustomLogo ? esc(data.name) + ' logo' : 'ZRecipe'}" />
      ${isCustomLogo ? '' : `<p class="sub">food costing software</p><p class="sub">${today}</p>`}
    </div>
  </div>`

  const footer = `<div class="footer">
    <span>Recipe: ${esc(data.name)} &middot; ${today}</span>
    <span>www.zrecipe.ie — food costing software</span>
  </div>`

  let bodyHtml: string

  if (options.orientation === 'landscape') {
    const photosCol = hasPhotos
      ? `<div class="photos-col">${photoGrid(images, true)}</div>`
      : ''
    const content = `<div class="content-col">
      ${ingredientsHtml}
      ${shoppingListHtml}
      ${hasMethod ? `<p class="section-title">Method</p>${methodList(data.instructions)}` : ''}
      ${hasNotes ? notesBox(data.description) : ''}
      ${options.includeAllergens ? `<p class="section-title">Allergen Information (EU Reg. 1169/2011)</p>${allergenBox(data.allergensContains, data.allergensMayContain)}` : ''}
    </div>`
    bodyHtml = `<div class="page landscape">
      ${header}
      <div class="layout" style="display:flex;gap:22px;flex:1;min-height:0;">
        ${photosCol}
        ${content}
      </div>
      ${footer}
    </div>`
  } else {
    bodyHtml = `<div class="page portrait">
      ${header}
      <div class="portrait-content">
        ${hasPhotos ? photoGrid(images, false, PORTRAIT_PHOTO_MAX_HEIGHT_MM) : ''}
        ${hasNotes ? notesBox(data.description) : ''}
        ${ingredientsHtml}
        ${shoppingListHtml}
        ${hasMethod ? `<p class="section-title">Method</p>${methodList(data.instructions)}` : ''}
        ${options.includeAllergens ? `<p class="section-title">Allergen Information (EU Reg. 1169/2011)</p>${allergenBox(data.allergensContains, data.allergensMayContain)}` : ''}
      </div>
      ${footer}
    </div>`
  }

  const pageSize = options.orientation === 'landscape' ? 'A4 landscape' : 'A4'
  // A4 minus the 15 mm @page margins: 267 × 180 mm landscape,
  // 180 × 267 mm portrait. A fixed frame keeps the footer on page one.
  const pageFrame = options.orientation === 'landscape'
    ? `.page { width:267mm; height:180mm; min-height:180mm; max-height:180mm; }
       .layout { min-height:0; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }`
    : `.page { width:180mm; height:267mm; min-height:267mm; max-height:267mm; }
       .portrait-content { flex:1; min-height:0; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }`
  const photosColWidth = options.orientation === 'landscape'
    ? `.photos-col { width:42%; height:100%; max-height:${LANDSCAPE_PHOTO_MAX_HEIGHT_MM}mm; min-height:0; flex-shrink:0; align-self:stretch; display:flex; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }
       .content-col { flex:1; min-width:0; min-height:0; overflow:hidden; }`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(data.name)}${data.batchLabel ? ` — ${esc(data.batchLabel)}` : ''} — Kitchen Card</title>
  <style>
    @page { size: ${pageSize}; margin: 15mm; }
    ${baseStyle}
    ${pageFrame}
    ${photosColWidth}
    @media print {
      html, body { width:100%; height:auto; overflow:hidden; }
      .page { break-after:avoid; page-break-after:avoid; }
    }
  </style>
</head>
<body>
  ${bodyHtml}
  <button class="print-btn no-print" onclick="window.print()">🖨 Print</button>
</body>
</html>`
}
