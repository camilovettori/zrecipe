'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Search, ChefHat, Apple, FileText, Clock3 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type ResultKind = 'recipe' | 'ingredient' | 'invoice' | 'recent'

interface SearchResult {
  id: string
  kind: ResultKind
  title: string
  subtitle: string
  href: string
}

interface SearchGroup {
  kind: ResultKind
  label: string
  dotColor: string
  items: SearchResult[]
}

interface InvoiceRow {
  id: string
  invoice_number?: string | null
  invoice_date?: string | null
  total_amount?: number | null
  supplier?: { name: string } | Array<{ name: string }> | null
}

interface IngredientRow {
  id: string
  name: string
  brand?: string | null
  current_price?: number | null
  price_unit?: string | null
  supplier?: { name: string } | Array<{ name: string }> | null
}

interface RecipeRow {
  id: string
  name: string
  category?: string | null
}

// ── Recent items storage (clicked results) ────────────────────────────────────

const RECENT_KEY = 'zrecipe:recent-nav'

type StoredItem = Omit<SearchResult, 'kind'> & { kind: Exclude<ResultKind, 'recent'> }

function pushRecentItem(item: SearchResult) {
  if (item.kind === 'recent') return
  try {
    const stored: StoredItem[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    const next = [
      { id: item.id, kind: item.kind as Exclude<ResultKind, 'recent'>, title: item.title, subtitle: item.subtitle, href: item.href },
      ...stored.filter((s) => s.id !== item.id),
    ].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch { /* non-critical */ }
}

function loadRecentItems(): SearchResult[] {
  try {
    const stored: StoredItem[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return stored.map((s) => ({ ...s, kind: 'recent' as const }))
  } catch {
    return []
  }
}

// ── Group config ──────────────────────────────────────────────────────────────

const GROUP_META: Record<Exclude<ResultKind, 'recent'>, { label: string; dotColor: string }> = {
  recipe:     { label: 'Recipes',     dotColor: 'bg-emerald-500' },
  ingredient: { label: 'Ingredients', dotColor: 'bg-amber-500' },
  invoice:    { label: 'Invoices',    dotColor: 'bg-blue-500' },
}

function kindIcon(kind: ResultKind) {
  if (kind === 'recipe')     return ChefHat
  if (kind === 'ingredient') return Apple
  if (kind === 'invoice')    return FileText
  return Clock3
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return iso }
}

// ── CommandPalette component ──────────────────────────────────────────────────

export default function CommandPalette() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [recent, setRecent] = useState<SearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  // Flatten all visible items for keyboard nav
  const flatItems = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return recent
    return results
  }, [query, recent, results])

  // ── Global ⌘K shortcut ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setIsOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Click outside to close ────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Load recent items when opening ────────────────────────────────────────

  useEffect(() => {
    if (isOpen) setRecent(loadRecentItems())
  }, [isOpen])

  // ── Debounced search ──────────────────────────────────────────────────────

  useEffect(() => {
    const term = query.trim()
    if (!term) { setResults([]); setActiveIndex(0); return }

    const timer = setTimeout(async () => {
      try {
        setLoading(true)
        const supabase = createClient()
        const tenantId = await resolveTenantId()
        const needle = term.toLowerCase()

        const [recipesRes, ingredientsRes, invoicesRes] = await Promise.all([
          supabase
            .from('recipes')
            .select('id, name, category')
            .eq('tenant_id', tenantId)
            .ilike('name', `%${term}%`)
            .order('updated_at', { ascending: false })
            .limit(5),
          supabase
            .from('ingredients')
            .select('id, name, brand, current_price, price_unit, supplier:suppliers!last_supplier_id(name)')
            .eq('tenant_id', tenantId)
            .or(`name.ilike.%${term}%,brand.ilike.%${term}%`)
            .order('updated_at', { ascending: false })
            .limit(5),
          supabase
            .from('invoices')
            .select('id, invoice_number, invoice_date, total_amount, supplier:suppliers(name)')
            .eq('tenant_id', tenantId)
            .order('invoice_date', { ascending: false })
            .limit(8),
        ])

        const recipes: SearchResult[] = (recipesRes.data as RecipeRow[] ?? [])
          .slice(0, 3)
          .map((r) => ({
            id: r.id,
            kind: 'recipe' as const,
            title: r.name,
            subtitle: r.category ?? 'Recipe',
            href: `/recipes/${r.id}`,
          }))

        const ingredients: SearchResult[] = (ingredientsRes.data as IngredientRow[] ?? [])
          .slice(0, 3)
          .map((i) => {
            const sup = Array.isArray(i.supplier) ? i.supplier[0] : i.supplier
            const pricePart = i.current_price != null
              ? `€${i.current_price.toFixed(2)} / ${i.price_unit ?? 'unit'}`
              : null
            const supPart = sup?.name ?? null
            const subtitle = [pricePart, supPart].filter(Boolean).join(' · ') || 'Ingredient'
            const title = i.brand ? `${i.name} (${i.brand})` : i.name
            return { id: i.id, kind: 'ingredient' as const, title, subtitle, href: `/ingredients/${i.id}` }
          })

        const invoices: SearchResult[] = (invoicesRes.data as InvoiceRow[] ?? [])
          .filter((inv) => {
            const sup = Array.isArray(inv.supplier) ? inv.supplier[0] : inv.supplier
            const haystack = `${inv.invoice_number ?? ''} ${sup?.name ?? ''}`.toLowerCase()
            return haystack.includes(needle)
          })
          .slice(0, 2)
          .map((inv) => {
            const sup = Array.isArray(inv.supplier) ? inv.supplier[0] : inv.supplier
            const parts = [
              sup?.name,
              fmtDate(inv.invoice_date),
              inv.total_amount != null ? `€${inv.total_amount.toFixed(2)}` : null,
            ].filter(Boolean).join(' · ')
            return {
              id: inv.id,
              kind: 'invoice' as const,
              title: inv.invoice_number ? `#${inv.invoice_number}` : 'Invoice',
              subtitle: parts || 'Invoice',
              href: `/invoices/${inv.id}`,
            }
          })

        setResults([...recipes, ...ingredients, ...invoices])
        setActiveIndex(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  // ── Actions ───────────────────────────────────────────────────────────────

  const navigate = useCallback((item: SearchResult) => {
    pushRecentItem(item)
    router.push(item.href)
    setIsOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }, [router])

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { setIsOpen(false); inputRef.current?.blur(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = flatItems[activeIndex]
      if (item) navigate(item)
    }
  }

  // ── Group results for display ─────────────────────────────────────────────

  const groups = useMemo<SearchGroup[]>(() => {
    if (!query.trim()) return []
    const byKind: Record<string, SearchResult[]> = {}
    for (const r of results) {
      if (!byKind[r.kind]) byKind[r.kind] = []
      byKind[r.kind].push(r)
    }
    return (['recipe', 'ingredient', 'invoice'] as const)
      .filter((k) => byKind[k]?.length)
      .map((k) => ({ kind: k, ...GROUP_META[k], items: byKind[k] }))
  }, [results, query])

  const showDropdown = isOpen && (flatItems.length > 0 || (query.trim() && !loading) || loading)

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      {/* ── Input ── */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 transition-all',
          isOpen
            ? 'border-emerald-400 bg-white ring-2 ring-emerald-400/20'
            : 'border-slate-200 hover:border-slate-300 hover:bg-white'
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); setActiveIndex(0) }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search..."
          className="w-44 min-w-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 sm:w-60"
          autoComplete="off"
          spellCheck={false}
        />
        {!query && (
          <kbd className="hidden text-[10px] font-medium text-slate-300 sm:block">⌘K</kbd>
        )}
      </div>

      {/* ── Dropdown ── */}
      {showDropdown && (
        <div className="absolute right-0 top-full z-[100] mt-1.5 w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="max-h-[400px] overflow-y-auto overscroll-contain">

            {/* Loading skeleton */}
            {loading && query.trim() && (
              <div className="space-y-1 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-2/5 animate-pulse rounded bg-slate-100" />
                      <div className="h-2.5 w-3/5 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Results grouped */}
            {!loading && query.trim() && groups.length > 0 && (
              <div className="p-2">
                {groups.map((group) => {
                  return (
                    <div key={group.kind} className="mb-3 last:mb-0">
                      {/* Group header */}
                      <div className="mb-1 flex items-center gap-1.5 px-3 py-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${group.dotColor}`} />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                          {group.label}
                        </span>
                      </div>
                      {group.items.map((item) => {
                        const globalIdx = flatItems.indexOf(item)
                        const active = globalIdx === activeIndex
                        return (
                          <ResultRow
                            key={item.id}
                            item={item}
                            active={active}
                            dotColor={group.dotColor}
                            onHover={() => setActiveIndex(globalIdx)}
                            onClick={() => navigate(item)}
                          />
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}

            {/* No results */}
            {!loading && query.trim() && groups.length === 0 && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-500">
                  No results for <span className="font-medium text-slate-700">&ldquo;{query}&rdquo;</span>
                </p>
              </div>
            )}

            {/* Recent items (empty query) */}
            {!query.trim() && recent.length > 0 && (
              <div className="p-2">
                <div className="mb-1 flex items-center gap-1.5 px-3 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Recent
                  </span>
                </div>
                {recent.map((item, idx) => {
                  const Icon = kindIcon(item.kind)
                  const active = idx === activeIndex
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => navigate(item)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                        active ? 'bg-slate-100' : 'hover:bg-slate-50'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t border-slate-100 px-4 py-2">
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">↵</kbd> open</span>
              <span><kbd className="font-mono">esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ResultRow ─────────────────────────────────────────────────────────────────

function ResultRow({
  item,
  active,
  dotColor,
  onHover,
  onClick,
}: {
  item: SearchResult
  active: boolean
  dotColor: string
  onHover: () => void
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
        active ? 'bg-emerald-50' : 'hover:bg-slate-50'
      )}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dotColor)} />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', active ? 'text-emerald-900' : 'text-slate-900')}>
          {item.title}
        </p>
        <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
      </div>
    </button>
  )
}
