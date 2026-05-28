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

type PrintMode = 'full' | 'kitchen'

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 11,
    color: '#0f172a',
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  brand: {
    fontSize: 20,
    fontWeight: 700,
    color: '#059669',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 4,
    fontFamily: 'Times-Bold',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    color: '#334155',
    fontSize: 9,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
    color: '#0f172a',
  },
  image: {
    width: '100%',
    height: 160,
    objectFit: 'cover',
    borderRadius: 12,
    marginBottom: 14,
  },
  table: {
    width: '100%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tableHeader: {
    backgroundColor: '#f8fafc',
    fontWeight: 700,
  },
  tableCell: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  tableCellLast: {
    borderRightWidth: 0,
  },
  summary: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryTotal: {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 4,
  },
  instructionItem: {
    marginBottom: 6,
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 28,
    right: 28,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
    fontSize: 9,
    color: '#94a3b8',
  },
  kitchenTitle: {
    fontSize: 26,
    fontWeight: 700,
    fontFamily: 'Times-Bold',
    marginBottom: 8,
  },
  kitchenInstruction: {
    marginBottom: 6,
    fontSize: 12,
    lineHeight: 1.5,
  },
})

function formatMoney(value: number) {
  return `€${value.toFixed(2)}`
}

function lineCost(item: RecipeIngredientDraft) {
  return item.lineCost || 0
}

function DocumentShell({
  recipe,
  mode,
}: {
  recipe: RecipeRecord
  mode: PrintMode
}) {
  const isKitchen = mode === 'kitchen'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>ZRecipe</Text>
          <Text style={isKitchen ? styles.kitchenTitle : styles.title}>{recipe.name}</Text>
          <Text style={{ color: '#64748b', fontSize: 10 }}>
            Generated on {new Date().toLocaleDateString()}
          </Text>

          <View style={styles.metaRow}>
            <Text style={styles.pill}>{recipe.category}</Text>
            <Text style={styles.pill}>
              Yield: {recipe.yieldQuantity} {recipe.yieldUnit}
            </Text>
            <Text style={styles.pill}>Prep: {recipe.prepTimeMinutes} min</Text>
            <Text style={styles.pill}>Cook: {recipe.cookTimeMinutes} min</Text>
          </View>
        </View>

        {recipe.imageUrl && <PdfImage src={recipe.imageUrl} style={styles.image} />}

        {!isKitchen && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recipe Info</Text>
            {recipe.description ? (
              <Text style={{ color: '#475569', marginBottom: 4 }}>{recipe.description}</Text>
            ) : null}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, { flex: 2 }]}>Ingredient</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>Quantity</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>Unit</Text>
              {!isKitchen && <Text style={[styles.tableCell, { flex: 1 }]}>Line Cost</Text>}
            </View>

            {recipe.ingredients.map((item) => (
              <View key={item.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 2 }]}>{item.ingredientName}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{item.quantity}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{item.unit}</Text>
                {!isKitchen ? (
                  <Text style={[styles.tableCell, styles.tableCellLast, { flex: 1 }]}>
                    {formatMoney(lineCost(item))}
                  </Text>
                ) : (
                  <Text style={[styles.tableCell, styles.tableCellLast, { flex: 0 }]} />
                )}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Instructions</Text>
          {recipe.instructions.map((step, index) => (
            <Text key={step.id} style={styles.instructionItem}>
              {index + 1}. {step.text}
            </Text>
          ))}
        </View>

        {!isKitchen && (
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text>Ingredient total</Text>
              <Text>{formatMoney(recipe.cost.ingredientCost)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text>Labor</Text>
              <Text>{formatMoney(recipe.cost.laborCost)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text>Overhead</Text>
              <Text>{formatMoney(recipe.cost.overheadCost)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text>Total cost</Text>
              <Text>{formatMoney(recipe.cost.totalCost)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text>Selling price</Text>
              <Text>{formatMoney(recipe.cost.sellingPrice)}</Text>
            </View>
            <Text style={styles.summaryTotal}>
              Margin: {recipe.cost.marginPercent.toFixed(1)}%
            </Text>
          </View>
        )}

        <Text style={styles.footer}>Generated by ZRecipe</Text>
      </Page>
    </Document>
  )
}

export async function generateRecipePdf(recipe: RecipeRecord, mode: PrintMode) {
  const blob = await pdf(<DocumentShell recipe={recipe} mode={mode} />).toBlob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${recipe.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${mode}.pdf`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
