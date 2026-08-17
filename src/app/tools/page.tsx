import type { Metadata } from 'next'
import Link from 'next/link'
import { Apple, ArrowRight, Calculator, CheckCircle2, Scale, Sparkles } from 'lucide-react'
import LandingNav from '@/components/landing/LandingNav'
import FreeToolsFooter from '@/components/landing/FreeToolsFooter'
import { PUBLIC_TOOLS } from '@/lib/public-tools'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.zrecipe.ie'
const pageUrl = `${siteUrl}/tools`

export const metadata: Metadata = {
  title: 'Free Food Business Tools for Restaurants & Bakeries',
  description: 'Free calculators and reference tools for restaurants, bakeries and food businesses. Calculate Irish VAT, food yield, trim loss, AP, EP and true ingredient cost.',
  keywords: [
    'free food business tools',
    'restaurant calculators',
    'bakery calculators',
    'food cost tools',
    'food yield calculator',
    'food waste calculator',
    'Irish VAT calculator',
    'recipe costing tools',
  ],
  alternates: { canonical: pageUrl },
  openGraph: {
    title: 'Free Food Business Tools | ZRecipe',
    description: 'Practical, free calculators for VAT, ingredient yield, waste and true food cost.',
    url: pageUrl,
    siteName: 'ZRecipe',
    locale: 'en_IE',
    type: 'website',
  },
}

const icons = { vat: Calculator, 'yield-calculator': Scale, 'yield-reference': Apple }
const details = {
  vat: ['Add and remove Irish VAT', 'Current rates and custom percentages', 'Net, VAT and gross totals'],
  'yield-calculator': ['Plan AP quantity from usable EP', 'Measure actual yield and waste', 'Calculate true cost per usable kg'],
  'yield-reference': ['Searchable ingredient yield chart', 'Preparation and trim notes', 'Send any value to the calculator'],
}

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CollectionPage',
      name: 'ZRecipe Free Food Business Tools',
      url: pageUrl,
      description: 'Free calculators and reference tools for food businesses.',
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: PUBLIC_TOOLS.map((tool, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: tool.name,
          url: `${siteUrl}${tool.href}`,
        })),
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Free Tools', item: pageUrl },
      ],
    },
  ],
}

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <LandingNav />
      <main>
        <section className="overflow-hidden bg-brand-paper">
          <div className="mx-auto max-w-7xl px-5 pb-20 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
            <nav aria-label="Breadcrumb" className="mb-8 text-sm text-slate-500">
              <Link href="/" className="hover:text-emerald-700">Home</Link><span className="mx-2" aria-hidden="true">/</span><span className="text-slate-700">Free Tools</span>
            </nav>
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700"><Sparkles className="h-4 w-4" /> Free — no sign-up</span>
              <h1 className="mt-6 text-balance font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">Free Food Business Tools</h1>
              <p className="mx-auto mt-5 max-w-2xl text-balance text-lg leading-8 text-slate-600">Fast, practical calculators for chefs, bakeries, restaurants and food businesses. Use them in your browser without creating an account.</p>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {PUBLIC_TOOLS.map((tool) => {
                const Icon = icons[tool.id]
                return (
                  <article key={tool.id} className="group flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl sm:p-7">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><Icon className="h-6 w-6" /></span>
                    <h2 className="mt-5 text-xl font-bold text-slate-900">{tool.name}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{tool.description}</p>
                    <ul className="mt-5 space-y-2">
                      {details[tool.id].map((detail) => <li key={detail} className="flex items-start gap-2 text-sm text-slate-500"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{detail}</li>)}
                    </ul>
                    <Link href={tool.href} className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">Open free tool <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid items-center gap-10 rounded-3xl bg-brand-green px-7 py-10 text-white sm:px-10 lg:grid-cols-[1fr_0.8fr] lg:px-14 lg:py-14">
            <div><p className="text-sm font-semibold uppercase tracking-widest text-emerald-200">When a calculator is not enough</p><h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Put every recipe cost on autopilot</h2><p className="mt-4 max-w-2xl leading-7 text-emerald-50/80">ZRecipe applies ingredient prices, yield factors, labour, overhead, VAT and margin to your full recipe library—then keeps costs current as supplier prices change.</p></div>
            <div className="flex flex-col gap-3 lg:items-end"><Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-400">Start 14-day Pro trial <ArrowRight className="h-4 w-4" /></Link><Link href="/#features" className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-emerald-50 transition hover:bg-white/10">Explore ZRecipe features</Link></div>
          </div>
        </section>
      </main>
      <FreeToolsFooter />
    </div>
  )
}
