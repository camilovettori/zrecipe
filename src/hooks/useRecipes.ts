'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { convertUnit, getUnitFamily } from '@/lib/utils/unit-converter'
import { calculateCost, calculateIngredientCost, type IngredientCostLine } from '@/lib/utils/cost-calculator'
import { type IngredientLookup } from '@/hooks/useInvoices'
import { resolveTenantId } from '@/hooks/useTenant'
import { type IngredientAllergen, type AllergenStatus } from '@/lib/allergens'
import { resolveIngredientPrice, type PriceHistoryEntry } from '@/lib/ingredients/resolveIngredientPrice'
import { computeLiveSubRecipeCost, type SubRecipeCostRow, type SubRecipeCostResult } from '@/lib/recipes/subRecipeCost'

export interface RecipeStepDraft {
  id: string
  text: string
}

export interface RecipeIngredientDraft {
  id: string
  ingredientId?: string | null
  subRecipeId?: string | null
  ingredientName: string
  ingredientBrand?: string | null
  quantity: number
  unit: string
  currentPrice?: number | null
  priceUnit?: string | null
  notes?: string | null
  lineCost: number
  allergens?: IngredientAllergen[]
  yield_percent?: number | null
  yield_override?: boolean | null
  ep_weight_manual?: number | null
  /** True when this line's sub-recipe price is a fallback snapshot rather
   *  than a live recalculation from the sub-recipe's current ingredients. */
  subRecipeCostStale?: boolean
  /** Total EP weight (grams) of the referenced sub-recipe, when this line is
   *  a sub-recipe. Used only to display the sub-recipe's batch size in the
   *  UI — costing goes through subRecipeCostPerGram instead. */
  subRecipeWeightG?: number | null
  /** The referenced sub-recipe's total cost divided by its live EP weight in
   *  grams. Lets a weight-based line (g/kg) bridge directly to this €/gram
   *  rate instead of hitting a unit mismatch. */
  subRecipeCostPerGram?: number | null
  /** True when the referenced sub-recipe has volume-measured ingredients that
   *  were excluded from its weight sum and no manual batch weight is set —
   *  lets the UI ask for a batch weight specifically instead of a generic
   *  unit mismatch. */
  subRecipeHasSkippedVolumeLines?: boolean
}

export interface RecipeEditorData {
  name: string
  description: string
  category: string
  yieldQuantity: number
  yieldUnit: string
  prepTimeMinutes: number
  cookTimeMinutes: number
  laborEnabled: boolean
  laborCost: number
  laborMode: 'fixed' | 'time'
  laborJobTitle: string | null
  laborHourlyRate: number | null
  overheadEnabled: boolean
  overheadCost: number
  overheadMode: 'fixed' | 'percent'
  overheadPercent: number
  wastePercent: number
  sellingPrice: number
  vatEnabled: boolean
  vatRate: number
  imageUrl: string | null
  imageUrls: string[]
  isSubIngredient: boolean
  subIngredientUnit: string
  /** User-entered EP batch weight (grams) of this recipe when used as a
   *  sub-recipe, measured on a scale. Takes precedence over the computed
   *  sum of weight-family lines — required when the recipe has
   *  volume-measured (ml/L) ingredients, since those need an unstated
   *  density to convert to grams. */
  subIngredientWeightManualG: number | null
  storageInstructions?: string | null
  instructions: RecipeStepDraft[]
  ingredients: RecipeIngredientDraft[]
}

export interface RecipeCostSummary {
  ingredientCost: number
  laborCost: number
  overheadCost: number
  wasteCost: number
  subtotal: number
  totalCost: number
  costPerUnit: number
  isBatch: boolean
  sellingPrice: number
  marginPercent: number
  foodCostPercentage: number
  /** At least one ingredient has never had a price recorded. */
  hasMissingPrices: boolean
  /** At least one ingredient's unit can't convert to its price's unit. */
  hasUnitMismatches: boolean
  /** At least one sub-recipe ingredient fell back to its stored cost
   *  snapshot instead of a live recalculation. */
  hasStaleSubRecipeCosts: boolean
  /** hasMissingPrices || hasUnitMismatches — totals below aren't fully accurate. */
  incompleteCost: boolean
  /** At least one ingredient has an explicit price of exactly €0 — real data,
   *  not incomplete, just unusual for food. */
  hasZeroPricedIngredients: boolean
  /** ids of the recipe_ingredients rows missing a price or unit-mismatched. */
  affectedIngredientIds: string[]
  warnings: string[]
}

export interface RecipeSummary {
  id: string
  name: string
  description: string
  category: string
  yieldQuantity: number
  yieldUnit: string
  imageUrl: string | null
  ingredientCount: number
  updatedAt: string
  isSubIngredient: boolean
  cost: RecipeCostSummary
}

export interface RecipeRecord extends RecipeEditorData {
  id: string
  tenantId: string
  createdAt: string
  updatedAt: string
  cost: RecipeCostSummary
}

type DBIngredientRow = {
  id: string
  name: string
  brand?: string | null
  current_price?: number | null
  price_unit?: string | null
  ingredient_allergens?: Array<{ allergen_id: number; status: string }> | null
  price_history?: Array<PriceHistoryEntry & { brand?: string | null }> | null
}

