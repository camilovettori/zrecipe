'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Grid2X2, List, Plus, Search, ChefHat, Lock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import EmptyState from '@/components/shared/EmptyState'
import RecipeCard from '@/components/recipes/RecipeCard'
import { RECIPE_CATEGORIES, useRecipes } from '@/hooks/useRecipes'
import { useSubscription } from '@/hooks/useSubscription'
import { EU_ALLERGENS } from '@/lib/allergens'
import { cn } from '@/lib/utils'

type ViewMode = 'grid' | 'list'

function marginTone(marginPercent: number) {
  if (marginPercent >= 30) return 'bg-emerald-50 text-emerald-700'
  if (marginPercent >= 15) return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="aspect-[16/9] animate-pulse bg-slate-100" />
      <div className="p-4">
        <div className="h-4 w-20 animate-pulse rounded-full bg-slate-100" />
        <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 flex items-center justify-between">
          <div className="h-8 w-24 animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    </div>
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
  const categoryOptions = ['all', 'sub-ingredients', ...RECIPE_CATEGORIES]

  const atRecipeLimit = !hasFullAccess && recipes.length >= limits.maxRecipes

  // Fetch excluded recipe IDs when allergen filter changes
  useEffect(() => {
    if (!allergenFilter) {
      setExcludeRecipeIds(new Set())
      return
    }
    fetch(`/api/recipes/allergen-free?allergen_id=${allergenFilter}`)
      .then((r) => r.json())
      .then((data: { excludeRecipeIds?: string[] }) => {
        setExcludeRecipeIds(new Set(data.excludeRecipeIds ?? []))
      })
      .catch(() => setExcludeRecipeIds(new Set()))
  }, [allergenFilter])

  const filteredRecipes = useMemo(() => {
    const search = query.trim().toLowerCase()
    return recipes.filter((recipe) => {
      const matchesSearch =
        !search ||
        recipe.name.toLowerCase().includes(search) ||
        recipe.description.toLowerCase().includes(search)
      const matchesCategory =
        category === 'all'
          ? true
          : category === 'sub-ingredients'
            ? recipe.isSubIngredient
            : recipe.category.toLowerCase() === category.toLowerCase()
      const matchesAllergen = !allergenFilter || !excludeRecipeIds.has(recipe.id)
      return matchesSearch && matchesCategory && matchesAllergen
    })
  }, [category, query, recipes, allergenFilter, excludeRecipeIds])

  const hasFilters = query.trim().length > 0 || category !== 'all' || allergenFilter !== null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            <ChefHat className="h-3.5 w-3.5" />
            Recipes
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">
            Recipes
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Build, cost, print, and manage every recipe in one place.
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => !atRecipeLimit && router.push('/recipes/new')}
            disabled={atRecipeLimit}
            title={atRecipeLimit ? `Free plan limit: ${limits.maxRecipes} recipes` : undefined}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition',
              atRecipeLimit
                ? 'cursor-not-allowed bg-slate-400'
                : 'bg-emerald-600 hover:bg-emerald-500'
            )}
          >
            {atRecipeLimit ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Create Recipe
          </button>
          {atRecipeLimit && (
            <p className="text-right text-xs text-slate-500">
              Free plan limit of {limits.maxRecipes} recipes reached.{' '}
              <a href="/settings?tab=billing" className="font-medium text-emerald-600 hover:underline">
                Upgrade to Pro
              </a>
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search recipes..."
            className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
          />
        </div>

        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="h-11 rounded-full border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-emerald-500"
        >
          {categoryOptions.map((item) =>
            item === 'all' ? (
              <option key={item} value="all">All categories</option>
            ) : item === 'sub-ingredients' ? (
              <option key={item} value="sub-ingredients">Sub-ingredients</option>
            ) : (
              <option key={item} value={item}>{item}</option>
            )
          )}
        </select>

        <select
          value={allergenFilter ?? ''}
          onChange={(e) => setAllergenFilter(e.target.value ? Number(e.target.value) : null)}
          className="h-11 rounded-full border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-emerald-500"
          title="Filter by allergen — shows only recipes free from the selected allergen"
        >
          <option value="">All allergens</option>
          {EU_ALLERGENS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} Free from {a.shortName}
            </option>
          ))}
        </select>

        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setView('grid')}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition',
              view === 'grid'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            )}
          >
            <Grid2X2 className="h-4 w-4" />
            Grid
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition',
              view === 'list'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            )}
          >
            <List className="h-4 w-4" />
            List
          </button>
        </div>
      </div>

      {loading ? (
        view === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="grid grid-cols-[84px_1.2fr_0.8fr_0.6fr_0.6fr] gap-4 p-4">
                  <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                  <div className="space-y-2">
                    <div className="h-4 w-20 animate-pulse rounded-full bg-slate-100" />
                    <div className="h-5 w-3/4 animate-pulse rounded bg-slate-100" />
                  </div>
                  <div className="h-8 w-20 animate-pulse rounded-full bg-slate-100" />
                  <div className="h-8 w-24 animate-pulse rounded-full bg-slate-100" />
                  <div className="h-8 w-16 animate-pulse rounded-full bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        )
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          <p className="font-medium">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 text-xs font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : filteredRecipes.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title={hasFilters ? 'No recipes found' : 'Create your first recipe'}
          description={
            hasFilters
              ? 'Try a different search or category filter.'
              : 'Add your first recipe to start building costs, margins, and kitchen-ready PDFs.'
          }
          action={
            !hasFilters
              ? { label: 'Create your first recipe', onClick: () => router.push('/recipes/new') }
              : undefined
          }
        />
      ) : view === 'grid' ? (
        <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {filteredRecipes.map((recipe) => (
              <motion.div
                key={recipe.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                <RecipeCard recipe={recipe} onClick={(id) => router.push(`/recipes/${id}`)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">Recipe</th>
                  <th className="px-5 py-4 font-semibold">Category</th>
                  <th className="px-5 py-4 font-semibold">Cost</th>
                  <th className="px-5 py-4 font-semibold">Margin</th>
                  <th className="px-5 py-4 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRecipes.map((recipe) => (
                  <tr
                    key={recipe.id}
                    onClick={() => router.push(`/recipes/${recipe.id}`)}
                    className="cursor-pointer transition hover:bg-slate-50"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-16 overflow-hidden rounded-xl bg-slate-100">
                          {recipe.imageUrl ? (
                            <Image
                              src={recipe.imageUrl}
                              alt={recipe.name}
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-amber-50">
                              <ChefHat className="h-5 w-5 text-emerald-600" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            {recipe.name}
                            {recipe.isSubIngredient && (
                              <span className="ml-1 align-middle text-xs font-semibold text-emerald-600">
                                (Sub)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">{recipe.description || 'No description'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{recipe.category}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                      €{recipe.cost.totalCost.toFixed(2)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
                          marginTone(recipe.cost.marginPercent)
                        )}
                      >
                        {recipe.cost.marginPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500">
                      {new Intl.DateTimeFormat('en-IE', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      }).format(new Date(recipe.updatedAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
