import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Shield, ArrowLeft } from 'lucide-react'
import AdminNav from './AdminNav'

const SUPER_ADMIN_EMAIL = 'camilovettori@gmail.com'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) redirect('/')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { count: unreadCount } = await admin
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('admin_unread', true)
  const hasUnreadTickets = (unreadCount ?? 0) > 0

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { count: recentAnnouncementCount } = await admin
    .from('announcements')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', thirtyDaysAgo)
  const hasRecentAnnouncement = (recentAnnouncementCount ?? 0) > 0

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — dark */}
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900 p-4">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Shield className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-bold text-emerald-400">ZRecipe Admin</p>
            <p className="text-[10px] text-slate-500">Ziffera Management</p>
          </div>
        </div>

        <div className="flex-1">
          <AdminNav hasUnreadTickets={hasUnreadTickets} hasRecentAnnouncement={hasRecentAnnouncement} />
        </div>

        <div className="border-t border-slate-800 pt-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to ZRecipe
          </Link>
        </div>
      </aside>

      {/* Content area — light */}
      <main className="flex-1 overflow-auto bg-slate-50 p-8">
        {children}
      </main>
    </div>
  )
}
