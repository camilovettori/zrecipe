import Link from 'next/link'
import { Home, ChefHat } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <ChefHat className="h-8 w-8" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold text-slate-900">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          The page may have moved, been deleted, or never existed.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          <Home className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