type DBSubRecipeRef = SubRecipeCostRow & {
  name: string
  sub_ingredient_weight_g?: number | null
}

type DBRecipeIngredientRow = {
  id: string
  recipe_id: string
  ingredient_id?: string | null
  sub_recipe_id?: string | null
  quantity: number
  unit: string
  notes?: string | null
  sort_order?: number | null
  yield_percent?: number | null
  yield_override?: boolean | null
  ingredient?: DBIngredientRow[] | DBIngredientRow | null
  sub_recipe?: DBSubRecipeRef[] | DBSubRecipeRef | null
}

type DBRecipeRow = {
  id: string
  tenant_id: string
  name: string
  description?: string | null
  category?: string | null
  instructions?: string | null
  yield_quantity?: number | null
  yield_unit?: string | null
  prep_time_minutes?: number | null
  cook_time_minutes?: number | null
  labor_enabled?: boolean | null
  labor_cost?: number | null
  labor_mode?: string | null
  labor_job_title?: string | null
  labor_hourly_rate?: number | null
  overhead_enabled?: boolean | null
  overhead_cost?: number | null
  overhead_mode?: string | null
  overhead_percent?: number | null
  waste_percent?: number | null
  selling_price?: number | null
  vat_enabled?: boolean | null
  vat_rate?: number | null
  image_url?: string | null
  image_urls?: string[] | null
  is_active?: boolean | null
  is_sub_ingredient?: boolean | null
  sub_ingredient_unit?: string | null
  sub_ingredient_cost_per_unit?: number | null
  sub_ingredient_weight_manual_g?: number | null
  storage_instructions?: string | null
  recipe_ingredients?: DBRecipeIngredientRow[] | DBRecipeIngredientRow | null
  created_at: string
  updated_at: string
}

export const RECIPE_CATEGORIES = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Dessert',
  'Bakery',
  'Beverage',
  'Sauce',
  'Other',
]

export const RECIPE_UNITS = [
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'L',
  'unit',
  'dozen',
  'portion',
  'serving',
  'tbsp',
  'tsp',
  'cup',
]

function newId() {
  return crypto.randomUUID()
}

function normalizeIngredientRelation(ingredient: DBRecipeIngredientRow['ingredient']) {
  const row = Array.isArray(ingredient) ? ingredient[0] : ingredient
  if (!row) return null

  const resolved = resolveIngredientPrice(row.price_history ?? [], row.current_price ?? null, row.price_unit ?? null)
  const effectiveBrand = (row.price_history ?? []).find((h) => h.id === resolved.historyId)?.brand ?? row.brand ?? null
  return {
    id: row.id,
    name: row.name,
    brand: effectiveBrand,
    currentPrice: resolved.price,
    priceUnit: resolved.unit,
  } satisfies IngredientLookup
}

function parseInstructions(raw: string | null | undefined): RecipeStepDraft[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
        .map((step, index) => {
          if (typeof step === 'string') {
            return { id: newId(), text: step.trim() }
          }
          if (step && typeof step === 'object' && 'text' in step) {
            return {
              id: typeof step.id === 'string' ? step.id : newId(),
              text: String(step.text ?? '').trim(),
            }
          }
          return { id: `${index}-${newId()}`, text: '' }
        })
        .filter((step) => step.text.length > 0)
    }
  } catch {
    // Fall back to line splitting below.
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.)-]?\s*/, '').trim())
    .filter(Boolean)
    .map((text) => ({ id: newId(), text }))
}

function serializeInstructions(steps: RecipeStepDraft[]) {
  return JSON.stringify(steps.map((step) => step.text).filter(Boolean))
}

function ingredientCostInput(item: RecipeIngredientDraft) {
  return {
    id: item.id,
    quantity: item.quantity,
    unit: item.unit,
    name: item.ingredientName,
    yield_percent: item.yield_percent ?? 100,
    // Preserve null (never priced) instead of collapsing it to 0 (priced at
    // zero) — calculateIngredientCost needs the distinction to flag a
    // missing price instead of silently costing the line at €0.
    current_price: item.currentPrice ?? null,
    price_unit: item.priceUnit ?? item.unit,
    staleSubRecipeCost: item.subRecipeCostStale ?? false,
    subRecipeWeightG: item.subRecipeWeightG ?? null,
    subRecipeCostPerGram: item.subRecipeCostPerGram ?? null,
    subRecipeHasSkippedVolumeLines: item.subRecipeHasSkippedVolumeLines ?? false,
  }
}

function ingredientLineCost(item: RecipeIngredientDraft) {
  return calculateIngredientCost(ingredientCostInput(item)).cost
}

/** Per-row cost + status (ok / missing_price / unit_mismatch) for UI badges. */
export function calculateLineCostDetailed(item: RecipeIngredientDraft): IngredientCostLine {
  return calculateIngredientCost(ingredientCostInput(item))
}

