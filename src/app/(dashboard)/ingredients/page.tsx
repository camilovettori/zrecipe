'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, LayoutGrid, List, Lock, Plus, Search, SlidersHorizontal, Apple } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useIngredients, type SortKey } from '@/hooks/useIngredients'
import { useSubscription } from '@/hooks/useSubscription'
import IngredientCard from '@/components/ingredients/IngredientCard'
import { CustomSelect } from '@/components/ui/CustomSelect'
import IngredientListView, { type TrendData } from '@/components/ingredients/IngredientListView'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import SupplierPriceImportModal from '@/components/ingredients/SupplierPriceImportModal'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'price', label: 'Price' },
  { value: 'updated', label: 'Last Updated' },
]

type ViewMode = 'grid' | 'list'

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 h-5 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-2 h-7 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 dark:border-slate-700">
        <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  )
}

function SkeletonListRow() {
  return (
    <div className="flex animate-pulse items-center gap-4 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
      <div className="h-10 w-10 rounded-lg bg-slate-200 dark:bg-slate-700" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="hidden h-4 w-16 rounded bg-slate-200 dark:bg-slate-700 md:block" />
    </div>
  )
}

export default function IngredientsPage() {
  const router = useRouter()
  const {
    ingredients,
    categories,
    loading,
    error,
    deleteIngredient,
    search,
    searchIngredients,
    category,
    filterByCategory,
    sortBy,
    setSortBy,
    needsVerificationOnly,
    setNeedsVerificationOnly,
    needsVerificationCount,
  } = useIngredients()
  const { limits, hasFullAccess } = useSubscription()

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [trends, setTrends] = useState<Record<string, TrendData>>({})

  // Read the persisted view mode after mount, not during the initial render —
  // reading localStorage in the useState initializer made the client's first
  // render tree diverge from the server-rendered 'grid' skeleton, causing a
  // hydration mismatch whenever a user had 'list' saved.
  useEffect(() => {
    const stored = localStorage.getItem('ingredients-view-mode') as ViewMode | null
    if (stored === 'grid' || stored === 'list') {
      setViewMode(stored)
    }
  }, [])

  // Fetch price trends when switching to list view (or when ingredients change in list mode)
  useEffect(() => {
    if (viewMode !== 'list' || ingredients.length === 0 || loading) return

    const ids = ingredients.map((i) => i.id)
    const supabase = createClient()
    supabase
      .from('ingredient_price_history')
      .select('ingredient_id, price, recorded_at')
      .in('ingredient_id', ids)
      .order('recorded_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return

        // Group by ingredient_id, keep the latest 2 per ingredient
        const grouped = new Map<string, number[]>()
        for (const row of data) {
          const arr = grouped.get(row.ingredient_id) ?? []
          if (arr.length < 2) {
            arr.push(row.price)
            grouped.set(row.ingredient_id, arr)
          }
        }

        const computed: Record<string, TrendData> = {}
        for (const [id, prices] of Array.from(grouped.entries())) {
          if (prices.length < 2 || prices[1] === 0) {
            computed[id] = { direction: 'flat', pct: 0 }
            continue
          }
          const latest = prices[0]
          const prev = prices[1]
          const pct = Math.abs(((latest - prev) / prev) * 100)
          computed[id] = {
            direction: latest > prev ? 'up' : latest < prev ? 'down' : 'flat',
            pct,
          }
        }
        setTrends(computed)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, loading, ingredients.length])

  const setView = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('ingredients-view-mode', mode)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const result = await deleteIngredient(deleteTarget.id)
      if (result.ok) {
        toast.success(`"${deleteTarget.name}" deleted`)
        setDeleteTarget(null)
      } else if (result.reason === 'in_use') {
        const name = result.ingredientName ?? 'This ingredient'
        if (result.recipeCount > 0) {
          toast.error(
            `${name} is used in ${result.recipeCount} recipe${result.recipeCount === 1 ? '' : 's'}. Remove it from those recipes first, or use Merge to combine it with another ingredient.`,
            { duration: 8000 }
          )
        } else {
          toast.error(
            `${name} still has references in the system (price history, allergens, or other data). It cannot be deleted right now.`,
            { duration: 8000 }
          )
        }
      } else {
        toast.error(`Failed to delete ingredient: ${result.message}`)
      }
    } catch {
      toast.error('Failed to delete ingredient')
    } finally {
      setDeleting(false)
    }
  }

  const hasFilters = search !== '' || category !== 'all'
  const atIngredientLimit = !hasFullAccess && ingredients.length >= limits.maxIngredients

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Ingredients
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {loading
              ? 'Loading…'
              : `${ingredients.length} ingredient${ingredients.length !== 1 ? 's' : ''}${hasFilters ? ' found' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setImportOpen(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <Search className="h-4 w-4" />
          Import supplier price list
        </button>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => !atIngredientLimit && router.push('/ingredients/new')}
            disabled={atIngredientLimit}
            title={atIngredientLimit ? `Free plan limit: ${limits.maxIngredients} ingredients` : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
              atIngredientLimit ? 'cursor-not-allowed bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-500'
            )}
          >
            {atIngredientLimit ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Add Ingredient
          </button>
          {atIngredientLimit && (
            <p className="text-right text-xs text-slate-500">
              Free plan limit of {limits.maxIngredients} reached.{' '}
              <a href="/settings/billing" className="font-medium text-emerald-600 hover:underline">Upgrade</a>
            </p>
          )}
        </div>
      </div>

      {/* Filters + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search ingredients…"
            value={search}
            onChange={(e) => searchIngredients(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
          />
        </div>

        <CustomSelect
          value={category}
          onChange={filterByCategory}
          options={[
            { value: 'all', label: 'All Categories' },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
        />

        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-400" />
          <CustomSelect
            value={sortBy}
            onChange={(v) => setSortBy(v as SortKey)}
            options={SORT_OPTIONS.map((o) => ({ value: o.value, label: `Sort: ${o.label}` }))}
          />
        </div>

        {/* Needs verification toggle — hidden entirely when there's nothing to show */}
        {needsVerificationCount > 0 && (
          <button
            type="button"
            onClick={() => setNeedsVerificationOnly((v) => !v)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              needsVerificationOnly
                ? 'border-amber-300 bg-amber-100 text-amber-800'
                : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Needs verification ({needsVerificationCount})
          </button>
        )}

        {/* View mode toggle */}
        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={() => setView('grid')}
            title="Grid view"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
              viewMode === 'grid'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('list')}
            title="List view"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
              viewMode === 'list'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonListRow key={i} />)}
          </div>
        )
      ) : ingredients.length === 0 ? (
        <EmptyState
          icon={Apple}
          title={hasFilters ? 'No results found' : 'No ingredients yet'}
          description={
            hasFilters
              ? 'Try adjusting your search or filter to find what you\'re looking for.'
              : 'Add your first ingredient to start tracking costs and price history.'
          }
          action={
            !hasFilters
              ? { label: 'Add your first ingredient', onClick: () => router.push('/ingredients/new') }
              : undefined
          }
        />
      ) : viewMode === 'grid' ? (
        <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {ingredients.map((ingredient) => (
              <motion.div
                key={ingredient.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18 }}
              >
                <IngredientCard
                  ingredient={ingredient}
                  onDeleteRequest={(id, name) => setDeleteTarget({ id, name })}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <IngredientListView
          ingredients={ingredients}
          trends={trends}
          sortBy={sortBy}
          onSortChange={setSortBy}
          onDeleteRequest={(id, name) => setDeleteTarget({ id, name })}
        />
      )}

      <ConfirmDelete
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        itemName={deleteTarget?.name ?? ''}
        loading={deleting}
      />

      <SupplierPriceImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        ingredients={ingredients}
      />
    </div>
  )
}
