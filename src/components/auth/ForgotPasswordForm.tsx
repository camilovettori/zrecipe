'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      })

      if (requestError) {
        setError(requestError.message)
        return
      }

      setMessage('If an account exists for that email, we sent a reset link.')
    } catch {
      setError('Unable to send reset link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          className={inputClass}
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Sending…' : 'Send Reset Link'}
      </button>

      <p className="text-center text-sm text-slate-600">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-emerald-700 hover:text-emerald-600">
          Back to sign in
        </Link>
      </p>
    </form>
  )
}
