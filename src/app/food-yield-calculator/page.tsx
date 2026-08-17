import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Scale, Sprout, TrendingDown, Utensils } from 'lucide-react'
import LandingNav from '@/components/landing/LandingNav'
import FoodYieldCalculator from '@/components/landing/FoodYieldCalculator'
import FreeToolsFooter from '@/components/landing/FreeToolsFooter'
import { SITE_URL } from '@/lib/site-url'

const siteUrl = SITE_URL
const pageUrl = `${siteUrl}/food-yield-calculator`

export const metadata: Metadata = {
  title: 'Food Yield Calculator – AP, EP, Waste & True Cost',
  description: 'Free food yield calculator for restaurants and chefs. Calculate as-purchased (AP) quantity, edible portion (EP), trim waste, yield percentage and true ingredient cost.',
  keywords: [
    'food yield calculator',
    'edible portion calculator',
    'AP EP calculator',
    'ingredient yield calculator',
    'food waste calculator',
    'trim loss calculator',
    'restaurant food yield',
    'as purchased edible portion',
    'true ingredient cost calculator',
    'food yield percentage formula',
    'chef yield calculator',
    'recipe costing calculator',
  ],
  alternates: { canonical: pageUrl },
  openGraph: {
    title: 'Free Food Yield Calculator – AP, EP, Waste & Cost',
    description: 'Plan purchasing or measure actual ingredient yield, waste and true usable cost.',
    url: pageUrl,
    siteName: 'ZRecipe',
    locale: 'en_IE',
    type: 'website',
    images: [{ url: '/images/og-image.jpg', width: 1200, height: 630, alt: 'ZRecipe food yield calculator' }],
  },
  twitter: { card: 'summary_large_image', title: 'Free Food Yield Calculator', description: 'Calculate AP, EP, waste and true ingredient cost.', images: ['/images/og-image.jpg'] },
}

const faqs = [
  { question: 'What is food yield percentage?', answer: 'Food yield percentage is the usable edible portion (EP) divided by the as-purchased quantity (AP), multiplied by 100. It shows how much of an ingredient remains after trimming or preparation.' },
  { question: 'What do AP and EP mean in food costing?', answer: 'AP means as purchased: the quantity and price when the ingredient arrives. EP means edible portion: the usable quantity after peel, bone, skin, stems, trim or other preparation loss.' },
  { question: 'How do I calculate how much food to buy?', answer: 'Divide the edible quantity required by the yield as a decimal. If a recipe needs 10 kg usable potato and your yield is 63%, purchase about 15.87 kg.' },
  { question: 'How does yield affect ingredient cost?', answer: 'A lower yield increases the true cost of every usable kilogram. Divide the AP price per kilogram by the yield decimal to calculate the cost per edible kilogram.' },
  { question: 'Are reference yield percentages exact?', answer: 'No. Reference values are planning estimates. Actual results vary with ingredient size and quality, supplier specification, storage, equipment, staff technique and preparation method. Measure your own yield when accuracy matters.' },
]

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebApplication', '@id': `${pageUrl}#calculator`, name: 'ZRecipe Food Yield Calculator', url: pageUrl, applicationCategory: 'BusinessApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript', description: 'Free AP, EP, waste and true food cost calculator.', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, featureList: ['Plan AP purchasing quantity from EP requirements', 'Measure actual food yield', 'Calculate trim and waste percentage', 'Calculate true cost per usable kilogram'] },
    { '@type': 'FAQPage', mainEntity: faqs.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl }, { '@type': 'ListItem', position: 2, name: 'Free Tools', item: `${siteUrl}/tools` }, { '@type': 'ListItem', position: 3, name: 'Food Yield Calculator', item: pageUrl }] },
  ],
}

