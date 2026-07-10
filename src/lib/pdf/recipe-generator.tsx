import {
  Document,
  Page,
  Text,
  View,
  Image as PdfImage,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer'
import type { RecipeRecord, RecipeIngredientDraft } from '@/hooks/useRecipes'
import type { RecipeAllergenSummary } from '@/lib/allergens'
import { calculateCost, type CostInputs } from '@/lib/utils/cost-calculator'

export type PrintMode = 'kitchen' | 'cost' | 'label'

type PdfTenant = {
  labor_hourly_rate?: number | null
  name?: string | null
}

type RecipePdfOptions = {
  includesCosts?: boolean
  tenant?: PdfTenant | null
  businessName?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(value: number) {
  return `€${value.toFixed(2)}`
}

async function getImageAsBase64(url: string): Promise<string | null> {
  try {
    if (typeof window === 'undefined' || typeof FileReader === 'undefined') return null

    const resolvedUrl = new URL(url, window.location.origin).toString()
    const response = await fetch(resolvedUrl)
    if (!response.ok) return null

    const blob = await response.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function lineCost(item: RecipeIngredientDraft) {
  return item.lineCost ?? 0
}

function ingHasContains(ing: RecipeIngredientDraft) {
  return ing.allergens?.some((a) => a.status === 'contains') ?? false
}

function ingHasMayContain(ing: RecipeIngredientDraft) {
  return ing.allergens?.some((a) => a.status === 'may_contain') ?? false
}

function buildPdfCostInputs(recipe: RecipeRecord, tenant?: PdfTenant | null): CostInputs {
  return {
    ingredients: recipe.ingredients.map((item) => ({
      quantity: item.quantity,
      unit: item.unit,
      name: item.ingredientName,
      yield_percent: item.yield_percent ?? 100,
      current_price: item.currentPrice ?? null,
      price_unit: item.priceUnit ?? item.unit,
    })),
    laborMode: recipe.laborMode,
    laborCostFixed: Number(recipe.laborCost ?? 0),
    prepTimeMinutes: Number(recipe.prepTimeMinutes ?? 0),
    laborHourlyRate: Number(tenant?.labor_hourly_rate ?? 15),
    overheadMode: recipe.overheadMode,
    overheadCostFixed: Number(recipe.overheadCost ?? 0),
    overheadPercent: Number(recipe.overheadPercent ?? 0),
    wastePercent: Number(recipe.wastePercent ?? 0),
    sellingPrice: Number(recipe.sellingPrice ?? 0),
    yieldQty: Number(recipe.yieldQuantity ?? 1),
    yieldUnit: recipe.yieldUnit ?? 'portion',
    vatEnabled: false,
    vatRate: 0,
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const C = {
  text:       '#0f172a',
  muted:      '#64748b',
  light:      '#94a3b8',
  border:     '#e2e8f0',
  bgLight:    '#f8fafc',
  emerald:    '#059669',
  emeraldBg:  '#ecfdf5',
  red:        '#dc2626',
  redBg:      '#fef2f2',
  amber:      '#d97706',
  amberBg:    '#fffbeb',
  violet:     '#7c3aed',
}

const kitchen = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    color: C.text,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  // ── header ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: C.emerald,
  },
  name: {
    fontSize: 26,
    fontFamily: 'Times-Bold',
    color: C.text,
    lineHeight: 1.1,
    maxWidth: 360,
  },
  brand: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: C.emerald,
    textAlign: 'right',
  },
  brandSub: {
    fontSize: 8,
    color: C.muted,
    textAlign: 'right',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  pill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: C.bgLight,
    color: C.muted,
    fontSize: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  pillGreen: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: C.emeraldBg,
    color: C.emerald,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    borderWidth: 1,
    borderColor: '#6ee7b7',
  },
  // ── image ──
  image: {
    width: '100%',
    height: 150,
    objectFit: 'cover',
    borderRadius: 8,
    marginBottom: 14,
  },
  // ── section ──
  sectionTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
    marginTop: 14,
  },
  // ── ingredients table ──
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    breakInside: 'avoid',
  },
  tHead: {
    backgroundColor: C.bgLight,
  },
  tTotalRow: {
    backgroundColor: C.bgLight,
    borderBottomWidth: 0,
  },
  tCell: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  tCellLast: {
    borderRightWidth: 0,
  },
  tHeadText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tIngNormal: {
    fontSize: 9,
    color: C.text,
    fontFamily: 'Helvetica-Bold',
  },
  tIngAllergen: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.text,
  },
  tNum: {
    fontSize: 9,
    color: C.text,
    textAlign: 'right',
  },
  tTotalLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.text,
  },
  tTotalVal: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.text,
    textAlign: 'right',
  },
  // ── allergen box ──
  // ── checkbox ──
  cbCell: {
    width: 26,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 1,
  },
  // ── allergen box ──
  allergenBox: {
    marginTop: 14,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: C.redBg,
    breakInside: 'avoid',
  },
  allergenTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.red,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 5,
  },
  allergenContains: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#991b1b',
    marginBottom: 3,
  },
  allergenMay: {
    fontSize: 9,
    color: C.amber,
  },
  allergenNone: {
    fontSize: 9,
    color: C.muted,
    fontFamily: 'Helvetica-Oblique',
  },
  // ── instructions ──
  step: {
    fontSize: 9,
    lineHeight: 1.5,
    marginBottom: 5,
    color: C.text,
    breakInside: 'avoid',
  },
  // ── cost summary ──
  costBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bgLight,
    breakInside: 'avoid',
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
    fontSize: 9,
  },
  costLabel: {
    color: C.muted,
  },
  costValue: {
    fontFamily: 'Helvetica-Bold',
    color: C.text,
  },
  costDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginVertical: 5,
  },
  costTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 11,
  },
  costTotalLabel: {
    fontFamily: 'Helvetica-Bold',
    color: C.text,
  },
  costTotalValue: {
    fontFamily: 'Helvetica-Bold',
    color: C.text,
  },
  costMargin: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    fontSize: 10,
  },
  costMarginValue: {
    fontFamily: 'Helvetica-Bold',
    color: C.emerald,
  },
  // ── footer ──
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7.5,
    color: C.light,
  },
})

