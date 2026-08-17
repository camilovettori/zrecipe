import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BadgeEuro, CheckCircle2, ReceiptText, ShieldCheck, Utensils } from 'lucide-react'
import LandingNav from '@/components/landing/LandingNav'
import VatCalculator from '@/components/landing/VatCalculator'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.zrecipe.ie'
const pageUrl = `${siteUrl}/vat-calculator-ireland`

export const metadata: Metadata = {
  title: 'VAT Calculator Ireland 2026 – Add or Remove VAT',
  description:
    'Free Irish VAT calculator for 2026. Add or remove VAT instantly at 23%, 13.5%, 9%, 4.8%, 0% or a custom rate. See net, VAT and gross amounts.',
  keywords: [
    'VAT calculator Ireland',
    'Irish VAT calculator',
    'VAT calculator Ireland 2026',
    'add VAT calculator',
    'remove VAT calculator',
    'reverse VAT calculator Ireland',
    'calculate VAT Ireland',
    '23 percent VAT calculator',
    '13.5 percent VAT calculator',
    '9 percent VAT calculator Ireland',
    'VAT inclusive calculator',
    'VAT exclusive calculator',
    'net to gross VAT calculator',
    'gross to net VAT calculator',
    'restaurant VAT calculator',
    'bakery VAT calculator',
    'hospitality VAT calculator Ireland',
    'food VAT Ireland',
  ],
  alternates: { canonical: pageUrl },
  openGraph: {
    title: 'Free VAT Calculator Ireland – Add or Remove VAT',
    description:
      'Calculate Irish VAT instantly at all current rates. Free, mobile-friendly and no sign-up required.',
    url: pageUrl,
    siteName: 'ZRecipe',
    type: 'website',
    locale: 'en_IE',
    images: [{
      url: '/images/og-image.jpg',
      width: 1200,
      height: 630,
      alt: 'ZRecipe Irish VAT calculator',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free VAT Calculator Ireland – Add or Remove VAT',
    description: 'Calculate net, VAT and gross prices instantly using current Irish VAT rates.',
    images: ['/images/og-image.jpg'],
  },
}

const rates = [
  { rate: '23%', name: 'Standard rate', detail: 'The standard Irish VAT rate for most taxable goods and services.' },
  { rate: '13.5%', name: 'Reduced rate', detail: 'A reduced rate used for qualifying goods and services, including certain food business supplies.' },
  { rate: '9%', name: 'Second reduced rate', detail: 'The second reduced rate for qualifying categories under current Irish VAT rules.' },
  { rate: '4.8%', name: 'Livestock rate', detail: 'A special rate applying to qualifying livestock and related agricultural supplies.' },
  { rate: '0%', name: 'Zero rate', detail: 'Applies to qualifying zero-rated goods, including many basic food products.' },
]

const faqs = [
  {
    question: 'How do I add VAT to a price in Ireland?',
    answer: 'Choose Add VAT, enter the net price and select the applicable rate. The calculator multiplies the net amount by the VAT rate and adds that tax to produce the gross price.',
  },
  {
    question: 'How do I remove VAT from a total price?',
    answer: 'Choose Remove VAT and enter the VAT-inclusive total. The calculator divides the gross amount by one plus the VAT rate to recover the net price and the VAT included.',
  },
  {
    question: 'What are the current VAT rates in Ireland?',
    answer: 'Ireland currently uses rates of 23%, 13.5%, 9%, 4.8% and 0%. The correct rate depends on the product, service and circumstances, so confirm the category in the Revenue VAT rates database.',
  },
  {
    question: 'What is €100 plus 23% VAT?',
    answer: 'The VAT is €23.00 and the gross price is €123.00. If €123.00 already includes VAT at 23%, the net amount is €100.00.',
  },
  {
    question: 'Does this calculator save the amounts I enter?',
    answer: 'No. The calculation runs locally in your browser. ZRecipe does not send or store the amounts entered into this free tool.',
  },
]

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      '@id': `${pageUrl}#calculator`,
      name: 'ZRecipe VAT Calculator Ireland',
      url: pageUrl,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript',
      description: 'Free calculator to add or remove Irish VAT and show net, VAT and gross amounts.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      featureList: [
        'Add Irish VAT to a net amount',
        'Remove Irish VAT from a gross amount',
        'Rates of 23%, 13.5%, 9%, 4.8% and 0%',
        'Custom VAT rate',
        'Copy calculation results',
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'VAT Calculator Ireland', item: pageUrl },
      ],
    },
  ],
}

