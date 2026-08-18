import { createClient } from '@/lib/supabase/server'

export type BlogCategory = 'Guide' | 'Tips' | 'News' | 'Case Study'

export interface BlogPost {
  id: string
  slug: string
  title: string
  category: BlogCategory
  excerpt: string | null
  content: string
  coverImageUrl: string | null
  authorName: string
  seoTitle: string | null
  seoDescription: string | null
  tags: string[]
  published: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

type BlogPostRow = {
  id: string
  slug: string
  title: string
  category: string
  excerpt: string | null
  content: string
  cover_image_url: string | null
  author_name: string
  seo_title: string | null
  seo_description: string | null
  tags: string[] | null
  published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

const BLOG_POST_COLUMNS =
  'id, slug, title, category, excerpt, content, cover_image_url, author_name, seo_title, seo_description, tags, published, published_at, created_at, updated_at'

function mapRow(row: BlogPostRow): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category as BlogCategory,
    excerpt: row.excerpt,
    content: row.content,
    coverImageUrl: row.cover_image_url,
    authorName: row.author_name,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    tags: row.tags ?? [],
    published: row.published,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** All published posts, most recent first — used by the /blog listing page. */
export async function getPublishedPosts(): Promise<BlogPost[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('blog_posts')
    .select(BLOG_POST_COLUMNS)
    .eq('published', true)
    .order('published_at', { ascending: false })

  return ((data ?? []) as unknown as BlogPostRow[]).map(mapRow)
}

/** A single published post by slug, or null if it doesn't exist / isn't published. */
export async function getPublishedPostBySlug(slug: string): Promise<BlogPost | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('blog_posts')
    .select(BLOG_POST_COLUMNS)
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()

  return data ? mapRow(data as unknown as BlogPostRow) : null
}

/** Up to `limit` other published posts in the same category, most recent first. */
export async function getRelatedPosts(
  category: BlogCategory,
  excludePostId: string,
  limit = 3
): Promise<BlogPost[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('blog_posts')
    .select(BLOG_POST_COLUMNS)
    .eq('published', true)
    .eq('category', category)
    .neq('id', excludePostId)
    .order('published_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as unknown as BlogPostRow[]).map(mapRow)
}

/** slug + updated_at for every published post — used by the sitemap.
 *  Wrapped defensively: tests/canonicalDomain.test.ts calls sitemap()
 *  directly outside a Next.js request, where cookies() (used by
 *  createClient()) throws — falling back to [] there is fine since that
 *  test only checks the static routes' URL shape, not blog content. */
export async function getPublishedPostSlugs(): Promise<Array<{ slug: string; updatedAt: string }>> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, updated_at')
      .eq('published', true)

    return ((data ?? []) as Array<{ slug: string; updated_at: string }>).map((r) => ({
      slug: r.slug,
      updatedAt: r.updated_at,
    }))
  } catch {
    return []
  }
}
