'use client'

import { motion } from 'framer-motion'
import { TrendingUp, AlertTriangle, ChefHat } from 'lucide-react'

const ingredients = [
  { name: 'Butter AOP', cost: 0.18, pct: 43, alert: true },
  { name: 'Labor', cost: 0.12, pct: 29, alert: false },
  { name: 'Flour T55', cost: 0.08, pct: 19, alert: false },
  { name: 'Other', cost: 0.04, pct: 9, alert: false },
]


export default function RecipePreviewCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55, duration: 0.55, ease: [0.25, 0.1, 0, 1] }}
      className="w-full rounded-2xl border border-brand-cream bg-white p-5 shadow-[0_4px_32px_rgba(14,59,46,0.10)]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <ChefHat className="h-3.5 w-3.5 text-brand-green/60" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
              Live costing
            </p>
          </div>
          <h3 className="mt-0.5 font-display text-[1.05rem] font-semibold text-[#1A1A1A]">
            Croissant au Beurre
          </h3>
        </div>
        <div className="shrink-0 rounded-xl bg-[#F0F7F4] px-3 py-2 text-center">
          <p className="text-[10px] text-[#6B6B6B]">Food cost</p>
          <p className="text-base font-bold text-brand-green">€0.42</p>
        </div>
      </div>

      {/* Ingredient cost bars */}
      <div className="mt-4 space-y-2.5">
        {ingredients.map((ing, i) => (
          <motion.div
            key={ing.name}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 + i * 0.08, duration: 0.3 }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs text-[#1A1A1A]">
                {ing.name}
                {ing.alert && (
                  <TrendingUp className="h-3 w-3 text-brand-terra" />
                )}
              </span>
              <span className="text-xs tabular-nums text-[#6B6B6B]">
                €{ing.cost.toFixed(2)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#F0ECE6]">
              <motion.div
                className={`h-1.5 rounded-full ${ing.alert ? 'bg-brand-terra' : 'bg-brand-green'}`}
                initial={{ width: 0 }}
                animate={{ width: `${ing.pct}%` }}
                transition={{ duration: 0.55, ease: 'easeOut', delay: 0.8 + i * 0.09 }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-[#F0ECE6] pt-3.5">
        <div className="flex items-center gap-1 text-[11px] text-brand-terra">
          <AlertTriangle className="h-3 w-3" />
          <span>Butter AOP up 8% this month</span>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#6B6B6B]">Margin</p>
          <p className="text-sm font-bold text-brand-green">87%</p>
        </div>
      </div>
    </motion.div>
  )
}