export function calculateRecipeCost(
  ingredients: RecipeIngredientDraft[],
  laborCost = 0,
  overheadCost = 0,
  sellingPrice = 0,
  opts?: {
    laborEnabled?: boolean
    laborMode?: 'fixed' | 'time'
    prepTimeMinutes?: number
    laborHourlyRate?: number
    overheadEnabled?: boolean
    overheadMode?: 'fixed' | 'percent'
    overheadPercent?: number
    wastePercent?: number
    yieldQuantity?: number
    yieldUnit?: string
  }
): RecipeCostSummary {
  const costs = calculateCost({
    ingredients: ingredients.map((item) => ingredientCostInput(item)),
    laborEnabled: opts?.laborEnabled ?? false,
    laborMode: opts?.laborMode ?? 'fixed',
    laborCostFixed: laborCost,
    prepTimeMinutes: opts?.prepTimeMinutes ?? 0,
    laborHourlyRate: opts?.laborHourlyRate ?? 0,
    overheadEnabled: opts?.overheadEnabled ?? false,
    overheadMode: opts?.overheadMode ?? 'fixed',
    overheadCostFixed: overheadCost,
    overheadPercent: opts?.overheadPercent ?? 0,
    wastePercent: opts?.wastePercent ?? 0,
    sellingPrice,
    yieldQty: opts?.yieldQuantity ?? 1,
    yieldUnit: opts?.yieldUnit ?? 'unit',
    vatEnabled: false,
    vatRate: 0,
  })

  return {
    ingredientCost: costs.ingredientCost,
    laborCost: costs.laborCost,
    overheadCost: costs.overheadCost,
    wasteCost: costs.wasteCost,
    subtotal: costs.subtotal,
    totalCost: costs.totalCost,
    costPerUnit: costs.costPerUnit,
    isBatch: costs.isBatch,
    sellingPrice: costs.sellingPrice,
    marginPercent: costs.margin,
    foodCostPercentage: costs.foodCostPercent,
    hasMissingPrices: costs.hasMissingPrices,
    hasUnitMismatches: costs.hasUnitMismatches,
    hasStaleSubRecipeCosts: costs.hasStaleSubRecipeCosts,
    incompleteCost: costs.incompleteCost,
    hasZeroPricedIngredients: costs.hasZeroPricedIngredients,
    affectedIngredientIds: costs.affectedLines.map((l) => l.id).filter((id): id is string => !!id),
    warnings: costs.warnings,
  }
}

export function calculateLineCost(item: RecipeIngredientDraft) {
  return ingredientLineCost(item)
}

function buildRecipeRecordFromInput(
  input: RecipeEditorData,
  id: string,
  tenantId: string,
  createdAt: string,
  updatedAt: string
): RecipeRecord {
  const ingredients = input.ingredients.map((item) => ({
    ...item,
    lineCost: calculateLineCost(item),
  }))
  const cost = calculateRecipeCost(
    ingredients,
    input.laborCost,
    input.overheadCost,
    input.sellingPrice,
    {
      laborEnabled: input.laborEnabled,
      laborMode: input.laborMode,
      prepTimeMinutes: input.prepTimeMinutes,
      laborHourlyRate: input.laborHourlyRate ?? 0,
      overheadEnabled: input.overheadEnabled,
      overheadMode: input.overheadMode,
      overheadPercent: input.overheadPercent,
      wastePercent: input.wastePercent,
      yieldQuantity: input.yieldQuantity,
      yieldUnit: input.yieldUnit,
    }
  )

  return {
    id,
    tenantId,
    name: input.name,
    description: input.description,
    category: input.category,
    yieldQuantity: input.yieldQuantity,
    yieldUnit: input.yieldUnit,
    prepTimeMinutes: input.prepTimeMinutes,
    cookTimeMinutes: input.cookTimeMinutes,
    laborEnabled: input.laborEnabled,
    laborCost: input.laborCost,
    laborMode: input.laborMode,
    laborJobTitle: input.laborJobTitle,
    laborHourlyRate: input.laborHourlyRate,
    overheadEnabled: input.overheadEnabled,
    overheadCost: input.overheadCost,
    overheadMode: input.overheadMode,
    overheadPercent: input.overheadPercent,
    wastePercent: input.wastePercent,
    sellingPrice: input.sellingPrice,
    vatEnabled: input.vatEnabled,
    vatRate: input.vatRate,
    imageUrl: input.imageUrl,
    imageUrls: input.imageUrls,
    isSubIngredient: input.isSubIngredient,
    subIngredientUnit: input.subIngredientUnit,
    subIngredientWeightManualG: input.subIngredientWeightManualG,
    instructions: input.instructions,
    ingredients,
    createdAt,
    updatedAt,
    cost,
  }
}

