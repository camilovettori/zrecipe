'use client'

import { motion } from 'framer-motion'
import { ChefHat, Apple, FileText, TrendingUp, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DashboardStats {
  totalRecipes: string
  totalIngredients: string
  invoicesThisMonth: string
  avgMargin: string
  avgMarginBasis: { included: number; total: number }
  monthlySpend: string
}

interface StatsCardsProps {
  stats: DashboardStats
}

const noMarginData = (v: string) => v === 'N/A' || v === '--' || v === 'Set prices'

export default function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      label:       'Total Recipes',
      value:       stats.totalRecipes,
      subtext:     'recipes tracked',
      icon:        ChefHat,
      iconBg:      'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor:   'text-emerald-600 dark:text-emerald-400',
      accentColor: 'border-l-emerald-500',
    },
    {
      label:       'Total Ingredients',
      value:       stats.totalIngredients,
      subtext:     'ingredients catalogued',
      icon:        Apple,
      iconBg:      'bg-amber-100 dark:bg-amber-900/30',
      iconColor:   'text-amber-600 dark:text-amber-400',
      accentColor: 'border-l-amber-500',
    },
    {
      label:       'Invoices This Month',
      value:       stats.invoicesThisMonth,
      subtext:     'invoices processed',
      icon:        FileText,
      iconBg:      'bg-blue-100 dark:bg-blue-900/30',
      iconColor:   'text-blue-600 dark:text-blue-400',
      accentColor: 'border-l-blue-500',
    },
    {
      label:       'Avg Margin',
      value:       noMarginData(stats.avgMargin) ? 'Set prices' : stats.avgMargin,
      subtext:     noMarginData(stats.avgMargin)
        ? 'Add recipe selling prices to calculate'
        : `Based on ${stats.avgMarginBasis.included} of ${stats.avgMarginBasis.total} recipes`,
      icon:        TrendingUp,
      iconBg:      'bg-violet-100 dark:bg-violet-900/30',
      iconColor:   'text-violet-600 dark:text-violet-400',
      accentColor: 'border-l-violet-500',
    },
    {
      label:       'Monthly Spend',
      value:       stats.monthlySpend,
      subtext:     'from invoices this month',
      icon:        Receipt,
      iconBg:      'bg-purple-100 dark:bg-purple-900/30',
      iconColor:   'text-purple-600 dark:text-purple-400',
      accentColor: 'border-l-purple-500',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.07, ease: 'easeOut' }}
          whileHover={{ y: -4, transition: { duration: 0.18 } }}
          className={cn(
            'flex items-start gap-4 rounded-xl border border-slate-200 border-l-4 bg-white p-6 shadow-sm transition-shadow hover:shadow-md',
            'dark:border-slate-700 dark:bg-slate-800',
            card.accentColor
          )}
        >
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', card.iconBg)}>
            <card.icon className={cn('h-6 w-6', card.iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{card.value}</p>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{card.subtext}</p>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
