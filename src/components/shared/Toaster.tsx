'use client'

import { useEffect, useState } from 'react'
import * as Toast from '@radix-ui/react-toast'
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'error' | 'info'

type ToastItem = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  duration: number
}

type ToastOptions = {
  description?: string
  variant?: ToastVariant
  /** Milliseconds before auto-dismiss. Defaults to 4000 — pass a longer
   *  value for messages the user needs more time to read (e.g. an
   *  explanation of why an action was blocked). */
  duration?: number
}

const DEFAULT_TOAST_DURATION = 4000

const listeners = new Set<(items: ToastItem[]) => void>()
let toasts: ToastItem[] = []

function emit(next: ToastItem[]) {
  toasts = next
  listeners.forEach((listener) => listener(toasts))
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function pushToast(title: string, options: ToastOptions = {}) {
  const item: ToastItem = {
    id: makeId(),
    title,
    description: options.description,
    variant: options.variant ?? 'info',
    duration: options.duration ?? DEFAULT_TOAST_DURATION,
  }

  emit([...toasts, item])
  return item.id
}

export const toast = Object.assign(
  (title: string, options?: ToastOptions) => pushToast(title, options),
  {
    success: (title: string, options?: Omit<ToastOptions, 'variant'>) =>
      pushToast(title, { ...options, variant: 'success' }),
    error: (title: string, options?: Omit<ToastOptions, 'variant'>) =>
      pushToast(title, { ...options, variant: 'error' }),
    info: (title: string, options?: Omit<ToastOptions, 'variant'>) =>
      pushToast(title, { ...options, variant: 'info' }),
    message: (title: string, options?: Omit<ToastOptions, 'variant'>) =>
      pushToast(title, { ...options, variant: 'info' }),
    dismiss: (id: string) => emit(toasts.filter((item) => item.id !== id)),
  }
)

function variantStyles(variant: ToastVariant) {
  switch (variant) {
    case 'success':
      return {
        ring: 'ring-emerald-200',
        iconBg: 'bg-emerald-50 text-emerald-600',
        accent: 'bg-emerald-500',
      }
    case 'error':
      return {
        ring: 'ring-red-200',
        iconBg: 'bg-red-50 text-red-600',
        accent: 'bg-red-500',
      }
    case 'info':
    default:
      return {
        ring: 'ring-blue-200',
        iconBg: 'bg-blue-50 text-blue-600',
        accent: 'bg-blue-500',
      }
  }
}

function ToastStack() {
  const [items, setItems] = useState<ToastItem[]>(toasts)

  useEffect(() => {
    const listener = (next: ToastItem[]) => setItems(next)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return (
    <>
      {items.map((item) => {
        const styles = variantStyles(item.variant)
        const Icon =
          item.variant === 'success' ? CheckCircle2 : item.variant === 'error' ? AlertCircle : Info

        return (
          <Toast.Root
            key={item.id}
            defaultOpen
            duration={item.duration}
            onOpenChange={(open) => {
              if (!open) {
                toast.dismiss(item.id)
              }
            }}
            className={cn(
              'group pointer-events-auto flex w-full items-start gap-3 rounded-2xl border bg-white p-4 shadow-xl ring-1',
              styles.ring
            )}
          >
            <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', styles.iconBg)}>
              <Icon className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <Toast.Title className="text-sm font-semibold text-slate-900">
                {item.title}
              </Toast.Title>
              {item.description ? (
                <Toast.Description className="mt-1 text-sm text-slate-500">
                  {item.description}
                </Toast.Description>
              ) : null}
            </div>

            <Toast.Close
              className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close toast"
            >
              <X className="h-4 w-4" />
            </Toast.Close>
          </Toast.Root>
        )
      })}
    </>
  )
}

export function Toaster() {
  return (
    <Toast.Provider swipeDirection="right">
      <ToastStack />
      <Toast.Viewport className="fixed bottom-4 right-4 z-[100] flex w-[min(92vw,24rem)] flex-col gap-3 outline-none" />
    </Toast.Provider>
  )
}
