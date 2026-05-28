'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface IngredientRow {
  id: string
  name: string
  category: string | null
  current_price: number | null
  base_unit: string
  package_size: number | null
  package_unit: string | null
  notes: string | null
  image_url: string | null
  supplier_id: string | null
  supplier: { name: string } | null
  created_at: string
  updated_at: string
}

export type SortKey = 'name' | 'price' | 'updated'

function applySort(items: IngredientRow[], sort: SortKey): IngredientRow[] {
  return [...items].sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'price':
        return (a.current_price ?? 0) - (b.current_price ?? 0)
      case 'updated':
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    }
  })
}

export function useIngredients() {
  const [all, setAll] = useState<IngredientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sortBy, setSortBy] = useState<SortKey>('name')

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('ingredients')
      .select('*, supplier:suppliers(name)')
      .order('name')
    if (error) setError(error.message)
    else setAll(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const ingredients = applySort(
    all.filter((i) => {
      const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase())
      const matchCat =
        category === 'all' || i.category?.toLowerCase() === category.toLowerCase()
      return matchSearch && matchCat
    }),
    sortBy
  )

  const createIngredient = async (
    data: Omit<IngredientRow, 'id' | 'supplier' | 'created_at' | 'updated_at'>
  ) => {
    const supabase = createClient()
    const { data: row, error } = await supabase
      .from('ingredients')
      .insert(data)
      .select()
      .single()
    if (error) throw error
    await fetch()
    return row as IngredientRow
  }

  const updateIngredient = async (id: string, data: Partial<IngredientRow>) => {
    const supabase = createClient()
    const { data: row, error } = await supabase
      .from('ingredients')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    await fetch()
    return row as IngredientRow
  }

  const deleteIngredient = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('ingredients').delete().eq('id', id)
    if (error) throw error
    await fetch()
  }

  return {
    ingredients,
    loading,
    error,
    refetch: fetch,
    createIngredient,
    updateIngredient,
    deleteIngredient,
    search,
    setSearch,
    category,
    setCategory,
    sortBy,
    setSortBy,
    searchIngredients: (q: string) => setSearch(q),
    filterByCategory: (cat: string) => setCategory(cat),
  }
}
