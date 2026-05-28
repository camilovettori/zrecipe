'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

const registerSchema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  businessType: z.enum(['restaurant', 'cafe', 'bakery', 'other'], {
    error: 'Please select a business type',
  }),
})

type RegisterFormData = z.infer<typeof registerSchema>

const inputClass =
  'w-full rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-white placeholder-white/40 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 transition-colors'

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

    // Create tenant and tenant_users via server-side route (uses service role to bypass RLS)
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
      // Email confirmation is disabled — user is already authenticated
      router.push('/dashboard')
    } else {
      setSuccessMessage('Check your email to confirm your account.')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-8">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-white">
            Z<span className="text-emerald-400">Recipe</span>
          </h1>
          <p className="mt-2 text-sm text-white/60">Start your free 14-day trial</p>
        </div>

        {/* Server error */}
        {serverError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-3 text-sm text-red-200"
          >
            {serverError}
          </motion.div>
        )}

        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-4 py-3 text-sm text-emerald-100"
          >
            {successMessage}
          </motion.div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Business name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-white/80">Business name</label>
            <input
              {...register('businessName')}
              type="text"
              autoComplete="organization"
              placeholder="Acme Bakery"
              className={inputClass}
            />
            {errors.businessName && (
              <p className="mt-1 text-xs text-red-300">{errors.businessName.message}</p>
            )}
          </div>

          {/* Full name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-white/80">Full name</label>
            <input
              {...register('fullName')}
              type="text"
              autoComplete="name"
              placeholder="Jane Smith"
              className={inputClass}
            />
            {errors.fullName && (
              <p className="mt-1 text-xs text-red-300">{errors.fullName.message}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="mb-1 block text-sm font-medium text-white/80">Email</label>
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={inputClass}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-300">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="mb-1 block text-sm font-medium text-white/80">Password</label>
            <input
              {...register('password')}
              type="password"
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              className={inputClass}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-300">{errors.password.message}</p>
            )}
          </div>

          {/* Business type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-white/80">Business type</label>
            <select
              {...register('businessType')}
              className={`${inputClass} [&>option]:bg-slate-900 [&>option]:text-white`}
              defaultValue=""
            >
              <option value="" disabled className="bg-slate-900 text-white/40">
                Select type…
              </option>
              <option value="restaurant" className="bg-slate-900">Restaurant</option>
              <option value="cafe" className="bg-slate-900">Café</option>
              <option value="bakery" className="bg-slate-900">Bakery</option>
              <option value="other" className="bg-slate-900">Other</option>
            </select>
            {errors.businessType && (
              <p className="mt-1 text-xs text-red-300">{errors.businessType.message}</p>
            )}
          </div>

          {/* Submit */}
          <motion.button
            type="submit"
            disabled={isSubmitting}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Creating account…' : 'Start Free Trial — 14 days'}
          </motion.button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/20" />
          <span className="text-xs text-white/40">or</span>
          <div className="h-px flex-1 bg-white/20" />
        </div>

        {/* Google OAuth */}
        <motion.button
          type="button"
          onClick={handleGoogleSignIn}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition-colors"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </motion.button>

        {/* Sign-in link */}
        <p className="mt-6 text-center text-sm text-white/50">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </motion.div>
  )
}
