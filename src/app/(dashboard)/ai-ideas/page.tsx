'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChefHat,
  Loader2,
  Plus,
  X,
  RefreshCw,
  Zap,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import { useIngredients } from '@/hooks/useIngredients'
import { useSubscription } from '@/hooks/useSubscription'
import { resolveTenantContext } from '@/hooks/useTenant'
import { cn } from '@/lib/utils'
import { CustomSelect } from '@/components/ui/CustomSelect'

type Tab = 'what-can-make' | 'use-before-expires'

interface AIIngredient {
  name: string
  quantity: number
  unit: string
  available: boolean
}

interface AIRecipe {
  name: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  prep_time_minutes: number
  cook_time_minutes: number
  yield_quantity: number
  yield_unit: string
  category: string
  ingredients: AIIngredient[]
  instructions: string[]
  tips: string
  suggested_selling_price: number
}

interface DBIngredient {
  id: string
  name: string
  current_price: number | null
  price_unit: string | null
}

const LOADING_MESSAGES = [
  'This may take up to 30 seconds...',
  'Checking your pantry...',
  'Mixing flavor combinations...',
  'Calculating costs...',
  'Almost ready to serve...',
]

const BUSINESS_TYPES = ['Bakery', 'Café', 'Restaurant', 'Catering', 'Pastry shop']
const COUNTS = [3, 5, 10]

const CATEGORY_MAP: Record<string, string> = {
  bakery: 'Bakery',
  dessert: 'Dessert',
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  beverage: 'Beverage',
  sauce: 'Sauce',
  bread: 'Bakery',
  pastry: 'Bakery',
  cake: 'Dessert',
  main: 'Dinner',
  other: 'Other',
}

function normalizeCategory(cat: string): string {
  return CATEGORY_MAP[cat?.toLowerCase()] ?? 'Other'
}

const difficultyConfig = {
  easy: {
    border: 'border-l-emerald-400',
    badge: 'bg-emerald-100 text-emerald-700',
    label: 'Easy',
  },
  medium: {
    border: 'border-l-amber-400',
    badge: 'bg-amber-100 text-amber-700',
    label: 'Medium',
  },
  hard: {
    border: 'border-l-red-400',
    badge: 'bg-red-100 text-red-700',
    label: 'Hard',
  },
}

