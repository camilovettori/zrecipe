'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { convertUnit, isConvertible } from '@/lib/utils/unit-converter'
import { calculateCost, calculateIngredientCost } from '@/lib/utils/cost-calculator'
import { type IngredientLookup } from '@/hooks/useInvoices'
import { resolveTenantId } from '@/hooks/useTenant'
import { type IngredientAllergen, type AllergenStatus } from '@/lib/allergens'

export interface RecipeStepDraft {
  id: string
  text: string
}

export interface RecipeIngredientDraft {
  id: string
  ingredientId?: string | null
  subRecipeId?: string | null
  subRecipeTotalCost?: number | null
  subRecipeYieldQuantity?: number | null
  subRecipeYieldUnit?: string | null
  subRecipeCostUnit?: string | null
  ingredientName: string
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
}

export interface RecipeEditorData {
  name: string
  description: string
  category: string
  yieldQuantity: number
  yieldUnit: string
  prepTimeMinutes: number
  cookTimeMinutes: number
  laborCost: number
  laborMode: 'fixed' | 'time'
  overheadCost: number
  overheadMode: 'fixed' | 'percent'
  overheadPercent: number
  wastePercent: number
  sellingPrice: number
  imageUrl: string | null
  imageUrls: string[]
  isSubIngredient: boolean
  subIngredientUnit: string
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
  current_price?: number | null
  price_unit?: string | null
  ingredient_allergens?: Array<{ allergen_id: number; status: string }> | null
}