function mapRecipeRow(
  row: DBRecipeRow,
  tenantLaborHourlyRate = 15,
  subRecipeWeights: Record<string, number | null> = {},
  /**
   * Pre-computed sub-recipe costs, keyed by sub-recipe id — one
   * computeLiveSubRecipeCost() call per distinct sub-recipe rather than one
   * per referencing line (see collectSubRecipeIds / the flat sub-recipe
   * fetch in refreshRecipes). When a line's sub_recipe_id has an entry here
   * it wins; otherwise this falls back to computing from the line's own
   * nested `sub_recipe` embed exactly as before, so getRecipeWithIngredients
   * (which still fetches that embed and never passes this map) is unchanged.
   */
  subRecipeCostMap?: Map<string, SubRecipeCostResult>
): RecipeRecord {
  const recipeIngredients = Array.isArray(row.recipe_ingredients)
    ? row.recipe_ingredients
    : row.recipe_ingredients
      ? [row.recipe_ingredients]
      : []

  const ingredients = recipeIngredients
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((item, index) => {
      // Access the raw ingredient row before normalization to extract allergens
      const rawIngRow = Array.isArray(item.ingredient)
        ? item.ingredient[0]
        : item.ingredient
      const allergens: IngredientAllergen[] = (rawIngRow?.ingredient_allergens ?? [])
        .map((a) => ({
          allergenId: a.allergen_id,
          status: (a.status === 'contains' || a.status === 'may_contain'
            ? a.status
            : 'contains') as AllergenStatus,
        }))

      const ingredient = normalizeIngredientRelation(item.ingredient)
      // For sub-recipe lines ingredient_id is null — fall back to the joined sub-recipe row
      const subRecipeRef = Array.isArray(item.sub_recipe)
        ? item.sub_recipe[0]
        : (item.sub_recipe ?? null)
      const ingredientName =
        ingredient?.name ?? subRecipeRef?.name ?? item.notes ?? `Ingredient ${index + 1}`

      // A sub-recipe line is priced like a regular ingredient, but its rate is
      // recalculated LIVE from the sub-recipe's current ingredients whenever
      // possible, rather than trusting the frozen sub_ingredient_cost_per_unit
      // snapshot written the last time that sub-recipe was saved. The snapshot
      // is only used as a fallback (e.g. the sub-recipe has no ingredient rows
      // in this fetch, or its own yield data is invalid) — subRecipeCostStale
      // flags whenever that fallback fired so the UI can surface it.
      //
      // Prefer the pre-computed map (one computeLiveSubRecipeCost call shared
      // across every line/recipe referencing this sub-recipe) over computing
      // it fresh per line — falls back to the per-line nested embed when no
      // map entry exists, which is always the case for getRecipeWithIngredients.
      const mappedSubRecipeCost =
        !ingredient && item.sub_recipe_id ? subRecipeCostMap?.get(item.sub_recipe_id) : undefined
      const liveSubRecipeCost =
        mappedSubRecipeCost ?? (!ingredient && subRecipeRef ? computeLiveSubRecipeCost(subRecipeRef) : null)

      const currentPrice = ingredient?.currentPrice ?? liveSubRecipeCost?.costPerUnit ?? null
      const priceUnit =
        ingredient?.priceUnit ?? liveSubRecipeCost?.unit ?? subRecipeRef?.sub_ingredient_unit ?? item.unit
      const subRecipeCostStale =
        liveSubRecipeCost != null &&
        (liveSubRecipeCost.source === 'snapshot' || liveSubRecipeCost.source === 'live_incomplete')

      const line: RecipeIngredientDraft = {
        id: item.id,
        ingredientId: item.ingredient_id ?? ingredient?.id ?? null,
        subRecipeId: item.sub_recipe_id ?? null,
        ingredientName,
        ingredientBrand: ingredient?.brand ?? null,
        quantity: Number(item.quantity),
        unit: item.unit,
        currentPrice,
        priceUnit,
        notes: item.notes ?? null,
        lineCost: 0,
        allergens,
        yield_percent: item.yield_percent != null ? Number(item.yield_percent) : 100,
        yield_override: item.yield_override ?? false,
        subRecipeCostStale,
        // Computed live from the sub-recipe's own ingredient rows first,
        // since the nested join's sub_ingredient_weight_g can be missing
        // from the response when PostgREST's schema cache hasn't picked up
        // this column for this relationship path yet. Falls back to the
        // direct top-level lookup (fetchSubRecipeWeights), then the nested
        // join column itself.
        subRecipeWeightG:
          liveSubRecipeCost?.weightG ??
          (item.sub_recipe_id ? subRecipeWeights[item.sub_recipe_id] : null) ??
          subRecipeRef?.sub_ingredient_weight_g ??
          null,
        // Only computable from a live recalculation (see computeLiveSubRecipeCost)
        // — no persisted fallback exists, since it's derived, not stored.
        subRecipeCostPerGram: liveSubRecipeCost?.costPerGram ?? null,
        subRecipeHasSkippedVolumeLines: liveSubRecipeCost?.hasSkippedVolumeLines ?? false,
      }
      line.lineCost = calculateLineCost(line)
      return line
    })

  const instructions = parseInstructions(row.instructions)
  const laborMode = (row.labor_mode === 'time' ? 'time' : 'fixed') as 'fixed' | 'time'
  const overheadMode = (row.overhead_mode === 'percent' ? 'percent' : 'fixed') as 'fixed' | 'percent'
  const overheadPercent = Number(row.overhead_percent ?? 0)
  const wastePercent = Number(row.waste_percent ?? 0)
  const prepTimeMinutes = Number(row.prep_time_minutes ?? 0)
  const laborEnabled = row.labor_enabled ?? false
  const overheadEnabled = row.overhead_enabled ?? false
  const laborJobTitle = row.labor_job_title ?? null
  // Per-recipe rate wins; tenant's rate is only a fallback for recipes saved
  // before this field existed (see the backfill migration).
  const laborHourlyRate = row.labor_hourly_rate != null
    ? Number(row.labor_hourly_rate)
    : tenantLaborHourlyRate

  const cost = calculateRecipeCost(
    ingredients,
    Number(row.labor_cost ?? 0),
    Number(row.overhead_cost ?? 0),
    Number(row.selling_price ?? 0),
    {
      laborEnabled,
      laborMode,
      overheadEnabled,
      overheadMode,
      overheadPercent,
      wastePercent,
      prepTimeMinutes,
      laborHourlyRate,
      yieldQuantity: Number(row.yield_quantity ?? 0),
      yieldUnit: row.yield_unit ?? 'portion',
    }
  )

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? '',
    category: row.category ?? 'Other',
    yieldQuantity: Number(row.yield_quantity ?? 0),
    yieldUnit: row.yield_unit ?? 'portion',
    prepTimeMinutes,
    cookTimeMinutes: Number(row.cook_time_minutes ?? 0),
    laborEnabled,
    laborCost: Number(row.labor_cost ?? 0),
    laborMode,
    laborJobTitle,
    laborHourlyRate,
    overheadEnabled,
    overheadCost: Number(row.overhead_cost ?? 0),
    overheadMode,
    overheadPercent,
    wastePercent,
    sellingPrice: Number(row.selling_price ?? 0),
    vatEnabled: row.vat_enabled ?? true,
    vatRate: Number(row.vat_rate ?? 13.5),
    imageUrl: row.image_url ?? null,
    imageUrls: row.image_urls?.length ? row.image_urls : (row.image_url ? [row.image_url] : []),
    isSubIngredient: row.is_sub_ingredient ?? false,
    subIngredientUnit: row.sub_ingredient_unit ?? 'g',
    subIngredientWeightManualG: row.sub_ingredient_weight_manual_g ?? null,
    storageInstructions: row.storage_instructions ?? null,
    instructions,
    ingredients,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cost,
  }
}

