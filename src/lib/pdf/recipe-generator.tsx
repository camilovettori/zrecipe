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

function calculatePdfCosts(recipe: RecipeRecord, tenant?: PdfTenant | null) {
  const ingredientCost = Number(
    recipe.ingredients.reduce((sum, item) => sum + lineCost(item), 0).toFixed(2)
  )
  const laborRate = Number(tenant?.labor_hourly_rate ?? 15)
  const prepTimeMinutes = Number(recipe.prepTimeMinutes ?? 0)
  const laborCost =
    recipe.laborMode === 'time'
      ? Number(((prepTimeMinutes / 60) * laborRate).toFixed(2))
      : Number(recipe.laborCost ?? 0)
  const overheadCost =
    recipe.overheadMode === 'percent'
      ? Number((ingredientCost * ((recipe.overheadPercent ?? 0) / 100)).toFixed(2))
      : Number(recipe.overheadCost ?? 0)
  const subtotal = Number((ingredientCost + laborCost + overheadCost).toFixed(2))
  const wastePercent = Number(recipe.wastePercent ?? 0)
  const wasteCost = Number((subtotal * (wastePercent / 100)).toFixed(2))
  const totalCost = Number((subtotal + wasteCost).toFixed(2))
  const isBatch = recipe.yieldUnit?.toLowerCase() === 'batch'
  const yieldQty = Number(recipe.yieldQuantity ?? 1)
  const costPerUnit = isBatch && yieldQty > 0
    ? Number((totalCost / yieldQty).toFixed(4))
    : totalCost
  const sellingPrice = Number(recipe.sellingPrice ?? recipe.cost.sellingPrice ?? 0)
  const margin = sellingPrice > 0
    ? Number((((sellingPrice - costPerUnit) / sellingPrice) * 100).toFixed(1))
    : 0

  return {
    ingredientCost,
    laborCost,
    laborRate,
    overheadCost,
    subtotal,
    wasteCost,
    wastePercent,
    totalCost,
    isBatch,
    yieldQty,
    costPerUnit,
    sellingPrice,
    margin,
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
  },
  tHead: {
    backgroundColor: C.bgLight,
  },
  tTotalRow: {
    backgroundColor: C.bgLight,
    borderBottomWidth: 0,
  },
  tCell: {
    paddingVertical: 6,
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
  allergenBox: {
    marginTop: 14,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: C.redBg,
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
  },
  // ── cost summary ──
  costBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bgLight,
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
})

// ── Shared: bullet allergen lines ─────────────────────────────────────────────

