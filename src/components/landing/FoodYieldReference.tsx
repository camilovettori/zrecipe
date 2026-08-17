'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Search } from 'lucide-react'
import { YIELD_FACTORS, type YieldFactor } from '@/lib/data/yield-factors'
import { cn } from '@/lib/utils'

const CATEGORIES: Array<{ value: 'all' | YieldFactor['category']; label: string }> = [
  { value: 'all', label: 'All ingredients' },
  { value: 'produce', label: 'Fruit & vegetables' },
  { value: 'meat', label: 'Meat' },
  { value: 'fish', label: 'Fish & seafood' },
  { value: 'dairy', label: 'Dairy & eggs' },
  { value: 'dry', label: 'Dry & pantry' },
]

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function FoodYieldReference() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('all')

  const filtered = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim()
    return YIELD_FACTORS.filter((item) => {
      const matchesCategory = category === 'all' || item.category === category
      const matchesQuery = !normalizedQuery || [item.ingredient, item.notes, ...item.aliases]
        .some((value) => value.toLowerCase().includes(normalizedQuery))
      return matchesCategory && matchesQuery
    })
  }, [category, query])

  return (
    <div id="yield-chart" className="scroll-mt-24">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <label htmlFor="yield-search" className="sr-only">Search ingredients</label>
            <input
              id="yield-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search potato, salmon, onion..."
              className="h-12 w-full rounded-xl border border-slate-200 pl-11 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            />
          </div>
          <p className="text-sm text-slate-500" aria-live="polite">{filtered.length} ingredients shown</p>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-2" aria-label="Filter yield reference by category">
          {CATEGORIES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setCategory(item.value)}
              aria-pressed={category === item.value}
              className={cn(
                'whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition',
                category === item.value
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-5 hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-4">Ingredient</th>
                <th className="px-5 py-4">Yield</th>
                <th className="px-5 py-4">Waste</th>
                <th className="px-5 py-4">Preparation note</th>
                <th className="px-5 py-4"><span className="sr-only">Calculate</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => (
                <tr key={item.ingredient} className="transition-colors hover:bg-emerald-50/50">
                  <th scope="row" className="px-5 py-4 text-sm font-semibold text-slate-900">{titleCase(item.ingredient)}</th>
                  <td className="px-5 py-4"><span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">{item.yieldPercent}%</span></td>
                  <td className="px-5 py-4 text-sm font-medium text-amber-700">{100 - item.yieldPercent}%</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{item.notes}</td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/food-yield-calculator?ingredient=${encodeURIComponent(item.ingredient)}#calculator`} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                      Calculate <ArrowRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-3 md:hidden">
          {filtered.map((item) => (
            <article key={item.ingredient} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">{titleCase(item.ingredient)}</h3>
                  <p className="mt-1 text-sm text-slate-500">{item.notes}</p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">{item.yieldPercent}%</span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-sm font-medium text-amber-700">{100 - item.yieldPercent}% waste</span>
                <Link href={`/food-yield-calculator?ingredient=${encodeURIComponent(item.ingredient)}#calculator`} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
                  Calculate <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-14 text-center">
            <p className="font-semibold text-slate-800">No matching ingredient found</p>
            <p className="mt-2 text-sm text-slate-500">Try another search or choose a different category.</p>
          </div>
        )}
      </div>
    </div>
  )
}
