'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { ChefHat } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RecipeSummary } from '@/hooks/useRecipes'

function marginClass(pct: number) {
  if (pct >= 60) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (pct >= 30) return 'bg-amber-50 text-amber-700 ring-amber-200'
  return 'bg-red-50 text-red-700 ring-red-200'
}

export default function RecipeCard({
  recipe,
  onClick,
}: {
  recipe: RecipeSummary
  onClick: (id: string) => void
}) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.2 }}
      onClick={() => onClick(recipe.id)}
      className="group overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-sm transition-shadow hover:shadow-xl"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
        {recipe.imageUrl ? (
          <Image
            src={recipe.imageUrl}
            alt={recipe.name}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-amber-50">
            <div className="rounded-full bg-white/90 p-5 shadow-sm ring-1 ring-slate-200">
              <ChefHat className="h-10 w-10 text-emerald-600" />
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/10 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <p className="line-clamp-1 text-lg font-semibold">
            {recipe.name}
            {recipe.isSubIngredient && (
              <span className="ml-1 align-middle text-xs font-semibold text-emerald-300">
                (Sub)
              </span>
            )}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/70">
            {recipe.category}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {recipe.category}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1',
              marginClass(recipe.cost.marginPercent)
            )}
          >
            {recipe.cost.marginPercent.toFixed(1)}% margin
          </span>
          {recipe.cost.totalCost > 0 && (
            <span className="text-sm font-semibold text-slate-700">
              €{recipe.cost.totalCost.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
}
