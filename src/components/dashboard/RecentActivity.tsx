import Link from 'next/link'
import { ChefHat, Apple, FileText } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

type ActivityItem = {
  type: 'recipe' | 'ingredient' | 'invoice'
  id: string
  label: string
  subtitle?: string
  value?: string
  at: string
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const ICON: Record<ActivityItem['type'], React.ComponentType<{ className?: string }>> = {
  recipe:     ChefHat,
  ingredient: Apple,
  invoice:    FileText,
}

const ICON_STYLE: Record<ActivityItem['type'], string> = {
  recipe:     'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  ingredient: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  invoice:    'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
}

const HREF: Record<ActivityItem['type'], (id: string) => string> = {
  recipe:     (id) => `/recipes/${id}`,
  ingredient: (id) => `/ingredients/${id}`,
  invoice:    (id) => `/invoices/${id}`,
}

async function getRecentActivity(tenantId: string): Promise<ActivityItem[]> {
  const admin = createAdminClient()

  const [recipesRes, ingredientsRes, invoicesRes] = await Promise.all([
    admin
      .from('recipes')
      .select('id, name, category, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('ingredients')
      .select('id, name, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('invoices')
      .select('id, invoice_number, created_at, total_amount, supplier:suppliers(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const items: ActivityItem[] = []

  for (const row of (recipesRes.data ?? []) as Array<{ id: string; name: string; category: string | null; created_at: string }>) {
    items.push({
      type: 'recipe',
      id: row.id,
      label: row.name,
      subtitle: row.category ?? undefined,
      at: row.created_at,
    })
  }
  for (const row of (ingredientsRes.data ?? []) as Array<{ id: string; name: string; created_at: string }>) {
    items.push({ type: 'ingredient', id: row.id, label: row.name, at: row.created_at })
  }
  type InvoiceRow = {
    id: string
    invoice_number: string | null
    created_at: string
    total_amount: number | null
    supplier: { name: string | null } | { name: string | null }[] | null
  }
  for (const row of (invoicesRes.data ?? []) as InvoiceRow[]) {
    const supplier = Array.isArray(row.supplier) ? row.supplier[0] ?? null : row.supplier
    items.push({
      type: 'invoice',
      id: row.id,
      label: supplier?.name ?? 'Invoice',
      subtitle: row.invoice_number ? `#${row.invoice_number}` : undefined,
      value: row.total_amount != null ? `€${Number(row.total_amount).toFixed(2)}` : undefined,
      at: row.created_at,
    })
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5)
}

interface Props {
  tenantId: string | null
}

export default async function RecentActivity({ tenantId }: Props) {
  const items = tenantId ? await getRecentActivity(tenantId) : []

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
        Recent Activity
      </h2>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        {items.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Start by importing an invoice or creating a recipe.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {items.map((item) => {
              const Icon = ICON[item.type]
              return (
                <li key={`${item.type}-${item.id}`}>
                  <Link
                    href={HREF[item.type](item.id)}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ICON_STYLE[item.type]}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {item.label}
                      </p>
                      {item.subtitle && (
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.subtitle}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      {item.value && (
                        <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{item.value}</span>
                      )}
                      <span className="text-xs text-slate-400 dark:text-slate-500">{timeAgo(item.at)}</span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
