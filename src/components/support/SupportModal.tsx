'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Loader2, CheckCircle2, LifeBuoy, MailCheck } from 'lucide-react'

const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-600'
const inputClass =
  'w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'

const publicSchema = z.object({
  name: z.string().min(2, 'Please enter your name'),
  email: z.string().email('Please enter a valid email'),
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(140),
  message: z.string().min(10, 'Please add a few more details').max(5000),
  website: z.string().optional(),
})
type PublicFormData = z.infer<typeof publicSchema>

const internalSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(140),
  message: z.string().min(10, 'Please add a few more details').max(5000),
})
type InternalFormData = z.infer<typeof internalSchema>

interface SupportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'public' | 'internal'
  onTicketCreated?: (ticket: { ticketId: string; ticketNumber?: string }) => void
  /** Only meaningful when mode='public' — which entry point this is, so the
   *  server can route the notification to the right channel. */
  source?: 'contact' | 'support'
}

export default function SupportModal({ open, onOpenChange, mode, onTicketCreated, source = 'support' }: SupportModalProps) {
  const [sent, setSent] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (!next) setSent(false)
    onOpenChange(next)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Close
            className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>

          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50">
              <LifeBuoy className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900">
                {mode === 'public' && source === 'contact' ? 'Get in touch' : 'Contact support'}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-slate-500">
                {mode === 'public'
                  ? source === 'contact'
                    ? "Send us a message and we'll reply as soon as we can."
                    : "We'll reply to your email as soon as possible."
                  : "You'll get a reply inside the app and by email."}
              </Dialog.Description>
            </div>
          </div>

          {sent ? (
            mode === 'public' && source === 'contact' ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <MailCheck className="h-9 w-9 text-emerald-500" />
                <p className="text-sm font-medium text-slate-800">Thanks for reaching out!</p>
                <p className="text-sm text-slate-500">We&apos;ll get back to you as soon as possible.</p>
                <p className="text-xs text-slate-400">
                  Thanks for reaching out — check your inbox for a confirmation.
                </p>
              </div>
            ) : mode === 'public' ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <LifeBuoy className="h-9 w-9 text-emerald-500" />
                <p className="text-sm font-medium text-slate-800">Contact support</p>
                <p className="text-sm text-slate-500">We&apos;ll reply to your email as soon as possible.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <CheckCircle2 className="h-9 w-9 text-emerald-500" />
                <p className="text-sm font-medium text-slate-800">Message sent</p>
                <p className="text-sm text-slate-500">We&apos;ll notify you here and by email when we reply.</p>
              </div>
            )
          ) : mode === 'public' ? (
            <PublicSupportForm source={source} onSent={() => setSent(true)} />
          ) : (
            <InternalSupportForm
              onSent={(ticket) => {
                onTicketCreated?.(ticket)
                if (!onTicketCreated) setSent(true)
              }}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PublicSupportForm({
  source,
  onSent,
}: {
  source: 'contact' | 'support'
  onSent: () => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<PublicFormData>({ resolver: zodResolver(publicSchema) })

  const onSubmit = async (data: PublicFormData) => {
    setServerError(null)
    try {
      const res = await fetch('/api/support/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, source }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setServerError((body as { error?: string }).error ?? 'Something went wrong. Please try again.')
        return
      }
      onSent()
    } catch {
      setServerError('Something went wrong. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {serverError}
        </div>
      )}

      {/* Honeypot — hidden from real users, bots often fill every field */}
      <div style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true">
        <label htmlFor="support-website">Website</label>
        <input id="support-website" type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="support-name" className={labelClass}>Name</label>
          <input id="support-name" {...register('name')} type="text" autoComplete="name" className={inputClass} />
          {errors.name && <p className="mt-1 text-xs text-amber-600">{errors.name.message}</p>}
        </div>
        <div>
          <label htmlFor="support-email" className={labelClass}>Email</label>
          <input id="support-email" {...register('email')} type="email" autoComplete="email" className={inputClass} />
          {errors.email && <p className="mt-1 text-xs text-amber-600">{errors.email.message}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="support-subject" className={labelClass}>Subject</label>
        <input id="support-subject" {...register('subject')} type="text" className={inputClass} />
        {errors.subject && <p className="mt-1 text-xs text-amber-600">{errors.subject.message}</p>}
      </div>

      <div>
        <label htmlFor="support-message" className={labelClass}>Message</label>
        <textarea id="support-message" {...register('message')} rows={4} className={inputClass} />
        {errors.message && <p className="mt-1 text-xs text-amber-600">{errors.message.message}</p>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : 'Send message'}
      </button>
    </form>
  )
}

function InternalSupportForm({
  onSent,
}: {
  onSent: (ticket: { ticketId: string; ticketNumber?: string }) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<InternalFormData>({ resolver: zodResolver(internalSchema) })

  const onSubmit = async (data: InternalFormData) => {
    setServerError(null)
    try {
      const res = await fetch('/api/support/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setServerError((body as { error?: string }).error ?? 'Something went wrong. Please try again.')
        return
      }
      onSent(body as { ticketId: string; ticketNumber?: string })
    } catch {
      setServerError('Something went wrong. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <div>
        <label htmlFor="support-i-subject" className={labelClass}>Subject</label>
        <input id="support-i-subject" {...register('subject')} type="text" className={inputClass} />
        {errors.subject && <p className="mt-1 text-xs text-amber-600">{errors.subject.message}</p>}
      </div>

      <div>
        <label htmlFor="support-i-message" className={labelClass}>Message</label>
        <textarea id="support-i-message" {...register('message')} rows={4} className={inputClass} />
        {errors.message && <p className="mt-1 text-xs text-amber-600">{errors.message.message}</p>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : 'Send message'}
      </button>
    </form>
  )
}