function collectSubRecipeIds(rows: DBRecipeRow[]): string[] {
  const ids = rows.flatMap((row) => {
    const items = Array.isArray(row.recipe_ingredients)
      ? row.recipe_ingredients
      : row.recipe_ingredients
        ? [row.recipe_ingredients]
        : []
    return items.map((item) => item.sub_recipe_id)
  })
  return Array.from(new Set(ids.filter((id): id is string => !!id)))
}

/**
 * Direct top-level lookup for sub_ingredient_weight_g, bypassing the nested
 * recipes->recipes join used for recipe_ingredients.sub_recipe. PostgREST's
 * schema cache can lag behind on newly added columns for a specific
 * relationship path even after it's visible on a direct select — this
 * sidesteps that instead of trusting the (possibly stale) nested join.
 */
async function fetchSubRecipeWeights(
  supabase: ReturnType<typeof createClient>,
  subRecipeIds: string[]
): Promise<Record<string, number | null>> {
  const weights: Record<string, number | null> = {}
  if (subRecipeIds.length === 0) return weights

  const { data, error } = await supabase
    .from('recipes')
    .select('id, sub_ingredient_weight_g')
    .in('id', subRecipeIds)

  if (error) {
    console.warn('[fetchSubRecipeWeights] lookup failed:', error.message)
    return weights
  }

  ;(data as unknown as Array<{ id: string; sub_ingredient_weight_g: number | null }> | null)?.forEach((w) => {
    weights[w.id] = w.sub_ingredient_weight_g ?? null
  })

  return weights
}

/**
 * Fetches every distinct sub-recipe referenced by `subRecipeIds` ONCE, flat —
 * not nested inside each referencing recipe_ingredients row. The old nested
 * `sub_recipe:recipes!sub_recipe_id(...)` embed re-expanded the whole
 * sub-recipe (its own recipe_ingredients, their ingredients, their
 * price_history) for every line/recipe that referenced it; PostgREST doesn't
 * deduplicate embedded entities, so a sub-recipe used 10 times was
 * transferred 10 times. Runs computeLiveSubRecipeCost exactly once per
 * distinct sub-recipe instead of once per referencing line — see
 * mapRecipeRow's subRecipeCostMap lookup. Preserves the same one-level-deep
 * shape the nested embed had (the sub-recipe's own ingredient lines, with
 * price_history constrained the same way as the parent query) and, per its
 * existing precedent, no sub-sub-recipe fallback.
 */
