'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  FileText, BarChart2, ShieldCheck, Camera, Bell, Printer,
  Package, DollarSign, ArrowRight, Globe,
} from 'lucide-react'
import LiveCostingCard from './LiveCostingCard'

const FEATURES = {
  login: [
    { Icon: FileText,    text: 'AI invoice imports' },
    { Icon: BarChart2,   text: 'Accurate food cost calculations' },
    { Icon: ShieldCheck, text: 'EU allergen & labeling compliance' },
  ],
  signup: [
    { Icon: ShieldCheck, text: 'See your true food cost on every dish — instantly' },
    { Icon: Camera,      text: 'Snap supplier invoices, prices update automatically' },
    { Icon: Printer,     text: 'Print EU-compliant allergen labels (Reg. 1169/2011)' },
  ],
  recovery: [
    { Icon: ShieldCheck, text: 'Secure email-based recovery' },
    { Icon: ShieldCheck, text: 'Your workspace stays protected' },
  ],
}

const COPY = {
  login: {
    eyebrow: 'FOOD COSTING SOFTWARE',
    headlineMain: 'Know the true cost of',
    headlineAccent: 'every plate.',
    subtitle: 'ZRecipe turns invoices and ingredients into instant food-cost intelligence for bakeries, restaurants, and food businesses.',
  },
  signup: {
    eyebrow: '14-DAY FREE TRIAL · NO CARD REQUIRED',
    headlineMain: 'Start costing recipes in the next',
    headlineAccent: '90 seconds.',
    subtitle: "Full Pro access from day one. Cancel anytime. We'll remind you 3 days before the trial ends — no surprise charges.",
  },
  recovery: {
    eyebrow: 'ACCOUNT RECOVERY',
    headlineMain: 'Reset your',
    headlineAccent: 'password.',
    subtitle: "We'll send a secure link to your inbox so you can get back into your workspace safely.",
  },
}

const WORKFLOW = [
  { Icon: Package,    label: 'Ingredients', sub: 'Add & manage' },
  { Icon: DollarSign, label: 'Cost',        sub: 'Real-time pricing' },
  { Icon: BarChart2,  label: 'Margin',      sub: 'Track profitability' },
  { Icon: FileText,   label: 'PDF',         sub: 'Export & share' },
]

const TRUST = [
  { Icon: ShieldCheck, text: 'GDPR-compliant' },
  { Icon: Globe,       text: 'EU-hosted' },
  { Icon: DollarSign,  text: '€25/month after trial' },
  { Icon: Package,     text: 'No credit card' },
]

interface AuthSplitShellProps {
  variant?: 'login' | 'signup' | 'recovery'
  formBadge: string
  formTitle: string
  formSubtitle?: string
  formId?: string
  children: ReactNode
}

