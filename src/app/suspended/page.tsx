import Link from 'next/link'
import { PauseCircle } from 'lucide-react'

export default function SuspendedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <PauseCircle className="h-16 w-16 text-amber-400" />
        </div>
        <h1 className="mb-3 text-2xl font-semibold text-slate-900">
          Account suspended
        </h1>
        <p className="mb-6 text-slate-500">
          Your ZRecipe account has been temporarily suspended. Your data is safe
          and preserved. Please contact support to restore access.
        </p>
        <a
          href="mailto:support@zrecipe.ie"
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          Contact support
        </a>
        <p className="mt-6 text-xs text-slate-400">
          Already resolved?{' '}
          <Link href="/login" className="text-slate-600 underline hover:text-slate-900">
            Try logging in again
          </Link>
        </p>
      </div>
    </div>
  )
}
