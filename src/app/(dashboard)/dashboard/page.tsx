import { createClient } from '@/lib/supabase/server'
import StatsCards from '@/components/dashboard/StatsCards'
import Link from 'next/link'
import { FileText, ChefHat, Upload, Plus, ArrowRight } from 'lucide-react'

async function getDisplayName() {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    const user = data.user
    if (!user) return 'Chef'
    return (
      (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ??
      user.email?.split('@')[0] ??
      'Chef'
    )
  } catch {
    return 'Chef'
  }
}

function QuickActions() {
  const actions = [
    {
      href:        '/invoices',
      icon:        Upload,
      iconBg:      'bg-blue-100 dark:bg-blue-900/30',
      iconColor:   'text-blue-600 dark:text-blue-400',
      title:       'Import Invoice',
      description: 'Upload a PDF or CSV to track ingredient costs',
    },
    {
      href:        '/ingredients/new',
      icon:        Plus,
      iconBg:      'bg-amber-100 dark:bg-amber-900/30',
      iconColor:   'text-amber-600 dark:text-amber-400',
      title:       'Add Ingredient',
      description: 'Catalogue a new ingredient and set its price',
    },
    {
      href:        '/recipes/new',
      icon:        ChefHat,
      iconBg:      'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor:   'text-emerald-600 dark:text-emerald-400',
      title:       'Create Recipe',
      description: 'Build a recipe and calculate its food cost',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {actions.map(({ href, icon: Icon, iconBg, iconColor, title, description }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
        >
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">
              {title}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {description}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600 mt-0.5 group-hover:text-emerald-500 transition-colors" />
        </Link>
      ))}
    </div>
  )
}

function EmptyActivity() {
  return (
    <div className="px-6 py-12">
      <div className="mb-6 text-center">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No activity yet</p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Get started with one of the actions below
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/invoices"
          className="group flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 p-6 text-center transition-all hover:border-blue-400 hover:bg-blue-50/50 dark:border-slate-600 dark:hover:border-blue-500 dark:hover:bg-blue-900/10"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
            <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors">
              Import your first invoice
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Upload a supplier invoice to automatically extract ingredient prices
            </p>
          </div>
          <span className="mx-auto text-xs font-medium text-blue-600 dark:text-blue-400">
            Go to Invoices →
          </span>
        </Link>

        <Link
          href="/recipes/new"
          className="group flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 p-6 text-center transition-all hover:border-emerald-400 hover:bg-emerald-50/50 dark:border-slate-600 dark:hover:border-emerald-500 dark:hover:bg-emerald-900/10"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
            <ChefHat className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-emerald-600 transition-colors">
              Create your first recipe
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Add ingredients, set quantities, and instantly see your food cost
            </p>
          </div>
          <span className="mx-auto text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Go to Recipes →
          </span>
        </Link>
      </div>
    </div>
  )
}

export default async function DashboardPage() {
  const displayName = await getDisplayName()

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Welcome back, {displayName}
        </h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Here&apos;s what&apos;s happening in your kitchen today.
        </p>
      </div>

      {/* Quick actions */}
      <QuickActions />

      {/* Stats */}
      <StatsCards />

      {/* Recent activity */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Recent Activity
        </h2>
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <EmptyActivity />
        </div>
      </section>
    </div>
  )
}
