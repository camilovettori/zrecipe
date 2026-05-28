import { createClient } from '@/lib/supabase/server'
import StatsCards from '@/components/dashboard/StatsCards'
import { FileText, ChefHat } from 'lucide-react'

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

function EmptyActivity() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex gap-3 mb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700">
          <FileText className="h-6 w-6 text-slate-400" />
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700">
          <ChefHat className="h-6 w-6 text-slate-400" />
        </div>
      </div>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
        No activity yet
      </p>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        Add an invoice or recipe to get started.
      </p>
    </div>
  )
}

export default async function DashboardPage() {
  const displayName = await getDisplayName()

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Welcome back, {displayName}
        </h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Here&apos;s an overview of your kitchen operations.
        </p>
      </div>

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
