'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { DEFAULT_INGREDIENT_CATEGORIES } from '@/lib/constants/ingredient-categories'

export function useIngredientCategories() {
  const [categories, setCategories] = useState<string[]>(DEFAULT_INGREDIENT_CATEGORIES)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    const tenantId = await resolveTenantId()

    const [{ data: ingredientRows }, { data: tenantRow }] = await Promise.all([
      supabase.from('ingredients').select('category'),
      supabase
        .from('tenants')
        .select('hidden_ingredient_categories')
        .eq('id', tenantId)
        .single(),
    ])

    const hidden = new Set(
      ((tenantRow?.hidden_ingredient_categories ?? []) as string[]).map((c) => c.toLowerCase())
    )

    const seen = new Map<string, string>() // lowercase -> display casing
    for (const def of DEFAULT_INGREDIENT_CATEGORIES) {
      seen.set(def.toLowerCase(), def)
    }
    for (const row of ingredientRows ?? []) {
      const cat = (row as { category: string | null }).category
      if (cat && cat.trim() && !seen.has(cat.trim().toLowerCase())) {
        seen.set(cat.trim().toLowerCase(), cat.trim())
      }
    }

    // "Other" is the required fallback category (`ingredient.category ?? 'Other'`)
    // used elsewhere in the codebase, so it can never be hidden from the picker.
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