const label = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 9,
    color: C.text,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  name: {
    fontSize: 18,
    fontFamily: 'Times-Bold',
    color: C.text,
    marginBottom: 2,
  },
  producer: {
    fontSize: 9,
    color: C.muted,
    marginBottom: 10,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  allergenContains: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#991b1b',
    marginBottom: 3,
  },
  allergenMay: {
    fontSize: 9,
    color: C.amber,
  },
  allergenNone: {
    fontSize: 9,
    color: C.muted,
    fontFamily: 'Helvetica-Oblique',
  },
  blankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    fontSize: 9,
  },
  blankLine: {
    flex: 1,
    marginLeft: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    height: 12,
  },
  legalNote: {
    fontSize: 7,
    color: C.light,
    marginTop: 6,
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    right: 24,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 7,
    color: C.light,
  },
})

const report = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 9,
    color: C.text,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  // ── header ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: C.violet,
  },
  docType: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: C.violet,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  name: {
    fontSize: 20,
    fontFamily: 'Times-Bold',
    color: C.text,
    lineHeight: 1.1,
    maxWidth: 340,
  },
  brand: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: C.violet,
    textAlign: 'right',
  },
  brandSub: {
    fontSize: 8,
    color: C.muted,
    textAlign: 'right',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 5,
  },
  pill: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: C.bgLight,
    color: C.muted,
    fontSize: 7.5,
    borderWidth: 1,
    borderColor: C.border,
  },
  pillViolet: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: '#f5f3ff',
    color: C.violet,
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    borderWidth: 1,
    borderColor: '#c4b5fd',
  },
  // ── section ──
  sectionTitle: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
    marginTop: 10,
  },
  // ── ingredients table ──
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    breakInside: 'avoid',
  },
  tHead: {
    backgroundColor: C.bgLight,
  },
  tTotalRow: {
    backgroundColor: C.bgLight,
    borderBottomWidth: 0,
  },
  tCell: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 8.5,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  tCellLast: {
    borderRightWidth: 0,
  },
  tHeadText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tIngName: {
    fontSize: 8.5,
    color: C.text,
    fontFamily: 'Helvetica-Bold',
  },
  tIngNameAllergen: {
    fontSize: 8.5,
    color: C.text,
    fontFamily: 'Helvetica-Bold',
  },
  tNum: {
    fontSize: 8.5,
    color: C.text,
    textAlign: 'right',
  },
  tTotalLabel: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: C.text,
  },
  tTotalVal: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: C.text,
    textAlign: 'right',
  },
  priceNote: {
    fontSize: 7.5,
    color: C.muted,
    fontFamily: 'Helvetica-Oblique',
    marginTop: 3,
    textAlign: 'right',
  },
  // ── cost analysis box ──
  analysisBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    overflow: 'hidden',
    breakInside: 'avoid',
  },
  analysisHeader: {
    backgroundColor: '#f5f3ff',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd6fe',
  },
  analysisHeaderText: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: C.violet,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  analysisBody: {
    padding: 12,
  },
  analysisSectionLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  analysisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  analysisLabel: {
    fontSize: 8.5,
    color: C.muted,
  },
  analysisValue: {
    fontSize: 8.5,
    color: C.text,
    fontFamily: 'Helvetica-Bold',
  },
  analysisDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginVertical: 7,
  },
  analysisTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f5f3ff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginVertical: 4,
  },
  analysisTotalLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: C.text,
  },
  analysisTotalValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: C.text,
  },
  analysisKeyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  analysisKeyLabel: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: C.text,
  },
  analysisKeyValue: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
  },
  // ── allergen box ──
  allergenBox: {
    marginTop: 10,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: C.redBg,
    breakInside: 'avoid',
  },
  allergenTitle: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: C.red,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  allergenContains: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: '#991b1b',
    marginBottom: 2,
  },
  allergenMay: {
    fontSize: 8.5,
    color: C.amber,
  },
  allergenNone: {
    fontSize: 8.5,
    color: C.muted,
    fontFamily: 'Helvetica-Oblique',
  },
  // ── footer ──
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7.5,
    color: C.light,
  },
})

