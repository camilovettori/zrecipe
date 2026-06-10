import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { LayoutDashboard, Users, CreditCard, Shield, ArrowLeft } from 'lucide-react'

const SUPER_ADMIN_EMAIL = 'camilovettori@gmail.com'

const NAV = [
  { href: '/adminziffera',         icon: LayoutDashboard, label: 'Overview' },
  { href: '/adminziffera/tenants', icon: Users,           label: 'Tenants' },
  { href: '/adminziffera/billing', icon: CreditCard,      label: 'Billing' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== SUPER_ADMIN_EMAIL) redirect('/')

  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen w-56 flex-col border-r border-gray-800 bg-gray-900 p-4">
        <div className="mb-8 flex items-center gap-2 px-2">
          <Shield className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-bold text-white">ZRecipe Admin</p>
            <p className="text-[10px] text-gray-500">Ziffera Management</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-gray-800 pt-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to ZRecipe
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  )
}