async function fetchSubRecipeCostMap(
  supabase: ReturnType<typeof createClient>,
  subRecipeIds: string[]
): Promise<Map<string, SubRecipeCostResult>> {
  const map = new Map<string, SubRecipeCostResult>()
  if (subRecipeIds.length === 0) return map

  const { data, error } = await supabase
    .from('recipes')
    .select(
      `
        id,
        sub_ingredient_cost_per_unit,
        sub_ingredient_unit,
        sub_ingredient_weight_g,
        sub_ingredient_weight_manual_g,
        yield_quantity,
        yield_unit,
        labor_enabled,
        labor_cost,
        labor_mode,
        labor_hourly_rate,
        prep_time_minutes,
        overhead_enabled,
        overhead_cost,
        overhead_mode,
        overhead_percent,
        waste_percent,
        recipe_ingredients!recipe_ingredients_recipe_id_fkey (
          quantity,
          unit,
          yield_percent,
          ingredient:ingredients (
            current_price,
            price_unit,
            price_history:ingredient_price_history (
              id, price, unit, is_selected_price, recorded_at
            )
          )
        )
      `
    )
    .in('id', subRecipeIds)
    .order('is_selected_price', {
      ascending: false,
      referencedTable: 'recipe_ingredients.ingredient.price_history',
    })
    .order('recorded_at', {
      ascending: false,
      referencedTable: 'recipe_ingredients.ingredient.price_history',
    })
    .order('id', {
      ascending: false,
      referencedTable: 'recipe_ingredients.ingredient.price_history',
    })
    .limit(1, { referencedTable: 'recipe_ingredients.ingredient.price_history' })

  if (error) {
    console.warn('[fetchSubRecipeCostMap] lookup failed:', error.message)
    return map
  }

  ;(data as unknown as SubRecipeCostRow[] | null)?.forEach((row) => {
    map.set(row.id, computeLiveSubRecipeCost(row))
  })

  return map
}

function mapSummary(
  row: DBRecipeRow,
  laborHourlyRate = 15,
  subRecipeCostMap?: Map<string, SubRecipeCostResult>
): RecipeSummary {
  const recipe = mapRecipeRow(row, laborHourlyRate, {}, subRecipeCostMap)
  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    category: recipe.category,
    yieldQuantity: recipe.yieldQuantity,
    yieldUnit: recipe.yieldUnit,
    imageUrl: recipe.imageUrl,
    ingredientCount: recipe.ingredients.length,
    updatedAt: recipe.updatedAt,
    isSubIngredient: recipe.isSubIngredient,
    cost: recipe.cost,
  }
}

