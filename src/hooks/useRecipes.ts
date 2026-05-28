'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { convertUnit } from '@/lib/utils/unit-converter'
import { type IngredientLookup } from '@/hooks/useInvoices'
import { resolveTenantId } from '@/hooks/useTenant'

export interface RecipeStepDraft {
  id: string
  text: string
}

export interface RecipeIngredientDraft {
  id: string
  ingredientId?: string | null
  ingredientName: string
  quantity: number
  unit: string
  currentPrice?: number | null
  priceUnit?: string | null
  notes?: string | null
  lineCost: number
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
  overheadCost: number
  sellingPrice: number
  imageUrl: string | null
  instructions: RecipeStepDraft[]
  ingredients: RecipeIngredientDraft[]
}

export interface RecipeCostSummary {
  ingredientCost: number
  laborCost: number
  overheadCost: number
  totalCost: number
  sellingPrice: number
  marginPercent: number
  foodCostPercentage: number
}

export interface RecipeSummary {
  id: string
  name: string
  description: string
  category: string
  imageUrl: string | null
  ingredientCount: number
  updatedAt: string
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
}

type DBRecipeIngredientRow = {
  id: string
  recipe_id: string
  ingredient_id?: string | null
  quantity: number
  unit: string
  notes?: string | null
  sort_order?: number | null
  ingredient?: DBIngredientRow[] | DBIngredientRow | null
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
  overhead_cost?: number | null
  selling_price?: number | null
  image_url?: string | null
  is_active?: boolean | null
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
  const currentPrice = item.currentPrice ?? 0
  if (!currentPrice) {
    return 0
  }

  const priceUnit = item.priceUnit ?? item.unit
  const quantityInPriceUnit = convertUnit(item.quantity, item.unit, priceUnit)
  return Number((quantityInPriceUnit * currentPrice).toFixed(2))
}

export function calculateRecipeCost(
  ingredients: RecipeIngredientDraft[],
  laborCost = 0,
  overheadCost = 0,
  sellingPrice = 0
): RecipeCostSummary {
  const ingredientCost = Number(
    ingredients.reduce((sum, item) => sum + ingredientLineCost(item), 0).toFixed(2)
  )
  const totalCost = Number((ingredientCost + laborCost + overheadCost).toFixed(2))
  const marginPercent =
    sellingPrice > 0 ? Number((((sellingPrice - totalCost) / sellingPrice) * 100).toFixed(1)) : 0
  const foodCostPercentage =
    sellingPrice > 0 ? Number(((totalCost / sellingPrice) * 100).toFixed(1)) : 0

  return {
    ingredientCost,
    laborCost,
    overheadCost,
    totalCost,
    sellingPrice,
    marginPercent,
    foodCostPercentage,
  }
}

export function calculateLineCost(item: RecipeIngredientDraft) {
  return ingredientLineCost(item)
}

function mapRecipeRow(row: DBRecipeRow): RecipeRecord {
  const recipeIngredients = Array.isArray(row.recipe_ingredients)
    ? row.recipe_ingredients
    : row.recipe_ingredients
      ? [row.recipe_ingredients]
      : []

  const ingredients = recipeIngredients
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((item, index) => {
      const ingredient = normalizeIngredientRelation(item.ingredient)
      const ingredientName =
        ingredient?.name ?? item.notes ?? `Ingredient ${index + 1}`
      const currentPrice = ingredient?.currentPrice ?? null
      const priceUnit = ingredient?.priceUnit ?? item.unit
      const line: RecipeIngredientDraft = {
        id: item.id,
        ingredientId: item.ingredient_id ?? ingredient?.id ?? null,
        ingredientName,
        quantity: Number(item.quantity),
        unit: item.unit,
        currentPrice,
        priceUnit,
        notes: item.notes ?? null,
        lineCost: 0,
      }
      line.lineCost = calculateLineCost(line)
      return line
    })

  const instructions = parseInstructions(row.instructions)
  const cost = calculateRecipeCost(
    ingredients,
    Number(row.labor_cost ?? 0),
    Number(row.overhead_cost ?? 0),
    Number(row.selling_price ?? 0)
  )

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? '',
    category: row.category ?? 'Other',
    yieldQuantity: Number(row.yield_quantity ?? 0),
    yieldUnit: row.yield_unit ?? 'portion',
    prepTimeMinutes: Number(row.prep_time_minutes ?? 0),
    cookTimeMinutes: Number(row.cook_time_minutes ?? 0),
    laborCost: Number(row.labor_cost ?? 0),
    overheadCost: Number(row.overhead_cost ?? 0),
    sellingPrice: Number(row.selling_price ?? 0),
    imageUrl: row.image_url ?? null,
    instructions,
    ingredients,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cost,
  }
}

