'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import SupportModal from '@/components/support/SupportModal'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})
type LoginFormData = z.infer<typeof loginSchema>

const labelClass = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]'
const inputClass =
  'h-12 w-full rounded-lg border border-[#E2DDD4] bg-white px-4 text-sm text-[#1A1A1A] outline-none transition-all placeholder:text-[#C0BAB1] focus:border-[#0E3B2E] focus:ring-4 focus:ring-[#0E3B2E]/[0.08] disabled:bg-[#FAFAF8]'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPwd, setShowPwd] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)

  const redirectTo = searchParams.get('redirectTo')
  const destination =
    redirectTo && redirectTo.startsWith('/') && redirectTo !== '/' ? redirectTo : '/dashboard'

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password })
    if (error) { setServerError(error.message); return }
    router.push(destination)
    router.refresh()
  }

  const handleGoogleSignIn = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}` },
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      {/* Email */}
      <div>
        <label htmlFor="l-email" className={labelClass}>Email</label>
        <div className="relative">
          <input
            id="l-email"
            data-testid="login-email-input"
            {...register('email')}
            type="email"
            autoComplete="email"
            placeholder="you@kitchen.com"
            className={`${inputClass} pr-11`}
          />
          <Mail className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C0BAB1]" />
        </div>
        {errors.email && <p className="mt-1.5 text-xs text-amber-600">{errors.email.message}</p>}
      </div>

      {/* Password */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="l-pwd" className={labelClass} style={{ marginBottom: 0 }}>Password</label>
          <Link href="/forgot-password" className="text-[11px] font-medium text-[#0E3B2E] transition hover:text-[#164d3c]">
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <input
            id="l-pwd"
            data-testid="login-password-input"
            {...register('password')}
            type={showPwd ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••••••"
            className={`${inputClass} pr-11`}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPwd((s) => !s)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#C0BAB1] transition hover:text-[#6B6B6B]"
            aria-label={showPwd ? 'Hide password' : 'Show password'}
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="mt-1.5 text-xs text-amber-600">{errors.password.message}</p>}
      </div>

      {/* Submit */}
      <button
        type="submit"
        data-testid="login-submit-button"
        disabled={isSubmitting}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold tracking-wide text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: '#0E3B2E' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#164d3c' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#0E3B2E' }}
      >
        {isSubmitting
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
          : <><Lock className="h-4 w-4" /> Sign in securely</>}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[#E8E4DF]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C0BAB1]">or</span>
        <div className="h-px flex-1 bg-[#E8E4DF]" />
      </div>

      {/* Google */}
      <button
        type="button"
        data-testid="login-google-button"
        onClick={handleGoogleSignIn}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-[#E2DDD4] bg-white text-sm font-medium text-[#3D3D3D] transition hover:bg-[#FAFAF8] hover:border-[#C8C4BC]"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <p className="pt-0.5 text-center text-sm text-[#6B6B6B]">
        New to ZRecipe?{' '}
        <Link href="/signup" className="font-semibold text-[#0E3B2E] transition hover:text-[#164d3c]" data-testid="login-signup-link">
          Start your 14-day free trial →
        </Link>
      </p>

      <p className="text-center text-sm text-[#6B6B6B]">
        Need help?{' '}
        <button
          type="button"
          onClick={() => setSupportOpen(true)}
          className="font-semibold text-[#0E3B2E] transition hover:text-[#164d3c]"
        >
          Contact support
        </button>
      </p>

      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} mode="public" source="support" />

    </form>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}
