import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import {
  Sparkles, ArrowRight, Check, Clock, AlertTriangle, TrendingDown,
} from 'lucide-react'
import LandingNav from '@/components/landing/LandingNav'
import LandingFAQ, { type FAQItem } from '@/components/landing/LandingFAQ'
import AboutSection from '@/components/landing/AboutSection'
import FeaturesSection from '@/components/landing/FeaturesSection'
import HeroGlowLayer from '@/components/landing/HeroGlowLayer'
import Reveal from '@/components/landing/Reveal'
import PrimaryCTALink from '@/components/landing/PrimaryCTALink'
import HeroDemoVideo from '@/components/landing/HeroDemoVideo'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

const STATS = [
  { label: '14-day free trial' },
  { label: '€25/month, no surprises', emphasize: true },
  { label: 'EU Reg. 1169/2011 compliant' },
  { label: 'Built by 20+ years in hospitality' },
]

const PROBLEMS = [
  {
    Icon: Clock,
    title: 'Your spreadsheet goes stale the moment prices change',
    description:
      "Supplier prices move constantly, but spreadsheets don't. By the time you notice, you've been under-pricing dishes for weeks.",
  },
  {
    Icon: AlertTriangle,
    title: 'Manual allergen labels are one typo away from a fine',
    description:
      'Copying allergen data by hand across recipes is slow and error-prone — and EU Regulation 1169/2011 gives you no room for mistakes.',
  },
  {
    Icon: TrendingDown,
    title: "You find out a recipe is unprofitable after it's already on the menu",
    description:
      'Without real-time costing, margin problems surface in your accounts months later — not in time to fix the price or the recipe.',
  },
]

const STEPS = [
  {
    number: '01',
    title: 'Import your invoices',
    description: 'Snap a photo or upload a PDF. AI extracts suppliers, prices, and packaging in seconds.',
  },
  {
    number: '02',
    title: 'Build your recipes',
    description: 'Add ingredients and quantities — ZRecipe calculates true cost and margin instantly.',
  },
  {
    number: '03',
    title: 'Price with confidence',
    description: 'Print allergen-compliant labels and kitchen cards, and know your margin on every dish.',
  },
]

const FREE_FEATURES = ['Up to 5 recipes', 'Up to 20 ingredients', 'Basic recipe costing', 'Supplier tracking']

const PRO_FEATURES = [
  'Unlimited recipes',
  'Unlimited ingredients',
  'AI-powered invoice import',
  'Yield factor & batch costing',
  'EU allergen labels & printing',
  'PDF export — kitchen cards & reports',
  'Team members (up to 5)',
  'AI recipe ideas',
]

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'Is there a free plan?',
    answer:
      'Yes. The Free plan includes up to 5 recipes, 20 ingredients, basic recipe costing, and supplier tracking — no credit card required.',
  },
  {
    question: 'Do I need a credit card to start the trial?',
    answer:
      'No. You get full Pro access for 14 days without entering payment details. Add a card only if you decide to continue on Pro.',
  },
  {
    question: 'Which countries and currencies does ZRecipe support?',
    answer:
      'ZRecipe is built for independent bakeries, cafés, and restaurants in Ireland and the EU, with EUR pricing and EU allergen labelling built in.',
  },
  {
    question: 'How does AI invoice import work?',
    answer:
      'Upload a PDF or photo of a supplier invoice and ZRecipe automatically extracts line items, prices, and packaging, then matches them to your ingredients.',
  },
  {
    question: 'Is ZRecipe compliant with EU allergen labelling law?',
    answer:
      'Allergen data set on your ingredients rolls up automatically to every recipe that uses them, so your labels stay aligned with EU Regulation 1169/2011.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. There are no lock-in contracts — cancel your Pro subscription at any time and keep access until the end of your billing period.',
  },
]

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zrecipe.ie'

const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ZRecipe',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'Recipe costing software for independent bakeries, cafés, and restaurants in Ireland and the EU. Turn supplier invoices into accurate costs, margins, and EU-compliant allergen labels.',
  url: siteUrl,
  provider: {
    '@type': 'Organization',
    name: 'Ziffera',
    url: 'https://ziffera.ie',
  },
  offers: [
    {
      '@type': 'Offer',
      name: 'ZRecipe Free',
      price: '0',
      priceCurrency: 'EUR',
    },
    {
      '@type': 'Offer',
      name: 'ZRecipe Pro',
      price: '25',
      priceCurrency: 'EUR',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '25',
        priceCurrency: 'EUR',
        unitText: 'MONTH',
      },
    },
  ],
}

const faqPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  })),
}

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageJsonLd) }}
      />

      <div className="min-h-screen bg-white">
        <LandingNav />

        {/* ══ HERO ═══════════════════════════════════════════════════════════ */}
        <section className="relative overflow-hidden bg-gradient-to-br from-brand-paper via-white to-emerald-50/30">
          {/* Ambient animated glow — lazy-mounted after first paint, see HeroGlowLayer */}
          <HeroGlowLayer />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:py-24 xl:py-28">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-700">
                <Sparkles className="h-3.5 w-3.5" />
                Recipe costing for independent food businesses
              </span>

              <h1 className="mt-5 max-w-2xl text-balance font-display text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl xl:text-6xl">
                Know exactly what every dish costs you — before you sell&nbsp;it.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                ZRecipe turns supplier invoices into accurate recipe costs, real margins, and
                EU-compliant allergen labels — built for bakeries, cafés, and restaurants across
                Ireland and the EU.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <PrimaryCTALink
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
                >
                  Start 14-day trial
                  <ArrowRight className="h-4 w-4" />
                </PrimaryCTALink>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Log in
                </Link>
              </div>

              <p className="mt-4 text-sm text-slate-500">No credit card required · Cancel anytime</p>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-primary-200/40 via-amber-100/30 to-transparent blur-2xl" />
              <div className="rounded-2xl bg-white p-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] sm:p-3">
                <div className="mb-2.5 flex items-center gap-1.5 px-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                  <span className="ml-2 text-xs font-medium text-slate-400">ZRecipe in action</span>
                </div>
                <HeroDemoVideo />
              </div>
            </div>
          </div>
        </section>

        {/* ══ STATS / TRUST BAR ═════════════════════════════════════════════ */}
        <section className="border-y border-brand-terra/10 bg-brand-cream/30 py-5">
          <div className="mx-auto grid max-w-5xl grid-cols-2 items-center gap-x-4 gap-y-3 px-5 text-center sm:px-8 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-brand-terra/15">
            {STATS.map((stat) =>
              stat.emphasize ? (
                <div key={stat.label} className="flex min-h-9 items-center justify-center lg:px-4">
                  <span className="rounded-full border border-accent-200 bg-accent-50 px-3.5 py-1 text-xs font-semibold uppercase tracking-wide text-accent-700 sm:text-sm">
                    {stat.label}
                  </span>
                </div>
              ) : (
                <div key={stat.label} className="flex min-h-9 items-center justify-center lg:px-6">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-700 sm:text-sm">
                    {stat.label}
                  </span>
                </div>
              )
            )}
          </div>
        </section>

        {/* ══ PROBLEM ════════════════════════════════════════════════════════ */}
        <section className="bg-brand-paper">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                  Running the numbers by hand doesn&apos;t scale
                </h2>
              </div>

              <div className="mt-12 grid gap-6 sm:grid-cols-3">
                {PROBLEMS.map(({ Icon, title, description }) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50">
                      <Icon className="h-5 w-5 text-primary-600" />
                    </div>
                    <h3 className="mt-4 font-sans text-base font-semibold text-slate-900">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ FEATURES ═══════════════════════════════════════════════════════ */}
        <FeaturesSection />

        {/* ══ ABOUT / FOUNDERS ═══════════════════════════════════════════════ */}
        <AboutSection />

        {/* ══ HOW IT WORKS ═══════════════════════════════════════════════════ */}
        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">How it works</h2>
            </div>

            <div className="relative mt-12 grid gap-5 sm:grid-cols-3">
              <div className="absolute left-[16.666%] right-[16.666%] top-11 hidden border-t border-dashed border-slate-200 sm:block" />
              {STEPS.map(({ number, title, description }, index) => {
                const stepAccent = [
                  'text-primary-600 bg-primary-50 border-primary-100',
                  'text-accent-500 bg-accent-50 border-accent-100',
                  'text-brand-terra bg-brand-terra/10 border-brand-terra/15',
                ][index]

                return (
                <div key={number} className="relative rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                  <span className={`inline-flex h-20 w-20 items-center justify-center rounded-2xl border font-display text-5xl font-bold leading-none ${stepAccent}`}>
                    {number}
                  </span>
                  <h3 className="mt-3 font-sans text-lg font-semibold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
                </div>
                )
              })}
            </div>
          </Reveal>
        </section>

        {/* ══ PRICING ════════════════════════════════════════════════════════ */}
        <section id="pricing" className="scroll-mt-16 bg-brand-paper py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                  Simple, transparent pricing
                </h2>
                <p className="mt-3 text-base text-slate-600">
                  Start free. Upgrade when your kitchen is ready to grow.
                </p>
              </div>

              <div className="mx-auto mt-12 grid max-w-3xl items-stretch gap-6 sm:grid-cols-2">
                {/* Free */}
                <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-7">
                  <h3 className="font-sans text-lg font-semibold text-slate-900">Free</h3>
                  <p className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-slate-900">€0</span>
                    <span className="text-sm text-slate-400">/month</span>
                  </p>
                  <ul className="mt-6 flex flex-col gap-3">
                    {FREE_FEATURES.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/register"
                    className="mt-auto block rounded-lg border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Start for free
                  </Link>
                </div>

                {/* Pro */}
                <div className="relative flex h-full flex-col rounded-2xl border-2 border-primary-600 bg-white p-7 shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
                  <span className="absolute -top-3 left-7 rounded-full bg-accent-500 px-3 py-1 text-xs font-semibold text-white">
                    Most popular
                  </span>
                  <h3 className="font-sans text-lg font-semibold text-slate-900">Pro</h3>
                  <p className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-slate-900">€25</span>
                    <span className="text-sm text-slate-400">/month</span>
                  </p>
                  <ul className="mt-6 flex flex-col gap-3">
                    {PRO_FEATURES.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <PrimaryCTALink
                    href="/register"
                    className="mt-auto block rounded-lg bg-primary-600 px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                  >
                    Start 14-day trial
                  </PrimaryCTALink>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ FAQ ════════════════════════════════════════════════════════════ */}
        <section id="faq" className="scroll-mt-16 mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Frequently asked questions
              </h2>
            </div>

            <div className="mt-12">
              <LandingFAQ items={FAQ_ITEMS} />
            </div>
          </Reveal>
        </section>

        {/* ══ FINAL CTA ══════════════════════════════════════════════════════ */}
        <section className="bg-dark py-16 sm:py-20">
          <Reveal className="mx-auto max-w-3xl px-5 text-center sm:px-8">
            <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Stop guessing what your dishes cost.
            </h2>
            <p className="mt-4 text-base text-slate-300">
              Start your 14-day free trial today — no credit card required.
            </p>
            <PrimaryCTALink
              href="/register"
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </PrimaryCTALink>
          </Reveal>
        </section>

        {/* ══ FOOTER ═════════════════════════════════════════════════════════ */}
        <footer className="bg-dark border-t border-white/5 py-12">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
              <div>
                <Image
                  src="/images/logo4.png"
                  alt="ZRecipe"
                  width={140}
                  height={47}
                  style={{ height: '32px', width: 'auto', objectFit: 'contain' }}
                />
                <p className="mt-3 max-w-xs text-sm text-slate-400">
                  Recipe costing and allergen compliance for independent food businesses.
                </p>
              </div>

              <div className="flex gap-12">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Product</p>
                  <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-400">
                    <li><a href="#features" className="transition-colors hover:text-white">Features</a></li>
                    <li><a href="#pricing" className="transition-colors hover:text-white">Pricing</a></li>
                    <li><a href="#faq" className="transition-colors hover:text-white">FAQ</a></li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account</p>
                  <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-400">
                    <li><Link href="/login" className="transition-colors hover:text-white">Log in</Link></li>
                    <li><Link href="/register" className="transition-colors hover:text-white">Start free trial</Link></li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Legal</p>
                  <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-400">
                    <li><Link href="/privacy" className="transition-colors hover:text-white">Privacy Policy</Link></li>
                    <li><Link href="/terms" className="transition-colors hover:text-white">Terms of Service</Link></li>
                    <li><Link href="/gdpr" className="transition-colors hover:text-white">GDPR</Link></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-10 border-t border-white/5 pt-6">
              <p className="text-xs text-slate-500">
                © {new Date().getFullYear()} Ziffera. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
