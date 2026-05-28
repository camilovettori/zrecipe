import { DashboardSkeleton } from '@/components/shared/Skeletons'

export default function Loading() {
  return (
    <div className="page-fade-in flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-5xl">
        <DashboardSkeleton />
      </div>
    </div>
  )
}
