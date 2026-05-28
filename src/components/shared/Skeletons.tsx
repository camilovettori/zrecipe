'use client'

import { cn } from '@/lib/utils'

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-slate-200/80', className)} />
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <SkeletonBlock className="aspect-[16/9] rounded-none" />
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-5 w-3/4" />
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-8 w-24 rounded-full" />
              <SkeletonBlock className="h-4 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({
  rows = 5,
  columns = 6,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, row) => (
          <div
            key={row}
            className="grid gap-4 p-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((__, column) => (
              <SkeletonBlock key={column} className="h-5 rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function BuilderSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-10 w-24 rounded-full" />
        <SkeletonBlock className="h-10 flex-1 rounded-full" />
        <SkeletonBlock className="h-10 w-24 rounded-full" />
        <SkeletonBlock className="h-10 w-24 rounded-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <SkeletonBlock className="h-64 rounded-3xl" />
          <SkeletonBlock className="h-80 rounded-3xl" />
          <SkeletonBlock className="h-72 rounded-3xl" />
        </div>
        <div className="space-y-6">
          <SkeletonBlock className="h-24 rounded-3xl" />
          <SkeletonBlock className="h-96 rounded-3xl" />
          <SkeletonBlock className="h-72 rounded-3xl" />
        </div>
      </div>
    </div>
  )
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-10 w-64 rounded-full" />
      <SkeletonBlock className="h-96 rounded-3xl" />
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SkeletonBlock className="h-8 w-48 rounded-full" />
        <SkeletonBlock className="h-4 w-80 rounded-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-28 rounded-3xl" />
        ))}
      </div>
      <SkeletonBlock className="h-72 rounded-3xl" />
    </div>
  )
}