// ── Shared: bullet allergen lines ─────────────────────────────────────────────

type AllergenStyleSheet = Pick<typeof kitchen, 'allergenNone' | 'allergenContains' | 'allergenMay'>

function AllergenDeclaration({
  allergens,
  st,
}: {
  allergens: RecipeAllergenSummary
  st: AllergenStyleSheet
}) {
  const hasAny = allergens.contains.length > 0 || allergens.mayContain.length > 0

  if (!hasAny) {
    return (
      <Text style={st.allergenNone}>No allergens declared</Text>
    )
  }

  return (
    <View>
      {allergens.contains.length > 0 && (
        <Text style={st.allergenContains}>
          CONTAINS: {allergens.contains.map((a) => a.name.toUpperCase()).join(', ')}
        </Text>
      )}
      {allergens.mayContain.length > 0 && (
        <Text style={st.allergenMay}>
          May contain: {allergens.mayContain.map((a) => a.name.toUpperCase()).join(', ')}
        </Text>
      )}
    </View>
  )
}

// ── FORMAT 1: Kitchen Card (A4) ────────────────────────────────────────────────

function CostRow({
  label,
  value,
  bold = false,
  valueColor,
}: {
  label: string
  value: string
  bold?: boolean
  valueColor?: string
}) {
  return (
    <View style={kitchen.costRow}>
      <Text style={bold ? [kitchen.costLabel, { fontFamily: 'Helvetica-Bold', color: C.text }] : kitchen.costLabel}>
        {label}
      </Text>
      <Text
        style={[
          kitchen.costValue,
          ...(bold ? [{ fontFamily: 'Helvetica-Bold' }] : []),
          ...(valueColor ? [{ color: valueColor }] : []),
        ]}
      >
        {value}
      </Text>
    </View>
  )
}

function PhotoStrip({ images }: { images: string[] }) {
  const count = images.length
  if (count === 0) return null

  if (count === 1) {
    return <PdfImage src={images[0]} style={kitchen.image} />
  }

  const rowHeight = count <= 4 ? 110 : 85
  const cols = count <= 3 ? count : 4
  const rows: string[][] = []
  for (let i = 0; i < images.length; i += cols) {
    rows.push(images.slice(i, i + cols))
  }

  return (
    <View style={{ marginBottom: 14, gap: 4 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 4 }}>
          {row.map((src, ci) => (
            <PdfImage
              key={ci}
              src={src}
              style={{ flex: 1, height: rowHeight, objectFit: 'cover', borderRadius: 6 }}
            />
          ))}
        </View>
      ))}
    </View>
  )
}

