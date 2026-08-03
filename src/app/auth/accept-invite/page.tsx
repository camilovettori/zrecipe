'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AcceptInvitePage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()

    const run = async () => {
      // Give Supabase a moment to exchange the invite token from the URL hash
      await new Promise((r) => setTimeout(r, 400))

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // The invite is looked up and applied server-side against the
      // tenant_invites table — this page must never write tenant_id/role
      // into tenant_users itself, since user_metadata is self-writable and
      // not a valid authorization source.
      const res = await fetch('/api/team/accept', { method: 'POST' })
      if (!res.ok) {
        throw new Error('Something went wrong finishing your account setup.')
      }
      const data = await res.json() as { redirect?: string }

      // Clear tenant cookie so middleware re-checks on next navigation
      document.cookie = 'has-tenant=; max-age=0; path=/'
      router.push(data.redirect ?? '/')
    }

    run().catch((e) => setError(e instanceof Error ? e.message : 'Something went wrong'))
  }, [router])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-red-600">{error}</p>
          <button onClick={() => router.push('/login')} className="mt-4 text-sm text-emerald-600 underline hover:no-underline">
            Go to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        <h2 className="mb-1 text-lg font-semibold text-gray-800">Setting up your account…</h2>
        <p className="text-sm text-gray-500">You&apos;ll be redirected shortly.</p>
      </div>
    </div>
  )
}
