'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Bell, Plus, FileText, Apple, ChefHat, Menu, ChevronRight, Home } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAppStore } from '@/stores/app'

const QUICK_ADD_ITEMS = [
  { label: 'New Invoice',    href: '/invoices',       icon: FileText },
  { label: 'New Ingredient', href: '/ingredients/new', icon: Apple },
  { label: 'New Recipe',     href: '/recipes/new',     icon: ChefHat },
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function useEntityName(pathname: string): string | null {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    setName(null)
    const segments = pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    const parent = segments[segments.length - 2]

    if (!last || !UUID_RE.test(last) || !parent) return

    const supabase = createClient()
    let cancelled = false

    const table = parent === 'recipes' ? 'recipes' : parent === 'ingredients' ? 'ingredients' : null
    if (!table) return

    supabase
      .from(table)
      .select('name')
      .eq('id', last)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.name) setName(data.name as string)
      })

    return () => { cancelled = true }
  }, [pathname])

  return name
}

function useBreadcrumbs(pathname: string, entityName: string | null) {
  const segments = pathname.split('/').filter(Boolean)
  return [
    { label: 'Home', href: '/' },
    ...segments.map((seg, i) => {
      const href = '/' + segments.slice(0, i + 1).join('/')
      const isLast = i === segments.length - 1
      const isUuid = UUID_RE.test(seg)
      const label = isLast && isUuid && entityName
        ? entityName
        : seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      return { label, href }
    }),
  ]
}

export default function TopBar() {
  const pathname = usePathname()
  const entityName = useEntityName(pathname)
  const breadcrumbs = useBreadcrumbs(pathname, entityName)
  const { setMobileSidebarOpen, setCommandSearchOpen } = useAppStore()

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const quickAddRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setCommandSearchOpen])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (quickAddRef.current && !quickAddRef.current.contains(e.target as Node)) {
        setQuickAddOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/80 backdrop-blur-sm px-4 sm:px-6 dark:border-slate-700 dark:bg-slate-900/80">
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-sm sm:flex">
        {breadcrumbs.map((crumb, i) => (
          <div key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
            {i === breadcrumbs.length - 1 ? (
              <span className="font-medium text-slate-900 dark:text-white max-w-[200px] truncate" title={crumb.label}>
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
              >
                {i === 0 ? <Home className="h-4 w-4" /> : crumb.label}
              </Link>
            )}
          </div>
        ))}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => setCommandSearchOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400"
        aria-label="Open search"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-400 dark:border-slate-600 dark:bg-slate-700">
          ⌘K
        </kbd>
      </button>

      <div ref={quickAddRef} className="relative">
        <button
          onClick={() => setQuickAddOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </button>

        {quickAddOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
            {QUICK_ADD_ITEMS.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setQuickAddOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Icon className="h-4 w-4 text-slate-400" />
                {label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <button
        className="relative rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500" />
      </button>
    </header>
  )
}