function KitchenCardDocument({
  recipe,
  allergens,
  imagesBase64,
  logoBase64,
  includesCosts,
  tenant,
}: {
  recipe: RecipeRecord
  allergens: RecipeAllergenSummary
  imagesBase64: (string | null)[]
  logoBase64: string | null
  includesCosts: boolean
  tenant?: PdfTenant | null
}) {
  const laborRate = Number(tenant?.labor_hourly_rate ?? 15)
  const wastePercent = Number(recipe.wastePercent ?? 0)
  const yieldQty = Number(recipe.yieldQuantity ?? 1)
  const pdfCosts = calculateCost(buildPdfCostInputs(recipe, tenant))
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const yieldUnitTrimmed = (recipe.yieldUnit ?? '').trim()
  const isGenericUnit = !yieldUnitTrimmed || ['unit', 'units'].includes(yieldUnitTrimmed.toLowerCase())
  const marginColor = pdfCosts.margin >= 40 ? C.emerald : pdfCosts.margin >= 20 ? C.amber : C.red

  return (
    <Document>
      <Page size="A4" style={kitchen.page}>
        {/* ── Header ── */}
        <View style={kitchen.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={kitchen.name}>{recipe.name}</Text>
            <View style={kitchen.metaRow}>
              <Text style={kitchen.pillGreen}>{recipe.category}</Text>
              <Text style={kitchen.pill}>
                {isGenericUnit
                  ? `Yield: ${recipe.yieldQuantity}`
                  : `Yield: ${recipe.yieldQuantity} ${yieldUnitTrimmed}`}
              </Text>
              {recipe.prepTimeMinutes > 0 && (
                <Text style={kitchen.pill}>Prep {recipe.prepTimeMinutes} min</Text>
              )}
              {recipe.cookTimeMinutes > 0 && (
                <Text style={kitchen.pill}>Cook {recipe.cookTimeMinutes} min</Text>
              )}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 3 }}>
            {logoBase64 ? (
              <PdfImage src={logoBase64} style={{ width: 100, height: 36, objectFit: 'contain' }} />
            ) : (
              <Text style={kitchen.brand}>ZRecipe</Text>
            )}
            <Text style={{ fontSize: 7.5, color: C.light, textAlign: 'right' }}>food costing software</Text>
            <Text style={kitchen.brandSub}>{date}</Text>
          </View>
        </View>

        {/* ── Photo strip ── */}
        <PhotoStrip images={imagesBase64.filter(Boolean) as string[]} />

        {/* ── Description ── */}
        {recipe.description ? (
          <Text style={{ fontSize: 9, color: C.muted, marginBottom: 8, lineHeight: 1.4 }}>
            {recipe.description}
          </Text>
        ) : null}

        {/* ── Ingredients table ── */}
        <Text style={kitchen.sectionTitle}>Ingredients</Text>
        <View style={kitchen.table}>
          {/* Header */}
          <View style={[kitchen.tRow, kitchen.tHead]}>
            <View style={[kitchen.cbCell, { paddingVertical: 6 }]} />
            <Text style={[kitchen.tCell, kitchen.tHeadText, { flex: 2.25 }]}>Ingredient</Text>
            <Text style={[kitchen.tCell, kitchen.tHeadText, { flex: 1.75 }]}>Notes</Text>
            <Text
              style={
                includesCosts
                  ? [kitchen.tCell, kitchen.tHeadText, { flex: 1, textAlign: 'right' }]
                  : [kitchen.tCell, kitchen.tHeadText, kitchen.tCellLast, { flex: 1, textAlign: 'right' }]
              }
            >
              Quantity
            </Text>
            {includesCosts && (
              <Text style={[kitchen.tCell, kitchen.tHeadText, kitchen.tCellLast, { flex: 1.2, textAlign: 'right' }]}>Cost</Text>
            )}
          </View>

          {/* Rows */}
          {recipe.ingredients.map((ing, idx) => {
            const isAllergen = ingHasContains(ing)
            const isMay = !isAllergen && ingHasMayContain(ing)
            const nameStyle = isAllergen ? kitchen.tIngAllergen : kitchen.tIngNormal
            const displayName = isAllergen
              ? ing.ingredientName.toUpperCase()
              : ing.ingredientName
            const noteText = (ing.notes && ing.notes !== ing.ingredientName) ? ing.notes : ''
            const zebraStyle = idx % 2 === 1 ? { backgroundColor: '#f1f5f9' } : {}

            return (
              <View key={ing.id} style={[kitchen.tRow, zebraStyle]}>
                <View style={kitchen.cbCell}>
                  <View style={kitchen.checkbox} />
                </View>
                <View style={[kitchen.tCell, { flex: 2.25, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                  <Text style={nameStyle}>{displayName}</Text>
                  {isAllergen && <Text style={{ fontSize: 7, color: C.red }}>!</Text>}
                  {isMay && <Text style={{ fontSize: 7, color: C.amber }}>~</Text>}
                </View>
                <View style={[kitchen.tCell, { flex: 1.75 }]}>
                  <View style={{ maxHeight: 23, overflow: 'hidden' }}>
                    <Text style={{ fontSize: 8, color: C.muted, fontFamily: 'Helvetica-Oblique', lineHeight: 1.4 }}>
                      {noteText}
                    </Text>
                  </View>
                </View>
                <Text
                  style={
                    includesCosts
                      ? [kitchen.tCell, kitchen.tNum, { flex: 1 }]
                      : [kitchen.tCell, kitchen.tNum, kitchen.tCellLast, { flex: 1 }]
                  }
                >
                  {ing.quantity} {ing.unit}
                </Text>
                {includesCosts && (
                  <Text style={[kitchen.tCell, kitchen.tCellLast, kitchen.tNum, { flex: 1.2 }]}>
                    {fmt(lineCost(ing))}
                  </Text>
                )}
              </View>
            )
          })}

          {/* Total row */}
          {includesCosts && (
            <View style={[kitchen.tRow, kitchen.tTotalRow]}>
              <View style={kitchen.cbCell} />
              <Text style={[kitchen.tCell, kitchen.tTotalLabel, { flex: 2.25 }]}>Total ingredient cost</Text>
              <Text style={[kitchen.tCell, { flex: 1.75 }]} />
              <Text style={[kitchen.tCell, { flex: 1 }]} />
              <Text style={[kitchen.tCell, kitchen.tCellLast, kitchen.tTotalVal, { flex: 1.2 }]}>
                {fmt(pdfCosts.ingredientCost)}
              </Text>
            </View>
          )}
        </View>

        {/* ── Allergen declaration ── */}
        <Text style={kitchen.sectionTitle}>Allergen Information (EU Reg. 1169/2011)</Text>
        <View style={kitchen.allergenBox}>
          <Text style={kitchen.allergenTitle}>Allergen Declaration</Text>
          <AllergenDeclaration allergens={allergens} st={kitchen} />
          {(allergens.contains.length > 0 || allergens.mayContain.length > 0) && (
            <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 5 }}>
              Allergen-containing ingredients are shown in BOLD UPPERCASE in the ingredient list above.
            </Text>
          )}
        </View>

        {/* ── Instructions ── */}
        {recipe.instructions.length > 0 && recipe.instructions.some((s) => s.text.trim()) && (
          <>
            <Text style={kitchen.sectionTitle}>Method</Text>
            {recipe.instructions
              .filter((s) => s.text.trim())
              .map((step, i) => (
                <Text key={step.id} style={kitchen.step}>
                  {i + 1}. {step.text}
                </Text>
              ))}
          </>
        )}

        {/* ── Cost summary ── */}
        {includesCosts && (
          <>
            <Text style={kitchen.sectionTitle}>Cost Summary{yieldQty > 1 ? ' (batch total)' : ''}</Text>
            <View style={kitchen.costBox}>
              <CostRow label="Ingredient cost" value={fmt(pdfCosts.ingredientCost)} />
              <CostRow
                label={
                  recipe.laborMode === 'time'
                    ? `Labor (${recipe.prepTimeMinutes}min x ${fmt(laborRate)}/hr)`
                    : 'Labor cost'
                }
                value={fmt(pdfCosts.laborCost)}
              />
              <CostRow
                label={
                  recipe.overheadMode === 'percent'
                    ? `Overhead (${recipe.overheadPercent}% of ingredients)`
                    : 'Overhead'
                }
                value={fmt(pdfCosts.overheadCost)}
              />
              {wastePercent > 0 && (
                <CostRow
                  label={`Waste (${wastePercent}%)`}
                  value={`+${fmt(pdfCosts.wasteCost)}`}
                />
              )}
              <View style={kitchen.costDivider} />
              <CostRow label={yieldQty > 1 ? 'Batch total cost' : 'Total cost'} value={fmt(pdfCosts.totalCost)} bold />
              {yieldQty > 1 && (
                <CostRow
                  label="Base cost per unit"
                  value={`\u20ac${pdfCosts.costPerUnit.toFixed(3)}`}
                />
              )}
              <CostRow label={yieldQty > 1 ? 'Price per unit' : 'Selling price'} value={fmt(pdfCosts.sellingPrice)} />
              {yieldQty > 1 && (
                <CostRow
                  label="Batch total revenue"
                  value={fmt(pdfCosts.sellingPrice * yieldQty)}
                />
              )}
              <CostRow label={yieldQty > 1 ? 'Profit per unit (base)' : 'Profit per unit'} value={`${pdfCosts.profitPerUnit >= 0 ? '+' : ''}${fmt(pdfCosts.profitPerUnit)}`} />
              {yieldQty > 1 && (
                <CostRow
                  label="Batch total profit"
                  value={`${pdfCosts.profitPerUnit >= 0 ? '+' : ''}${fmt(pdfCosts.profitPerUnit * yieldQty)}`}
                  valueColor={pdfCosts.profitPerUnit >= 0 ? C.emerald : C.red}
                />
              )}
              <CostRow
                label="Margin"
                value={`${pdfCosts.margin.toFixed(1)}%`}
                valueColor={marginColor}
                bold
              />
              <CostRow label="Food cost" value={`${pdfCosts.foodCostPercent.toFixed(1)}%`} />
            </View>
          </>
        )}

        {/* ── Footer ── */}
        <View style={kitchen.footer}>
          <Text style={kitchen.footerText}>Recipe: {recipe.name} · {date}</Text>
          <Text style={kitchen.footerText}>www.zrecipe.ie — food costing software</Text>
        </View>
      </Page>
    </Document>
  )
}