function RecipeResultCard({
  recipe,
  onCreate,
}: {
  recipe: AIRecipe
  onCreate: () => void
}) {
  const diff = difficultyConfig[recipe.difficulty] ?? difficultyConfig.medium
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
        diff.border
      )}
    >
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-lg font-bold text-slate-900">{recipe.name}</h3>
        <p className="mt-1 text-sm italic text-slate-500 leading-relaxed">{recipe.description}</p>
      </div>

      {/* Badges */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', diff.badge)}>
          {diff.label}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
          <Clock className="h-3 w-3" />
          {recipe.prep_time_minutes}m prep
        </span>
        <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
          <ChefHat className="h-3 w-3" />
          {recipe.cook_time_minutes}m cook
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
          Yields {recipe.yield_quantity} {recipe.yield_unit}
        </span>
      </div>

      {/* Ingredients */}
      <div className="mb-4 flex-1">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Ingredients
        </p>
        <ul className="space-y-1.5">
          {ingredients.map((ing, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {ing.available ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              )}
              <span className={ing.available ? 'text-slate-700' : 'text-amber-700'}>
                <span className="font-medium">{ing.name}</span>
                <span className="ml-1 text-slate-500">
                  — {ing.quantity} {ing.unit}
                </span>
                {!ing.available && (
                  <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-600">
                    to buy
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            {ingredients.filter((i) => i.available).length} available
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            {ingredients.filter((i) => !i.available).length} to buy
          </span>
        </div>
      </div>

      {/* Suggested price */}
      <div className="mb-4 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
        <span className="text-sm text-slate-600">Suggested selling price</span>
        <span className="text-base font-bold text-emerald-700">
          €{recipe.suggested_selling_price.toFixed(2)}
        </span>
      </div>

      {/* Pro tip */}
      {recipe.tips && (
        <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="font-semibold">Pro tip: </span>
          {recipe.tips}
        </div>
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={onCreate}
        className="mt-auto w-full rounded-xl border-2 border-emerald-600 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-600 hover:text-white"
      >
        Create this recipe →
      </button>
    </div>
  )
}

export default function AIIdeasPage() {
  const router = useRouter()
  const { ingredients, loading: ingredientsLoading } = useIngredients()
  const { isPro } = useSubscription()

  const [activeTab, setActiveTab] = useState<Tab>('what-can-make')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [businessType, setBusinessType] = useState('Restaurant')
  const [style, setStyle] = useState('')
  const [count, setCount] = useState(5)
  const [urgentText, setUrgentText] = useState('')
  const [urgentList, setUrgentList] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [recipes, setRecipes] = useState<AIRecipe[]>([])
  const [dbIngredients, setDbIngredients] = useState<DBIngredient[]>([])
  const [error, setError] = useState<string | null>(null)
  const [msgIdx, setMsgIdx] = useState(0)
  const [aiUsage, setAiUsage] = useState<{ used: number; limit: number | null } | null>(null)

  // Pre-fill business type from tenant context
  useEffect(() => {
    resolveTenantContext()
      .then((ctx) => {
        if (ctx.tenant.businessType) {
          setBusinessType(ctx.tenant.businessType)
        }
      })
      .catch(() => {})
  }, [])

  // Fetch AI usage for current month
  useEffect(() => {
    fetch('/api/ai/usage')
      .then((r) => r.json())
      .then((data: { recipe_ideas?: { used: number; limit: number | null } }) => {
        if (data.recipe_ideas !== undefined) setAiUsage(data.recipe_ideas)
      })
      .catch(() => {})
  }, [])

  // Rotating loading messages
  useEffect(() => {
    if (!loading) return
    const t = setInterval(
      () => setMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length),
      2000
    )
    return () => clearInterval(t)
  }, [loading])

  const toggleIngredient = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const addUrgent = () => {
    const trimmed = urgentText.trim()
    if (!trimmed || urgentList.includes(trimmed)) return
    setUrgentList((p) => [...p, trimmed])
    setUrgentText('')
  }

  // Build the urgent ingredients: typed list + chips selected in "use-before-expires" tab
  const computedUrgent =
    activeTab === 'use-before-expires'
      ? [
          ...urgentList,
          ...(ingredients ?? [])
            .filter((i) => selectedIds.has(i.id) && !urgentList.includes(i.name))
            .map((i) => i.name),
        ]
      : []

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    setMsgIdx(0)
      try {
        const body = {
          ingredient_ids: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
        urgent_ingredients: computedUrgent.length > 0 ? computedUrgent : undefined,
        business_type: businessType,
        style: style || undefined,
        count,
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60_000)
      let res: Response
      try {
        res = await fetch('/api/ai/recipe-ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as {
            error?: string
            message?: string
            usage?: { used: number; limit: number }
          }
          if (res.status === 429 && d.usage) {
            setAiUsage(d.usage)
          }
          throw new Error(d.message ?? d.error ?? 'Failed to generate ideas')
        }

        const data = (await res.json()) as {
          recipes?: AIRecipe[] | null
          ingredients?: DBIngredient[] | null
        }
        setRecipes(Array.isArray(data.recipes) ? data.recipes : [])
        setDbIngredients(Array.isArray(data.ingredients) ? data.ingredients : [])

        // Refresh usage count after successful generation
        fetch('/api/ai/usage')
          .then((r) => r.json())
          .then((u: { recipe_ideas?: { used: number; limit: number | null } }) => {
            if (u.recipe_ideas !== undefined) setAiUsage(u.recipe_ideas)
          })
          .catch(() => {})
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong'
        setError(message)
        toast.error(message)
      } finally {
        setLoading(false)
      }
    }

  const handleCreate = (recipe: AIRecipe) => {
    const nameMap = new Map(dbIngredients.map((d) => [d.name.toLowerCase(), d]))
    const recipeIngredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
    const recipeInstructions = Array.isArray(recipe.instructions) ? recipe.instructions : []

    const prefillIngredients = recipeIngredients.map((ing) => {
      const matched = nameMap.get(ing.name.toLowerCase())
      return {
        id: crypto.randomUUID(),
        ingredientId: matched?.id ?? null,
        ingredientName: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        currentPrice: matched?.current_price ?? null,
        priceUnit: matched?.price_unit ?? null,
        notes: null,
        lineCost: 0,
      }
    })

    sessionStorage.setItem(
      'prefill-recipe',
      JSON.stringify({
        name: recipe.name,
        description: recipe.description,
        category: normalizeCategory(recipe.category),
        prepTimeMinutes: recipe.prep_time_minutes,
        cookTimeMinutes: recipe.cook_time_minutes,
        yieldQuantity: recipe.yield_quantity,
        yieldUnit: recipe.yield_unit,
        sellingPrice: recipe.suggested_selling_price,
        instructions: recipeInstructions.map((text) => ({
          id: crypto.randomUUID(),
          text,
        })),
        ingredients: prefillIngredients,
      })
    )

    router.push('/recipes/new')
  }

  const safeRecipes = Array.isArray(recipes) ? recipes : []
  const hasResults = safeRecipes.length > 0
  const atLimit = aiUsage !== null && aiUsage.limit !== null && aiUsage.used >= aiUsage.limit

  // All business type options — include tenant's if not in predefined list
  const businessTypeOptions = BUSINESS_TYPES.includes(businessType)
    ? BUSINESS_TYPES
    : [businessType, ...BUSINESS_TYPES]

  return (
    <div className="mx-auto max-w-[900px] space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-200">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">AI Recipe Ideas</h1>
          <p className="text-sm text-slate-500">
            Get recipe suggestions based on your ingredients
          </p>
        </div>
        {aiUsage !== null && (
          <div className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold',
            atLimit
              ? 'bg-red-100 text-red-700'
              : aiUsage.limit !== null && aiUsage.used >= aiUsage.limit * 0.8
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-600'
          )}>
            {aiUsage.used} / {aiUsage.limit ?? '∞'} ideas this month
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {(
          [
            { key: 'what-can-make', label: 'What can I make?' },
            { key: 'use-before-expires', label: 'Use before it expires' },
          ] as { key: Tab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex-1 rounded-xl py-2.5 text-sm font-semibold transition',
              activeTab === key
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Controls panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Ingredient chips */}
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {activeTab === 'what-can-make'
                ? 'Select ingredients to use'
                : 'Mark urgent ingredients'}
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set(ingredients.map((i) => i.id)))}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Clear
              </button>
            </div>
          </div>

          {ingredientsLoading ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-slate-100" />
              ))}
            </div>
          ) : (ingredients?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">
              No ingredients yet.{' '}
              <Link href="/ingredients" className="text-emerald-600 hover:underline">
                Add some ingredients
              </Link>{' '}
              first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(ingredients ?? []).map((ing) => {
                const sel = selectedIds.has(ing.id)
                return (
                  <button
                    key={ing.id}
                    type="button"
                    onClick={() => toggleIngredient(ing.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm font-medium transition',
                      sel
                        ? activeTab === 'what-can-make'
                          ? 'border-emerald-500 bg-emerald-100 text-emerald-800'
                          : 'border-amber-500 bg-amber-100 text-amber-800'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                    )}
                  >
                    {ing.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Urgent text input (Tab 2 only) */}
        {activeTab === 'use-before-expires' && (
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Add urgent ingredient names
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={urgentText}
                onChange={(e) => setUrgentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addUrgent()}
                placeholder="e.g. cream cheese, ripe bananas..."
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
              />
              <button
                type="button"
                onClick={addUrgent}
                className="flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-white transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {urgentList.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {urgentList.map((name, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => setUrgentList((p) => p.filter((_, j) => j !== i))}
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5 text-amber-600 hover:text-amber-900" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Config row */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              I run a...
            </label>
            <CustomSelect
              value={businessType}
              onChange={setBusinessType}
              options={businessTypeOptions.map((t) => ({ value: t, label: t }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Style preference
            </label>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g. French pastry, vegan..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Suggestions
            </label>
            <CustomSelect
              value={String(count)}
              onChange={(v) => setCount(Number(v))}
              options={COUNTS.map((n) => ({ value: String(n), label: `${n} recipes` }))}
            />
          </div>
        </div>

        {error && !atLimit && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {atLimit ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <Zap className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  You&apos;ve reached your monthly AI limit ({aiUsage?.used}/{aiUsage?.limit} ideas used)
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  {isPro
                    ? 'Upgrade to Business for unlimited AI recipe ideas.'
                    : 'Upgrade to Pro for 50 AI recipe ideas per month.'}
                </p>
              </div>
              <a
                href="/settings/billing"
                className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-400"
              >
                Upgrade
              </a>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200/60 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {activeTab === 'what-can-make' ? 'Get Ideas' : 'Get Suggestions'}
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-200 opacity-75" />
            <Sparkles className="relative h-8 w-8 animate-pulse text-emerald-600" />
          </div>
          <p className="text-sm font-medium text-slate-600 transition-all duration-500">
            {LOADING_MESSAGES[msgIdx]}
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && hasResults && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">
              {safeRecipes.length} Recipe {safeRecipes.length === 1 ? 'Idea' : 'Ideas'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ingredients you have
              <AlertTriangle className="ml-2 h-3.5 w-3.5 text-amber-500" />
              ingredients to buy
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {safeRecipes.map((recipe, i) => (
              <RecipeResultCard
                key={i}
                recipe={recipe}
                onCreate={() => handleCreate(recipe)}
              />
            ))}
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              Generate more ideas
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasResults && (
        <div className="flex flex-col items-center gap-5 py-20 text-center">
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-100 to-emerald-200 shadow-inner">
              <ChefHat className="h-12 w-12 text-emerald-600" />
            </div>
            <div className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 shadow-md">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Ready to inspire you</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Select your ingredients, set your preferences, and let AI suggest professional
              recipes you can make and sell.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
