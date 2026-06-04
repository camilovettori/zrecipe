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

      const tenantId = user.user_metadata?.tenant_id as string | undefined
      const role = (user.user_metadata?.role as string | undefined) ?? 'staff'

      if (tenantId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('tenant_users') as any).upsert(
          { tenant_id: tenantId, user_id: user.id, role },
          { onConflict: 'tenant_id,user_id' }
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('tenant_invites') as any)
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('tenant_id', tenantId)
          .eq('email', user.email!)
      }

      // Clear tenant cookie so middleware re-checks on next navigation
      document.cookie = 'has-tenant=; max-age=0; path=/'
      router.push('/')
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
