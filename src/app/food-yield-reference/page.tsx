import type { Metadata } from 'next'
import Link from 'next/link'
import { Apple, ArrowRight, BookOpen, Info, Scale } from 'lucide-react'
import LandingNav from '@/components/landing/LandingNav'
import FoodYieldReference from '@/components/landing/FoodYieldReference'
import FreeToolsFooter from '@/components/landing/FreeToolsFooter'
import { YIELD_FACTORS } from '@/lib/data/yield-factors'
import { SITE_URL } from '@/lib/site-url'

const siteUrl = SITE_URL
const pageUrl = `${siteUrl}/food-yield-reference`

export const metadata: Metadata = {
  title: 'Food Yield Percentage Chart – Ingredient Yield Reference',
  description: 'Search food yield percentages for fruit, vegetables, meat, fish and pantry ingredients. Compare edible portion, AP yield, trim loss and waste, then calculate true food cost.',
  keywords: [
    'food yield percentage chart',
    'food yield reference chart',
    'ingredient yield percentages',
    'vegetable yield chart',
    'meat yield percentage',
    'fruit yield percentage',
    'edible portion yield chart',
    'AP EP food chart',
    'trim loss percentage',
    'restaurant food yield chart',
    'chef yield reference',
  ],
  alternates: { canonical: pageUrl },
  openGraph: {
    title: 'Food Yield Percentage Chart | ZRecipe',
    description: 'Search ingredient yield, waste and trim-loss percentages and send any result to the free calculator.',
    url: pageUrl,
    siteName: 'ZRecipe',
    locale: 'en_IE',
    type: 'website',
    images: [{ url: '/images/og-image.jpg', width: 1200, height: 630, alt: 'ZRecipe food yield reference chart' }],
  },
}

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ItemList',
      name: 'Food Yield Percentage Reference',
      description: 'A searchable planning reference for edible ingredient yield and preparation loss.',
      numberOfItems: YIELD_FACTORS.length,
      itemListElement: YIELD_FACTORS.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: `${item.ingredient}: ${item.yieldPercent}% yield`,
        description: item.notes,
      })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Free Tools', item: `${siteUrl}/tools` },
        { '@type': 'ListItem', position: 3, name: 'Food Yield Reference', item: pageUrl },
      ],
    },
  ],
}

export default function FoodYieldReferencePage() {
  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <LandingNav />
      <main>
        <section className="overflow-hidden bg-brand-paper">
          <div className="mx-auto max-w-7xl px-5 pb-20 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
            <nav aria-label="Breadcrumb" className="mb-8 text-sm text-slate-500"><Link href="/" className="hover:text-emerald-700">Home</Link><span className="mx-2" aria-hidden="true">/</span><Link href="/tools" className="hover:text-emerald-700">Free Tools</Link><span className="mx-2" aria-hidden="true">/</span><span className="text-slate-700">Food Yield Reference</span></nav>
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700"><Apple className="h-4 w-4" /> {YIELD_FACTORS.length} ingredient references</span>
              <h1 className="mt-6 text-balance font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">Food Yield Percentage Chart</h1>
              <p className="mx-auto mt-5 max-w-2xl text-balance text-lg leading-8 text-slate-600">Search typical edible yield, preparation loss and waste percentages for common kitchen ingredients.</p>
            </div>
            <div className="mx-auto mt-12 max-w-6xl"><FoodYieldReference /></div>
            <div className="mx-auto mt-5 flex max-w-4xl items-start gap-2 text-xs leading-5 text-slate-500"><Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><p>These are planning estimates compiled from culinary yield references, including USDA food buying guidance. Actual yield varies with quality, storage, equipment and preparation. Confirm important costs with your own measured yield.</p></div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-3xl text-center"><p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Use the chart correctly</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">From reference yield to reliable food cost</h2><p className="mt-4 leading-7 text-slate-600">A reference percentage is an excellent starting point. Your own production measurement is the best value for purchasing and pricing decisions.</p></div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <article className="rounded-3xl border border-slate-200 p-7"><BookOpen className="h-7 w-7 text-emerald-700" /><h3 className="mt-5 text-xl font-bold text-slate-900">1. Start with a reference</h3><p className="mt-3 text-sm leading-7 text-slate-600">Choose the closest ingredient and preparation note, then use its percentage to plan an initial purchase.</p></article>
            <article className="rounded-3xl border border-slate-200 p-7"><Scale className="h-7 w-7 text-emerald-700" /><h3 className="mt-5 text-xl font-bold text-slate-900">2. Weigh AP and EP</h3><p className="mt-3 text-sm leading-7 text-slate-600">Record the ingredient before trimming and weigh the usable portion after your normal preparation process.</p></article>
            <article className="rounded-3xl border border-slate-200 p-7"><Apple className="h-7 w-7 text-emerald-700" /><h3 className="mt-5 text-xl font-bold text-slate-900">3. Save your real yield</h3><p className="mt-3 text-sm leading-7 text-slate-600">Use your measured percentage for future recipes. Repeat when supplier specification or preparation changes.</p></article>
          </div>
          <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-950"><strong>Source and methodology:</strong> reference values are intended for planning. The USDA Food Buying Guide explains that yield data are averages and can vary with product quality, storage, equipment and preparation. Review the official <a href="https://foodbuyingguide.fns.usda.gov/Home/About" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">USDA Food Buying Guide methodology</a>.</div>
        </section>

        <section className="bg-slate-50 py-16 sm:py-20"><div className="mx-auto max-w-6xl px-5 sm:px-8"><div className="grid items-center gap-10 rounded-3xl bg-brand-green px-7 py-10 text-white sm:px-10 lg:grid-cols-[1fr_0.8fr] lg:px-14 lg:py-14"><div><p className="text-sm font-semibold uppercase tracking-widest text-emerald-200">Make the percentage useful</p><h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Calculate AP, EP, waste and true cost</h2><p className="mt-4 max-w-2xl leading-7 text-emerald-50/80">Choose any ingredient in the chart or enter your own measured yield in the free calculator.</p></div><div className="flex flex-col gap-3 lg:items-end"><Link href="/food-yield-calculator" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-400">Open yield calculator <ArrowRight className="h-4 w-4" /></Link><Link href="/register" className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-emerald-50 transition hover:bg-white/10">Automate yields with ZRecipe</Link></div></div></div></section>
      </main>
      <FreeToolsFooter />
    </div>
  )
}