export function useRecipes(options?: { autoLoad?: boolean }) {
  const autoLoad = options?.autoLoad ?? true
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshRecipes = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const tenantId = await resolveTenantId()

      // LIST payload only — see mapSummary(). Trimmed to what the cards render
      // plus whatever calculateRecipeCost genuinely needs to get a real
      // margin: no `instructions` (can be large free text) or other fields
      // RecipeSummary never reads, no per-line notes/sort_order/yield_override/
      // ingredient brand, price_history constrained to the single row
      // resolveIngredientPrice will actually pick (is_selected_price first,
      // else most recent — verified this returns identical results to the
      // full history, see resolveIngredientPrice.test.ts). No nested
      // `sub_recipe:recipes!sub_recipe_id(...)` embed either — PostgREST
      // re-expands that block (the sub-recipe's own ingredients + their
      // price_history) in full for EVERY referencing line, so a sub-recipe
      // used by several recipes was transferred several times over. It's
      // fetched once instead, flat, right below. The tenant-settings lookup
      // doesn't depend on the recipes query, so they run concurrently.
      const [{ data: tenantData, error: tenantError }, { data, error: fetchError }] = await Promise.all([
        supabase
          .from('tenants')
          .select('labor_hourly_rate')
          .eq('id', tenantId)
          .maybeSingle(),
        supabase
          .from('recipes')
          .select(
            `
              id,
              name,
              description,
              category,
              yield_quantity,
              yield_unit,
              prep_time_minutes,
              labor_enabled,
              labor_cost,
              labor_mode,
              labor_hourly_rate,
              overhead_enabled,
              overhead_cost,
              overhead_mode,
              overhead_percent,
              waste_percent,
              selling_price,
              image_url,
              is_sub_ingredient,
              updated_at,
              recipe_ingredients!recipe_ingredients_recipe_id_fkey (
                sub_recipe_id,
                quantity,
                unit,
                yield_percent,
                ingredient:ingredients (
                  current_price,
                  price_unit,
                  price_history:ingredient_price_history (
                    id, price, unit, is_selected_price, recorded_at
                  )
                )
              )
            `
          )
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          // Third sort key (id.desc) makes the server-side pick fully
          // deterministic on a recorded_at tie, matching
          // resolveIngredientPrice's own tiebreak (entry.id > newest.id)
          // exactly — otherwise Postgres could return either tied row and
          // the constrained query could silently diverge from the full-
          // history result on that edge case.
          .order('is_selected_price', {
            ascending: false,
            referencedTable: 'recipe_ingredients.ingredient.price_history',
          })
          .order('recorded_at', {
            ascending: false,
            referencedTable: 'recipe_ingredients.ingredient.price_history',
          })
          .order('id', {
            ascending: false,
            referencedTable: 'recipe_ingredients.ingredient.price_history',
          })
          .limit(1, { referencedTable: 'recipe_ingredients.ingredient.price_history' }),
      ])

      if (tenantError) {
        console.warn('[refreshRecipes] tenant settings error:', tenantError.message)
      }

      if (fetchError) {
        console.error('[refreshRecipes] Supabase error:', {
          message: fetchError.message,
          code:    fetchError.code,
          details: fetchError.details,
          hint:    fetchError.hint,
        })
        throw fetchError
      }

      const laborHourlyRate = Number(tenantData?.labor_hourly_rate ?? 15)
      const rows = (data as unknown as DBRecipeRow[] | null) ?? []

      const subRecipeCostMap = await fetchSubRecipeCostMap(supabase, collectSubRecipeIds(rows))

      setRecipes(rows.map((row) => mapSummary(row, laborHourlyRate, subRecipeCostMap)))
    } catch (err) {
      console.error('[refreshRecipes] caught:', err)
      setError(err instanceof Error ? err.message : 'Failed to load recipes')
      setRecipes([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!autoLoad) {
      setLoading(false)
      return
    }

    refreshRecipes()
  }, [autoLoad, refreshRecipes])

  const getRecipeWithIngredients = useCallback(async (id: string) => {
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from('recipes')
      .select(
        `
          id,
          tenant_id,
          name,
          description,
          category,
          instructions,
          yield_quantity,
          yield_unit,
          prep_time_minutes,
          cook_time_minutes,
          labor_enabled,
          labor_cost,
          labor_mode,
          labor_job_title,
          labor_hourly_rate,
          overhead_enabled,
          overhead_cost,
          overhead_mode,
          overhead_percent,
          waste_percent,
          selling_price,
          vat_enabled,
          vat_rate,
          image_url,
          image_urls,
          is_active,
          is_sub_ingredient,
          sub_ingredient_unit,
          sub_ingredient_cost_per_unit,
          sub_ingredient_weight_manual_g,
          storage_instructions,
          recipe_ingredients!recipe_ingredients_recipe_id_fkey (
            id,
            recipe_id,
            ingredient_id,
            sub_recipe_id,
            quantity,
            unit,
            notes,
            sort_order,
            yield_percent,
            yield_override,
            ingredient:ingredients (
              id,
              name,
              brand,
              current_price,
              price_unit,
              price_history:ingredient_price_history (
                id, price, unit, brand, is_selected_price, recorded_at
              )
            ),
            sub_recipe:recipes!sub_recipe_id (
              id,
              name,
              sub_ingredient_cost_per_unit,
              sub_ingredient_unit,
              sub_ingredient_weight_g,
              sub_ingredient_weight_manual_g,
              yield_quantity,
              yield_unit,
              labor_enabled,
              labor_cost,
              labor_mode,
              labor_hourly_rate,
              prep_time_minutes,
              overhead_enabled,
              overhead_cost,
              overhead_mode,
              overhead_percent,
              waste_percent,
              recipe_ingredients!recipe_ingredients_recipe_id_fkey (
                id,
                quantity,
                unit,
                yield_percent,
                ingredient:ingredients (
                  current_price,
                  price_unit,
                  price_history:ingredient_price_history (
                    id, price, unit, is_selected_price, recorded_at
                  )
                ),
                sub_recipe:recipes!sub_recipe_id (
                  sub_ingredient_cost_per_unit,
                  sub_ingredient_unit
                )
              )
            )
          ),
          created_at,
          updated_at
        `
      )
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      console.error('[getRecipeWithIngredients] Supabase error:', {
        message: fetchError.message,
        code:    fetchError.code,
        details: fetchError.details,
        hint:    fetchError.hint,
      })
      throw fetchError
    }

    if (!data) return null

    const row = data as unknown as DBRecipeRow
    const subRecipeWeights = await fetchSubRecipeWeights(supabase, collectSubRecipeIds([row]))

    return mapRecipeRow(row, undefined, subRecipeWeights)
  }, [])

  const saveRecipe = useCallback(
    async (recipeId: string | null, input: RecipeEditorData) => {
      let tenantId = 'draft'
      try {
        tenantId = await resolveTenantId()
      } catch {
        // If tenant resolution fails, we can still return a usable local record.
      }

      const recipeCost = calculateRecipeCost(
        input.ingredients.map((item) => ({ ...item, lineCost: calculateLineCost(item) })),
        input.laborCost,
        input.overheadCost,
        input.sellingPrice,
        {
          laborEnabled: input.laborEnabled,
          laborMode: input.laborMode,
          prepTimeMinutes: input.prepTimeMinutes,
          laborHourlyRate: input.laborHourlyRate ?? 0,
          overheadEnabled: input.overheadEnabled,
          overheadMode: input.overheadMode,
          overheadPercent: input.overheadPercent,
          wastePercent: input.wastePercent,
          yieldQuantity: input.yieldQuantity,
          yieldUnit: input.yieldUnit,
        }
      )
      // Compute cost per sub-ingredient unit so parent recipes can price by weight/volume
      // OR by count. subIngredientUnit is pinned to the recipe's own yield unit in
      // RecipeBuilder.doSave, so yieldUnit and subIngredientUnit are always in the same
      // family — this always converts cleanly:
      //   Weight/volume yield (e.g. 1.15 kg, subIngredientUnit = 'kg'):
      //     yieldInSubUnit = 1.15 → costPerUnit = totalCost / 1.15 (€/kg)
      //   Count yield (e.g. 1 unit, subIngredientUnit = 'unit'):
      //     yieldInSubUnit = 1 → costPerUnit = totalCost / 1 (€/unit = total cost of one item)
      const subIngredientUnit = input.subIngredientUnit || 'unit'
      const yieldInSubUnit = (() => {
        if (!input.isSubIngredient) return 0
        return convertUnit(input.yieldQuantity, input.yieldUnit, subIngredientUnit)
      })()
      const subIngredientCostPerUnit =
        input.isSubIngredient && yieldInSubUnit > 0
          ? recipeCost.totalCost / yieldInSubUnit
          : null

      // Total EP weight of this recipe in grams — summed only from its
      // weight-family ingredient lines (g/kg/oz/lb). Volume ingredients are
      // deliberately excluded rather than converted, since weight↔volume
      // needs an unstated density (see CLAUDE.md costing rule 3). Stored so
      // a parent recipe can bridge "used Xg of this" against a sub-recipe
      // that's priced per count unit (see cost-calculator.ts).
      const subIngredientWeightG = (() => {
        if (!input.isSubIngredient) return null
        const totalG = input.ingredients.reduce((sum, ing) => {
          if (getUnitFamily(ing.unit) !== 'weight') return sum
          return sum + convertUnit(ing.quantity, ing.unit, 'g')
        }, 0)
        return totalG > 0 ? totalG : null
      })()

      const res = await fetch('/api/recipes/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: recipeId,
          name: input.name,
          description: input.description || null,
          category: input.category || 'Other',
          instructions: serializeInstructions(input.instructions),
          yieldQuantity: input.yieldQuantity,
          yieldUnit: input.yieldUnit,
          prepTimeMinutes: input.prepTimeMinutes,
          cookTimeMinutes: input.cookTimeMinutes,
          laborEnabled: input.laborEnabled,
          laborCost: input.laborCost,
          laborMode: input.laborMode,
          laborJobTitle: input.laborJobTitle,
          laborHourlyRate: input.laborHourlyRate,
          overheadEnabled: input.overheadEnabled,
          overheadCost: input.overheadCost,
          overheadMode: input.overheadMode,
          overheadPercent: input.overheadPercent,
          wastePercent: input.wastePercent,
          sellingPrice: input.sellingPrice,
          vatEnabled: input.vatEnabled,
          vatRate: input.vatRate,
          imageUrl: input.imageUrls[0] ?? input.imageUrl,
          imageUrls: input.imageUrls,
          isSubIngredient: input.isSubIngredient,
          subIngredientUnit,
          subIngredientCostPerUnit,
          subIngredientWeightG,
          subIngredientWeightManualG: input.subIngredientWeightManualG ?? null,
          storageInstructions: input.storageInstructions ?? null,
          ingredients: input.ingredients,
        }),
      })

      const json = await res.json() as { success?: boolean; recipeId?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Unable to save recipe')

      const savedId = json.recipeId
      if (!savedId) throw new Error('Recipe id missing after save')

      const refreshed = await getRecipeWithIngredients(savedId).catch((error) => {
        console.warn('[useRecipes] Reload after save failed:', error)
        return null
      })

      if (refreshed) {
        return refreshed
      }

      console.warn('[useRecipes] Falling back to local recipe snapshot after save')
      return buildRecipeRecordFromInput(
        input,
        savedId,
        tenantId,
        new Date().toISOString(),
        new Date().toISOString()
      )
    },
    [getRecipeWithIngredients]
  )

  const createRecipe = useCallback(
    async (input: RecipeEditorData) => saveRecipe(null, input),
    [saveRecipe]
  )

  const updateRecipe = useCallback(
    async (id: string, input: RecipeEditorData) => saveRecipe(id, input),
    [saveRecipe]
  )

  const deleteRecipe = useCallback(async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('recipes').delete().eq('id', id)
    if (error) {
      throw error
    }
  }, [])

  const addIngredientToRecipe = useCallback(
    async (
      recipeId: string,
      ingredientId: string,
      quantity: number,
      unit: string,
      notes?: string | null
    ) => {
      const supabase = createClient()
      const { error } = await supabase.from('recipe_ingredients').insert({
        recipe_id: recipeId,
        ingredient_id: ingredientId,
        quantity,
        unit,
        notes: notes ?? null,
      })

      if (error) {
        throw error
      }
    },
    []
  )

  const removeIngredientFromRecipe = useCallback(async (recipeIngredientId: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('recipe_ingredients')
      .delete()
      .eq('id', recipeIngredientId)

    if (error) {
      throw error
    }
  }, [])

  const updateIngredientQuantity = useCallback(
    async (recipeIngredientId: string, quantity: number, unit: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('recipe_ingredients')
        .update({ quantity, unit })
        .eq('id', recipeIngredientId)

      if (error) {
        throw error
      }
    },
    []
  )

  return {
    recipes,
    loading,
    error,
    refreshRecipes,
    getRecipeWithIngredients,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    addIngredientToRecipe,
    removeIngredientFromRecipe,
    updateIngredientQuantity,
    calculateRecipeCost,
    calculateLineCost,
  }
}
