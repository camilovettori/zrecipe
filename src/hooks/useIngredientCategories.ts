'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_INGREDIENT_CATEGORIES } from '@/lib/constants/ingredient-categories'

export function useIngredientCategories() {
  const [categories, setCategories] = useState<string[]>(DEFAULT_INGREDIENT_CATEGORIES)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('ingredients')
      .select('category')
      .then(({ data }) => {
        if (cancelled || !data) return
        const seen = new Map<string, string>() // lowercase -> display casing
        for (const def of DEFAULT_INGREDIENT_CATEGORIES) {
          seen.set(def.toLowerCase(), def)
        }
        for (const row of data) {
          const cat = (row as { category: string | null }).category
          if (cat && cat.trim() && !seen.has(cat.trim().toLowerCase())) {
            seen.set(cat.trim().toLowerCase(), cat.trim())
          }
        }
        const merged = Array.from(seen.values()).sort((a, b) => {
          if (a === 'Other') return 1
          if (b === 'Other') return -1
          return a.localeCompare(b)
        })
        setCategories(merged)
      })
    return () => { cancelled = true }
  }, [])

  return categories
}
