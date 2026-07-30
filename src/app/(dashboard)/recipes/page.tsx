'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChefHat, Folder, Grid2X2, LayoutList, Lock, Plus, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import RecipeCard from '@/components/recipes/RecipeCard'
import RecipeCategoryCard, { getRecipeCategoryStyle } from '@/components/recipes/RecipeCategoryCard'
import { useRecipes, type RecipeSummary } from '@/hooks/useRecipes'
import { useSubscription } from '@/hooks/useSubscription'
import { EU_ALLERGENS } from '@/lib/allergens'
import { cn } from '@/lib/utils'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { convertUnit } from '@/lib/utils/unit-converter'
import { format } from 'date-fns'

type ViewMode = 'grid' | 'list' | 'categories'
type SortKey = 'margin_desc' | 'profit_desc' | 'cost_asc' | 'name_asc' | 'updated_desc'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'margin_desc',  label: 'Margin: highest' },
  { value: 'profit_desc',  label: 'Profit: highest' },
  { value: 'cost_asc',     label: 'Cost: lowest' },
  { value: 'name_asc',     label: 'Name: A→Z' },
  { value: 'updated_desc', label: 'Recently updated' },
]

function marginPillClass(pct: number) {
  if (pct >= 60) return 'bg-emerald-100 text-emerald-700'
  if (pct >= 35) return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-600'
}

function normalizeCountUnit(unit: string) {
  const trimmed = unit.trim().toLowerCase()
  if (trimmed === 'units') return 'unit'
  if (trimmed === 'dozens') return 'dozen'
  if (trimmed === 'portions') return 'portion'
  if (trimmed === 'servings') return 'serving'
  return trimmed || 'unit'
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="aspect-video animate-pulse bg-slate-100" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-2 gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-16 animate-pulse rounded-xl bg-slate-100" />
          <div className="space-y-1.5">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </td>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
        </td>
      ))}
    </tr>
  )
}

