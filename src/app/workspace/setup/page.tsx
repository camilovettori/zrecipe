'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

const ThreeBackground = dynamic(
  () => import('@/components/auth/ThreeBackground'),
  { ssr: false }
)

const schema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
  businessType: z.enum(['restaurant', 'cafe', 'bakery', 'other'], {
    error: 'Please select a business type',
  }),
})

type FormData = z.infer<typeof schema>

const inputClass =
  'w-full rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-white placeholder-white/40 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 transition-colors'

export default function WorkspaceSetupPage() {
  const router = useRouter()
  const nextPath = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('next')
    : null
  const destination =
    nextPath && nextPath.startsWith('/') && nextPath !== '/login' && nextPath !== '/auth/callback'
      ? nextPath
      : '/dashboard'
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setServerError(null)

    // Ensure the user is still authenticated (session may have expired)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const res = await fetch('/api/auth/setup-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: data.businessName,
        businessType: data.businessType,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setServerError((err as { error?: string }).error ?? 'Failed to create workspace')
      return
    }

    router.push(destination)
    router.refresh()
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <ThreeBackground />
      <div className="page-fade-in relative z-10 flex min-h-screen items-center justify-center p-4">
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
              <p className="mt-2 text-sm text-white/60">
                One last step — tell us about your business
              </p>
            </div>

            {serverError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-3 text-sm text-red-200"
              >
                {serverError}
              </motion.div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Business name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-white/80">
                  Business name
                </label>
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

              {/* Business type */}
              <div>
                <label className="mb-1 block text-sm font-medium text-white/80">
                  Business type
                </label>
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

              <motion.button
                type="submit"
                disabled={isSubmitting}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Setting up workspace…' : 'Create Workspace'}
              </motion.button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
