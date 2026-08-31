'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Link2, Loader2, Lock, Search, Unplug, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { useSubscription } from '@/hooks/useSubscription'
import { useRecipes } from '@/hooks/useRecipes'
import { rankCandidates } from '@/lib/matching/nameTokenMatch'
import EmptyState from '@/components/shared/EmptyState'

type ItemSummary = {
  itemName: string
  unitsSold: number
  revenueCents: number
  currency: string
  linkedRecipeId: string | null
}

function money(cents: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100)
}

export default function SquareMappingPage() {
  const { limits, loading: subscriptionLoading } = useSubscription()
  const { recipes, loading: recipesLoading } = useRecipes()
  const [items, setItems] = useState<ItemSummary[] | null>(null)
  const [loadingItems, setLoadingItems] = useState(true)
  const [savingItem, setSavingItem] = useState<string | null>(null)
  const [searchOpenFor, setSearchOpenFor] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadItems = async () => {
    try {
      setLoadingItems(true)
      const response = await fetch('/api/integrations/square/item-summary', { cache: 'no-store' })
      const data = await response.json().catch(() => ({})) as { items?: ItemSummary[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to load Square items.')
      setItems(data.items ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load Square items.')
      setItems([])
    } finally {
      setLoadingItems(false)
    }
  }

  useEffect(() => {
    if (subscriptionLoading) return
    if (!limits.canUseSquareIntegration) {
      setLoadingItems(false)
      return
    }
    void loadItems()
  }, [subscriptionLoading, limits.canUseSquareIntegration])

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes])
  const recipeCandidates = useMemo(() => recipes.map((r) => ({ id: r.id, name: r.name })), [recipes])

  const closeSearch = () => {
    setSearchOpenFor(null)
    setSearchQuery('')
  }

  const link = async (squareItemName: string, recipeId: string) => {
    setSavingItem(squareItemName)
    try {
      const response = await fetch('/api/integrations/square/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ squareItemName, recipeId }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to link recipe.')
      setItems((prev) =>
        prev?.map((item) => (item.itemName === squareItemName ? { ...item, linkedRecipeId: recipeId } : item)) ?? null
      )
      closeSearch()
      toast.success('Recipe linked.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to link recipe.')
    } finally {
      setSavingItem(null)
    }
  }

  const unlink = async (squareItemName: string) => {
    setSavingItem(squareItemName)
    try {
      const response = await fetch('/api/integrations/square/mapping', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ squareItemName }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to unlink recipe.')
      setItems((prev) =>
        prev?.map((item) => (item.itemName === squareItemName ? { ...item, linkedRecipeId: null } : item)) ?? null
      )
      toast.success('Recipe unlinked.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to unlink recipe.')
    } finally {
      setSavingItem(null)
    }
  }

  const loading = loadingItems || recipesLoading

  if (subscriptionLoading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
  }

  if (!limits.canUseSquareIntegration) {
    return (
      <div className="mx-auto max-w-4xl pb-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <EmptyState
            icon={Lock}
            title="Square POS is a Pro feature"
            description="Upgrade to Pro or Business to map Square sales to your recipes."
            action={{ label: 'View plans', onClick: () => window.location.assign('/settings/billing') }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <Link
        href="/settings/integrations/square"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Square settings
      </Link>

      <div>
        <h1 className="font-display text-3xl font-semibold text-slate-900">Map Square items to recipes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Link each item Square sells to the ZRecipe recipe that makes it, so real margin — units sold x actual food
          cost — shows up on the Square analytics page.
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      ) : !items || items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No Square sales in the last 90 days yet. Sync your Square sales first.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const linkedRecipe = item.linkedRecipeId ? recipeById.get(item.linkedRecipeId) : null
            const suggestions = !item.linkedRecipeId ? rankCandidates(item.itemName, recipeCandidates, 3) : []
            const searchOpen = searchOpenFor === item.itemName
            const searchResults = searchOpen && searchQuery.trim() ? rankCandidates(searchQuery, recipeCandidates, 8) : []
            const saving = savingItem === item.itemName

            return (
              <div key={item.itemName} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{item.itemName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.unitsSold} sold · {money(item.revenueCents, item.currency)} revenue (last 90 days)
                    </p>
                  </div>

                  {linkedRecipe && (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                        <Link2 className="h-3.5 w-3.5" />
                        {linkedRecipe.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSearchOpenFor(item.itemName)}
                        className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => unlink(item.itemName)}
                        disabled={saving}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        <Unplug className="h-3.5 w-3.5" />
                        Unlink
                      </button>
                    </div>
                  )}
                </div>

                {searchOpen ? (
                  <div className="relative mt-3 max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      autoFocus
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search recipes..."
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-9 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                    />
                    <button
                      type="button"
                      onClick={closeSearch}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label="Cancel search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    {searchQuery.trim() && (
                      <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                        {searchResults.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-slate-400">No matching recipes.</p>
                        ) : (
                          searchResults.map((result) => (
                            <button
                              key={result.id}
                              type="button"
                              disabled={saving}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => link(item.itemName, result.id)}
                              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {result.name}
                              <Link2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  !linkedRecipe && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          disabled={saving}
                          onClick={() => link(item.itemName, suggestion.id)}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                        >
                          {suggestion.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSearchOpenFor(item.itemName)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
                      >
                        <Search className="h-3.5 w-3.5" />
                        Search recipes...
                      </button>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