function AllergenDeclaration({
  allergens,
  st,
}: {
  allergens: RecipeAllergenSummary
  st: typeof kitchen | typeof label
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

function KitchenCardDocument({
  recipe,
  allergens,
  imageBase64,
  includesCosts,
  tenant,
}: {
  recipe: RecipeRecord
  allergens: RecipeAllergenSummary
  imageBase64: string | null
  includesCosts: boolean
  tenant?: PdfTenant | null
}) {
  const pdfCosts = calculatePdfCosts(recipe, tenant)
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
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
              <Text style={kitchen.pill}>Yield: {recipe.yieldQuantity} {recipe.yieldUnit}</Text>
              {recipe.prepTimeMinutes > 0 && (
                <Text style={kitchen.pill}>Prep {recipe.prepTimeMinutes} min</Text>
              )}
              {recipe.cookTimeMinutes > 0 && (
                <Text style={kitchen.pill}>Cook {recipe.cookTimeMinutes} min</Text>
              )}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={kitchen.brand}>ZRecipe</Text>
            <Text style={kitchen.brandSub}>{date}</Text>
          </View>
        </View>

        {/* ── Image ── */}
        {imageBase64 && (
          <PdfImage src={imageBase64} style={kitchen.image} />
        )}

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
            <Text style={[kitchen.tCell, kitchen.tHeadText, { flex: 3 }]}>Ingredient</Text>
            <Text style={[kitchen.tCell, kitchen.tHeadText, { flex: 1, textAlign: 'right' }]}>Qty</Text>
            <Text
              style={
                includesCosts
                  ? [kitchen.tCell, kitchen.tHeadText, { flex: 1 }]
                  : [kitchen.tCell, kitchen.tHeadText, kitchen.tCellLast, { flex: 1 }]
              }
            >
              Unit
            </Text>
            {includesCosts && (
              <Text style={[kitchen.tCell, kitchen.tHeadText, kitchen.tCellLast, { flex: 1.2, textAlign: 'right' }]}>Cost</Text>
            )}
          </View>

          {/* Rows */}
          {recipe.ingredients.map((ing) => {
            const isAllergen = ingHasContains(ing)
            const isMay = !isAllergen && ingHasMayContain(ing)
            const nameStyle = isAllergen ? kitchen.tIngAllergen : kitchen.tIngNormal
            const displayName = isAllergen
              ? ing.ingredientName.toUpperCase()
              : ing.ingredientName

            return (
              <View key={ing.id} style={kitchen.tRow}>
                <View style={[kitchen.tCell, { flex: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                  <Text style={nameStyle}>{displayName}</Text>
                  {isAllergen && <Text style={{ fontSize: 7, color: C.red }}>!</Text>}
                  {isMay && <Text style={{ fontSize: 7, color: C.amber }}>~</Text>}
                </View>
                <Text style={[kitchen.tCell, kitchen.tNum, { flex: 1 }]}>{ing.quantity}</Text>
                <Text
                  style={
                    includesCosts
                      ? [kitchen.tCell, kitchen.tIngNormal, { flex: 1 }]
                      : [kitchen.tCell, kitchen.tIngNormal, kitchen.tCellLast, { flex: 1 }]
                  }
                >
                  {ing.unit}
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
              <Text style={[kitchen.tCell, kitchen.tTotalLabel, { flex: 3 }]}>Total ingredient cost</Text>
              <Text style={[kitchen.tCell, { flex: 1 }]} />
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
            <Text style={kitchen.sectionTitle}>Cost Summary</Text>
            <View style={kitchen.costBox}>
              <CostRow label="Ingredient cost" value={fmt(pdfCosts.ingredientCost)} />
              <CostRow
                label={
                  recipe.laborMode === 'time'
                    ? `Labor (${recipe.prepTimeMinutes}min x ${fmt(pdfCosts.laborRate)}/hr)`
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
              {pdfCosts.wastePercent > 0 && (
                <CostRow
                  label={`Waste (${pdfCosts.wastePercent}%)`}
                  value={`+${fmt(pdfCosts.wasteCost)}`}
                />
              )}
              <View style={kitchen.costDivider} />
              <CostRow label="Total cost" value={fmt(pdfCosts.totalCost)} bold />
              {pdfCosts.isBatch && pdfCosts.yieldQty > 1 && (
                <CostRow
                  label={`Cost per unit (/ ${pdfCosts.yieldQty})`}
                  value={`\u20ac${pdfCosts.costPerUnit.toFixed(3)}`}
                />
              )}
              <CostRow label="Selling price" value={fmt(pdfCosts.sellingPrice)} />
              <CostRow
                label="Margin"
                value={`${pdfCosts.margin.toFixed(1)}%`}
                valueColor={marginColor}
                bold
              />
            </View>
          </>
        )}

        {/* ── Footer ── */}
        <View style={kitchen.footer}>
          <Text style={kitchen.footerText}>Generated by ZRecipe</Text>
          <Text style={kitchen.footerText}>
            {recipe.prepTimeMinutes > 0 ? `Prep: ${recipe.prepTimeMinutes} min` : ''}
            {recipe.prepTimeMinutes > 0 && recipe.cookTimeMinutes > 0 ? '  |  ' : ''}
            {recipe.cookTimeMinutes > 0 ? `Cook: ${recipe.cookTimeMinutes} min` : ''}
          </Text>
          <Text style={kitchen.footerText}>{date}</Text>
        </View>
      </Page>
    </Document>
  )
}

// ── FORMAT 2: Product Label (A5) ─────────────────────────────────────────────

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
}: {
  recipe: RecipeRecord
  allergens: RecipeAllergenSummary
  businessName: string
}) {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const ingredientParts = buildIngredientText(recipe.ingredients)

  return (
    <Document>
      <Page size="A5" style={label.page}>
        {/* ── Product name ── */}
        <Text style={label.name}>{recipe.name.toUpperCase()}</Text>
        <Text style={label.producer}>{businessName}</Text>

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
        <Text style={[label.legalNote, { marginTop: 4 }]}>
          Generated by ZRecipe - {date}
        </Text>
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
  const imageBase64 = recipe.imageUrl ? await getImageAsBase64(recipe.imageUrl) : null

  const doc =
    mode === 'label' ? (
      <ProductLabelDocument recipe={recipe} allergens={allergy} businessName={businessName} />
    ) : (
      <KitchenCardDocument
        recipe={recipe}
        allergens={allergy}
        imageBase64={imageBase64}
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
