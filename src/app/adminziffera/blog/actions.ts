'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/auth/admin'
import type { BlogCategory } from '@/lib/blog'

export interface BlogPostInput {
  id: string | null
  slug: string
  title: string
  category: BlogCategory
  excerpt: string
  content: string
  coverImageUrl: string | null
  authorName: string
  seoTitle: string
  seoDescription: string
  tags: string[]
  published: boolean
}

function revalidateBlog(id: string | null, slug: string) {
  revalidatePath('/adminziffera/blog')
  if (id) revalidatePath(`/adminziffera/blog/${id}`)
  revalidatePath('/blog')
  revalidatePath(`/blog/${slug}`)
  revalidatePath('/sitemap.xml')
}

export async function saveBlogPost(input: BlogPostInput): Promise<{ id: string }> {
  await requireSuperAdmin()
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = admin.from('blog_posts') as any

  const title = input.title.trim()
  const slug = input.slug.trim()
  if (!title) throw new Error('Title is required.')
  if (!slug) throw new Error('Slug is required.')

  const row = {
    slug,
    title,
    category: input.category,
    excerpt: input.excerpt.trim() || null,
    content: input.content,
    cover_image_url: input.coverImageUrl,
    author_name: input.authorName.trim() || 'ZRecipe Team',
    seo_title: input.seoTitle.trim() || null,
    seo_description: input.seoDescription.trim() || null,
    tags: input.tags,
    published: input.published,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    // Only stamp published_at the first time a post goes live — later
    // edits or unpublish/republish cycles keep the original publish date.
    const { data: existing } = await table
      .select('published_at')
      .eq('id', input.id)
      .maybeSingle()

    const publishedAt =
      input.published && !existing?.published_at ? new Date().toISOString() : existing?.published_at ?? null

    const { error } = await table
      .update({ ...row, published_at: publishedAt })
      .eq('id', input.id)
    if (error) {
      throw new Error(error.code === '23505' ? 'That slug is already used by another post.' : error.message)
    }

    revalidateBlog(input.id, slug)
    return { id: input.id }
  }

  const { data, error } = await table
    .insert({ ...row, published_at: input.published ? new Date().toISOString() : null })
    .select('id')
    .single()
  if (error) {
    throw new Error(error.code === '23505' ? 'That slug is already used by another post.' : error.message)
  }

  revalidateBlog(data.id as string, slug)
  return { id: data.id as string }
}

export async function deleteBlogPost(id: string): Promise<void> {
  await requireSuperAdmin()
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from('blog_posts') as any).delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidateBlog(null, '')
}
