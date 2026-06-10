'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Tag, Search, Plus, Minus, Trash2, Printer, Eye, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

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

type RecipeResult = {
  id: string
  name: string
  category: string | null
  storage_instructions: string | null
  recipe_ingredients: Array<{
    ingredient: { name: string } | null
  }>
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
  '62x29':   { w: 62,    h: 29 },
  '62x100':  { w: 62,    h: 100 },
  '89x36':   { w: 89,    h: 36 },
  '101x152': { w: 101,   h: 152 },
  'a4-grid': { w: 63.5,  h: 38.1 },
  'custom':  { w: 62,    h: 100 },
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LabelsPage() {
  const [labelQueue, setLabelQueue] = useState<LabelItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<RecipeResult[]>([])
  const [labelSize, setLabelSize] = useState('62x100')
  const [printerType, setPrinterType] = useState<'roll' | 'sheet'>('roll')
  const [labelsPerRow, setLabelsPerRow] = useState(3)
  const [labelsPerCol, setLabelsPerCol] = useState(7)
  const [customWidth, setCustomWidth] = useState(62)
  const [customHeight, setCustomHeight] = useState(100)
  const [tenantName, setTenantName] = useState('')
  const [tenantId, setTenantId] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: memberRow } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      const tid = (memberRow as { tenant_id: string } | null)?.tenant_id
      if (!tid) return
      setTenantId(tid)
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', tid)
        .single()
      if ((tenantData as { name?: string } | null)?.name) {
        setTenantName((tenantData as { name: string }).name)
      }
    }
    load().catch(console.error)
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return }
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (supabase.from('recipes') as any)
      .select(`id, name, category, storage_instructions,
        recipe_ingredients!recipe_ingredients_recipe_id_fkey (
          ingredient:ingredients ( name )
        )`)
      .ilike('name', `%${query}%`)
      .eq('is_active', true)
      .limit(6)
    const filtered = tenantId ? q.eq('tenant_id', tenantId) : q
    const { data } = await filtered
    setSearchResults((data ?? []) as RecipeResult[])
  }, [tenantId])

  const addToQueue = (recipe: RecipeResult) => {
    const ingredientNames = recipe.recipe_ingredients
      ?.map((ri) => ri.ingredient?.name)
      .filter(Boolean)
      .join(', ') ?? ''
    setLabelQueue((prev) => [...prev, {
      recipeId: recipe.id,
      recipeName: recipe.name,
      quantity: 1,
      isEditing: false,
      labelData: {
        productName: recipe.name,
        businessName: tenantName,
        category: '',
        batchId: '',
        yieldQty: '',
        productionDate: new Date().toISOString().split('T')[0],
        expiryDate: '',
        ingredients: ingredientNames,
        storageInstructions: recipe.storage_instructions ?? '',
        weight: '',
        allergens: [],
      },
    }])
    setSearchQuery('')
    setSearchResults([])
    searchInputRef.current?.focus()
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

    const allLabels: LabelData[] = []
    labelQueue.forEach((item) => {
      for (let i = 0; i < item.quantity; i++) allLabels.push(item.labelData)
    })

    const renderLabel = (label: LabelData) => {
      let ingredientsHtml = label.ingredients
      label.allergens.forEach((a) => {
        const re = new RegExp(`(${a})`, 'gi')
        ingredientsHtml = ingredientsHtml.replace(re, '<strong style="text-transform:uppercase;">$1</strong>')
      })
      const scale = Math.min(size.h / 100, 1)
      const nameSize = Math.max(10, Math.round(16 * scale))
      const bodySize = Math.max(6, Math.round(9 * scale))
      const metaSize = Math.max(5, Math.round(7 * scale))
      const pad = Math.max(2, Math.round(4 * scale))
      const fmtDate = (d: string) => d
        ? new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: '2-digit' })
        : ''
      return `<div class="label" style="width:${size.w}mm;height:${size.h}mm;padding:${pad}mm;border:0.5px solid #ccc;box-sizing:border-box;overflow:hidden;page-break-inside:avoid;display:flex;flex-direction:column;">
        <p style="font-size:${nameSize}px;font-weight:900;line-height:1.1;margin:0;">${label.productName}</p>
        ${label.businessName ? `<p style="font-size:${metaSize}px;color:#666;margin:1px 0 0;">${label.businessName}</p>` : ''}
        <p style="font-size:${metaSize - 1}px;font-weight:800;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:${Math.round(3 * scale)}px 0 1px;">Ingredients</p>
        <p style="font-size:${bodySize - 1}px;color:#333;line-height:1.3;margin:0;flex:1;overflow:hidden;">${ingredientsHtml}</p>
        ${label.allergens.length > 0 ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:2px;padding:1.5px 3px;margin:2px 0;"><p style="font-size:${metaSize}px;font-weight:800;color:#dc2626;margin:0;">CONTAINS: ${label.allergens.join(', ')}</p></div>` : ''}
        ${label.weight ? `<p style="font-size:${bodySize}px;font-weight:700;margin:2px 0 0;">Net Wt: ${label.weight}</p>` : ''}
        ${label.storageInstructions ? `<p style="font-size:${metaSize - 1}px;color:#888;font-style:italic;margin:1px 0;">${label.storageInstructions}</p>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:${metaSize - 1}px;color:#999;margin-top:auto;">
          ${label.batchId ? `<span>Batch: ${label.batchId}</span>` : '<span></span>'}
          <span>${fmtDate(label.productionDate) ? `Prod: ${fmtDate(label.productionDate)}` : ''}${fmtDate(label.expiryDate) ? ` · BB: ${fmtDate(label.expiryDate)}` : ''}</span>
        </div>
      </div>`
    }

    const labelsHtml = isRoll
      ? allLabels.map(renderLabel).join('')
      : `<div style="display:grid;grid-template-columns:repeat(${cols},${size.w}mm);grid-auto-rows:${size.h}mm;gap:0;justify-content:center;">${allLabels.map(renderLabel).join('')}</div>`

    win.document.write(`<!DOCTYPE html><html><head><title>Labels — ZRecipe</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;${isRoll ? '' : 'padding:5mm;'}}
      @media print{
        body{padding:0}.no-print{display:none!important}
        ${isRoll
          ? `@page{size:${size.w}mm ${size.h}mm;margin:0}.label{page-break-after:always}`
          : `@page{size:A4;margin:10mm}`}
      }
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
  const PREVIEW_MAX_W = 220
  const previewScale = Math.min(1, PREVIEW_MAX_W / currentSize.w)
  const previewW = Math.round(currentSize.w * previewScale * 3.78)
  const previewH = Math.round(currentSize.h * previewScale * 3.78)

  const inputCls = 'w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-emerald-400 focus:outline-none'
  const labelCls = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400'

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
                    onClick={() => addToQueue(recipe)}
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
                    {/* Row header */}
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
                        {/* Qty */}
                        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white">
                          <button
                            type="button"
                            onClick={() => updateQuantity(index, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(index, Number(e.target.value))}
                            className="w-10 border-0 text-center text-sm font-semibold focus:outline-none"
                            min={1}
                            max={100}
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(index, item.quantity + 1)}
                            className="p-1.5 text-gray-400 hover:text-gray-600"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        {/* Edit toggle */}
                        <button
                          type="button"
                          onClick={() => toggleEdit(index)}
                          className={cn(
                            'rounded-lg p-1.5 transition-colors',
                            item.isEditing
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                          )}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeFromQueue(index)}
                          className="p-1.5 text-gray-400 transition-colors hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Edit form */}
                    {item.isEditing && (
                      <div className="space-y-3 border-t border-gray-100 bg-white px-4 py-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>Product Name</label>
                            <input type="text" value={item.labelData.productName}
                              onChange={(e) => updateLabelField(index, 'productName', e.target.value)}
                              className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Net Weight</label>
                            <input type="text" value={item.labelData.weight}
                              onChange={(e) => updateLabelField(index, 'weight', e.target.value)}
                              placeholder="e.g. 250g" className={inputCls} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>Batch ID</label>
                            <input type="text" value={item.labelData.batchId}
                              onChange={(e) => updateLabelField(index, 'batchId', e.target.value)}
                              placeholder="e.g. B-001" className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Best Before</label>
                            <input type="date" value={item.labelData.expiryDate}
                              onChange={(e) => updateLabelField(index, 'expiryDate', e.target.value)}
                              className={inputCls} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>Production Date</label>
                            <input type="date" value={item.labelData.productionDate}
                              onChange={(e) => updateLabelField(index, 'productionDate', e.target.value)}
                              className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Storage</label>
                            <input type="text" value={item.labelData.storageInstructions}
                              onChange={(e) => updateLabelField(index, 'storageInstructions', e.target.value)}
                              placeholder="e.g. Store in a cool, dry place" className={inputCls} />
                          </div>
                        </div>
                        <div>
                          <label className={labelCls}>Ingredients List</label>
                          <textarea
                            value={item.labelData.ingredients}
                            onChange={(e) => updateLabelField(index, 'ingredients', e.target.value)}
                            rows={2}
                            className={cn(inputCls, 'resize-none')}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Queue summary */}
              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-800">{totalLabels}</span>{' '}
                  label{totalLabels !== 1 ? 's' : ''} from{' '}
                  {labelQueue.length} recipe{labelQueue.length !== 1 ? 's' : ''}
                </p>
                <button
                  type="button"
                  onClick={() => setLabelQueue([])}
                  className="text-xs text-gray-400 transition-colors hover:text-red-400"
                >
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
                <button
                  key={size.value}
                  type="button"
                  onClick={() => setLabelSize(size.value)}
                  className={cn(
                    'rounded-xl border-2 p-3 text-left transition-all',
                    labelSize === size.value
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <p className="text-sm font-medium text-gray-800">{size.label}</p>
                  <p className="text-[10px] text-gray-400">{size.desc}</p>
                </button>
              ))}
            </div>
            {labelSize === 'custom' && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Width (mm)</label>
                  <input type="number" value={customWidth}
                    onChange={(e) => setCustomWidth(Number(e.target.value))}
                    className={inputCls} min={20} max={200} />
                </div>
                <div>
                  <label className={labelCls}>Height (mm)</label>
                  <input type="number" value={customHeight}
                    onChange={(e) => setCustomHeight(Number(e.target.value))}
                    className={inputCls} min={20} max={300} />
                </div>
              </div>
            )}
          </div>

          {/* Printer Type */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-gray-800">Printer Type</h3>
            <div className="mb-3 flex rounded-lg bg-gray-100 p-0.5">
              {(['roll', 'sheet'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPrinterType(type)}
                  className={cn(
                    'flex-1 rounded-md py-2 text-sm font-medium transition-all',
                    printerType === type ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                  )}
                >
                  {type === 'roll' ? 'Roll (continuous)' : 'Sheet / A4'}
                </button>
              ))}
            </div>
            {printerType === 'sheet' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Labels per row</label>
                  <input type="number" value={labelsPerRow}
                    onChange={(e) => setLabelsPerRow(Math.min(5, Math.max(1, Number(e.target.value))))}
                    className={inputCls} min={1} max={5} />
                </div>
                <div>
                  <label className={labelCls}>Labels per column</label>
                  <input type="number" value={labelsPerCol}
                    onChange={(e) => setLabelsPerCol(Math.min(15, Math.max(1, Number(e.target.value))))}
                    className={inputCls} min={1} max={15} />
                </div>
              </div>
            )}
          </div>

          {/* Live Preview */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-gray-800">Preview</h3>
            <div className="flex min-h-[180px] items-center justify-center rounded-xl bg-gray-50 p-4">
              {labelQueue.length > 0 ? (
                <div
                  className="overflow-hidden rounded-lg border-2 border-gray-800 bg-white"
                  style={{ width: previewW, height: previewH, padding: 8 }}
                >
                  <p style={{ fontSize: 11, fontWeight: 900, lineHeight: 1.2 }}>
                    {labelQueue[0].labelData.productName}
                  </p>
                  {labelQueue[0].labelData.businessName && (
                    <p style={{ fontSize: 7, color: '#6b7280', marginTop: 1 }}>
                      {labelQueue[0].labelData.businessName}
                    </p>
                  )}
                  <p style={{ fontSize: 5, color: '#6b7280', marginTop: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
              ) : (
                <div className="text-center">
                  <Eye className="mx-auto mb-1 h-6 w-6 text-gray-300" />
                  <p className="text-xs text-gray-400">Add a recipe to preview</p>
                </div>
              )}
            </div>
            <p className="mt-2 text-center text-[10px] text-gray-400">
              {currentSize.w} × {currentSize.h} mm · Showing first label
            </p>
          </div>

          {/* Print button */}
          <button
            type="button"
            onClick={handlePrintAllLabels}
            disabled={labelQueue.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-5 w-5" />
            Print {totalLabels} Label{totalLabels !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
