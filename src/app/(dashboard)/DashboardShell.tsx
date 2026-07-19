'use client'

import { useAppStore } from '@/stores/app'
import Sidebar from '@/components/dashboard/Sidebar'
import TopBar from '@/components/dashboard/TopBar'
import UpgradePopup, { UpgradeBanner } from '@/components/shared/UpgradePopup'
import { cn } from '@/lib/utils'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/10">
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
        <UpgradeBanner />
        <main className="flex-1 p-5 sm:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      <UpgradePopup />
    </div>
  )
}
