import type { Metadata } from 'next'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import LandingNav from '@/components/landing/LandingNav'
import BlogFooter from '@/components/blog/BlogFooter'
import BlogPostCard from '@/components/blog/BlogPostCard'
import { getPublishedPosts } from '@/lib/blog'
import { SITE_URL } from '@/lib/site-url'

export const revalidate = 3600

const pageUrl = `${SITE_URL}/blog`
const pageTitle = 'Blog — Food Costing, Compliance & Kitchen Tips'
const pageDescription =
  'Practical guides on food cost percentage, allergen compliance, and recipe costing for Irish bakeries, cafés and restaurants.'

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: pageUrl },
  openGraph: {
    title: 'ZRecipe Blog',
    description: pageDescription,
    url: pageUrl,
    siteName: 'ZRecipe',
    locale: 'en_IE',
    type: 'website',
  },
}

export default async function BlogIndexPage() {
  const posts = await getPublishedPosts()

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'ZRecipe Blog',
    url: pageUrl,
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${SITE_URL}/blog/${p.slug}`,
      datePublished: p.publishedAt,
    })),
  }

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
              <span className="text-slate-700">Blog</span>
            </nav>
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                <Sparkles className="h-4 w-4" /> ZRecipe Blog
              </span>
              <h1 className="mt-6 text-balance font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Food costing, compliance &amp; kitchen tips
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-balance text-lg leading-8 text-slate-600">
                Practical guides for bakeries, cafés and restaurants — food cost percentage, allergen
                compliance, and getting more out of your recipes.
              </p>
            </div>

            {posts.length === 0 ? (
              <p className="mt-16 text-center text-sm text-slate-500">
                New posts are on the way — check back soon.
              </p>
            ) : (
              <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => (
                  <BlogPostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid items-center gap-10 rounded-3xl bg-brand-green px-7 py-10 text-white sm:px-10 lg:grid-cols-[1fr_0.8fr] lg:px-14 lg:py-14">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-200">
                Ready to stop guessing?
              </p>
              <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">
                Put every recipe cost on autopilot
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-emerald-50/80">
                ZRecipe applies ingredient prices, yield factors, labour, overhead, VAT and margin to
                your full recipe library — then keeps costs current as supplier prices change.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
              >
                Start 14-day Pro trial
              </Link>
              <Link
                href="/#features"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-emerald-50 transition hover:bg-white/10"
              >
                Explore ZRecipe features
              </Link>
            </div>
          </div>
        </section>
      </main>
      <BlogFooter />
    </div>
  )
}
