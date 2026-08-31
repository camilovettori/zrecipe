import type { RecipeCostSummary } from '@/hooks/useRecipes'

export type SquareItemSales = {
  itemName: string
  unitsSold: number
  revenueCents: number
  currency: string
  linkedRecipeId: string | null
}

export type LinkedRecipeForMargin = {
  id: string
  name: string
  isSubIngredient: boolean
  cost: Pick<RecipeCostSummary, 'costPerUnit'>
}

export type MarginRow = SquareItemSales & {
  linkedRecipeName: string | null
  isSubRecipe: boolean
  costCents: number | null
  marginCents: number | null
  marginPercent: number | null
}

/**
 * units sold x live recipe cost per unit, same formula shape as the
 * costPerUnit-based margin already computed for recipes (see
 * cost-calculator.ts: margin = ((sellingPrice - costPerUnit) / sellingPrice)
 * * 100), with Square revenue standing in for selling price.
 *
 * An unlinked item never produces a margin (costCents/marginCents/
 * marginPercent all null) — never a fabricated €0. Per CLAUDE.md core
 * costing rule 7, a linked sub-recipe shows cost but never margin/profit.
 */
export function computeMarginRow(item: SquareItemSales, recipe: LinkedRecipeForMargin | null): MarginRow {
  if (!recipe) {
    return { ...item, linkedRecipeName: null, isSubRecipe: false, costCents: null, marginCents: null, marginPercent: null }
  }

  const costCents = Math.round(recipe.cost.costPerUnit * item.unitsSold * 100)

  if (recipe.isSubIngredient) {
    return { ...item, linkedRecipeName: recipe.name, isSubRecipe: true, costCents, marginCents: null, marginPercent: null }
  }

  const marginCents = item.revenueCents - costCents
  const marginPercent = item.revenueCents > 0 ? (marginCents / item.revenueCents) * 100 : 0
  return { ...item, linkedRecipeName: recipe.name, isSubRecipe: false, costCents, marginCents, marginPercent }
}

export function computeMarginRows(
  items: SquareItemSales[],
  recipeById: Map<string, LinkedRecipeForMargin>
): MarginRow[] {
  return items.map((item) =>
    computeMarginRow(item, item.linkedRecipeId ? recipeById.get(item.linkedRecipeId) ?? null : null)
  )
}
