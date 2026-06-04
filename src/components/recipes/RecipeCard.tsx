'use client'

import { motion } from 'framer-motion'
import { ChefHat } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RecipeSummary } from '@/hooks/useRecipes'

function marginBadgeClass(pct: number) {
  if (pct >= 60) return 'bg-emerald-500/90 text-white'
  if (pct >= 35) return 'bg-amber-500/90 text-white'
  return 'bg-red-500/90 text-white'
}

export default function RecipeCard({
  recipe,
  onClick,
}: {
  recipe: RecipeSummary
  onClick: (id: string) => void
}) {
  const profitPerUnit = recipe.cost.sellingPrice - recipe.cost.costPerUnit
  const hasPrice = recipe.cost.sellingPrice > 0

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18 }}
      onClick={() => onClick(recipe.id)}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:border-gray-200 hover:shadow-md"
    >
      {/* Image — 16:9 */}
      <div className="relative aspect-video overflow-hidden bg-gray-100">
        {recipe.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.imageUrl}
            alt={recipe.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-amber-50">
            <div className="rounded-full bg-white/90 p-4 shadow-sm ring-1 ring-slate-200">
              <ChefHat className="h-8 w-8 text-emerald-500" />
            </div>
          </div>
        )}

        {/* Category badge — bottom left */}
        <div className="absolute bottom-2 left-2">
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
            {recipe.category}
          </span>
        </div>

        {/* Margin badge — top right (only when price is set) */}
        {hasPrice && (
          <div className="absolute right-2 top-2">
            <span className={cn(
              'rounded-full px-2 py-0.5 text-xs font-bold backdrop-blur-sm',
              marginBadgeClass(recipe.cost.marginPercent)
            )}>
              {recipe.cost.marginPercent.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="mb-3 line-clamp-1 text-sm font-semibold leading-tight text-gray-900 transition-colors group-hover:text-emerald-600">
          {recipe.name}
          {recipe.isSubIngredient && (
            <span className="ml-1.5 align-middle text-[10px] font-semibold text-emerald-600">(Sub)</span>
          )}
        </h3>

        {/* 2×2 cost grid */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg bg-gray-50 p-2 text-center">
            <div className="text-[10px] text-gray-400">Total cost</div>
            <div className="mt-0.5 text-sm font-semibold text-gray-700">
              €{recipe.cost.totalCost.toFixed(2)}
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 p-2 text-center">
            <div className="text-[10px] text-gray-400">Selling price</div>
            <div className="mt-0.5 text-sm font-semibold text-gray-700">
              {hasPrice ? `€${recipe.cost.sellingPrice.toFixed(2)}` : '—'}
            </div>
          </div>
          <div className={cn('rounded-lg p-2 text-center', hasPrice && profitPerUnit > 0 ? 'bg-emerald-50' : hasPrice ? 'bg-red-50' : 'bg-gray-50')}>
            <div className="text-[10px] text-gray-400">Profit / unit</div>
            <div className={cn('mt-0.5 text-sm font-semibold', !hasPrice ? 'text-gray-400' : profitPerUnit > 0 ? 'text-emerald-600' : 'text-red-500')}>
              {hasPrice ? `${profitPerUnit >= 0 ? '+' : ''}€${profitPerUnit.toFixed(2)}` : '—'}
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 p-2 text-center">
            <div className="text-[10px] text-gray-400">Food cost</div>
            <div className={cn('mt-0.5 text-sm font-semibold', !hasPrice ? 'text-gray-400' : recipe.cost.foodCostPercentage < 30 ? 'text-emerald-600' : recipe.cost.foodCostPercentage < 40 ? 'text-amber-600' : 'text-red-500')}>
              {hasPrice ? `${recipe.cost.foodCostPercentage.toFixed(1)}%` : '—'}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
