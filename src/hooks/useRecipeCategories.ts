'use client'

// NOTE: this hook reads/writes tenants.hidden_recipe_categories, which does
// not exist in the DB yet. Run the migration at
// supabase/migrations/20260731100000_add_hidden_recipe_categories.sql
// before using this hook (or the recipe category delete/rename UI it powers)
// against a live database.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { RECIPE_CATEGORIES } from '@/hooks/useRecipes'

export function useRecipeCategories() {
  const [categories, setCategories] = useState<string[]>(RECIPE_CATEGORIES)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    const tenantId = await resolveTenantId()

    const [{ data: recipeRows }, { data: tenantRow }] = await Promise.all([
      supabase.from('recipes').select('category'),
      supabase
        .from('tenants')
        .select('hidden_recipe_categories')
        .eq('id', tenantId)
        .single(),
    ])

    const hidden = new Set(
      ((tenantRow?.hidden_recipe_categories ?? []) as string[]).map((c) => c.toLowerCase())
    )

    const seen = new Map<string, string>() // lowercase -> display casing
    for (const def of RECIPE_CATEGORIES) {
      seen.set(def.toLowerCase(), def)
    }
    for (const row of recipeRows ?? []) {
      const cat = (row as { category: string | null }).category
      if (cat && cat.trim() && !seen.has(cat.trim().toLowerCase())) {
        seen.set(cat.trim().toLowerCase(), cat.trim())
      }
    }

    // "Other" is the required fallback category used elsewhere in the
    // codebase, so it can never be hidden from the picker.
    const merged = Array.from(seen.entries())
      .filter(([lower, display]) => display === 'Other' || !hidden.has(lower))
      .map(([, display]) => display)
      .sort((a, b) => {
        if (a === 'Other') return 1
        if (b === 'Other') return -1
        return a.localeCompare(b)
      })

    setCategories(merged)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { categories, refetch }
}
