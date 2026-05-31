'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'

const registerSchema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  businessType: z.enum(['restaurant', 'cafe', 'bakery', 'catering', 'hotel', 'food-truck', 'other'], {
    error: 'Please select a business type',
  }),
})

type RegisterFormData = z.infer<typeof registerSchema>

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'

export default function RegisterForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const router = useRouter()

  const handleGoogleSignIn = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/dashboard')}`,
      },
    })
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({ resolver: zodResolver(registerSchema) })

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null)
    setSuccessMessage(null)
    const supabase = createClient()
    const normalizedBusinessType = data.businessType.toLowerCase()
    const normalizedEmail = data.email.trim().toLowerCase()
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (typeof window !== 'undefined' ? window.location.origin : '')
    const emailRedirectTo = appUrl ? `${appUrl}/auth/callback` : undefined

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: data.password,
      options: {
        emailRedirectTo,
        data: {
          business_name: data.businessName,
          full_name: data.fullName,
          business_type: normalizedBusinessType,
          plan: 'pro',
        },
      },
    })

    if (signUpError || !authData.user) {
      setServerError(signUpError?.message ?? 'Failed to create account')
      return
    }

    const workspaceRes = await fetch('/api/auth/setup-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: authData.user.id,
        businessName: data.businessName,
        businessType: normalizedBusinessType,
      }),
    })

    if (!workspaceRes.ok) {
      const err = await workspaceRes.json().catch(() => ({}))
      setServerError((err as { error?: string }).error ?? 'Failed to create workspace')
      return
    }

    if (authData.session) {
      router.push('/dashboard')
    } else {
      setSuccessMessage('Check your email to confirm your account.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      <div className="grid gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Business name</label>
          <input
            {...register('businessName')}
            type="text"
            autoComplete="organization"
            placeholder="Acme Bakery"
            className={inputClass}
          />
          {errors.businessName && (
            <p className="mt-1.5 text-xs text-red-600">{errors.businessName.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Full name</label>
          <input
            {...register('fullName')}
            type="text"
            autoComplete="name"
            placeholder="Jane Smith"
            className={inputClass}
          />
          {errors.fullName && <p className="mt-1.5 text-xs text-red-600">{errors.fullName.message}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
          <input
            {...register('email')}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className={inputClass}
          />
          {errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
          <input
            {...register('password')}
            type="password"
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            className={inputClass}
          />
          {errors.password && (
            <p className="mt-1.5 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Business type</label>
          <select
            {...register('businessType')}
            className={`${inputClass} appearance-none`}
            defaultValue=""
          >
            <option value="" disabled>
              Select type...
            </option>
            <option value="bakery">Bakery</option>
            <option value="restaurant">Restaurant</option>
            <option value="cafe">Cafe</option>
            <option value="catering">Catering</option>
            <option value="hotel">Hotel</option>
            <option value="food-truck">Food Truck</option>
            <option value="other">Other</option>
          </select>
          {errors.businessType && (
            <p className="mt-1.5 text-xs text-red-600">{errors.businessType.message}</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Creating account...' : 'Start free trial - 14 days'}
      </button>

      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">or</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
      >
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </button>

      <p className="pt-2 text-center text-sm text-slate-600">
        By signing up you agree to our Terms &amp; Privacy.
      </p>

      <p className="text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-emerald-700 hover:text-emerald-600">
          Sign in
        </Link>
      </p>
    </form>
  )
}
