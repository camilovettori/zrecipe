'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, Eye, EyeOff, Loader2, Mail, ShieldCheck, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CustomSelect } from '@/components/ui/CustomSelect'
import SupportModal from '@/components/support/SupportModal'

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

const labelClass = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]'
const inputBase =
  'h-12 w-full rounded-lg border border-[#E2DDD4] bg-white px-4 text-sm text-[#1A1A1A] outline-none transition-all placeholder:text-[#C0BAB1] focus:border-[#0E3B2E] focus:ring-4 focus:ring-[#0E3B2E]/[0.08] disabled:bg-[#FAFAF8]'

function PasswordStrength({ value }: { value: string }) {
  const score = !value ? 0 : value.length < 6 ? 1 : value.length < 10 || !/[A-Z]/.test(value) || !/[0-9]/.test(value) ? 2 : 3
  const colors = ['', 'bg-red-400', 'bg-amber-400', 'bg-[#0E3B2E]']
  const labels = ['', 'Weak', 'Fair', 'Strong']
  if (!value) return null
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= score ? colors[score] : 'bg-[#E2DDD4]'}`} />
        ))}
      </div>
      <span className="text-[10px] font-medium text-[#6B6B6B]">{labels[score]}</span>
    </div>
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

export default function RegisterForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showPwd, setShowPwd] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const router = useRouter()

  const { register, handleSubmit, control, setValue, formState: { errors, isSubmitting } } =
    useForm<RegisterFormData>({ resolver: zodResolver(registerSchema) })
  const businessType = useWatch({ control, name: 'businessType' }) ?? ''

  const passwordValue = useWatch({ control, name: 'password', defaultValue: '' })

  const handleGoogleSignIn = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/dashboard')}` },
    })
  }

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null)
    setSuccessMessage(null)
    const supabase = createClient()
    const normalizedBusinessType = data.businessType.toLowerCase()
    const normalizedEmail = data.email.trim().toLowerCase()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== 'undefined' ? window.location.origin : '')
    const emailRedirectTo = appUrl ? `${appUrl}/auth/callback` : undefined

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: data.password,
      options: {
        emailRedirectTo,
        data: { business_name: data.businessName, full_name: data.fullName, business_type: normalizedBusinessType, plan: 'pro' },
      },
    })

    if (signUpError || !authData.user) {
      setServerError(signUpError?.message ?? 'Failed to create account')
      return
    }

    // If there's an immediate session (email confirmation disabled),
    // set up the workspace now. Otherwise the /auth/callback route
    // handles workspace creation after the user confirms their email
    // (it reads business_name from the metadata we set above).
    if (authData.session) {
      const workspaceRes = await fetch('/api/auth/setup-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: authData.user.id, businessName: data.businessName, businessType: normalizedBusinessType }),
      })

      if (!workspaceRes.ok) {
        const err = await workspaceRes.json().catch(() => ({}))
        setServerError((err as { error?: string }).error ?? 'Failed to create workspace')
        return
      }

      router.push('/dashboard')
    } else {
      setSuccessMessage('Check your email to confirm your account.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}
      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      {/* Business name + Full name — side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="r-biz" className={labelClass}>Business name</label>
          <div className="relative">
            <input
              id="r-biz"
              data-testid="signup-business-input"
              {...register('businessName')}
              type="text"
              autoComplete="organization"
              placeholder="Boulangerie Margaux"
              className={`${inputBase} pr-10`}
            />
            <Building2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C0BAB1]" />
          </div>
          {errors.businessName && <p className="mt-1 text-[11px] text-amber-600">{errors.businessName.message}</p>}
        </div>

        <div>
          <label htmlFor="r-name" className={labelClass}>Your name</label>
          <div className="relative">
            <input
              id="r-name"
              data-testid="signup-name-input"
              {...register('fullName')}
              type="text"
              autoComplete="name"
              placeholder="Léa Dubois"
              className={`${inputBase} pr-10`}
            />
            <User className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C0BAB1]" />
          </div>
          {errors.fullName && <p className="mt-1 text-[11px] text-amber-600">{errors.fullName.message}</p>}
        </div>
      </div>

      {/* Work email */}
      <div>
        <label htmlFor="r-email" className={labelClass}>Work email</label>
        <div className="relative">
          <input
            id="r-email"
            data-testid="signup-email-input"
            {...register('email')}
            type="email"
            autoComplete="email"
            placeholder="you@kitchen.com"
            className={`${inputBase} pr-11`}
          />
          <Mail className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C0BAB1]" />
        </div>
        {errors.email && <p className="mt-1.5 text-xs text-amber-600">{errors.email.message}</p>}
      </div>

      {/* Password + strength */}
      <div>
        <label htmlFor="r-pwd" className={labelClass}>Password</label>
        <div className="relative">
          <input
            id="r-pwd"
            data-testid="signup-password-input"
            {...register('password')}
            type={showPwd ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            className={`${inputBase} pr-11`}
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
        <PasswordStrength value={passwordValue ?? ''} />
        {errors.password && <p className="mt-1.5 text-xs text-amber-600">{errors.password.message}</p>}
      </div>

      {/* Business type */}
      <div>
        <label htmlFor="r-type" className={labelClass}>Business type</label>
        <CustomSelect
          value={businessType}
          onChange={(v) => setValue('businessType', v as RegisterFormData['businessType'], { shouldValidate: true })}
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
        {errors.businessType && <p className="mt-1.5 text-xs text-amber-600">{errors.businessType.message}</p>}
      </div>

      {/* Submit */}
      <div className="pt-0.5">
        <button
          type="submit"
          data-testid="signup-submit-button"
          disabled={isSubmitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold tracking-wide text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: '#0E3B2E' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#164d3c' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#0E3B2E' }}
        >
          {isSubmitting
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating your kitchen…</>
            : 'Start free trial →'}
        </button>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-[#B8B3AA]">
          <ShieldCheck className="h-3 w-3" />
          Secured · No credit card required
        </p>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[#E8E4DF]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C0BAB1]">or</span>
        <div className="h-px flex-1 bg-[#E8E4DF]" />
      </div>

      {/* Google */}
      <button
        type="button"
        data-testid="signup-google-button"
        onClick={handleGoogleSignIn}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-[#E2DDD4] bg-white text-sm font-medium text-[#3D3D3D] transition hover:bg-[#FAFAF8] hover:border-[#C8C4BC]"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <p className="text-center text-[11px] text-[#B8B3AA]">
        By starting, you agree to our Terms &amp; Privacy Policy. GDPR-compliant &amp; EU-hosted.
      </p>

      <p className="text-center text-sm text-[#6B6B6B]">
        Already have an account?{' '}
        <Link href="/login" className="font-bold text-[#0E3B2E] transition hover:text-[#164d3c]" data-testid="signup-login-link">
          Sign in
        </Link>
      </p>

      <p className="text-center text-sm text-[#6B6B6B]">
        Need help?{' '}
        <button
          type="button"
          onClick={() => setSupportOpen(true)}
          className="font-bold text-[#0E3B2E] transition hover:text-[#164d3c]"
        >
          Contact support
        </button>
      </p>

      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} mode="public" source="support" />

    </form>
  )
}
