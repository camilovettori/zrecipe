'use client'

import { motion } from 'framer-motion'
import { ChefHat, Apple, FileText, TrendingUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCard {
  label:       string
  value:       string
  subtext:     string
  icon:        React.ElementType
  iconBg:      string
  iconColor:   string
  accentColor: string   // Tailwind border-l color class
  trend:       string   // '—' until real data exists
  trendColor:  string   // text color class
}

const CARDS: StatCard[] = [
  {
    label:       'Total Recipes',
    value:       '0',
    subtext:     'recipes tracked',
    icon:        ChefHat,
    iconBg:      'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor:   'text-emerald-600 dark:text-emerald-400',
    accentColor: 'border-l-emerald-500',
    trend:       '—',
    trendColor:  'text-slate-400',
  },
  {
    label:       'Total Ingredients',
    value:       '0',
    subtext:     'ingredients catalogued',
    icon:        Apple,
    iconBg:      'bg-amber-100 dark:bg-amber-900/30',
    iconColor:   'text-amber-600 dark:text-amber-400',
    accentColor: 'border-l-amber-500',
    trend:       '—',
    trendColor:  'text-slate-400',
  },
  {
    label:       'Invoices This Month',
    value:       '0',
    subtext:     'invoices processed',
    icon:        FileText,
    iconBg:      'bg-blue-100 dark:bg-blue-900/30',
    iconColor:   'text-blue-600 dark:text-blue-400',
    accentColor: 'border-l-blue-500',
    trend:       '—',
    trendColor:  'text-slate-400',
  },
  {
    label:       'Avg Margin',
    value:       'N/A',
    subtext:     'Add recipes to see margins',
    icon:        TrendingUp,
    iconBg:      'bg-violet-100 dark:bg-violet-900/30',
    iconColor:   'text-violet-600 dark:text-violet-400',
    accentColor: 'border-l-violet-500',
    trend:       '—',
    trendColor:  'text-slate-400',
  },
]

export default function StatsCards() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.07, ease: 'easeOut' }}
          whileHover={{ y: -4, transition: { duration: 0.18 } }}
          className={cn(
            'flex items-start gap-4 rounded-xl border border-slate-200 border-l-4 bg-white p-6 shadow-sm hover:shadow-md transition-shadow',
            'dark:border-slate-700 dark:bg-slate-800',
            card.accentColor,
          )}
        >
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
              card.iconBg
            )}
          >
            <card.icon className={cn('h-6 w-6', card.iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {card.label}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {card.value}
              </p>
              <span className={cn('flex items-center gap-0.5 text-xs font-medium', card.trendColor)}>
                <Minus className="h-3 w-3" />
                {card.trend}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              {card.subtext}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
