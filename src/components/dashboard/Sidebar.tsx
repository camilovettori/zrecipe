'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  FileText,
  Apple,
  ChefHat,
  BarChart3,
  Tag,
  Truck,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sparkles,
  Store,
  User,
  X,
  Shield,
  LifeBuoy,
  Megaphone,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { clearTenantCache } from '@/hooks/useTenant'
import { useAppStore } from '@/stores/app'
import { useUserUnread } from '@/hooks/useUserUnread'
import { cn } from '@/lib/utils'

const SUPER_ADMIN_EMAIL = 'camilovettori@gmail.com'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/ingredients', label: 'Ingredients', icon: Apple },
  { href: '/recipes', label: 'Recipes', icon: ChefHat },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/square', label: 'Square', icon: Store },
  { href: '/labels', label: 'Labels', icon: Tag },
  { href: '/ai-ideas', label: 'AI Ideas', icon: Sparkles },
  { href: '/suppliers', label: 'Suppliers', icon: Truck },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface UserInfo {
  email?: string
  name?: string
}

function NavItems({
  collapsed,
  onNavClick,
}: {
  collapsed: boolean
  onNavClick?: () => void
}) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavClick}
            title={collapsed ? label : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-2',
              active
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && (
              <motion.span
                initial={false}
                animate={{ opacity: 1 }}
                className="overflow-hidden whitespace-nowrap"
              >
                {label}
              </motion.span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

function UserSection({
  collapsed,
  user,
}: {
  collapsed: boolean
  user: UserInfo | null
}) {
  const router = useRouter()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const initial = (user?.name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()

  const handleLogout = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    document.cookie = 'has-tenant=; path=/; max-age=0'
    clearTenantCache()
    router.push('/login')
  }

  return (
    <div className="border-t border-slate-800 p-3">
      <div className="relative">
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-slate-800',
            collapsed && 'justify-center px-2'
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
            {initial}
          </div>
          {!collapsed && (
            <div className="flex-1 overflow-hidden text-left">
              <p className="truncate text-sm font-medium text-white">
                {user?.name ?? 'User'}
              </p>
              <p className="text-xs text-slate-400">Owner</p>
            </div>
          )}
        </button>

        <AnimatePresence>
          {dropdownOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-0 mb-2 min-w-[180px] w-full rounded-xl border border-slate-700 bg-slate-800 shadow-xl overflow-hidden z-50"
            >
              <Link
                href="/settings/profile"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                <User className="h-4 w-4" />
                Profile
              </Link>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function SidebarContent({
  collapsed,
  onNavClick,
  onToggle,
  user,
  userEmail,
  announcementCount = 0,
}: {
  collapsed: boolean
  onNavClick?: () => void
  onToggle?: () => void
  user: UserInfo | null
  userEmail?: string
  announcementCount?: number
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-slate-800',
          collapsed ? 'justify-center' : 'px-5'
        )}
      >
        {collapsed ? (
          <Image src="/images/favicon2.png" alt="ZRecipe" width={28} height={28} style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
        ) : (
          <Image src="/images/logo4.png" alt="ZRecipe" width={140} height={40} style={{ height: '36px', width: 'auto', objectFit: 'contain' }} />
        )}
      </div>

      <NavItems collapsed={collapsed} onNavClick={onNavClick} />

      {/* Collapse toggle — inside the sidebar at the bottom of nav */}
      {onToggle && (
        <div className="px-3 pb-2">
          <button
            onClick={onToggle}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300',
              collapsed && 'justify-center'
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Admin link — only for super admins */}
      {(userEmail ?? '').toLowerCase() === SUPER_ADMIN_EMAIL && (
        <div className="px-3 pb-1">
          <Link
            href="/adminziffera"
            title={collapsed ? 'Admin Panel' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 transition-colors hover:bg-slate-800/50 hover:text-amber-400',
              collapsed && 'justify-center'
            )}
          >
            <Shield className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && <span>Admin Panel</span>}
          </Link>
        </div>
      )}

      {/* Support */}
      <div className="px-3 pb-1">
        <Link
          href="/support"
          onClick={onNavClick}
          title={collapsed ? 'Support' : undefined}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300',
            collapsed && 'justify-center'
          )}
        >
          <LifeBuoy className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && <span>Support</span>}
        </Link>
      </div>

      {/* Announcements */}
      <div className="px-3 pb-1">
        <Link
          href="/announcements"
          onClick={onNavClick}
          title={collapsed ? 'Announcements' : undefined}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300',
            collapsed && 'justify-center'
          )}
        >
          <span className="relative shrink-0">
            <Megaphone className="h-3.5 w-3.5" />
            {announcementCount > 0 && (
              <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
            )}
          </span>
          {!collapsed && (
            <span className="flex flex-1 items-center justify-between">
              Announcements
              {announcementCount > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {announcementCount > 9 ? '9+' : announcementCount}
                </span>
              )}
            </span>
          )}
        </Link>
      </div>

      {/* Separator */}
      <div className="mx-3 border-t border-slate-700" />

      <UserSection collapsed={collapsed} user={user} />
    </div>
  )
}

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } =
    useAppStore()
  const [user, setUser] = useState<UserInfo | null>(null)
  const { announcementCount } = useUserUnread()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser({
          email: data.user.email,
          name:
            (data.user.user_metadata?.full_name as string | undefined) ??
            data.user.email,
        })
      }
    })
  }, [])

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <motion.aside
        animate={{ width: sidebarCollapsed ? 72 : 260 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="fixed inset-y-0 left-0 z-50 hidden flex-col overflow-hidden bg-slate-900 lg:flex"
      >
        <SidebarContent
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          user={user}
          userEmail={user?.email}
          announcementCount={announcementCount}
        />
      </motion.aside>

      {/* ── Mobile overlay ── */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.aside
              key="drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 lg:hidden"
            >
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="absolute right-3 top-4 text-slate-400 hover:text-white transition-colors"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarContent
                collapsed={false}
                user={user}
                userEmail={user?.email}
                onNavClick={() => setMobileSidebarOpen(false)}
                announcementCount={announcementCount}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
