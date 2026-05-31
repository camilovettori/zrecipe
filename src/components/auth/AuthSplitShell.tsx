'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Calculator, Check, FileText, Percent, ReceiptText, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const FloatingFoodShowcase = dynamic(() => import('./FloatingFoodShowcase'), {
  ssr: false,
  loading: () => (
    <div className="relative mt-5 hidden h-[300px] max-w-[540px] lg:block">
      <div className="absolute inset-x-0 top-8 h-56 rounded-full bg-emerald-400/10 blur-3xl" />
    </div>
  ),
})

type FeatureStyle = 'subtle' | 'check'

interface AuthSplitShellProps {
  badge?: string
  leftTitle?: string
  leftSubtitle?: string
  features?: string[]
  footerText?: string
  rightTitle?: string
  rightSubtitle?: string
  featureStyle?: FeatureStyle
  modelPath?: string
  ctaHref?: string
  ctaLabel?: string
  pricingNote?: string
  formId?: string
  children: ReactNode
}

function FeatureIcon({ style }: { style: FeatureStyle }) {
  return style === 'check' ? (
    <Check className="h-4 w-4 flex-none text-emerald-300" />
  ) : (
    <Sparkles className="h-4 w-4 flex-none text-emerald-300" />
  )
}

const workflow = [
  { label: 'Ingredients', icon: ReceiptText },
  { label: 'Cost', icon: Calculator },
  { label: 'Margin', icon: Percent },
  { label: 'PDF', icon: FileText },
]

export default function AuthSplitShell({
  badge = 'ZRECIPE',
  leftTitle = 'Recipe costing made simple',
  leftSubtitle = 'Stop guessing your food costs. Track every ingredient, import invoices with AI, and stay EU-compliant - all in one place.',
  features = [
    'AI-powered invoice imports',
    'Instant food cost calculations',
    'EU allergen compliance',
  ],
  footerText = 'Built for bakeries, restaurants, and food businesses across Ireland and the EU.',
  rightTitle = 'Welcome back',
  rightSubtitle = 'Sign in to continue costing recipes, managing suppliers, and exporting kitchen-ready PDFs.',
  featureStyle = 'subtle',
  modelPath = '/models/croissant.glb',
  ctaHref = '/signup',
  ctaLabel = 'Start free trial',
  pricingNote = 'No credit card required',
  formId,
  children,
}: AuthSplitShellProps) {
  const isCheckList = featureStyle === 'check'
  const [showShowcase, setShowShowcase] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const syncShowcase = () => setShowShowcase(mediaQuery.matches)

    syncShowcase()
    mediaQuery.addEventListener('change', syncShowcase)

    return () => mediaQuery.removeEventListener('change', syncShowcase)
  }, [])

  return (
    <div className="min-h-screen overflow-hidden bg-[#08111c] text-white">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(3,7,18,0.98),rgba(8,15,27,0.97)_48%,rgba(5,18,18,0.98))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_30%,rgba(16,185,129,0.18),transparent_32%),radial-gradient(circle_at_80%_80%,rgba(20,184,166,0.10),transparent_28%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.022)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.022)_1px,transparent_1px)] bg-[size:56px_56px] opacity-35" />

      <div className="relative mx-auto grid min-h-screen max-w-[1500px] lg:grid-cols-2">
        <section className="relative flex min-h-[46vh] flex-col px-6 py-7 sm:px-8 lg:min-h-screen lg:px-12 xl:px-16">
          <div className="mx-auto flex w-full max-w-[620px] flex-1 flex-col justify-center">
            <div className="mb-6">
              <div className="inline-flex items-center rounded-lg border border-white/8 bg-white/[0.045] px-3 py-2 shadow-[0_16px_60px_rgba(2,6,23,0.22)] backdrop-blur-xl">
                <Image
                  src="/images/logo.png"
                  alt="ZRecipe"
                  width={165}
                  height={48}
                  priority
                  sizes="(min-width: 1280px) 165px, 145px"
                  className="h-auto w-[145px] max-w-full xl:w-[165px]"
                />
              </div>
            </div>

            <div className="mb-5 text-[11px] font-semibold uppercase tracking-[0.26em] text-emerald-300">
              {badge}
            </div>

            <h1 className="max-w-[560px] text-balance text-4xl font-semibold leading-[1.04] text-white sm:text-5xl xl:text-[54px]">
              {leftTitle}
            </h1>
            <p className="mt-5 max-w-[560px] text-pretty text-base leading-7 text-slate-300 sm:text-lg">
              {leftSubtitle}
            </p>

            <div className="mt-6 flex max-w-[590px] flex-wrap gap-2.5">
              {features.map((feature) => (
                <span
                  key={feature}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium backdrop-blur-xl',
                    isCheckList
                      ? 'border-emerald-400/18 bg-emerald-400/8 text-emerald-50'
                      : 'border-white/10 bg-white/6 text-slate-100'
                  )}
                >
                  <FeatureIcon style={featureStyle} />
                  <span>{feature}</span>
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href={ctaHref}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_42px_rgba(16,185,129,0.28)] transition duration-200 hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                {ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>

              <div className="text-sm leading-6 text-slate-300">
                <div className="font-semibold text-white">14 days free</div>
                <div>
                  Then &euro;25/month <span className="text-slate-500">/</span> {pricingNote}
                </div>
              </div>
            </div>

            <div className="mt-6 hidden w-fit items-center rounded-xl border border-white/8 bg-white/[0.045] px-3 py-2 text-xs text-slate-300 shadow-[0_16px_60px_rgba(2,6,23,0.14)] backdrop-blur-xl lg:flex">
              {workflow.map((item, index) => {
                const Icon = item.icon

                return (
                  <div key={item.label} className="flex items-center">
                    <span className="inline-flex items-center gap-2 px-2.5">
                      <Icon className="h-3.5 w-3.5 text-emerald-300" />
                      <span>{item.label}</span>
                    </span>
                    {index < workflow.length - 1 && <span className="text-slate-600">/</span>}
                  </div>
                )
              })}
            </div>

            {showShowcase && <FloatingFoodShowcase modelPath={modelPath} />}

            <p className="mt-3 max-w-[560px] text-sm leading-6 text-slate-400">{footerText}</p>
          </div>
        </section>

        <aside className="relative flex items-center justify-center px-4 pb-8 pt-2 sm:px-6 lg:min-h-screen lg:px-10 lg:py-8">
          <div className="relative w-full max-w-[520px]">
            <div className="absolute inset-0 -z-10 rounded-[28px] bg-emerald-400/10 blur-2xl" />

            <div className="rounded-2xl border border-white/10 bg-white p-6 text-slate-900 shadow-[0_30px_110px_rgba(2,6,23,0.36)] sm:p-8">
              <div id={formId} className="scroll-mt-24">
                <div className="mb-6">
                  <div className="inline-flex items-center rounded-full border border-emerald-500/15 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                    {rightTitle === 'Create your account' ? 'Start your trial' : 'Sign in'}
                  </div>
                  <h2 className="mt-4 text-3xl font-semibold text-slate-950">
                    {rightTitle}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{rightSubtitle}</p>
                </div>
                {children}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