// ── FORMAT 2: Full Cost Report (A4) ──────────────────────────────────────────

function CostReportDocument({
  recipe,
  allergens,
  logoBase64,
  tenant,
}: {
  recipe: RecipeRecord
  allergens: RecipeAllergenSummary
  logoBase64: string | null
  tenant?: PdfTenant | null
}) {
  const laborRate = Number(tenant?.labor_hourly_rate ?? 15)
  const wastePercent = Number(recipe.wastePercent ?? 0)
  const yieldQty = Number(recipe.yieldQuantity ?? 1)
  const pdfCosts = calculateCost(buildPdfCostInputs(recipe, tenant))
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const marginColor = pdfCosts.margin >= 40 ? C.emerald : pdfCosts.margin >= 20 ? C.amber : C.red
  const marginBg = pdfCosts.margin >= 40 ? C.emeraldBg : pdfCosts.margin >= 20 ? C.amberBg : C.redBg
  const marginBorder = pdfCosts.margin >= 40 ? '#6ee7b7' : pdfCosts.margin >= 20 ? '#fcd34d' : '#fca5a5'
  const foodCostColor = pdfCosts.foodCostPercent < 30 ? C.emerald : pdfCosts.foodCostPercent <= 35 ? C.amber : C.red
  const foodCostBg = pdfCosts.foodCostPercent < 30 ? C.emeraldBg : pdfCosts.foodCostPercent <= 35 ? C.amberBg : C.redBg
  const foodCostBorder = pdfCosts.foodCostPercent < 30 ? '#6ee7b7' : pdfCosts.foodCostPercent <= 35 ? '#fcd34d' : '#fca5a5'
  const yieldUnitTrimmed = (recipe.yieldUnit ?? '').trim()
  const isGenericUnit = !yieldUnitTrimmed || ['unit', 'units'].includes(yieldUnitTrimmed.toLowerCase())

  const laborLabel = recipe.laborMode === 'time'
    ? `Labor (${recipe.prepTimeMinutes} min × €${laborRate}/hr)`
    : 'Labor cost'
  const overheadLabel = recipe.overheadMode === 'percent'
    ? `Overhead (${recipe.overheadPercent}% of ingredients)`
    : 'Overhead'

  return (
    <Document>
      <Page size="A4" style={report.page}>
        {/* ── Header ── */}
        <View style={report.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={report.docType}>Cost Report</Text>
            <Text style={report.name}>{recipe.name}</Text>
            <View style={report.metaRow}>
              <Text style={report.pillViolet}>{recipe.category}</Text>
              <Text style={report.pill}>
                {isGenericUnit
                  ? `Yield: ${recipe.yieldQuantity}`
                  : `Yield: ${recipe.yieldQuantity} ${yieldUnitTrimmed}`}
              </Text>
              {recipe.prepTimeMinutes > 0 && (
                <Text style={report.pill}>Prep {recipe.prepTimeMinutes} min</Text>
              )}
              {recipe.cookTimeMinutes > 0 && (
                <Text style={report.pill}>Cook {recipe.cookTimeMinutes} min</Text>
              )}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 3 }}>
            {logoBase64 ? (
              <PdfImage src={logoBase64} style={{ width: 100, height: 36, objectFit: 'contain' }} />
            ) : (
              <Text style={report.brand}>ZRecipe</Text>
            )}
            <Text style={{ fontSize: 7.5, color: C.light, textAlign: 'right' }}>food costing software</Text>
            <Text style={report.brandSub}>{date}</Text>
          </View>
        </View>

        {/* ── Ingredient Breakdown ── */}
        <Text style={report.sectionTitle}>Ingredient Breakdown</Text>
        <View style={report.table}>
          <View style={[report.tRow, report.tHead]}>
            <Text style={[report.tCell, report.tHeadText, { flex: 3 }]}>Ingredient</Text>
            <Text style={[report.tCell, report.tHeadText, { flex: 1.5, textAlign: 'right' }]}>Quantity</Text>
            <Text style={[report.tCell, report.tHeadText, report.tCellLast, { flex: 1.2, textAlign: 'right' }]}>Line Cost</Text>
          </View>

          {recipe.ingredients.map((ing, idx) => {
            const isAllergen = ingHasContains(ing)
            const isMay = !isAllergen && ingHasMayContain(ing)
            const nameStyle = isAllergen ? report.tIngNameAllergen : report.tIngName
            const displayName = isAllergen ? ing.ingredientName.toUpperCase() : ing.ingredientName
            const zebraStyle = idx % 2 === 1 ? { backgroundColor: '#f8fafc' } : {}
            return (
              <View key={ing.id} style={[report.tRow, zebraStyle]}>
                <View style={[report.tCell, { flex: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                  <Text style={nameStyle}>{displayName}</Text>
                  {isAllergen && <Text style={{ fontSize: 7, color: C.red }}>!</Text>}
                  {isMay && <Text style={{ fontSize: 7, color: C.amber }}>~</Text>}
                </View>
                <Text style={[report.tCell, report.tNum, { flex: 1.5 }]}>
                  {ing.quantity} {ing.unit}
                </Text>
                <Text style={[report.tCell, report.tCellLast, report.tNum, { flex: 1.2 }]}>
                  {fmt(lineCost(ing))}
                </Text>
              </View>
            )
          })}

          <View style={[report.tRow, report.tTotalRow]}>
            <Text style={[report.tCell, report.tTotalLabel, { flex: 3 }]}>Total ingredient cost</Text>
            <Text style={[report.tCell, { flex: 1.5 }]} />
            <Text style={[report.tCell, report.tCellLast, report.tTotalVal, { flex: 1.2 }]}>
              {fmt(pdfCosts.ingredientCost)}
            </Text>
          </View>
        </View>
        <Text style={report.priceNote}>Ingredient prices as of {date}</Text>

        {/* ── Cost Analysis ── */}
        <View style={report.analysisBox}>
          <View style={report.analysisHeader}>
            <Text style={report.analysisHeaderText}>Cost Analysis</Text>
          </View>
          <View style={report.analysisBody}>
            {/* Cost Components */}
            <Text style={report.analysisSectionLabel}>Cost Components</Text>
            <View style={report.analysisRow}>
              <Text style={report.analysisLabel}>Ingredient cost</Text>
              <Text style={report.analysisValue}>{fmt(pdfCosts.ingredientCost)}</Text>
            </View>
            <View style={report.analysisRow}>
              <Text style={report.analysisLabel}>{laborLabel}</Text>
              <Text style={report.analysisValue}>{fmt(pdfCosts.laborCost)}</Text>
            </View>
            <View style={report.analysisRow}>
              <Text style={report.analysisLabel}>{overheadLabel}</Text>
              <Text style={report.analysisValue}>{fmt(pdfCosts.overheadCost)}</Text>
            </View>
            {wastePercent > 0 && (
              <View style={report.analysisRow}>
                <Text style={report.analysisLabel}>Waste ({wastePercent}%)</Text>
                <Text style={report.analysisValue}>+{fmt(pdfCosts.wasteCost)}</Text>
              </View>
            )}

            <View style={report.analysisTotalRow}>
              <Text style={report.analysisTotalLabel}>{yieldQty > 1 ? 'Batch total cost' : 'Total cost'}</Text>
              <Text style={report.analysisTotalValue}>{fmt(pdfCosts.totalCost)}</Text>
            </View>

            <View style={report.analysisDivider} />

            {/* Performance */}
            <Text style={report.analysisSectionLabel}>Performance</Text>
            {yieldQty > 1 && (
              <View style={report.analysisRow}>
                <Text style={report.analysisLabel}>Base cost per unit</Text>
                <Text style={report.analysisValue}>€{pdfCosts.costPerUnit.toFixed(3)}</Text>
              </View>
            )}
            <View style={report.analysisRow}>
              <Text style={report.analysisLabel}>{yieldQty > 1 ? 'Price per unit' : 'Selling price'}</Text>
              <Text style={report.analysisValue}>{fmt(pdfCosts.sellingPrice)}</Text>
            </View>
            {yieldQty > 1 && (
              <View style={report.analysisRow}>
                <Text style={report.analysisLabel}>Batch total revenue</Text>
                <Text style={report.analysisValue}>{fmt(pdfCosts.sellingPrice * yieldQty)}</Text>
              </View>
            )}
            <View style={report.analysisKeyRow}>
              <Text style={report.analysisKeyLabel}>{yieldQty > 1 ? 'Profit per unit (base)' : 'Profit per unit'}</Text>
              <Text style={[report.analysisKeyValue, { color: pdfCosts.profitPerUnit >= 0 ? C.emerald : C.red }]}>
                {pdfCosts.profitPerUnit >= 0 ? '+' : ''}{fmt(pdfCosts.profitPerUnit)}
              </Text>
            </View>
            {yieldQty > 1 && (
              <View style={report.analysisRow}>
                <Text style={report.analysisLabel}>Batch total profit</Text>
                <Text style={[report.analysisValue, { color: pdfCosts.profitPerUnit >= 0 ? C.emerald : C.red }]}>
                  {pdfCosts.profitPerUnit >= 0 ? '+' : ''}{fmt(pdfCosts.profitPerUnit * yieldQty)}
                </Text>
              </View>
            )}

            <View style={report.analysisDivider} />

            {/* Key metric tiles */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: marginBorder, backgroundColor: marginBg }}>
                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>
                  Gross Margin
                </Text>
                <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: marginColor }}>
                  {pdfCosts.margin.toFixed(1)}%
                </Text>
              </View>
              <View style={{ flex: 1, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: foodCostBorder, backgroundColor: foodCostBg }}>
                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>
                  Food Cost %
                </Text>
                <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: foodCostColor }}>
                  {pdfCosts.foodCostPercent.toFixed(1)}%
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Allergen declaration ── */}
        <View style={report.allergenBox}>
          <Text style={report.allergenTitle}>Allergen Information (EU Reg. 1169/2011)</Text>
          <AllergenDeclaration allergens={allergens} st={report} />
        </View>

        {/* ── Footer ── */}
        <View style={report.footer}>
          <Text style={report.footerText}>Cost Report: {recipe.name} · {date}</Text>
          <Text style={report.footerText}>www.zrecipe.ie — food costing software</Text>
        </View>
      </Page>
    </Document>
  )
}

