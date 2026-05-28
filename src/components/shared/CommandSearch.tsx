'use client'

import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Search,
  Sparkles,
  FileText,
  ChefHat,
  Apple,
  ArrowRight,
  Clock3,
  X,
  UploadCloud,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { useAppStore } from '@/stores/app'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

type SearchKind = 'recipe' | 'ingredient' | 'invoice' | 'action' | 'recent'

type SearchResult = {
  id: string
  kind: SearchKind
  title: string
  subtitle: string
  href?: string
  icon: ComponentType<{ className?: string }>
}

type InvoiceSearchRow = {
  id: string
  invoice_number?: string | null
  supplier?: { name: string } | Array<{ name: string }> | null
}

const RECENT_STORAGE_KEY = 'zrecipe:recent-searches'

const QUICK_ACTIONS: SearchResult[] = [
  {
    id: 'create-recipe',
    kind: 'action',
    title: 'Create Recipe',
    subtitle: 'Open the recipe builder for a new recipe',
    href: '/recipes/new',
    icon: ChefHat,
  },
  {
    id: 'import-invoice',
    kind: 'action',
    title: 'Import Invoice',
    subtitle: 'Open invoice import and OCR',
    href: '/invoices?import=1',
    icon: UploadCloud,
  },
]

function storeRecent(term: string) {
  const trimmed = term.trim()
  if (!trimmed) return
  const existing = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) ?? '[]') as string[]
  const next = [trimmed, ...existing.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6)
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next))
}

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export default function CommandSearch() {
  const router = useRouter()
  const open = useAppStore((state) => state.commandSearchOpen)
  const setOpen = useAppStore((state) => state.setCommandSearchOpen)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [recent, setRecent] = useState<string[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  const visibleResults = useMemo(() => {
    if (!query.trim()) {
      return recent.map<SearchResult>((term, index) => ({
        id: `recent-${index}-${term}`,
        kind: 'recent',
        title: term,
        subtitle: 'Recent search',
        href: undefined,
        icon: Clock3,
      }))
    }

    return results
  }, [query, recent, results])

  useEffect(() => {
  const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [setOpen])

  useEffect(() => {
    if (!open) return
    setRecent(readRecent())
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timeout)
  }, [open])

  useEffect(() => {
    if (!open) return

    const term = query.trim()
    if (!term) {
      setResults([])
      setActiveIndex(0)
      return
    }

    const timeout = window.setTimeout(async () => {
      try {
        setLoading(true)
        const supabase = createClient()
        const tenantId = await resolveTenantId()
        const needle = term.toLowerCase()

        const [recipesRes, ingredientsRes, invoicesRes] = await Promise.all([
          supabase
            .from('recipes')
            .select('id, name, description, category, image_url')
            .eq('tenant_id', tenantId)
            .order('updated_at', { ascending: false })
            .limit(8),
          supabase
            .from('ingredients')
            .select('id, name, category')
            .eq('tenant_id', tenantId)
            .order('updated_at', { ascending: false })
            .limit(8),
          supabase
            .from('invoices')
            .select('id, invoice_number, invoice_date, total_amount, supplier:suppliers(name)')
            .eq('tenant_id', tenantId)
            .order('invoice_date', { ascending: false })
            .limit(8),
        ])

        const recipeResults =
          recipesRes.data
            ?.filter((item) => {
              const haystack = `${item.name} ${item.description ?? ''} ${item.category ?? ''}`.toLowerCase()
              return haystack.includes(needle)
            })
            .map<SearchResult>((item) => ({
              id: item.id,
              kind: 'recipe',
              title: item.name,
              subtitle: item.category ?? 'Recipe',
              href: `/recipes/${item.id}`,
              icon: ChefHat,
            })) ?? []

        const ingredientResults =
          ingredientsRes.data
            ?.filter((item) => `${item.name} ${item.category ?? ''}`.toLowerCase().includes(needle))
            .map<SearchResult>((item) => ({
              id: item.id,
              kind: 'ingredient',
              title: item.name,
              subtitle: item.category ?? 'Ingredient',
              href: `/ingredients/${item.id}`,
              icon: Apple,
            })) ?? []

        const invoiceResults =
          (invoicesRes.data as InvoiceSearchRow[] | null)
            ?.filter((item) => {
              const supplier = Array.isArray(item.supplier) ? item.supplier[0] : item.supplier
              const haystack = `${item.invoice_number ?? ''} ${supplier?.name ?? ''}`.toLowerCase()
              return haystack.includes(needle)
            })
            .map<SearchResult>((item) => ({
              id: item.id,
              kind: 'invoice',
              title: item.invoice_number ?? 'Invoice',
              subtitle: Array.isArray(item.supplier) ? item.supplier[0]?.name ?? 'Invoice' : item.supplier?.name ?? 'Invoice',
              href: `/invoices/${item.id}`,
              icon: FileText,
            })) ?? []

        setResults([...recipeResults, ...ingredientResults, ...invoiceResults].slice(0, 8))
        setActiveIndex(0)
      } catch (error) {
        setResults([])
        toast.error(error instanceof Error ? error.message : 'Unable to search right now')
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [open, query])

  const close = () => setOpen(false)

  const selectItem = (item: SearchResult) => {
    if (query.trim()) {
      storeRecent(query)
      setRecent(readRecent())
    }

    if (item.kind === 'recent') {
      setQuery(item.title)
      return
    }

    if (item.href) {
      router.push(item.href)
      close()
    }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!visibleResults.length && !QUICK_ACTIONS.length) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, visibleResults.length - 1))
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const item = visibleResults[activeIndex]
      if (item) selectItem(item)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-sm" />
        <Dialog.Content
          onKeyDown={handleKeyDown}
          className="fixed left-1/2 top-1/2 z-[95] w-[min(92vw,44rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl outline-none"
        >
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
            <Search className="h-5 w-5 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recipes, ingredients, invoices..."
              className="h-11 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
            <Dialog.Close
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-4">
            {!query.trim() ? (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => {
                          if (action.href) {
                            router.push(action.href)
                            close()
                          }
                        }}
                        className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50"
                      >
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                        <p className="mt-1 text-sm text-slate-500">{action.subtitle}</p>
                      </button>
                    )
                  })}
                </div>

                <div>
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    Recent searches
                  </div>
                  {recent.length === 0 ? (
                    <p className="text-sm text-slate-500">Your recent searches will appear here.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {recent.map((term) => (
                        <button
                          key={term}
                          type="button"
                          onClick={() => setQuery(term)}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4">
                    <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : visibleResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Search className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-slate-900">No results found</p>
                <p className="mt-1 text-sm text-slate-500">
                  Try a different recipe, ingredient, or invoice number.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleResults.map((item, index) => {
                  const Icon = item.icon
                  const active = index === activeIndex

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectItem(item)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition',
                        active
                          ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      )}
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                        <Icon className="h-4 w-4" />
                        </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {item.title}
                        </p>
                        <p className="truncate text-sm text-slate-500">{item.subtitle}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
