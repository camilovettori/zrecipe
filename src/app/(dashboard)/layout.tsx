'use client'

import { useAppStore } from '@/stores/app'
import Sidebar from '@/components/dashboard/Sidebar'
import TopBar from '@/components/dashboard/TopBar'
import CommandSearch from '@/components/shared/CommandSearch'
import { cn } from '@/lib/utils'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />

      {/*
        Tailwind JIT needs full strings present in source — both classes are here:
        lg:pl-[72px]   (collapsed)
        lg:pl-[260px]  (expanded)
      */}
      <div
        className={cn(
          'page-fade-in flex min-h-screen flex-col transition-[padding] duration-300 ease-in-out',
          sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[260px]'
        )}
      >
        <TopBar />
        <main className="flex-1 p-5 sm:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
      <CommandSearch />
    </div>
  )
}
