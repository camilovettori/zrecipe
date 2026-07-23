'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveIngredientPrice, type PriceHistoryEntry } from '@/lib/ingredients/resolveIngredientPrice'
import { deleteIngredientById, type DeleteIngredientResult } from '@/lib/ingredients/deleteIngredient'

export interface IngredientRow {
  id: string
  name: string
  brand: string | null
  /** Brand of the effective price_history row (selected, else latest) —
   *  the brand actually driving this ingredient's cost today. Legacy
   *  `brand` above is no longer read as the source of truth for display. */
  effectiveBrand: string | null
  category: string | null
  current_price: number | null
  base_unit: string
  package_size: number | null
  package_unit: string | null
  last_purchase_date: string | null
  last_supplier_id: string | null
  notes: string | null
  image_url: string | null
  supplier_id: string | null
  supplier: { name: string } | null
  created_at: string
  updated_at: string
}

export type SortKey = 'name' | 'price' | 'updated'

type IngredientDbRow = {
  id: string
  name: string
  brand: string | null
  category: string | null
  current_price: number | null
  price_unit: string | null
  package_size: number | null
  package_unit: string | null
  last_purchase_date: string | null
  last_supplier_id: string | null
  notes: string | null
  image_url: string | null
  supplier_id: string | null
  supplier: { name: string } | { name: string }[] | null
  created_at: string
  updated_at: string
  price_history?: Array<PriceHistoryEntry & { brand?: string | null }> | null
}

function normalizeIngredientRow(row: IngredientDbRow): IngredientRow {
  const supplier = Array.isArray(row.supplier) ? row.supplier[0] ?? null : row.supplier
  const resolved = resolveIngredientPrice(row.price_history ?? [], row.current_price, row.price_unit)
  const effectiveBrand = row.price_history?.find((h) => h.id === resolved.historyId)?.brand ?? null
  return {
    id: row.id,
    name: row.name,
    brand: row.brand ?? null,
    effectiveBrand,
    category: row.category,
    current_price: row.current_price,
    base_unit: row.price_unit ?? '',
    package_size: row.package_size,
    package_unit: row.package_unit,
    last_purchase_date: row.last_purchase_date,
    last_supplier_id: row.last_supplier_id,
    notes: row.notes,
    image_url: row.image_url,
    supplier_id: row.supplier_id,
    supplier: supplier ? { name: supplier.name } : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

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
      .select(
        `id, name, brand, category, current_price, price_unit, package_size, package_unit, last_purchase_date, last_supplier_id, notes, image_url, supplier_id, supplier:suppliers!last_supplier_id(name), created_at, updated_at,
         price_history:ingredient_price_history ( id, price, unit, brand, is_selected_price, recorded_at )`
      )
      .order('name')
    if (error) setError(error.message)
    else {
      const rows = (data as IngredientDbRow[] | null) ?? []
      setAll(rows.map(normalizeIngredientRow))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const ingredients = applySort(
    all.filter((i) => {
      const matchSearch =
        !search ||
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.brand?.toLowerCase().includes(search.toLowerCase()) ?? false)
      const matchCat =
        category === 'all' || i.category?.toLowerCase() === category.toLowerCase()
      return matchSearch && matchCat
    }),
    sortBy
  )
  const categories = Array.from(
    new Set(all.map((i) => i.category).filter((cat): cat is string => Boolean(cat)))
  ).sort()

  const createIngredient = async (
    data: Omit<IngredientRow, 'id' | 'supplier' | 'created_at' | 'updated_at' | 'effectiveBrand'>
  ) => {
    const supabase = createClient()
    const { base_unit, ...rest } = data
    const { data: row, error } = await supabase
      .from('ingredients')
      .insert({
        ...rest,
        price_unit: base_unit,
      })
      .select()
      .single()
    if (error) throw error
    await fetch()
    return normalizeIngredientRow(row as IngredientDbRow)
  }

  const updateIngredient = async (id: string, data: Partial<IngredientRow>) => {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { base_unit, effectiveBrand, ...rest } = data
    const { data: row, error } = await supabase
      .from('ingredients')
      .update({
        ...rest,
        ...(base_unit !== undefined ? { price_unit: base_unit } : {}),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    await fetch()
    return normalizeIngredientRow(row as IngredientDbRow)
  }

  const deleteIngredient = async (id: string): Promise<DeleteIngredientResult> => {
    const supabase = createClient()
    const result = await deleteIngredientById(supabase, id)
    if (result.ok) await fetch()
    return result
  }

  return {
    ingredients,
    categories,
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
