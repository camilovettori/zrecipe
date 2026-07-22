'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, CreditCard, Inbox, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/adminziffera',               icon: LayoutDashboard, label: 'Overview' },
  { href: '/adminziffera/tenants',       icon: Users,           label: 'Tenants' },
  { href: '/adminziffera/inbox',         icon: Inbox,           label: 'Inbox' },
  { href: '/adminziffera/announcements', icon: Megaphone,       label: 'Announcements' },
  { href: '/adminziffera/billing',       icon: CreditCard,      label: 'Billing' },
]

export default function AdminNav({
  hasUnreadTickets = false,
  hasRecentAnnouncement = false,
}: {
  hasUnreadTickets?: boolean
  hasRecentAnnouncement?: boolean
}) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/adminziffera' ? pathname === '/adminziffera' : pathname.startsWith(href)

  return (
    <nav className="space-y-0.5">
      {NAV.map(({ href, icon: Icon, label }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              active
                ? 'border-l-2 border-emerald-500 bg-emerald-600/10 pl-[10px] text-emerald-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            )}
          >
            <span className="relative shrink-0">
              <Icon className="h-4 w-4" />
              {href === '/adminziffera/inbox' && hasUnreadTickets && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />
              )}
              {href === '/adminziffera/announcements' && hasRecentAnnouncement && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />
              )}
            </span>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