export default async function FoodYieldCalculatorPage({ searchParams }: { searchParams: Promise<{ ingredient?: string | string[] }> }) {
  const params = await searchParams
  const initialIngredient = typeof params.ingredient === 'string' ? params.ingredient : undefined
  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <LandingNav />
      <main>
        <section className="overflow-hidden bg-brand-paper">
          <div className="mx-auto max-w-7xl px-5 pb-20 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
            <nav aria-label="Breadcrumb" className="mb-8 text-sm text-slate-500"><Link href="/" className="hover:text-emerald-700">Home</Link><span className="mx-2" aria-hidden="true">/</span><Link href="/tools" className="hover:text-emerald-700">Free Tools</Link><span className="mx-2" aria-hidden="true">/</span><span className="text-slate-700">Food Yield Calculator</span></nav>
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700"><Scale className="h-4 w-4" /> Free food costing tool</span>
              <h1 className="mt-6 text-balance font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">Food Yield Calculator</h1>
              <p className="mx-auto mt-5 max-w-2xl text-balance text-lg leading-8 text-slate-600">Calculate food yield percentage, trim waste, AP quantity, edible portion and the true cost of every usable kilogram.</p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-500"><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Free to use</span><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> No sign-up</span><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Private in-browser calculation</span></div>
            </div>
            <div className="mx-auto mt-12 max-w-6xl"><FoodYieldCalculator initialIngredient={initialIngredient} /></div>
            <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-5 text-slate-500">Reference yields are planning averages, not guarantees. Measure your own ingredients for production decisions. See the <Link href="/food-yield-reference" className="font-semibold text-emerald-700 underline underline-offset-2">food yield reference chart</Link>.</p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-3xl text-center"><p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">AP, EP and waste explained</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">How to calculate food yield</h2><p className="mt-4 leading-7 text-slate-600">Yield connects the quantity you buy to the quantity you can actually serve. These four formulas turn trim loss into a cost you can plan.</p></div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'Yield percentage', formula: 'EP ÷ AP × 100', text: 'The percentage of the purchased ingredient that remains usable.' },
              { title: 'Waste percentage', formula: '100 − Yield %', text: 'The share lost to peel, bone, skin, stems, trim or preparation.' },
              { title: 'AP quantity needed', formula: 'EP needed ÷ Yield', text: 'The quantity to purchase so production has enough usable food.' },
              { title: 'True EP cost', formula: 'AP cost ÷ Yield', text: 'The real price of one usable unit after yield loss.' },
            ].map((item) => <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="font-semibold text-slate-900">{item.title}</h3><p className="mt-4 rounded-xl bg-emerald-50 px-3 py-3 text-center font-bold text-emerald-800">{item.formula}</p><p className="mt-4 text-sm leading-6 text-slate-500">{item.text}</p></article>)}
          </div>
        </section>

        <section className="bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 sm:px-8 lg:grid-cols-3">
            <article className="rounded-3xl border border-slate-200 bg-white p-7"><Sprout className="h-7 w-7 text-emerald-700" /><h2 className="mt-5 text-xl font-bold text-slate-900">AP: as purchased</h2><p className="mt-3 text-sm leading-7 text-slate-600">The full quantity received from your supplier, including any parts removed before service.</p></article>
            <article className="rounded-3xl border border-slate-200 bg-white p-7"><Utensils className="h-7 w-7 text-emerald-700" /><h2 className="mt-5 text-xl font-bold text-slate-900">EP: edible portion</h2><p className="mt-3 text-sm leading-7 text-slate-600">The usable quantity that goes into your recipe or reaches the customer after preparation.</p></article>
            <article className="rounded-3xl border border-slate-200 bg-white p-7"><TrendingDown className="h-7 w-7 text-emerald-700" /><h2 className="mt-5 text-xl font-bold text-slate-900">Example: potato at 63%</h2><p className="mt-3 text-sm leading-7 text-slate-600">For 10 kg EP, divide 10 by 0.63. Purchase 15.87 kg AP and expect approximately 5.87 kg trim loss.</p></article>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20"><div className="grid items-center gap-10 rounded-3xl bg-brand-green px-7 py-10 text-white sm:px-10 lg:grid-cols-[1fr_0.8fr] lg:px-14 lg:py-14"><div><p className="text-sm font-semibold uppercase tracking-widest text-emerald-200">Built into ZRecipe Pro</p><h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">Apply yield factors to every recipe automatically</h2><p className="mt-4 max-w-2xl leading-7 text-emerald-50/80">Turn a one-off calculation into live recipe costing. ZRecipe adjusts quantities and costs across your recipe library when yield or supplier pricing changes.</p></div><div className="flex flex-col gap-3 lg:items-end"><Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-400">Start 14-day Pro trial <ArrowRight className="h-4 w-4" /></Link><Link href="/food-yield-reference" className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-emerald-50 transition hover:bg-white/10">Browse yield reference</Link></div></div></section>

        <section className="bg-brand-paper py-16 sm:py-20"><div className="mx-auto max-w-3xl px-5 sm:px-8"><div className="text-center"><p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Yield questions</p><h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">Food yield calculator FAQ</h2></div><div className="mt-10 space-y-4">{faqs.map((item) => <details key={item.question} className="rounded-2xl border border-slate-200 bg-white p-5 open:shadow-sm"><summary className="cursor-pointer list-none pr-6 font-semibold text-slate-900 marker:hidden">{item.question}</summary><p className="mt-3 text-sm leading-7 text-slate-600">{item.answer}</p></details>)}</div></div></section>
      </main>
      <FreeToolsFooter />
    </div>
  )
}