export default function VatCalculatorIrelandPage() {
  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <LandingNav />

      <main>
        <section className="overflow-hidden bg-brand-paper">
          <div className="mx-auto max-w-7xl px-5 pb-20 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
            <nav aria-label="Breadcrumb" className="mb-8 text-sm text-slate-500">
              <Link href="/" className="hover:text-emerald-700">Home</Link>
              <span className="mx-2" aria-hidden="true">/</span>
              <span className="text-slate-700">VAT Calculator Ireland</span>
            </nav>

            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                <BadgeEuro className="h-4 w-4" /> Free Irish business tool
              </span>
              <h1 className="mt-6 text-balance font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                VAT Calculator Ireland
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-balance text-lg leading-8 text-slate-600">
                Add or remove Irish VAT instantly. Calculate the net price, VAT amount and gross total using current rates or your own custom percentage.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Free to use</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> No sign-up</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Private in-browser calculation</span>
              </div>
            </div>

            <div className="mx-auto mt-12 max-w-5xl">
              <VatCalculator />
            </div>

            <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-5 text-slate-500">
              Updated August 2026. Rates are based on the current Irish VAT rate table. Always confirm the correct treatment for your supply with{' '}
              <a
                href="https://www.revenue.ie/en/vat/vat-rates/search-vat-rates/current-VAT-rates.aspx"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-emerald-700 underline underline-offset-2"
              >
                Revenue.ie
              </a>{' '}
              or a qualified tax adviser.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Irish VAT rates 2026</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Current VAT rates in Ireland</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Select a preset in the calculator or enter a custom rate. VAT treatment can vary even between similar food and drink products.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {rates.map((item) => (
              <article key={item.rate} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-3xl font-bold text-emerald-700">{item.rate}</p>
                <h3 className="mt-2 text-base font-semibold text-slate-900">{item.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 sm:px-8 lg:grid-cols-2">
            <article className="rounded-3xl border border-slate-200 bg-white p-7 sm:p-9">
              <ReceiptText className="h-7 w-7 text-emerald-700" />
              <h2 className="mt-5 text-2xl font-bold text-slate-900">How to add VAT to a net price</h2>
              <p className="mt-3 leading-7 text-slate-600">
                Multiply the net price by the VAT rate to find the tax, then add it to the net amount.
              </p>
              <div className="mt-6 rounded-2xl bg-emerald-50 p-5 font-medium text-emerald-950">
                <p>VAT = Net × (Rate ÷ 100)</p>
                <p className="mt-2">Gross = Net + VAT</p>
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-500">Example: €100 plus 23% VAT gives €23 VAT and a €123 gross price.</p>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-7 sm:p-9">
              <ShieldCheck className="h-7 w-7 text-emerald-700" />
              <h2 className="mt-5 text-2xl font-bold text-slate-900">How to remove VAT from a gross price</h2>
              <p className="mt-3 leading-7 text-slate-600">
                Dividing by the VAT factor removes VAT correctly. Subtracting the percentage directly gives the wrong answer.
              </p>
              <div className="mt-6 rounded-2xl bg-emerald-50 p-5 font-medium text-emerald-950">
                <p>Net = Gross ÷ (1 + Rate ÷ 100)</p>
                <p className="mt-2">VAT = Gross − Net</p>
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-500">Example: €123 including 23% VAT contains €23 VAT and has a €100 net price.</p>
            </article>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid items-center gap-10 rounded-3xl bg-brand-green px-7 py-10 text-white sm:px-10 lg:grid-cols-[1fr_0.8fr] lg:px-14 lg:py-14">
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-emerald-200">
                <Utensils className="h-4 w-4" /> Built for food businesses
              </span>
              <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">VAT is one part of your true recipe cost</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-emerald-50/80">
                ZRecipe combines ingredient prices, labour, overhead, waste, VAT and selling margin so bakeries, cafés and restaurants can price every recipe with confidence.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-400">
                Start 14-day Pro trial <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/#features" className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-emerald-50 transition hover:bg-white/10">
                Explore recipe costing features
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-brand-paper py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-5 sm:px-8">
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">VAT questions</p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">Irish VAT calculator FAQ</h2>
            </div>
            <div className="mt-10 space-y-4">
              {faqs.map((item) => (
                <details key={item.question} className="group rounded-2xl border border-slate-200 bg-white p-5 open:shadow-sm">
                  <summary className="cursor-pointer list-none pr-6 text-base font-semibold text-slate-900 marker:hidden">
                    {item.question}
                  </summary>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 bg-dark py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 text-sm text-slate-400 sm:px-8 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Ziffera. Free VAT calculator by ZRecipe.</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
            <Link href="/" className="hover:text-white">ZRecipe</Link>
            <Link href="/#pricing" className="hover:text-white">Pricing</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