// ── FORMAT 3: Product Label (A5) ─────────────────────────────────────────────

function buildIngredientText(ingredients: RecipeIngredientDraft[]): Array<{ text: string; bold: boolean }> {
  return ingredients.map((ing, i) => ({
    text: (ingHasContains(ing) ? ing.ingredientName.toUpperCase() : ing.ingredientName) +
      (i < ingredients.length - 1 ? ', ' : ''),
    bold: ingHasContains(ing),
  }))
}

function ProductLabelDocument({
  recipe,
  allergens,
  businessName,
  logoBase64,
}: {
  recipe: RecipeRecord
  allergens: RecipeAllergenSummary
  businessName: string
  logoBase64: string | null
}) {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const ingredientParts = buildIngredientText(recipe.ingredients)

  return (
    <Document>
      <Page size="A5" style={label.page}>
        {/* ── Product name ── */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={label.name}>{recipe.name.toUpperCase()}</Text>
            <Text style={label.producer}>{businessName}</Text>
          </View>
          {logoBase64 ? (
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <PdfImage src={logoBase64} style={{ width: 70, height: 26, objectFit: 'contain' }} />
              <Text style={{ fontSize: 6.5, color: C.light, textAlign: 'right' }}>food costing software</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.muted }}>ZRecipe</Text>
          )}
        </View>

        <View style={label.divider} />

        {/* ── Ingredients list with allergens in bold ── */}
        <Text style={label.sectionTitle}>Ingredients</Text>
        <Text style={{ fontSize: 9, lineHeight: 1.6, marginBottom: 4 }}>
          {ingredientParts.map((part, i) =>
            part.bold ? (
              <Text key={i} style={{ fontFamily: 'Helvetica-Bold' }}>{part.text}</Text>
            ) : (
              <Text key={i}>{part.text}</Text>
            )
          )}
        </Text>

        <View style={label.divider} />

        {/* ── Allergen summary ── */}
        <Text style={label.sectionTitle}>Allergen Information</Text>
        <AllergenDeclaration allergens={allergens} st={label} />

        <View style={label.divider} />

        {/* ── Net weight / yield ── */}
        <Text style={label.sectionTitle}>Net weight / Yield</Text>
        <Text style={{ fontSize: 9, marginBottom: 8 }}>
          {recipe.yieldQuantity} {recipe.yieldUnit}
        </Text>

        {/* ── Date fields ── */}
        <View style={label.blankRow}>
          <Text style={{ fontSize: 9, color: C.muted }}>Date of production</Text>
          <View style={label.blankLine} />
        </View>
        <View style={label.blankRow}>
          <Text style={{ fontSize: 9, color: C.muted }}>Best before</Text>
          <View style={label.blankLine} />
        </View>
        <View style={label.blankRow}>
          <Text style={{ fontSize: 9, color: C.muted }}>Batch / Lot</Text>
          <View style={label.blankLine} />
        </View>

        <View style={label.divider} />

        {/* ── Legal footer ── */}
        <Text style={{ fontSize: 8, color: C.muted }}>Produced by: {businessName}</Text>
        <Text style={label.legalNote}>
          Allergen information declared in accordance with EU Regulation No 1169/2011 on the provision of food information to consumers.
          Allergens are indicated in BOLD in the ingredients list.
        </Text>
        {/* ── Branding footer ── */}
        <View style={label.footer}>
          <Text style={label.footerText}>Generated {date}</Text>
          <Text style={label.footerText}>www.zrecipe.ie — food costing software</Text>
        </View>
      </Page>
    </Document>
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateRecipePdf(
  recipe: RecipeRecord,
  mode: PrintMode,
  allergens?: RecipeAllergenSummary,
  options: RecipePdfOptions = {}
) {
  const allergy = allergens ?? { contains: [], mayContain: [] }
  const includesCosts = options.includesCosts ?? mode === 'cost'
  const businessName = options.businessName ?? options.tenant?.name ?? 'ZRecipe'

  const galleryUrls = recipe.imageUrls?.length
    ? recipe.imageUrls.slice(0, 8)
    : recipe.imageUrl ? [recipe.imageUrl] : []

  const [imagesBase64, logoBase64] = await Promise.all([
    Promise.all(galleryUrls.map((url) => getImageAsBase64(url))),
    getImageAsBase64('/images/fundobranco2.png'),
  ])

  const doc =
    mode === 'label' ? (
      <ProductLabelDocument recipe={recipe} allergens={allergy} businessName={businessName} logoBase64={logoBase64} />
    ) : mode === 'cost' ? (
      <CostReportDocument recipe={recipe} allergens={allergy} logoBase64={logoBase64} tenant={options.tenant} />
    ) : (
      <KitchenCardDocument
        recipe={recipe}
        allergens={allergy}
        imagesBase64={imagesBase64}
        logoBase64={logoBase64}
        includesCosts={includesCosts}
        tenant={options.tenant}
      />
    )

  const blob = await pdf(doc).toBlob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${recipe.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${mode}.pdf`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