type DBSubRecipeRef = {
  id: string
  name: string
  sub_ingredient_cost_per_unit?: number | null
  sub_ingredient_unit?: string | null
  yield_quantity?: number | null
  yield_unit?: string | null
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
  labor_cost?: number | null
  labor_mode?: string | null
  overhead_cost?: number | null
  overhead_mode?: string | null
  overhead_percent?: number | null
  waste_percent?: number | null
  selling_price?: number | null
  image_url?: string | null
  image_urls?: string[] | null
  is_active?: boolean | null
  is_sub_ingredient?: boolean | null
  sub_ingredient_unit?: string | null
  sub_ingredient_cost_per_unit?: number | null
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
      return row
    ? {
        id: row.id,
        name: row.name,
        currentPrice: row.current_price ?? null,
        priceUnit: row.price_unit ?? null,
      } satisfies IngredientLookup
    : null
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

function ingredientLineCost(item: RecipeIngredientDraft) {
  return calculateIngredientCost({
    quantity: item.quantity,
    unit: item.unit,
    name: item.ingredientName,
    yield_percent: item.yield_percent ?? 100,
    current_price: item.currentPrice ?? 0,
    price_unit: item.priceUnit ?? item.unit,
    subRecipeId: item.subRecipeId ?? null,
    subRecipeTotalCost: item.subRecipeTotalCost ?? null,
    subRecipeYieldQuantity: item.subRecipeYieldQuantity ?? null,
    subRecipeYieldUnit: item.subRecipeYieldUnit ?? null,
    subRecipeCostUnit: item.subRecipeCostUnit ?? null,
  }).cost
}

export function calculateRecipeCost(
  ingredients: RecipeIngredientDraft[],
  laborCost = 0,
  overheadCost = 0,
  sellingPrice = 0,
  opts?: {
    laborMode?: 'fixed' | 'time'
    prepTimeMinutes?: number
    laborHourlyRate?: number
    overheadMode?: 'fixed' | 'percent'
    overheadPercent?: number
    wastePercent?: number
    yieldQuantity?: number
    yieldUnit?: string
  }
): RecipeCostSummary {
  const costs = calculateCost({
    ingredients: ingredients.map((item) => ({
      quantity: item.quantity,
      unit: item.unit,
      yield_percent: item.yield_percent ?? 100,
      current_price: item.currentPrice ?? 0,
      price_unit: item.priceUnit ?? item.unit,
      subRecipeId: item.subRecipeId ?? null,
      subRecipeTotalCost: item.subRecipeTotalCost ?? null,
      subRecipeYieldQuantity: item.subRecipeYieldQuantity ?? null,
      subRecipeYieldUnit: item.subRecipeYieldUnit ?? null,
      subRecipeCostUnit: item.subRecipeCostUnit ?? null,
    })),
    laborMode: opts?.laborMode ?? 'fixed',
    laborCostFixed: laborCost,
    prepTimeMinutes: opts?.prepTimeMinutes ?? 0,
    laborHourlyRate: opts?.laborHourlyRate ?? 15,
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
      laborMode: input.laborMode,
      prepTimeMinutes: input.prepTimeMinutes,
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
    laborCost: input.laborCost,
    laborMode: input.laborMode,
    overheadCost: input.overheadCost,
    overheadMode: input.overheadMode,
    overheadPercent: input.overheadPercent,
    wastePercent: input.wastePercent,
    sellingPrice: input.sellingPrice,
    imageUrl: input.imageUrl,
    imageUrls: input.imageUrls,
    isSubIngredient: input.isSubIngredient,
    subIngredientUnit: input.subIngredientUnit,
    instructions: input.instructions,
    ingredients,
    createdAt,
    updatedAt,
    cost,
  }
}

function mapRecipeRow(row: DBRecipeRow, laborHourlyRate = 15): RecipeRecord {
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
      const currentPrice = ingredient?.currentPrice ?? subRecipeRef?.sub_ingredient_cost_per_unit ?? null
      const priceUnit = ingredient?.priceUnit ?? subRecipeRef?.sub_ingredient_unit ?? item.unit
      const subRecipeYieldQuantity = subRecipeRef?.yield_quantity ?? null
      const subRecipeYieldUnit = subRecipeRef?.yield_unit ?? null
      const line: RecipeIngredientDraft = {
        id: item.id,
        ingredientId: item.ingredient_id ?? ingredient?.id ?? null,
        subRecipeId: item.sub_recipe_id ?? null,
        subRecipeTotalCost: subRecipeRef?.sub_ingredient_cost_per_unit != null
          && subRecipeYieldQuantity != null
          && subRecipeYieldUnit
          && subRecipeRef.sub_ingredient_unit
          && isConvertible(subRecipeYieldUnit, subRecipeRef.sub_ingredient_unit)
          ? Number((subRecipeRef.sub_ingredient_cost_per_unit * convertUnit(subRecipeYieldQuantity, subRecipeYieldUnit, subRecipeRef.sub_ingredient_unit ?? item.unit)).toFixed(2))
          : null,
        subRecipeYieldQuantity,
        subRecipeYieldUnit,
        subRecipeCostUnit: subRecipeRef?.sub_ingredient_unit ?? item.unit,
        ingredientName,
        quantity: Number(item.quantity),
        unit: item.unit,
        currentPrice,
        priceUnit,
        notes: item.notes ?? null,
        lineCost: 0,
        allergens,
        yield_percent: item.yield_percent != null ? Number(item.yield_percent) : 100,
        yield_override: item.yield_override ?? false,
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

  const cost = calculateRecipeCost(
    ingredients,
    Number(row.labor_cost ?? 0),
    Number(row.overhead_cost ?? 0),
    Number(row.selling_price ?? 0),
    {
      laborMode,
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
    laborCost: Number(row.labor_cost ?? 0),
    laborMode,
    overheadCost: Number(row.overhead_cost ?? 0),
    overheadMode,
    overheadPercent,
    wastePercent,
    sellingPrice: Number(row.selling_price ?? 0),
    imageUrl: row.image_url ?? null,
    imageUrls: row.image_urls?.length ? row.image_urls : (row.image_url ? [row.image_url] : []),
    isSubIngredient: row.is_sub_ingredient ?? false,
    subIngredientUnit: row.sub_ingredient_unit ?? 'g',
    storageInstructions: row.storage_instructions ?? null,
    instructions,
    ingredients,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cost,
  }
}

function mapSummary(row: DBRecipeRow, laborHourlyRate = 15): RecipeSummary {
  const recipe = mapRecipeRow(row, laborHourlyRate)
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
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('labor_hourly_rate')
        .eq('id', tenantId)
        .maybeSingle()

      if (tenantError) {
        console.warn('[refreshRecipes] tenant settings error:', tenantError.message)
      }

      const laborHourlyRate = Number(tenantData?.labor_hourly_rate ?? 15)
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
            labor_cost,
            labor_mode,
            overhead_cost,
            overhead_mode,
            overhead_percent,
            waste_percent,
            selling_price,
            image_url,
            image_urls,
            is_active,
            is_sub_ingredient,
            sub_ingredient_unit,
            sub_ingredient_cost_per_unit,
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
                current_price,
                price_unit
              ),
              sub_recipe:recipes!sub_recipe_id (
                id,
                name,
                sub_ingredient_cost_per_unit,
                sub_ingredient_unit,
                yield_quantity,
                yield_unit
              )
            ),
            created_at,
            updated_at
          `
        )
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })

      if (fetchError) {
        console.error('[refreshRecipes] Supabase error:', {
          message: fetchError.message,
          code:    fetchError.code,
          details: fetchError.details,
          hint:    fetchError.hint,
        })
        throw fetchError
      }

      setRecipes((data as unknown as DBRecipeRow[] | null)?.map((row) => mapSummary(row, laborHourlyRate)) ?? [])
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
          labor_cost,
          labor_mode,
          overhead_cost,
          overhead_mode,
          overhead_percent,
          waste_percent,
          selling_price,
          image_url,
          image_urls,
          is_active,
          is_sub_ingredient,
          sub_ingredient_unit,
          sub_ingredient_cost_per_unit,
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
              current_price,
              price_unit
            ),
            sub_recipe:recipes!sub_recipe_id (
              id,
              name,
              sub_ingredient_cost_per_unit,
              sub_ingredient_unit,
              yield_quantity,
              yield_unit
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

    return data ? mapRecipeRow(data as unknown as DBRecipeRow) : null
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
          laborMode: input.laborMode,
          prepTimeMinutes: input.prepTimeMinutes,
          overheadMode: input.overheadMode,
          overheadPercent: input.overheadPercent,
          wastePercent: input.wastePercent,
          yieldQuantity: input.yieldQuantity,
          yieldUnit: input.yieldUnit,
        }
      )
      // Compute cost per sub-ingredient unit so parent recipes can price by weight/volume.
      // When yield and sub-ingredient unit are in the same family (e.g. yield=1.15kg, unit=g):
      //   yieldInSubUnit = convertUnit(1.15, 'kg', 'g') = 1150 → costPerGram = totalCost / 1150
      // When yield is in a count unit (e.g. 'unit') incompatible with 'g':
      //   fall back to total ingredient weight to derive the base quantity.
      const subIngredientUnit = input.subIngredientUnit || 'g'
      const yieldInSubUnit = (() => {
        if (!input.isSubIngredient) return 0
        if (isConvertible(input.yieldUnit, subIngredientUnit)) {
          return convertUnit(input.yieldQuantity, input.yieldUnit, subIngredientUnit)
        }
        // Yield unit incompatible — sum the total weight of all weight/volume ingredients
        return input.ingredients.reduce((sum, ing) => {
          if (!isConvertible(ing.unit, subIngredientUnit)) return sum
          return sum + convertUnit(ing.quantity, ing.unit, subIngredientUnit)
        }, 0)
      })()
      const subIngredientCostPerUnit =
        input.isSubIngredient && yieldInSubUnit > 0
          ? recipeCost.totalCost / yieldInSubUnit
          : null

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
          laborCost: input.laborCost,
          laborMode: input.laborMode,
          overheadCost: input.overheadCost,
          overheadMode: input.overheadMode,
          overheadPercent: input.overheadPercent,
          wastePercent: input.wastePercent,
          sellingPrice: input.sellingPrice,
          imageUrl: input.imageUrls[0] ?? input.imageUrl,
          imageUrls: input.imageUrls,
          isSubIngredient: input.isSubIngredient,
          subIngredientUnit: input.subIngredientUnit || 'g',
          subIngredientCostPerUnit,
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