export default function AuthSplitShell({
  variant = 'login',
  formBadge,
  formTitle,
  formSubtitle,
  formId = 'auth-form',
  children,
}: AuthSplitShellProps) {
  const copy = COPY[variant]
  const features = FEATURES[variant]

  return (
    <div className="flex h-screen flex-col overflow-hidden lg:grid lg:grid-cols-[58%_42%]">

      {/* ══ LEFT ══════════════════════════════════════════════════════════════ */}
      <aside
        className="relative flex h-[220px] flex-shrink-0 flex-col overflow-hidden bg-[#0a1a14] bg-cover bg-center bg-no-repeat lg:h-auto"
        style={{ backgroundImage: "url('/images/fundo2.png')" }}
      >
        {/* Dark-left → transparent-right overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, rgba(10,26,20,0.92) 0%, rgba(10,26,20,0.78) 40%, rgba(10,26,20,0.32) 70%, rgba(10,26,20,0.12) 100%)',
          }}
        />
        {/* Stronger overlay on mobile */}
        <div
          className="absolute inset-0 lg:hidden"
          style={{ background: 'rgba(10,26,20,0.55)' }}
        />

        {/* ── CONTENT — two sections, justify-between ──────────────────────── */}
        <div
          className="relative flex h-full flex-col justify-between px-8 pb-5 pt-8 lg:px-10 lg:pt-12"
          style={{ zIndex: 10 }}
        >

          {/* ── TOP SECTION ─────────────────────────────────────────────────── */}
          <div>
            {/* Brand block — flex column ensures logo + eyebrow share exact left edge */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingLeft: 0 }}>
              <img
                src="/images/logo4.png"
                alt="ZRecipe"
                style={{ height: '64px', width: 'auto', objectFit: 'contain' }}
              />
              <span
                className="hidden lg:block"
                style={{
                  marginTop: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.13em',
                  color: '#5DCAA5',
                }}
              >
                {copy.eyebrow}
              </span>
            </div>

            {/* Mobile: compact headline (eyebrow already rendered above) */}
            <div className="mt-2 lg:hidden">
              <h1
                className="font-display font-bold leading-tight text-white"
                style={{ fontSize: '1.5rem', maxWidth: 300 }}
              >
                {copy.headlineMain}{' '}
                {copy.headlineAccent && <span style={{ color: '#5DCAA5' }}>{copy.headlineAccent}</span>}
              </h1>
            </div>

            {/* Desktop: headline + rest of content */}
            <div className="hidden lg:block">
              {/* (eyebrow is in brand block above) */}

              <h1
                className="font-display font-bold leading-[1.1] text-white"
                style={{ fontSize: 'clamp(2rem, 2.85vw, 2.625rem)', maxWidth: '460px', marginTop: '28px' }}
              >
                {copy.headlineMain}{' '}
                {copy.headlineAccent && <span style={{ color: '#5DCAA5' }}>{copy.headlineAccent}</span>}
              </h1>

              <p
                className="leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.86rem', maxWidth: '460px', marginTop: '14px' }}
              >
                {copy.subtitle}
              </p>

              <ul className="flex flex-col" style={{ maxWidth: '460px', marginTop: '20px', gap: '10px' }}>
                {features.map(({ Icon, text }, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                    style={{
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.11)',
                      fontSize: '12.5px',
                      color: 'white',
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: '#5DCAA5' }} />
                    {text}
                  </li>
                ))}
              </ul>

              {variant !== 'recovery' && (
                <div style={{ maxWidth: '460px', marginTop: '20px' }}>
                  <LiveCostingCard />
                </div>
              )}

              {variant !== 'recovery' && (
                <div style={{ marginTop: '24px' }}>
                  <Link
                    href={variant === 'login' ? '/register' : `#${formId}`}
                    className="inline-flex items-center gap-2 font-semibold text-white transition-opacity hover:opacity-85"
                    style={{ background: '#1D9E75', borderRadius: '10px', fontSize: '16px', padding: '14px 32px' }}
                  >
                    {variant === 'login' ? 'Start free trial →' : 'Create your kitchen →'}
                  </Link>
                  <p className="mt-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    14 days free · No credit card · Cancel anytime
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── BOTTOM SECTION (desktop only) — pushed to bottom by justify-between ── */}
          <div className="hidden lg:block">

            {/* Workflow strip — full width, evenly spread */}
            <div className="flex w-full items-start justify-between">
              {WORKFLOW.map((step, i) => {
                const Icon = step.Icon
                return (
                  <div key={step.label} className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-full"
                        style={{ background: 'rgba(93,202,165,0.14)' }}
                      >
                        <Icon className="h-5 w-5" style={{ color: '#5DCAA5' }} />
                      </div>
                      <span className="text-[13px] font-medium text-white">{step.label}</span>
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>{step.sub}</span>
                    </div>
                    {i < WORKFLOW.length - 1 && (
                      <ArrowRight className="mt-2 h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.22)' }} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Trust badges — full width, centered with gap */}
            <div className="mt-4 flex w-full items-center justify-between">
              {TRUST.map(({ Icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-1.5"
                  style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {text}
                </div>
              ))}
            </div>

            {/* Legal footer — centered, stacked lines */}
            <div className="mt-3 text-center" style={{ fontSize: '11px', lineHeight: 1.8 }}>
              <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                <Link href="/privacy" className="transition-colors hover:text-white">Privacy Policy</Link>
                <span className="mx-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
                <Link href="/terms" className="transition-colors hover:text-white">Terms of Service</Link>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.4)' }}>© 2026 Ziffera. All rights reserved.</p>
              <p style={{ color: 'rgba(255,255,255,0.4)' }}>
                Developed by{' '}
                <a
                  href="https://ziffera.ie"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                  style={{ color: 'rgba(255,255,255,0.55)' }}
                >
                  Ziffera.ie
                </a>
              </p>
            </div>

          </div>
        </div>
      </aside>

      {/* ══ RIGHT — form panel ════════════════════════════════════════════════ */}
      <main
        className="relative flex flex-1 items-start justify-center overflow-y-auto px-6 py-8 lg:items-center lg:px-10 lg:py-10"
        style={{ background: '#f0f5f2' }}
      >
        {/* Left-edge gradient — blends wallpaper boundary into panel, no wallpaper content hidden */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 top-0 hidden lg:block"
          style={{
            width: '80px',
            background: 'linear-gradient(to right, rgba(10,26,20,0.4) 0%, rgba(240,245,242,0.5) 40%, rgba(240,245,242,1) 100%)',
            zIndex: 0,
          }}
        />
        <div
          id={formId}
          className="w-full max-w-[400px] scroll-mt-4 rounded-2xl bg-white p-7 shadow-[0_8px_32px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] lg:p-9"
        >
          <div className="mb-3 flex justify-center">
            <img
              src="/images/favicon2.png"
              alt="ZRecipe"
              style={{ width: '64px', height: '64px', objectFit: 'contain', background: 'transparent', display: 'block' }}
            />
          </div>

          <h2 className="text-center font-display text-[1.65rem] font-bold leading-tight tracking-tight text-[#1A1A1A]">
            {formTitle}
          </h2>

          {formSubtitle && (
            <p className="mt-1.5 text-center text-[0.84rem] text-[#6B6B6B]">
              {formSubtitle}
            </p>
          )}

          <div className="mt-6">{children}</div>
        </div>
      </main>

    </div>
  )
}
