'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ImageIcon, Loader2, Lock } from 'lucide-react'
import { toast } from '@/lib/toast'
import { clearTenantCache, resolveTenantContext } from '@/hooks/useTenant'
import { hasBrandingRights } from '@/lib/tenant'

type TenantSettings = {
  id: string
  subscription_status: string | null
  is_comped: boolean
  custom_logo_url: string | null
}

export default function BrandingSettingsPage() {
  const [tenant, setTenant] = useState<TenantSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const hasBranding = hasBrandingRights(tenant?.subscription_status ?? null, tenant?.is_comped ?? false)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const ctx = await resolveTenantContext()
        setTenant({
          id: ctx.tenantId,
          subscription_status: ctx.tenant.subscriptionStatus ?? null,
          is_comped: ctx.tenant.isComped ?? false,
          custom_logo_url: ctx.tenant.customLogoUrl ?? null,
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to load settings')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Logo must be an image file')
      return
    }
    try {
      setUploadingLogo(true)
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/tenant/logo', { method: 'POST', body: formData })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Upload failed')
      // The shared tenant context cache (used by useSubscription()/resolveTenantContext()
      // across the app, incl. the Kitchen Card modal) must be invalidated or it'll keep
      // serving the pre-upload value for the rest of the session.
      clearTenantCache()
      setTenant((t) => t ? { ...t, custom_logo_url: (body as { url: string }).url } : t)
      toast.success('Logo updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to upload logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleLogoRemove = async () => {
    try {
      setUploadingLogo(true)
      const res = await fetch('/api/tenant/logo', { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Remove failed')
      clearTenantCache()
      setTenant((t) => t ? { ...t, custom_logo_url: null } : t)
      toast.success('Logo removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to remove logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-10 w-56 animate-pulse rounded-full bg-slate-100" />
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
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
        <h1 className="font-display text-2xl font-semibold text-slate-900">Kitchen Card Branding</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose the logo shown in the header of your printed Kitchen Cards.
        </p>
      </div>

      <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Kitchen Card branding</h2>
            <p className="text-sm text-slate-500">
              Choose the logo shown in the header of your printed Kitchen Cards.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-2">
            {tenant?.custom_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.custom_logo_url} alt="Custom logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-center text-[11px] text-slate-400">No custom logo — using ZRecipe branding</span>
            )}
          </div>

          {hasBranding ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                {uploadingLogo && <Loader2 className="h-4 w-4 animate-spin" />}
                {tenant?.custom_logo_url ? 'Replace logo' : 'Upload logo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingLogo}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleLogoUpload(file)
                    e.target.value = ''
                  }}
                />
              </label>
              {tenant?.custom_logo_url && (
                <button
                  type="button"
                  onClick={handleLogoRemove}
                  disabled={uploadingLogo}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Remove
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Lock className="h-4 w-4 shrink-0" />
                Upgrade to Pro to customize or remove branding.
              </div>
              <Link
                href="/settings/billing"
                className="shrink-0 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                Upgrade
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
