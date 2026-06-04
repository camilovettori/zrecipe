'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CustomSelect } from '@/components/ui/CustomSelect'

const schema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
  businessType: z.enum(['restaurant', 'cafe', 'bakery', 'catering', 'hotel', 'food-truck', 'other'], {
    error: 'Please select a business type',
  }),
})
type FormData = z.infer<typeof schema>

const labelClass = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]'
const inputBase =
  'h-12 w-full rounded-lg border border-[#E2DDD4] bg-white px-4 text-sm text-[#1A1A1A] outline-none transition-all placeholder:text-[#C0BAB1] focus:border-[#0E3B2E] focus:ring-4 focus:ring-[#0E3B2E]/[0.08] disabled:bg-[#FAFAF8]'

export default function WorkspaceSetupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [serverError, setServerError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const nextPath = searchParams.get('next')
  const destination =
    nextPath && nextPath.startsWith('/') && nextPath !== '/login' && nextPath !== '/auth/callback'
      ? nextPath
      : '/dashboard'

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) })
  const businessType = watch('businessType') ?? ''

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const meta = user.user_metadata ?? {}
      // Pre-fill from email signup metadata or Google profile
      if (meta.business_name) setValue('businessName', meta.business_name)
      if (meta.business_type) setValue('businessType', meta.business_type)
      setReady(true)
    })
  }, [router, setValue])

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const res = await fetch('/api/auth/setup-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessName: data.businessName, businessType: data.businessType }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setServerError((err as { error?: string }).error ?? 'Failed to create workspace')
      return
    }

    document.cookie = 'has-tenant=true; path=/; max-age=31536000; samesite=lax'
    router.push(destination)
    router.refresh()
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: '#f0f5f2' }}
    >
      <div className="w-full max-w-[400px]">
        <div className="rounded-2xl bg-white p-8 shadow-[0_8px_32px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]">

          {/* Brand icon */}
          <div className="mb-4 flex justify-center">
            <Image
              src="/images/favicon2.png"
              alt="ZRecipe"
              width={64}
              height={64}
              style={{ width: '64px', height: '64px', objectFit: 'contain' }}
            />
          </div>

          <h1 className="text-center font-display text-[1.65rem] font-bold leading-tight tracking-tight text-[#1A1A1A]">
            Set up your kitchen.
          </h1>
          <p className="mt-1.5 text-center text-[0.84rem] text-[#6B6B6B]">
            One last step — name your workspace and you&apos;re in.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>

            {serverError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {serverError}
              </div>
            )}

            {/* Business name */}
            <div>
              <label htmlFor="ws-biz" className={labelClass}>Business name</label>
              <div className="relative">
                <input
                  id="ws-biz"
                  {...register('businessName')}
                  type="text"
                  autoComplete="organization"
                  placeholder="Boulangerie Margaux"
                  className={`${inputBase} pr-11`}
                />
                <Building2 className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C0BAB1]" />
              </div>
              {errors.businessName && (
                <p className="mt-1.5 text-xs text-amber-600">{errors.businessName.message}</p>
              )}
            </div>

            {/* Business type */}
            <div>
              <label htmlFor="ws-type" className={labelClass}>Business type</label>
              <CustomSelect
                value={businessType}
                onChange={(v) => setValue('businessType', v as FormData['businessType'], { shouldValidate: true })}
                placeholder="Select your kitchen type…"
                options={[
                  { value: 'bakery', label: 'Bakery' },
                  { value: 'restaurant', label: 'Restaurant' },
                  { value: 'cafe', label: 'Café' },
                  { value: 'catering', label: 'Catering' },
                  { value: 'hotel', label: 'Hotel' },
                  { value: 'food-truck', label: 'Food Truck' },
                  { value: 'other', label: 'Other' },
                ]}
              />
              {errors.businessType && (
                <p className="mt-1.5 text-xs text-amber-600">{errors.businessType.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || !ready}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold tracking-wide text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: '#0E3B2E' }}
              onMouseEnter={(e) => {
                if (!isSubmitting) (e.currentTarget as HTMLElement).style.background = '#164d3c'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = '#0E3B2E'
              }}
            >
              {isSubmitting || !ready
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {isSubmitting ? 'Setting up…' : 'Loading…'}</>
                : 'Create workspace →'}
            </button>

          </form>
        </div>

        <p className="mt-6 text-center text-[11px]" style={{ color: 'rgba(0,0,0,0.35)' }}>
          © 2026 Ziffera · GDPR-compliant · EU-hosted
        </p>
      </div>
    </div>
  )
}