function RecipeGrid({
  recipes,
  onOpen,
}: {
  recipes: RecipeSummary[]
  onOpen: (id: string) => void
}) {
  return (
    <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <AnimatePresence mode="popLayout">
        {recipes.map((recipe) => (
          <motion.div
            key={recipe.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16 }}
          >
            <RecipeCard recipe={recipe} onClick={onOpen} />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}

export default function RecipesPage() {
  const router = useRouter()
  const { recipes, loading, error } = useRecipes()
  const { limits, hasFullAccess } = useSubscription()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [allergenFilter, setAllergenFilter] = useState<number | null>(null)
  const [excludeRecipeIds, setExcludeRecipeIds] = useState<Set<string>>(new Set())
  const [view, setView] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortKey>('margin_desc')
  const categoryOptions = useMemo(
    () => [
      'all',
      'sub-ingredients',
      ...Array.from(new Set(recipes.map((r) => r.category?.trim() || 'Uncategorised'))).sort(),
    ],
    [recipes]
  )

  const atRecipeLimit = !hasFullAccess && recipes.length >= limits.maxRecipes

  const avgMargin = useMemo(() => {
    if (!recipes.length) return 0
    return recipes.reduce((s, r) => s + r.cost.marginPercent, 0) / recipes.length
  }, [recipes])

  useEffect(() => {
    const stored = localStorage.getItem('recipes-view-mode') as ViewMode | null
    if (stored === 'grid' || stored === 'list' || stored === 'categories') {
      setView(stored)
    }
  }, [])

  const setViewMode = (mode: ViewMode) => {
    setView(mode)
    localStorage.setItem('recipes-view-mode', mode)
  }

  useEffect(() => {
    if (!allergenFilter) { setExcludeRecipeIds(new Set()); return }
    fetch(`/api/recipes/allergen-free?allergen_id=${allergenFilter}`)
      .then((r) => r.json())
      .then((d: { excludeRecipeIds?: string[] }) => setExcludeRecipeIds(new Set(d.excludeRecipeIds ?? [])))
      .catch(() => setExcludeRecipeIds(new Set()))
  }, [allergenFilter])

  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = recipes.filter((r) => {
      const matchesSearch = !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
      const recipeCategory = r.category?.trim() || 'Uncategorised'
      const matchesCategory =
        category === 'all'
          ? true
          : category === 'sub-ingredients'
            ? r.isSubIngredient
            : recipeCategory.toLowerCase() === category.toLowerCase()
      const matchesAllergen = !allergenFilter || !excludeRecipeIds.has(r.id)
      return matchesSearch && matchesCategory && matchesAllergen
    })

    return filtered.sort((a, b) => {
      const ap = a.cost.sellingPrice - a.cost.costPerUnit
      const bp = b.cost.sellingPrice - b.cost.costPerUnit
      switch (sortBy) {
        case 'margin_desc':  return b.cost.marginPercent - a.cost.marginPercent
        case 'profit_desc':  return bp - ap
        case 'cost_asc':     return a.cost.totalCost - b.cost.totalCost
        case 'name_asc':     return a.name.localeCompare(b.name)
        case 'updated_desc': return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        default: return 0
      }
    })
  }, [category, query, recipes, allergenFilter, excludeRecipeIds, sortBy])

  const categoryGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const grouped = new Map<string, typeof recipes>()

    for (const recipe of recipes) {
      if (allergenFilter && excludeRecipeIds.has(recipe.id)) continue

      const categoryName = recipe.category?.trim() || 'Uncategorised'
      const categoryMatches = !q || categoryName.toLowerCase().includes(q)
      const recipeMatches =
        !q ||
        recipe.name.toLowerCase().includes(q) ||
        recipe.description.toLowerCase().includes(q)

      if (!categoryMatches && !recipeMatches) continue

      const existing = grouped.get(categoryName) ?? []
      existing.push(recipe)
      grouped.set(categoryName, existing)
    }

    return Array.from(grouped.entries())
      .map(([name, items]) => {
        const pricedRecipes = items.filter((recipe) => !recipe.isSubIngredient && recipe.cost.sellingPrice > 0)
        const averageMargin = pricedRecipes.length > 0
          ? pricedRecipes.reduce((sum, recipe) => sum + recipe.cost.marginPercent, 0) / pricedRecipes.length
          : null
        const missingPriceCount = items.filter(
          (recipe) => !recipe.isSubIngredient && recipe.cost.sellingPrice <= 0
        ).length
        const incompleteCount = items.filter(
          (recipe) => recipe.ingredientCount === 0 || recipe.cost.totalCost <= 0
        ).length

        return {
          name,
          recipes: items,
          averageMargin,
          missingPriceCount,
          incompleteCount,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allergenFilter, excludeRecipeIds, query, recipes])

  const categoryDetailAverageMargin = useMemo(() => {
    const pricedRecipes = filteredRecipes.filter(
      (recipe) => !recipe.isSubIngredient && recipe.cost.sellingPrice > 0
    )
    if (pricedRecipes.length === 0) return null
    return pricedRecipes.reduce((sum, recipe) => sum + recipe.cost.marginPercent, 0) / pricedRecipes.length
  }, [filteredRecipes])

  const openCategory = (categoryName: string) => {
    const q = query.trim().toLowerCase()
    const hasRecipeMatch = recipes.some((recipe) => {
      const recipeCategory = recipe.category?.trim() || 'Uncategorised'
      return (
        recipeCategory === categoryName &&
        (
          recipe.name.toLowerCase().includes(q) ||
          recipe.description.toLowerCase().includes(q)
        )
      )
    })

    if (q && !hasRecipeMatch) setQuery('')
    setCategory(categoryName)
  }

  const hasFilters = query.trim().length > 0 || category !== 'all' || allergenFilter !== null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-600">
            <ChefHat className="h-3.5 w-3.5" />
            <span>Recipes</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Recipes</h1>
          {!loading && (
            <p className="mt-0.5 text-sm text-slate-500">
              {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}
              {recipes.length > 0 && ` · avg margin ${avgMargin.toFixed(1)}%`}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => !atRecipeLimit && router.push('/recipes/new')}
            disabled={atRecipeLimit}
            title={atRecipeLimit ? `Free plan limit: ${limits.maxRecipes} recipes` : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-sm',
              atRecipeLimit ? 'cursor-not-allowed bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-500'
            )}
          >
            {atRecipeLimit ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Create Recipe
          </button>
          {atRecipeLimit && (
            <p className="text-right text-xs text-slate-500">
              Free plan limit of {limits.maxRecipes} reached.{' '}
              <a href="/settings/billing" className="font-medium text-emerald-600 hover:underline">Upgrade</a>
            </p>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
          />
        </div>

        <CustomSelect
          value={category}
          onChange={setCategory}
          options={categoryOptions.map((c) => ({
            value: c,
            label: c === 'all' ? 'All categories' : c === 'sub-ingredients' ? 'Sub-ingredients' : c,
          }))}
        />

        <CustomSelect
          value={allergenFilter != null ? String(allergenFilter) : ''}
          onChange={(v) => setAllergenFilter(v ? Number(v) : null)}
          options={[
            { value: '', label: 'All allergens' },
            ...EU_ALLERGENS.map((a) => ({ value: String(a.id), label: `${a.icon} Free from ${a.shortName}` })),
          ]}
        />

        <CustomSelect
          value={sortBy}
          onChange={(v) => setSortBy(v as SortKey)}
          options={SORT_OPTIONS}
        />

        {/* Grid / list / categories toggle */}
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              view === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Grid2X2 className="h-4 w-4" />
            Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <LayoutList className="h-4 w-4" />
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('categories')}
            title="Categories"
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              view === 'categories' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Folder className="h-4 w-4" />
            Categories
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">{error}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-1 text-xs font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        view === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : view === 'categories' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full table-fixed">
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
              </tbody>
            </table>
          </div>
        )
      ) : view === 'categories' ? (
        category === 'all' ? (
          categoryGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
                <Folder className="h-8 w-8 text-emerald-400" />
              </div>
              <h3 className="mb-1 text-lg font-semibold text-gray-800">
                {recipes.length === 0 ? 'No recipes yet' : 'No recipe categories found'}
              </h3>
              <p className="mb-6 max-w-xs text-sm text-gray-400">
                {recipes.length === 0
                  ? 'Create your first recipe to start browsing by category.'
                  : 'Try a different search or allergen filter.'}
              </p>
              {recipes.length === 0 && (
                <button
                  type="button"
                  onClick={() => router.push('/recipes/new')}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                >
                  + Create your first recipe
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-800">Browse by category</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Open a category to review its recipes, margins, and pricing.
                </p>
              </div>
              <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {categoryGroups.map((group) => (
                    <RecipeCategoryCard
                      key={group.name}
                      name={group.name}
                      recipeCount={group.recipes.length}
                      averageMargin={group.averageMargin}
                      missingPriceCount={group.missingPriceCount}
                      incompleteCount={group.incompleteCount}
                      previewNames={group.recipes.slice(0, 3).map((recipe) => recipe.name)}
                      onClick={() => openCategory(group.name)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  getRecipeCategoryStyle(category).folder
                )}>
                  <Folder className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {category === 'sub-ingredients' ? 'Sub-ingredients' : category}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {filteredRecipes.length} recipe{filteredRecipes.length === 1 ? '' : 's'}
                    {categoryDetailAverageMargin != null && ` · Avg margin ${categoryDetailAverageMargin.toFixed(1)}%`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCategory('all')}
                className="flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 sm:self-auto"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to categories
              </button>
            </div>

            {filteredRecipes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
                  <Folder className="h-7 w-7 text-emerald-400" />
                </div>
                <h3 className="text-base font-semibold text-gray-800">
                  No recipes found for this category
                </h3>
                <p className="mt-1 text-sm text-gray-400">
                  Try a different search or allergen filter.
                </p>
              </div>
            ) : (
              <RecipeGrid
                recipes={filteredRecipes}
                onOpen={(id) => router.push(`/recipes/${id}`)}
              />
            )}
          </div>
        )
      ) : filteredRecipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
            <ChefHat className="h-8 w-8 text-emerald-400" />
          </div>
          <h3 className="mb-1 text-lg font-semibold text-gray-800">
            {hasFilters ? 'No recipes found' : 'No recipes yet'}
          </h3>
          <p className="mb-6 max-w-xs text-sm text-gray-400">
            {hasFilters
              ? 'Try a different search or filter.'
              : 'Create your first recipe to start tracking costs, margins, and profits.'}
          </p>
          {!hasFilters && (
            <button
              type="button"
              onClick={() => router.push('/recipes/new')}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              + Create your first recipe
            </button>
          )}
        </div>
      ) : view === 'grid' ? (
        <RecipeGrid
          recipes={filteredRecipes}
          onOpen={(id) => router.push(`/recipes/${id}`)}
        />
      ) : (
        /* List view */
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full table-fixed divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3.5">Recipe</th>
                <th className="w-28 px-5 py-3.5">Category</th>
                <th className="w-24 px-5 py-3.5">Cost</th>
                <th className="w-24 px-5 py-3.5">Selling</th>
                <th className="w-24 px-5 py-3.5">Profit</th>
                <th className="w-24 px-5 py-3.5">Margin</th>
                <th className="w-28 px-5 py-3.5">Updated</th>
              </tr>
            </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecipes.map((recipe) => {
                  const isSubRecipe = recipe.isSubIngredient || (recipe as { is_sub_recipe?: boolean }).is_sub_recipe === true
                  const yieldQuantity = Math.max(1, recipe.yieldQuantity ?? 1)
                  const yieldUnit = recipe.yieldUnit?.trim() || 'units'
                  const unitsPerYield = Math.max(1, convertUnit(yieldQuantity, normalizeCountUnit(recipe.yieldUnit ?? 'unit'), 'unit'))
                  const profitPerUnit = recipe.cost.sellingPrice - recipe.cost.costPerUnit
                  const hasPrice = !isSubRecipe && recipe.cost.sellingPrice > 0
                  const costPerSingleUnit = unitsPerYield > 1 ? recipe.cost.totalCost / unitsPerYield : null
                  return (
                    <tr
                      key={recipe.id}
                      onClick={() => router.push(`/recipes/${recipe.id}`)}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      {/* Recipe name + thumbnail */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                            {recipe.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={recipe.imageUrl} alt={recipe.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-amber-50">
                                <ChefHat className="h-5 w-5 text-emerald-400" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {recipe.name}
                              {isSubRecipe && (
                                <span className="ml-1.5 text-xs font-semibold text-emerald-600">(Sub)</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400 line-clamp-2">{recipe.description || 'No recipe notes'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {recipe.category}
                        </span>
                      </td>

                      {/* Cost */}
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {isSubRecipe ? (
                          <div className="space-y-0.5">
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">Total cost</div>
                            <div className="font-medium text-slate-900">€{recipe.cost.totalCost.toFixed(2)}</div>
                          </div>
                        ) : (
                          `€${recipe.cost.totalCost.toFixed(2)}`
                        )}
                      </td>

                      {/* Selling / Yield */}
                      <td className="px-5 py-4 text-sm font-medium text-slate-900">
                        {isSubRecipe ? (
                          <div className="space-y-0.5">
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">Yield</div>
                            <div className="font-medium text-slate-900">
                              {yieldQuantity} {yieldUnit}
                            </div>
                          </div>
                        ) : (
                          hasPrice ? `€${recipe.cost.sellingPrice.toFixed(2)}` : <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Profit / Cost per unit */}
                      <td className="px-5 py-4">
                        {isSubRecipe ? (
                          <div className="space-y-0.5">
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">Cost / yield unit</div>
                            <div className="font-medium text-slate-900">€{recipe.cost.costPerUnit.toFixed(2)}</div>
                          </div>
                        ) : hasPrice ? (
                          <span className={cn('text-sm font-medium', profitPerUnit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {profitPerUnit >= 0 ? '+' : ''}€{profitPerUnit.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-sm text-slate-300">—</span>
                        )}
                      </td>

                      {/* Margin / Cost per single unit */}
                      <td className="px-5 py-4">
                        {isSubRecipe ? (
                          <div className="space-y-0.5">
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">
                              {costPerSingleUnit != null ? 'Cost / single unit' : 'Cost / unit'}
                            </div>
                            <div className="font-medium text-slate-900">
                              €{(costPerSingleUnit ?? recipe.cost.costPerUnit).toFixed(2)}
                            </div>
                          </div>
                        ) : hasPrice ? (
                          <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', marginPillClass(recipe.cost.marginPercent))}>
                            {recipe.cost.marginPercent.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-sm text-slate-300">—</span>
                        )}
                      </td>
                      {/* Updated */}
                      <td className="px-5 py-4 text-xs text-slate-400">
                        {format(new Date(recipe.updatedAt), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
        </div>
      )}
    </div>
  )
}
