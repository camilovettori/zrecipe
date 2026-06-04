'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, Minus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IngredientRow } from '@/hooks/useIngredients'
import type { SortKey } from '@/hooks/useIngredients'
import { findIngredientImage } from '@/lib/utils/ingredient-image'

export type TrendData = {
  direction: 'up' | 'down' | 'flat'
  pct: number
}

const CATEGORY_BADGE: Record<string, string> = {
  dairy: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  flour: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  sugar: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  spice: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  meat: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  vegetable: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  fruit: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  other: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
}

function Thumbnail({ ingredient }: { ingredient: IngredientRow }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (ingredient.image_url?.startsWith('http')) {
      setSrc(ingredient.image_url)
      return
    }
    setSrc(null)
    findIngredientImage(ingredient.name).then(setSrc)
  }, [ingredient.id, ingredient.image_url, ingredient.name])

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={ingredient.name} className="h-10 w-10 rounded-lg object-cover" />
    )
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
      {ingredient.name[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function TrendBadge({ trend }: { trend?: TrendData }) {
  if (!trend || trend.direction === 'flat') {
    return (
      <span className="flex items-center gap-0.5 text-xs text-slate-400">
        <ArrowRight className="h-3 w-3" />
      </span>
    )
  }
  if (trend.direction === 'up') {
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-red-500">
        <ArrowUp className="h-3 w-3" />
        {trend.pct.toFixed(0)}%
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600">
      <ArrowDown className="h-3 w-3" />
      {trend.pct.toFixed(0)}%
    </span>
  )
}

interface SortableHeaderProps {
  label: string
  sortKey: SortKey
  currentSort: SortKey
  onSort: (k: SortKey) => void
}

function SortableHeader({ label, sortKey, currentSort, onSort }: SortableHeaderProps) {
  const active = currentSort === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    >
      {label}
      {active ? (
        <ChevronDown className="h-3 w-3" />
      ) : (
        <Minus className="h-3 w-3 opacity-30" />
      )}
    </button>
  )
}

interface Props {
  ingredients: IngredientRow[]
  trends: Record<string, TrendData>
  sortBy: SortKey
  onSortChange: (key: SortKey) => void
  onDeleteRequest: (id: string, name: string) => void
}

export default function IngredientListView({
  ingredients,
  trends,
  sortBy,
  onSortChange,
  onDeleteRequest,
}: Props) {
  const router = useRouter()

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
            <tr>
              <th className="w-14 px-4 py-3" />
              <th className="px-4 py-3 text-left">
                <SortableHeader label="Name" sortKey="name" currentSort={sortBy} onSort={onSortChange} />
              </th>
              <th className="hidden px-4 py-3 text-left sm:table-cell">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Category
                </span>
              </th>
              <th className="px-4 py-3 text-left">
                <SortableHeader label="Price" sortKey="price" currentSort={sortBy} onSort={onSortChange} />
              </th>
              <th className="hidden px-4 py-3 text-left md:table-cell">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Trend
                </span>
              </th>
              <th className="hidden px-4 py-3 text-left md:table-cell">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Supplier
                </span>
              </th>
              <th className="hidden px-4 py-3 text-left lg:table-cell">
                <SortableHeader label="Updated" sortKey="updated" currentSort={sortBy} onSort={onSortChange} />
              </th>
              <th className="w-16 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {ingredients.map((ingredient) => (
              <tr
                key={ingredient.id}
                onClick={() => router.push(`/ingredients/${ingredient.id}`)}
                className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40"
              >
                {/* Thumbnail */}
                <td className="px-4 py-3">
                  <Thumbnail ingredient={ingredient} />
                </td>

                {/* Name + brand */}
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900 dark:text-white">{ingredient.name}</p>
                  {ingredient.brand && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{ingredient.brand}</p>
                  )}
                </td>

                {/* Category */}
                <td className="hidden px-4 py-3 sm:table-cell">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                      CATEGORY_BADGE[(ingredient.category ?? 'other').toLowerCase()] ?? CATEGORY_BADGE.other
                    )}
                  >
                    {ingredient.category ?? 'Other'}
                  </span>
                </td>

                {/* Price */}
                <td className="px-4 py-3">
                  {ingredient.current_price != null ? (
                    <span className="font-semibold text-emerald-600">
                      €{ingredient.current_price.toFixed(2)}
                      <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                        / {ingredient.base_unit}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* Trend */}
                <td className="hidden px-4 py-3 md:table-cell">
                  <TrendBadge trend={trends[ingredient.id]} />
                </td>

                {/* Supplier */}
                <td className="hidden px-4 py-3 md:table-cell">
                  <span className="text-slate-500 dark:text-slate-400">
                    {ingredient.supplier?.name ?? '—'}
                  </span>
                </td>

                {/* Last updated */}
                <td className="hidden px-4 py-3 lg:table-cell">
                  <span className="text-slate-400 dark:text-slate-500">
                    {format(new Date(ingredient.updated_at), 'MMM d, yyyy')}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => router.push(`/ingredients/${ingredient.id}`)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-300 hover:text-emerald-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400"
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteRequest(ingredient.id, ingredient.name)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-red-300 hover:text-red-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