function mapSummary(row: DBRecipeRow): RecipeSummary {
  const recipe = mapRecipeRow(row)
  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    category: recipe.category,
    imageUrl: recipe.imageUrl,
    ingredientCount: recipe.ingredients.length,
    updatedAt: recipe.updatedAt,
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
            overhead_cost,
            selling_price,
            image_url,
            is_active,
            recipe_ingredients (
              id,
              recipe_id,
              ingredient_id,
              quantity,
              unit,
              notes,
              sort_order,
              ingredient:ingredients (
                id,
                name,
                current_price,
                price_unit
              )
            ),
            created_at,
            updated_at
          `
        )
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      setRecipes((data as unknown as DBRecipeRow[] | null)?.map(mapSummary) ?? [])
    } catch (err) {
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
          overhead_cost,
          selling_price,
          image_url,
          is_active,
          recipe_ingredients (
            id,
            recipe_id,
            ingredient_id,
            quantity,
            unit,
            notes,
            sort_order,
              ingredient:ingredients (
                id,
                name,
                current_price,
                price_unit
              )
            ),
          created_at,
          updated_at
        `
      )
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      throw fetchError
    }

    return data ? mapRecipeRow(data as unknown as DBRecipeRow) : null
  }, [])

  const persistRecipeIngredients = useCallback(
    async (recipeId: string, ingredients: RecipeIngredientDraft[]) => {
      const supabase = createClient()
      const { error: deleteError } = await supabase
        .from('recipe_ingredients')
        .delete()
        .eq('recipe_id', recipeId)

      if (deleteError) {
        throw deleteError
      }

      if (ingredients.length === 0) {
        return
      }

      const tenantId = await resolveTenantId()
      const { error: insertError } = await supabase.from('recipe_ingredients').insert(
        ingredients.map((item, index) => ({
          recipe_id: recipeId,
          ingredient_id: item.ingredientId ?? null,
          quantity: item.quantity,
          unit: item.unit,
          notes: item.notes ?? item.ingredientName ?? null,
          sort_order: index,
          tenant_id: tenantId,
        }))
      )

      if (insertError) {
        throw insertError
      }
    },
    []
  )

  const saveRecipe = useCallback(
    async (recipeId: string | null, input: RecipeEditorData) => {
      const supabase = createClient()
      const tenantId = await resolveTenantId()
      const payload = {
        tenant_id: tenantId,
        name: input.name,
        description: input.description || null,
        category: input.category || 'Other',
        instructions: serializeInstructions(input.instructions),
        yield_quantity: input.yieldQuantity,
        yield_unit: input.yieldUnit,
        prep_time_minutes: input.prepTimeMinutes,
        cook_time_minutes: input.cookTimeMinutes,
        labor_cost: input.laborCost,
        overhead_cost: input.overheadCost,
        selling_price: input.sellingPrice,
        image_url: input.imageUrl,
        is_active: true,
      }

      let savedId = recipeId

      if (savedId) {
        const { error: updateError } = await supabase
          .from('recipes')
          .update(payload)
          .eq('id', savedId)

        if (updateError) {
          throw updateError
        }
      } else {
        const { data, error: createError } = await supabase
          .from('recipes')
          .insert(payload)
          .select('id')
          .single()

        if (createError || !data) {
          throw createError ?? new Error('Unable to create recipe')
        }

        savedId = data.id
      }

      if (!savedId) {
        throw new Error('Recipe id missing after save')
      }

      await persistRecipeIngredients(savedId, input.ingredients)
      const refreshed = await getRecipeWithIngredients(savedId)
      if (!refreshed) {
        throw new Error('Unable to reload saved recipe')
      }
      return refreshed
    },
    [getRecipeWithIngredients, persistRecipeIngredients]
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
