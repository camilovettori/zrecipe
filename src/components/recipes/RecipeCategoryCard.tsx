'use client'

import { AlertTriangle, ArrowRight, Folder } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const CATEGORY_STYLE: Record<string, { folder: string; badge: string; accent: string }> = {
  breakfast: {
    folder: 'bg-amber-50 text-amber-600',
    badge: 'bg-amber-50 text-amber-700',
    accent: 'group-hover:border-amber-200',
  },
  lunch: {
    folder: 'bg-blue-50 text-blue-500',
    badge: 'bg-blue-50 text-blue-700',
    accent: 'group-hover:border-blue-200',
  },
  dinner: {
    folder: 'bg-indigo-50 text-indigo-500',
    badge: 'bg-indigo-50 text-indigo-700',
    accent: 'group-hover:border-indigo-200',
  },
  dessert: {
    folder: 'bg-pink-50 text-pink-500',
    badge: 'bg-pink-50 text-pink-700',
    accent: 'group-hover:border-pink-200',
  },
  bakery: {
    folder: 'bg-orange-50 text-orange-500',
    badge: 'bg-orange-50 text-orange-700',
    accent: 'group-hover:border-orange-200',
  },
  beverage: {
    folder: 'bg-cyan-50 text-cyan-600',
    badge: 'bg-cyan-50 text-cyan-700',
    accent: 'group-hover:border-cyan-200',
  },
  sauce: {
    folder: 'bg-red-50 text-red-500',
    badge: 'bg-red-50 text-red-700',
    accent: 'group-hover:border-red-200',
  },
  other: {
    folder: 'bg-slate-100 text-slate-500',
    badge: 'bg-slate-100 text-slate-600',
    accent: 'group-hover:border-slate-300',
  },
  uncategorised: {
    folder: 'bg-slate-100 text-slate-500',
    badge: 'bg-slate-100 text-slate-600',
    accent: 'group-hover:border-slate-300',
  },
}

export const DEFAULT_RECIPE_CATEGORY_STYLE = {
  folder: 'bg-emerald-50 text-emerald-600',
  badge: 'bg-emerald-50 text-emerald-700',
  accent: 'group-hover:border-emerald-200',
}

export function getRecipeCategoryStyle(category: string) {
  return CATEGORY_STYLE[category.toLowerCase()] ?? DEFAULT_RECIPE_CATEGORY_STYLE
}

interface RecipeCategoryCardProps {
  name: string
  recipeCount: number
  averageMargin: number | null
  missingPriceCount: number
  incompleteCount: number
  previewNames: string[]
  onClick: () => void
}

export default function RecipeCategoryCard({
  name,
  recipeCount,
  averageMargin,
  missingPriceCount,
  incompleteCount,
  previewNames,
  onClick,
}: RecipeCategoryCardProps) {
  const style = getRecipeCategoryStyle(name)

  return (
    <motion.button
      layout
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18 }}
      onClick={onClick}
      className={cn(
        'group min-h-52 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md',
        style.accent
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', style.folder)}>
          <Folder className="h-5 w-5" />
        </div>
        <ArrowRight className="mt-1 h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <h3 className="truncate text-base font-semibold text-slate-900">{name}</h3>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', style.badge)}>
          {recipeCount}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {recipeCount} recipe{recipeCount === 1 ? '' : 's'}
        {averageMargin != null && ` · Avg margin ${averageMargin.toFixed(1)}%`}
      </p>

      {(missingPriceCount > 0 || incompleteCount > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {missingPriceCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {missingPriceCount} need{missingPriceCount === 1 ? 's' : ''} price
            </span>
          )}
          {incompleteCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {incompleteCount} incomplete
            </span>
          )}
        </div>
      )}

      {previewNames.length > 0 && (
        <p className="mt-4 line-clamp-2 text-xs leading-relaxed text-slate-400">
          {previewNames.join(', ')}
          {recipeCount > previewNames.length ? '...' : ''}
        </p>
      )}
    </motion.button>
  )
}
