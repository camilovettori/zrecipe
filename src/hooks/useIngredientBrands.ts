'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useIngredientBrands() {
  const [brands, setBrands] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase
      .from('ingredients')
      .select('brand')
      .then(({ data }) => {
        if (cancelled || !data) return
        const seen = new Set<string>()
        for (const row of data) {
          const b = (row as { brand: string | null }).brand
          if (b && b.trim()) seen.add(b.trim())
        }
        setBrands(Array.from(seen).sort((a, b) => a.localeCompare(b)))
      })
    return () => { cancelled = true }
  }, [])

  return brands
}
