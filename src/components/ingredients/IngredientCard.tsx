'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Pencil, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { IngredientRow } from '@/hooks/useIngredients'

const CATEGORY_BADGE: Record<string, string> = {
  dairy:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  flour:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  sugar:
    'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  spice:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  meat:
    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  vegetable:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  fruit:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  other:
    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
}

interface IngredientCardProps {
  ingredient: IngredientRow
  onDeleteRequest: (id: string, name: string) => void
}

export default function IngredientCard({ ingredient, onDeleteRequest }: IngredientCardProps) {
  const router = useRouter()
  const [hovered, setHovered] = useState(false)

  const badge =
    CATEGORY_BADGE[(ingredient.category ?? 'other').toLowerCase()] ?? CATEGORY_BADGE.other

  const stopAndNavigate = (e: React.MouseEvent, href: string) => {
    e.stopPropagation()
    router.push(href)
  }

  const stopAndDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDeleteRequest(ingredient.id, ingredient.name)
  }

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={() => router.push(`/ingredients/${ingredient.id}`)}
      className="relative cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
    >
      {/* Quick actions — visible on hover */}
      <motion.div
        initial={false}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.15 }}
        className="absolute right-3 top-3 flex gap-1.5"
      >
        <button
          onClick={(e) => stopAndNavigate(e, `/ingredients/${ingredient.id}`)}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-emerald-300 hover:text-emerald-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400"
          aria-label="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={stopAndDelete}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-red-300 hover:text-red-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400"
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </motion.div>

      {/* Category badge */}
      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', badge)}>
        {ingredient.category ?? 'Other'}
      </span>

      {/* Name */}
      <h3 className="mt-3 line-clamp-1 text-base font-semibold text-slate-900 dark:text-white">
        {ingredient.name}
      </h3>

      {/* Price */}
      <p className="mt-1">
        <span className="text-xl font-bold text-emerald-600">
          {ingredient.current_price != null
            ? `$${ingredient.current_price.toFixed(2)}`
            : '—'}
        </span>
        {ingredient.current_price != null && (
          <span className="ml-1 text-sm text-slate-500 dark:text-slate-400">
            / {ingredient.base_unit}
          </span>
        )}
      </p>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700">
        <span className="truncate text-xs text-slate-400 dark:text-slate-500 max-w-[50%]">
          {ingredient.supplier?.name ?? 'No supplier'}
        </span>
        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
          {format(new Date(ingredient.updated_at), 'MMM d, yyyy')}
        </span>
      </div>
    </motion.div>
  )
}
