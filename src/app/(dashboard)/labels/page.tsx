'use client'

import { useEffect, useRef, useState } from 'react'
import { Tag, Search, Plus, Minus, Trash2, Printer, Eye, Pencil, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { EU_ALLERGENS } from '@/lib/allergens'
import type { IngredientAllergen } from '@/lib/allergens'

// ── Types ────────────────────────────────────────────────────────────────────

interface LabelData {
  productName: string
  businessName: string
  category: string
  batchId: string
  yieldQty: string
  productionDate: string
  expiryDate: string
  ingredients: string
  storageInstructions: string
  weight: string
  allergens: string[]
}

type StringLabelField = Exclude<keyof LabelData, 'allergens'>

interface LabelItem {
  recipeId: string
  recipeName: string
  quantity: number
  labelData: LabelData
  isEditing: boolean
}

interface EditingLabel {
  recipeId: string
  recipeName: string
  quantity: number
  labelData: LabelData
}

type RecipeResult = {
  id: string
  name: string
  category: string | null
  storage_instructions: string | null
}

const LABEL_SIZES = [
  { value: '62x29',   label: '62 × 29 mm',   desc: 'Brother DK-11209' },
  { value: '62x100',  label: '62 × 100 mm',  desc: 'Brother DK-11202' },
  { value: '89x36',   label: '89 × 36 mm',   desc: 'Dymo 99012' },
  { value: '101x152', label: '101 × 152 mm', desc: 'Shipping label' },
  { value: 'a4-grid', label: 'A4 Grid',       desc: '3 × 7 per sheet' },
  { value: 'custom',  label: 'Custom',        desc: 'Set your own size' },
]

const SIZE_MAP: Record<string, { w: number; h: number }> = {
  '62x29':   { w: 62,   h: 29 },
  '62x100':  { w: 62,   h: 100 },
  '89x36':   { w: 89,   h: 36 },
  '101x152': { w: 101,  h: 152 },
  'a4-grid': { w: 63.5, h: 38.1 },
  'custom':  { w: 62,   h: 100 },
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LabelsPage() {
  const [labelQueue, setLabelQueue] = useState<LabelItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<RecipeResult[]>([])
  const [editingNewLabel, setEditingNewLabel] = useState<EditingLabel | null>(null)
  const [labelSize, setLabelSize] = useState('62x100')
  const [printerType, setPrinterType] = useState<'roll' | 'sheet'>('roll')
  const [labelsPerRow, setLabelsPerRow] = useState(3)
  const [labelsPerCol, setLabelsPerCol] = useState(7)
  const [customWidth, setCustomWidth] = useState(62)
  const [customHeight, setCustomHeight] = useState(100)
  const [tenantName, setTenantName] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: memberRow } = await supabase
        .from('tenant_users').select('tenant_id')
        .eq('user_id', user.id).limit(1).maybeSingle()
      const tid = (memberRow as { tenant_id: string } | null)?.tenant_id
      if (!tid) return
      const { data: tenantData } = await supabase
        .from('tenants').select('name').eq('id', tid).single()
      if ((tenantData as { name?: string } | null)?.name) {
        setTenantName((tenantData as { name: string }).name)
      }
    }
    load().catch(console.error)
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Simple search — no joins, no allergens, just recipe metadata
  const handleSearch = async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return }
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('recipes') as any)
      .select('id, name, category, storage_instructions')
      .ilike('name', `%${query}%`)
      .neq('is_active', false)
      .limit(5)
    if (error) console.error('[label search]', error)
    setSearchResults((data ?? []) as RecipeResult[])
  }

  // On recipe select — fetch ingredients + allergens fresh by recipe_id
  const handleSelectRecipe = async (recipe: RecipeResult) => {
    const supabase = createClient()

    // Fetch ingredient IDs + names in one query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: riData } = await (supabase.from('recipe_ingredients') as any)
      .select('ingredient_id, ingredient:ingredients ( id, name )')
      .eq('recipe_id', recipe.id)

    const ingredientNames: string[] = (riData ?? [])
      .map((ri: { ingredient?: { name?: string } | null }) => ri.ingredient?.name)
      .filter(Boolean)

    const ingredientIds: string[] = (riData ?? [])
      .map((ri: { ingredient?: { id?: string } | null }) => ri.ingredient?.id)
      .filter(Boolean)

    // Fetch allergens via the authenticated API endpoint (uses admin client + EU_ALLERGENS mapping)
    let allergens: string[] = []
    if (ingredientIds.length > 0) {
      try {
        const res = await fetch(`/api/ingredients/allergens?ids=${ingredientIds.join(',')}`)
        if (res.ok) {
          const allergenMap = await res.json() as Record<string, IngredientAllergen[]>
          const seenIds = new Set<number>()
          Object.values(allergenMap).forEach((list) =>
            list.filter((a) => a.status === 'contains').forEach((a) => seenIds.add(a.allergenId))
          )
          allergens = Array.from(seenIds)
            .map((id) => EU_ALLERGENS.find((e) => e.id === id)?.shortName ?? '')
            .filter(Boolean)
        }
      } catch {
        // non-critical
      }
    }

    setEditingNewLabel({
      recipeId: recipe.id,
      recipeName: recipe.name,
      quantity: 1,
      labelData: {
        productName: recipe.name,
        businessName: tenantName,
        category: '',
        batchId: '',
        yieldQty: '',
        productionDate: new Date().toISOString().split('T')[0],
        expiryDate: '',
        ingredients: ingredientNames.join(', '),
        storageInstructions: recipe.storage_instructions ?? '',
        weight: '',
        allergens,
      },
    })
    setSearchQuery('')
    setSearchResults([])
  }

  const confirmAddToQueue = () => {
    if (!editingNewLabel) return
    setLabelQueue((prev) => [...prev, {
      recipeId: editingNewLabel.recipeId,
      recipeName: editingNewLabel.recipeName,
      quantity: Math.max(1, editingNewLabel.quantity),
      isEditing: false,
      labelData: editingNewLabel.labelData,
    }])
    setEditingNewLabel(null)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  const setEditField = (field: StringLabelField, value: string) => {
    if (!editingNewLabel) return
    setEditingNewLabel({ ...editingNewLabel, labelData: { ...editingNewLabel.labelData, [field]: value } })
  }

  const updateQuantity = (index: number, qty: number) => {
    setLabelQueue((prev) => prev.map((item, i) =>
      i === index ? { ...item, quantity: Math.min(100, Math.max(1, qty || 1)) } : item
    ))
  }

  const removeFromQueue = (index: number) => {
    setLabelQueue((prev) => prev.filter((_, i) => i !== index))
  }

  const toggleEdit = (index: number) => {
    setLabelQueue((prev) => prev.map((item, i) =>
      i === index ? { ...item, isEditing: !item.isEditing } : item
    ))
  }

  const updateLabelField = (index: number, field: StringLabelField, value: string) => {
    setLabelQueue((prev) => prev.map((item, i) =>
      i === index ? { ...item, labelData: { ...item.labelData, [field]: value } } : item
    ))
  }

  // ── Print ─────────────────────────────────────────────────────────────────

  const handlePrintAllLabels = () => {
    const win = window.open('', '_blank')
    if (!win) return

    const size = labelSize === 'custom'
      ? { w: customWidth, h: customHeight }
      : (SIZE_MAP[labelSize] ?? SIZE_MAP['62x100'])

    const isRoll = printerType === 'roll'
    const cols = isRoll ? 1 : labelsPerRow

    const allLabels: LabelData[] = labelQueue.flatMap((item) =>
      Array.from({ length: item.quantity }, () => ({
        ...item.labelData,
        allergens: item.labelData.allergens ?? [],
      }))
    )

    const renderLabel = (label: LabelData) => {
      let ingredientsHtml = label.ingredients || ''
      const allergens = label.allergens ?? []
      allergens.forEach((a) => {
        const re = new RegExp(`(${a})`, 'gi')
        ingredientsHtml = ingredientsHtml.replace(re, '<strong style="text-transform:uppercase;">$1</strong>')
      })

      const fmtDate = (d: string) => d
        ? new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: '2-digit' })
        : ''
      const prodDate = fmtDate(label.productionDate)
      const expDate = fmtDate(label.expiryDate)

      // All sizes scale proportionally based on label height (base = 100mm)
      const scale = size.h / 100
      const clamp = (min: number, val: number, max: number) => Math.max(min, Math.min(max, val))
      const fs = {
        name:        clamp(8,  Math.round(16 * scale), 22),
        business:    clamp(5,  Math.round(8 * scale),  12),
        sectionHead: clamp(4,  Math.round(6 * scale),  9),
        body:        clamp(5,  Math.round(8 * scale),  11),
        allergen:    clamp(5,  Math.round(7 * scale),  10),
        meta:        clamp(4,  Math.round(6 * scale),  8),
        metaVal:     clamp(5,  Math.round(7 * scale),  9),
      }
      const pad = clamp(2, Math.round(4 * scale), 8)
      const gap = clamp(1, Math.round(3 * scale), 6)
      const radius = clamp(2, Math.round(4 * scale), 8)

      // Truncate ingredients to fit available space
      const pxPerMm = 3.78
      const innerW = (size.w - pad * 2) * pxPerMm
      const charsPerLine = Math.floor(innerW / (fs.body * 0.52))
      const fixedH = fs.name + fs.business + fs.sectionHead +
        (allergens.length > 0 ? fs.allergen * 2 + gap * 4 : 0) +
        (label.weight ? fs.body + gap : 0) +
        (label.storageInstructions ? fs.meta + gap : 0) +
        fs.metaVal * 2 + gap * 8 + pad * 2 * pxPerMm
      const availH = size.h * pxPerMm - fixedH
      const maxLines = Math.max(1, Math.floor(availH / (fs.body * 1.35)))
      const maxChars = charsPerLine * maxLines
      const truncated = ingredientsHtml.length > maxChars
        ? ingredientsHtml.slice(0, maxChars) + '…'
        : ingredientsHtml

      return `<div class="label" style="width:${size.w}mm;height:${size.h}mm;border:1.5px solid #1e293b;border-radius:${radius}px;padding:${pad}mm;box-sizing:border-box;overflow:hidden;page-break-inside:avoid;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;">
        <p style="font-size:${fs.name}px;font-weight:900;line-height:1.1;margin:0 0 ${gap * 0.3}px 0;">${label.productName}</p>
        ${label.businessName ? `<p style="font-size:${fs.business}px;color:#6b7280;font-weight:500;margin:0 0 ${gap}px 0;line-height:1.2;">${label.businessName}</p>` : ''}
        <p style="font-size:${fs.sectionHead}px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 ${gap * 0.3}px 0;">Ingredients</p>
        <p style="font-size:${fs.body}px;color:#374151;line-height:1.3;margin:0;flex:1;overflow:hidden;">${truncated}</p>
        ${allergens.length > 0 ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:${clamp(2, Math.round(3 * scale), 6)}px;padding:${clamp(1, Math.round(2 * scale), 4)}px ${clamp(2, Math.round(3 * scale), 6)}px;margin:${gap * 0.5}px 0;"><p style="font-size:${fs.allergen - 1}px;font-weight:800;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 1px 0;">Contains</p><p style="font-size:${fs.allergen}px;font-weight:700;color:#991b1b;margin:0;">${allergens.join(', ')}</p></div>` : ''}
        ${label.storageInstructions ? `<p style="font-size:${fs.meta}px;color:#6b7280;font-style:italic;margin:${gap * 0.3}px 0;line-height:1.2;">${label.storageInstructions}</p>` : ''}
        ${label.weight ? `<p style="font-size:${fs.body}px;font-weight:700;margin:${gap * 0.3}px 0;">Net Wt: ${label.weight}</p>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:${clamp(1, Math.round(2 * scale), 4)}px;border-top:1px solid #e5e7eb;padding-top:${clamp(1, Math.round(2 * scale), 4)}px;margin-top:auto;">
          ${label.batchId ? `<div><p style="font-size:${fs.meta - 1}px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;margin:0;">Batch</p><p style="font-size:${fs.metaVal}px;font-weight:600;color:#374151;margin:0;">${label.batchId}</p></div>` : '<div></div>'}
          ${label.yieldQty ? `<div><p style="font-size:${fs.meta - 1}px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;margin:0;">Yield</p><p style="font-size:${fs.metaVal}px;font-weight:600;color:#374151;margin:0;">${label.yieldQty} units</p></div>` : '<div></div>'}
          ${prodDate ? `<div><p style="font-size:${fs.meta - 1}px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;margin:0;">Produced</p><p style="font-size:${fs.metaVal}px;font-weight:600;color:#374151;margin:0;">${prodDate}</p></div>` : '<div></div>'}
          ${expDate ? `<div><p style="font-size:${fs.meta - 1}px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;margin:0;">Best Before</p><p style="font-size:${fs.metaVal}px;font-weight:600;color:#374151;margin:0;">${expDate}</p></div>` : '<div></div>'}
        </div>
      </div>`
    }

    const labelsHtml = isRoll
      ? allLabels.map(renderLabel).join('')
      : `<div style="display:grid;grid-template-columns:repeat(${cols},${size.w}mm);grid-auto-rows:${size.h}mm;gap:0;justify-content:center;">${allLabels.map(renderLabel).join('')}</div>`

    win.document.write(`<!DOCTYPE html><html><head><title>Labels — ZRecipe</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;${isRoll ? '' : 'padding:5mm;'}}
      @media print{body{padding:0}.no-print{display:none!important}${isRoll ? `@page{size:${size.w}mm ${size.h}mm;margin:0}.label{page-break-after:always}` : `@page{size:A4;margin:10mm}`}}
      .print-bar{position:fixed;bottom:0;left:0;right:0;background:white;border-top:1px solid #eee;padding:12px 24px;display:flex;justify-content:space-between;align-items:center;z-index:100}
      .print-btn{background:#059669;color:white;border:none;padding:10px 24px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
      .print-btn:hover{background:#047857}
    </style></head><body>
      ${labelsHtml}
      <div class="print-bar no-print">
        <span style="font-size:13px;color:#666;">${allLabels.length} label${allLabels.length !== 1 ? 's' : ''} · ${size.w}×${size.h}mm${isRoll ? ' · roll' : ` · ${cols} per row`}</span>
        <button class="print-btn" onclick="window.print()">Print Labels</button>
      </div>
    </body></html>`)
    win.document.close()
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const totalLabels = labelQueue.reduce((sum, i) => sum + i.quantity, 0)
  const currentSize = labelSize === 'custom'
    ? { w: customWidth, h: customHeight }
    : (SIZE_MAP[labelSize] ?? SIZE_MAP['62x100'])

  // For sheet preview: scale A4 to fit ~300px wide
  const A4_W_PX = 794  // 210mm at 96dpi
  const A4_H_PX = 1123 // 297mm at 96dpi
  const SHEET_SCALE = 0.34
  const sheetPreviewW = Math.round(A4_W_PX * SHEET_SCALE)
  const sheetPreviewH = Math.round(A4_H_PX * SHEET_SCALE)

  // For roll preview: scale label to max 280px wide
  const rollScale = Math.min(1, 280 / (currentSize.w * 3.78))
  const rollPreviewW = Math.round(currentSize.w * 3.78 * rollScale)
  const rollPreviewH = Math.round(currentSize.h * 3.78 * rollScale)

  // Flatten queue items to a flat array of LabelData for the sheet preview
  const flatLabels: LabelData[] = []
  labelQueue.forEach((item) => {
    for (let i = 0; i < item.quantity; i++) flatLabels.push(item.labelData)
  })
  const pagesNeeded = Math.ceil(totalLabels / (labelsPerRow * labelsPerCol))

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100'
  const modalLabelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500'
  const queueInputCls = 'w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-emerald-400 focus:outline-none'
  const queueLabelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
          <Tag className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Label Printing</h1>
          <p className="text-sm text-slate-500">Batch print for Brother, Dymo, Zebra and A4 sheets</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">

        {/* ── LEFT: Label Queue ─────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-gray-800">Label Queue</h2>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                void handleSearch(e.target.value)
              }}
              placeholder="Search recipes to add labels…"
              className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
            {searchQuery && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                {searchResults.map((recipe) => (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => void handleSelectRecipe(recipe)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-emerald-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{recipe.name}</p>
                      <p className="text-xs text-gray-400">{recipe.category ?? 'Uncategorised'}</p>
                    </div>
                    <Plus className="h-4 w-4 text-emerald-500" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Queue items */}
          {labelQueue.length > 0 ? (
            <>
              <div className="mb-4 space-y-2">
                {labelQueue.map((item, index) => (
                  <div key={`${item.recipeId}-${index}`} className="overflow-hidden rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Tag className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        <span className="truncate text-sm font-medium text-gray-800">
                          {item.labelData.productName}
                        </span>
                        {item.labelData.allergens.length > 0 && (
                          <span className="flex-shrink-0 rounded-full border border-red-100 bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">
                            {item.labelData.allergens.length} allergen{item.labelData.allergens.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white">
                          <button type="button" onClick={() => updateQuantity(index, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                            <Minus className="h-3 w-3" />
                          </button>
                          <input type="number" value={item.quantity}
                            onChange={(e) => updateQuantity(index, Number(e.target.value))}
                            className="w-10 border-0 text-center text-sm font-semibold focus:outline-none"
                            min={1} max={100} />
                          <button type="button" onClick={() => updateQuantity(index, item.quantity + 1)}
                            className="p-1.5 text-gray-400 hover:text-gray-600">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <button type="button" onClick={() => toggleEdit(index)}
                          className={cn('rounded-lg p-1.5 transition-colors',
                            item.isEditing ? 'bg-emerald-50 text-emerald-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => removeFromQueue(index)}
                          className="p-1.5 text-gray-400 transition-colors hover:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {item.isEditing && (
                      <div className="space-y-3 border-t border-gray-100 bg-white px-4 py-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={queueLabelCls}>Product Name</label>
                            <input type="text" value={item.labelData.productName}
                              onChange={(e) => updateLabelField(index, 'productName', e.target.value)}
                              className={queueInputCls} />
                          </div>
                          <div>
                            <label className={queueLabelCls}>Net Weight</label>
                            <input type="text" value={item.labelData.weight}
                              onChange={(e) => updateLabelField(index, 'weight', e.target.value)}
                              placeholder="e.g. 250g" className={queueInputCls} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={queueLabelCls}>Batch ID</label>
                            <input type="text" value={item.labelData.batchId}
                              onChange={(e) => updateLabelField(index, 'batchId', e.target.value)}
                              placeholder="e.g. B-001" className={queueInputCls} />
                          </div>
                          <div>
                            <label className={queueLabelCls}>Best Before</label>
                            <input type="date" value={item.labelData.expiryDate}
                              onChange={(e) => updateLabelField(index, 'expiryDate', e.target.value)}
                              className={queueInputCls} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={queueLabelCls}>Production Date</label>
                            <input type="date" value={item.labelData.productionDate}
                              onChange={(e) => updateLabelField(index, 'productionDate', e.target.value)}
                              className={queueInputCls} />
                          </div>
                          <div>
                            <label className={queueLabelCls}>Storage</label>
                            <input type="text" value={item.labelData.storageInstructions}
                              onChange={(e) => updateLabelField(index, 'storageInstructions', e.target.value)}
                              placeholder="e.g. Store cool, dry" className={queueInputCls} />
                          </div>
                        </div>
                        <div>
                          <label className={queueLabelCls}>Ingredients List</label>
                          <textarea value={item.labelData.ingredients}
                            onChange={(e) => updateLabelField(index, 'ingredients', e.target.value)}
                            rows={2} className={cn(queueInputCls, 'resize-none')} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-800">{totalLabels}</span>{' '}
                  label{totalLabels !== 1 ? 's' : ''} from {labelQueue.length} recipe{labelQueue.length !== 1 ? 's' : ''}
                </p>
                <button type="button" onClick={() => setLabelQueue([])}
                  className="text-xs text-gray-400 transition-colors hover:text-red-400">
                  Clear all
                </button>
              </div>
            </>
          ) : (
            <div className="py-12 text-center">
              <Tag className="mx-auto mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm font-medium text-gray-400">No labels in queue</p>
              <p className="mt-1 text-xs text-gray-300">Search and add recipes above</p>
            </div>
          )}
        </div>

        {/* ── RIGHT: Settings + Preview ─────────────────────────────────── */}
        <div className="space-y-4">

          {/* Label Size */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-gray-800">Label Size</h3>
            <div className="grid grid-cols-2 gap-2">
              {LABEL_SIZES.map((size) => (
                <button key={size.value} type="button" onClick={() => setLabelSize(size.value)}
                  className={cn('rounded-xl border-2 p-3 text-left transition-all',
                    labelSize === size.value ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-gray-300')}>
                  <p className="text-sm font-medium text-gray-800">{size.label}</p>
                  <p className="text-[10px] text-gray-400">{size.desc}</p>
                </button>
              ))}
            </div>
            {labelSize === 'custom' && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={queueLabelCls}>Width (mm)</label>
                  <input type="number" value={customWidth}
                    onChange={(e) => setCustomWidth(Number(e.target.value))}
                    className={queueInputCls} min={20} max={200} />
                </div>
                <div>
                  <label className={queueLabelCls}>Height (mm)</label>
                  <input type="number" value={customHeight}
                    onChange={(e) => setCustomHeight(Number(e.target.value))}
                    className={queueInputCls} min={20} max={300} />
                </div>
              </div>
            )}
          </div>

          {/* Printer Type */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-gray-800">Printer Type</h3>
            <div className="mb-3 flex rounded-lg bg-gray-100 p-0.5">
              {(['roll', 'sheet'] as const).map((type) => (
                <button key={type} type="button" onClick={() => setPrinterType(type)}
                  className={cn('flex-1 rounded-md py-2 text-sm font-medium transition-all',
                    printerType === type ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500')}>
                  {type === 'roll' ? 'Roll (continuous)' : 'Sheet / A4'}
                </button>
              ))}
            </div>
            {printerType === 'sheet' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={queueLabelCls}>Labels per row</label>
                  <input type="number" value={labelsPerRow}
                    onChange={(e) => setLabelsPerRow(Math.min(5, Math.max(1, Number(e.target.value))))}
                    className={queueInputCls} min={1} max={5} />
                </div>
                <div>
                  <label className={queueLabelCls}>Labels per column</label>
                  <input type="number" value={labelsPerCol}
                    onChange={(e) => setLabelsPerCol(Math.min(15, Math.max(1, Number(e.target.value))))}
                    className={queueInputCls} min={1} max={15} />
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800">Preview</h3>
              <span className="text-[10px] text-gray-400">
                {currentSize.w} × {currentSize.h} mm · {printerType === 'roll' ? 'Roll' : `${labelsPerRow}×${labelsPerCol} per page`}
              </span>
            </div>

            <div className="overflow-hidden rounded-xl bg-gray-100 p-4">
              {labelQueue.length > 0 ? (
                printerType === 'sheet' ? (
                  // A4 sheet preview — scaled down full page with grid
                  <div style={{ width: sheetPreviewW, height: sheetPreviewH, overflow: 'hidden', position: 'relative', margin: '0 auto' }}>
                    <div style={{
                      width: A4_W_PX, minHeight: A4_H_PX,
                      background: 'white', padding: '38px',
                      transform: `scale(${SHEET_SCALE})`, transformOrigin: 'top left',
                      position: 'absolute', top: 0, left: 0,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${labelsPerRow}, ${currentSize.w}mm)`,
                        gridAutoRows: `${currentSize.h}mm`,
                        gap: '2mm',
                        justifyContent: 'start',
                      }}>
                        {flatLabels.slice(0, labelsPerRow * labelsPerCol).map((label, i) => (
                          <div key={i} style={{
                            width: `${currentSize.w}mm`, height: `${currentSize.h}mm`,
                            border: '1.5px solid #1e293b', borderRadius: '4px',
                            padding: '3mm', overflow: 'hidden',
                            fontFamily: '-apple-system, sans-serif',
                            display: 'flex', flexDirection: 'column',
                          }}>
                            <p style={{ fontWeight: 900, fontSize: '10px', lineHeight: 1.1, margin: 0 }}>
                              {label.productName}
                            </p>
                            {label.businessName && (
                              <p style={{ fontSize: '6px', color: '#888', margin: '1px 0' }}>
                                {label.businessName}
                              </p>
                            )}
                            <p style={{ fontSize: '5px', fontWeight: 800, color: '#888', textTransform: 'uppercase', margin: '3px 0 1px' }}>
                              Ingredients
                            </p>
                            <p style={{ fontSize: '5.5px', color: '#333', lineHeight: 1.3, overflow: 'hidden', margin: 0, flex: 1 }}>
                              {label.ingredients.slice(0, 60)}{label.ingredients.length > 60 ? '…' : ''}
                            </p>
                            {label.allergens.length > 0 && (
                              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '2px', padding: '1px 2px', margin: '2px 0' }}>
                                <p style={{ fontSize: '5px', fontWeight: 800, color: '#dc2626' }}>
                                  CONTAINS: {label.allergens.join(', ')}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Roll preview — single label
                  <div style={{ width: rollPreviewW, height: rollPreviewH, overflow: 'hidden', margin: '0 auto' }}>
                    <div style={{
                      border: '2px solid #1e293b', borderRadius: '6px', padding: '8px',
                      background: 'white', width: rollPreviewW, height: rollPreviewH,
                    }}>
                      <p style={{ fontWeight: 900, fontSize: 11, lineHeight: 1.1 }}>
                        {labelQueue[0].labelData.productName}
                      </p>
                      {labelQueue[0].labelData.businessName && (
                        <p style={{ fontSize: 7, color: '#6b7280', marginTop: 1 }}>
                          {labelQueue[0].labelData.businessName}
                        </p>
                      )}
                      <p style={{ fontSize: 5, color: '#6b7280', marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>
                        Ingredients
                      </p>
                      <p style={{ fontSize: 6, color: '#374151', lineHeight: 1.3 }}>
                        {labelQueue[0].labelData.ingredients.slice(0, 120)}
                        {labelQueue[0].labelData.ingredients.length > 120 ? '…' : ''}
                      </p>
                      {labelQueue[0].labelData.allergens.length > 0 && (
                        <div style={{ marginTop: 3, padding: '2px 4px', background: '#fef2f2', borderRadius: 3, border: '1px solid #fca5a5' }}>
                          <p style={{ fontSize: 5, fontWeight: 800, color: '#dc2626' }}>
                            CONTAINS: {labelQueue[0].labelData.allergens.join(', ')}
                          </p>
                        </div>
                      )}
                      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 5, color: '#9ca3af' }}>
                        <span>{labelQueue[0].labelData.batchId}</span>
                        <span>
                          {labelQueue[0].labelData.productionDate
                            ? new Date(labelQueue[0].labelData.productionDate).toLocaleDateString('en-IE', { day: '2-digit', month: '2-digit', year: '2-digit' })
                            : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex min-h-[140px] items-center justify-center text-center">
                  <div>
                    <Eye className="mx-auto mb-1 h-6 w-6 text-gray-300" />
                    <p className="text-xs text-gray-400">Add a recipe to preview</p>
                  </div>
                </div>
              )}
            </div>

            {labelQueue.length > 0 && printerType === 'sheet' && (
              <p className="mt-2 text-center text-[10px] text-gray-400">
                {pagesNeeded} page{pagesNeeded > 1 ? 's' : ''} needed ·{' '}
                {Math.min(totalLabels, labelsPerRow * labelsPerCol)} shown in preview
              </p>
            )}
          </div>

          {/* Print button */}
          <button type="button" onClick={handlePrintAllLabels} disabled={labelQueue.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Printer className="h-5 w-5" />
            Print {totalLabels} Label{totalLabels !== 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {/* ── New Label Modal ──────────────────────────────────────────────────── */}
      {editingNewLabel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEditingNewLabel(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Label Details</h2>
                <p className="text-sm text-gray-500">{editingNewLabel.recipeName}</p>
              </div>
              <button type="button" onClick={() => setEditingNewLabel(null)}
                className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div>
                <label className={modalLabelCls}>Product Name</label>
                <input type="text" value={editingNewLabel.labelData.productName}
                  onChange={(e) => setEditField('productName', e.target.value)}
                  className={inputCls} autoFocus />
              </div>

              <div>
                <label className={modalLabelCls}>Business Name</label>
                <input type="text" value={editingNewLabel.labelData.businessName}
                  onChange={(e) => setEditField('businessName', e.target.value)}
                  className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={modalLabelCls}>Net Weight</label>
                  <input type="text" value={editingNewLabel.labelData.weight}
                    onChange={(e) => setEditField('weight', e.target.value)}
                    placeholder="e.g. 250g" className={inputCls} />
                </div>
                <div>
                  <label className={modalLabelCls}>Batch ID</label>
                  <input type="text" value={editingNewLabel.labelData.batchId}
                    onChange={(e) => setEditField('batchId', e.target.value)}
                    placeholder="e.g. B-001" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={modalLabelCls}>Production Date</label>
                  <input type="date" value={editingNewLabel.labelData.productionDate}
                    onChange={(e) => setEditField('productionDate', e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className={modalLabelCls}>Best Before / Use By</label>
                  <input type="date" value={editingNewLabel.labelData.expiryDate}
                    onChange={(e) => setEditField('expiryDate', e.target.value)}
                    className={inputCls} />
                </div>
              </div>

              <div>
                <label className={modalLabelCls}>Ingredients List</label>
                <textarea value={editingNewLabel.labelData.ingredients}
                  onChange={(e) => setEditField('ingredients', e.target.value)}
                  rows={3} className={cn(inputCls, 'resize-none')} />
                <p className="mt-1 text-xs text-gray-400">
                  Allergens will be highlighted in bold automatically
                </p>
              </div>

              <div>
                <label className={modalLabelCls}>Storage Instructions</label>
                <input type="text" value={editingNewLabel.labelData.storageInstructions}
                  onChange={(e) => setEditField('storageInstructions', e.target.value)}
                  placeholder="e.g. Store in a cool, dry place" className={inputCls} />
              </div>

              <div>
                <label className={modalLabelCls}>Number of Labels</label>
                <div className="flex items-center gap-2">
                  <input type="number"
                    value={editingNewLabel.quantity}
                    onChange={(e) => setEditingNewLabel({ ...editingNewLabel, quantity: Math.max(1, Number(e.target.value)) })}
                    className="w-24 rounded-xl border border-gray-200 px-3 py-2.5 text-center text-sm focus:border-emerald-400 focus:outline-none"
                    min={1} />
                  <span className="text-sm text-gray-400">labels</span>
                </div>
              </div>

              {editingNewLabel.labelData.allergens.length > 0 && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-red-600">
                    Allergens (auto-detected)
                  </p>
                  <p className="text-sm font-semibold text-red-700">
                    {editingNewLabel.labelData.allergens.join(', ')}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
              <button type="button" onClick={() => setEditingNewLabel(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={confirmAddToQueue}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700">
                <Plus className="h-4 w-4" />
                Add to Queue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
