'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantContext } from '@/hooks/useTenant'

type TenantSettings = {
  id: string
  name: string
  business_type: string | null
  owner_email: string | null
}

export default function BusinessSettingsPage() {
  const [tenant, setTenant] = useState<TenantSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState('')

  // ── Data load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const supabase = createClient()

        // Use resolveTenantContext() — calls /api/auth/tenant which uses the
        // service-role client, bypassing any RLS that blocks direct queries.
        // This avoids the anon-client tenants query that may fail due to RLS.
        const [{ data: authData }, ctx] = await Promise.all([
          supabase.auth.getUser(),
          resolveTenantContext(),
        ])

        setCurrentUserEmail(authData.user?.email ?? '')

        const tenantRow: TenantSettings = {
          id: ctx.tenantId,
          name: ctx.tenant.name,
          business_type: ctx.tenant.businessType ?? null,
          owner_email: ctx.tenant.ownerEmail ?? null,
        }

        setTenant(tenantRow)
        setAccountName(tenantRow.name)
        setBusinessType(tenantRow.business_type ?? '')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to load settings')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAccountSave = async () => {
    if (!tenant) return
    try {
      setSavingAccount(true)
      // Use the server-side API so the update runs with the service-role
      // client and isn't blocked by RLS.
      const res = await fetch('/api/auth/tenant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: accountName, businessType: businessType || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Unable to update account')
      }
      setTenant((t) => t ? { ...t, name: accountName, business_type: businessType || null } : t)
      toast.success('Account updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update account')
    } finally {
      setSavingAccount(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-10 w-56 animate-pulse rounded-full bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Business Details</h1>
        <p className="mt-1 text-sm text-slate-500">Update your workspace information.</p>
      </div>

      <section className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Business Details</h2>
            <p className="text-sm text-slate-500">Update your workspace information.</p>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Business name</span>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Business type</span>
            <input
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              placeholder="restaurant, cafe, bakery…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Owner email</span>
            <input
              value={currentUserEmail || tenant?.owner_email || ''}
              readOnly
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 outline-none"
            />
          </label>
          <button
            onClick={handleAccountSave}
            disabled={savingAccount}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {savingAccount && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </section>
    </div>
  )
}
