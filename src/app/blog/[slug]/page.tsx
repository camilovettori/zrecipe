import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import LandingNav from '@/components/landing/LandingNav'
import BlogFooter from '@/components/blog/BlogFooter'
import BlogPostCard, { CATEGORY_STYLE, formatPostDate } from '@/components/blog/BlogPostCard'
import { getPublishedPostBySlug, getRelatedPosts } from '@/lib/blog'
import { SITE_URL } from '@/lib/site-url'
import { cn } from '@/lib/utils'

export const revalidate = 3600

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await getPublishedPostBySlug(slug)
  if (!post) return {}

  const title = post.seoTitle || post.title
  const description = post.seoDescription || post.excerpt || undefined
  const pageUrl = `${SITE_URL}/blog/${post.slug}`

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'ZRecipe',
      locale: 'en_IE',
      type: 'article',
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      images: post.coverImageUrl
        ? [{ url: post.coverImageUrl, width: 1200, height: 630, alt: post.title }]
        : [{ url: '/images/og-image.jpg', width: 1200, height: 630, alt: 'ZRecipe' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [post.coverImageUrl ?? '/images/og-image.jpg'],
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = await getPublishedPostBySlug(slug)
  if (!post) notFound()

  const relatedPosts = await getRelatedPosts(post.category, post.id, 3)
  const pageUrl = `${SITE_URL}/blog/${post.slug}`

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.seoDescription || post.excerpt || undefined,
    image: post.coverImageUrl ? [post.coverImageUrl] : undefined,
    author: { '@type': 'Organization', name: post.authorName },
    publisher: {
      '@type': 'Organization',
      name: 'ZRecipe',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/images/logo4.png` },
    },
    datePublished: post.publishedAt ?? post.createdAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
  }

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <LandingNav />
      <main>
        <article className="mx-auto max-w-3xl px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
          <nav aria-label="Breadcrumb" className="mb-8 text-sm text-slate-500">
            <Link href="/" className="hover:text-emerald-700">Home</Link>
            <span className="mx-2" aria-hidden="true">/</span>
            <Link href="/blog" className="hover:text-emerald-700">Blog</Link>
            <span className="mx-2" aria-hidden="true">/</span>
            <span className="text-slate-700">{post.title}</span>
          </nav>

          <span
            className={cn(
              'inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
              CATEGORY_STYLE[post.category] ?? CATEGORY_STYLE.Guide
            )}
          >
            {post.category}
          </span>

          <h1 className="mt-4 text-balance font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            {post.title}
          </h1>

          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{post.authorName}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={post.publishedAt ?? undefined}>{formatPostDate(post.publishedAt)}</time>
          </div>

          {post.coverImageUrl && (
            <div className="mt-8 overflow-hidden rounded-3xl bg-brand-paper">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.coverImageUrl} alt="" className="w-full object-cover" />
            </div>
          )}

          {/* Content is authored exclusively by the super admin via the
              WYSIWYG editor at /adminziffera/blog — not user-submitted —
              so rendering it as trusted HTML is safe here. */}
          <div className="blog-content mt-10" dangerouslySetInnerHTML={{ __html: post.content }} />

          <div className="mt-14 rounded-3xl bg-brand-green px-7 py-9 text-white sm:px-10">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-200">
              Enjoyed this guide?
            </p>
            <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">
              Try ZRecipe free for 14 days
            </h2>
            <p className="mt-3 max-w-xl leading-7 text-emerald-50/80">
              Import invoices, track ingredient prices, and see the real cost and margin of every
              recipe — automatically.
            </p>
            <Link
              href="/register"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
            >
              Start free trial
            </Link>
          </div>

          {relatedPosts.length > 0 && (
            <section className="mt-16">
              <h2 className="text-xl font-bold text-slate-900">Related posts</h2>
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {relatedPosts.map((related) => (
                  <BlogPostCard key={related.id} post={related} />
                ))}
              </div>
            </section>
          )}
        </article>
      </main>
      <BlogFooter />
    </div>
  )
}
