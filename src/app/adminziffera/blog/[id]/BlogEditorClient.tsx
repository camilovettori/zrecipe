'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Loader2, Upload, X, ChevronDown, ExternalLink } from 'lucide-react'
import { saveBlogPost, type BlogPostInput } from '../actions'
import type { BlogCategory } from '@/lib/blog'

const QuillEditor = dynamic(() => import('../QuillEditor'), { ssr: false })

const CATEGORIES: BlogCategory[] = ['Guide', 'Tips', 'News', 'Case Study']

export interface InitialBlogPost {
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
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export default function BlogEditorClient({ initialPost }: { initialPost: InitialBlogPost | null }) {
  const router = useRouter()
  const isNew = initialPost === null

  const [title, setTitle] = useState(initialPost?.title ?? '')
  const [slug, setSlug] = useState(initialPost?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const [category, setCategory] = useState<BlogCategory>((initialPost?.category as BlogCategory) ?? 'Guide')
  const [excerpt, setExcerpt] = useState(initialPost?.excerpt ?? '')
  const [content, setContent] = useState(initialPost?.content ?? '')
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(initialPost?.cover_image_url ?? null)
  const [authorName, setAuthorName] = useState(initialPost?.author_name ?? 'ZRecipe Team')
  const [seoTitle, setSeoTitle] = useState(initialPost?.seo_title ?? '')
  const [seoDescription, setSeoDescription] = useState(initialPost?.seo_description ?? '')
  const [tagsInput, setTagsInput] = useState((initialPost?.tags ?? []).join(', '))
  const [published, setPublished] = useState(initialPost?.published ?? false)
  const [seoOpen, setSeoOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleTitleChange(value: string) {
    setTitle(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  async function handleCoverUpload(file: File) {
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/admin/blog/upload-image', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed.')
      setCoverImageUrl(json.url as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  function handleSave() {
    setError(null)
    const finalSlug = slugify(slug)
    if (!title.trim()) { setError('Title is required.'); return }
    if (!finalSlug) { setError('Slug is required.'); return }

    const input: BlogPostInput = {
      id: initialPost?.id ?? null,
      slug: finalSlug,
      title: title.trim(),
      category,
      excerpt,
      content,
      coverImageUrl,
      authorName,
      seoTitle,
      seoDescription,
      tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      published,
    }

    startTransition(async () => {
      try {
        const result = await saveBlogPost(input)
        if (isNew) {
          router.push(`/adminziffera/blog/${result.id}`)
        } else {
          router.refresh()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save post.')
      }
    })
  }

  return (
    <div className="max-w-3xl">
      <Link href="/adminziffera/blog" className="mb-6 flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to Blog
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{isNew ? 'New Post' : 'Edit Post'}</h1>
        <div className="flex items-center gap-2">
          {!isNew && published && (
            <a
              href={`/blog/${initialPost.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Preview <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Post title"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-lg font-semibold text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugTouched(true) }}
            placeholder="post-slug"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <p className="mt-1 text-xs text-slate-400">zrecipe.ie/blog/{slugify(slug) || 'post-slug'}</p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as BlogCategory)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-500">Excerpt</label>
            <span className={`text-xs ${excerpt.length >= 150 ? 'text-red-500' : 'text-slate-400'}`}>{excerpt.length}/150</span>
          </div>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            maxLength={150}
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Cover image</label>
          {coverImageUrl ? (
            <div className="relative w-full max-w-sm overflow-hidden rounded-lg border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverImageUrl} alt="" className="aspect-video w-full object-cover" />
              <button
                type="button"
                onClick={() => setCoverImageUrl(null)}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex w-full max-w-sm cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 hover:border-emerald-300 hover:bg-emerald-50/40">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading…' : 'Upload cover image'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleCoverUpload(file)
                }}
              />
            </label>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Author name</label>
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500">Content</label>
          <QuillEditor value={content} onChange={setContent} />
        </div>

        <div className="rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setSeoOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700"
          >
            SEO
            <ChevronDown className={`h-4 w-4 transition-transform ${seoOpen ? 'rotate-180' : ''}`} />
          </button>
          {seoOpen && (
            <div className="space-y-4 border-t border-slate-100 px-4 py-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500">SEO title</label>
                  <span className={`text-xs ${seoTitle.length >= 60 ? 'text-red-500' : 'text-slate-400'}`}>{seoTitle.length}/60</span>
                </div>
                <input
                  type="text"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  maxLength={60}
                  placeholder={title || 'SEO title'}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500">SEO description</label>
                  <span className={`text-xs ${seoDescription.length >= 160 ? 'text-red-500' : 'text-slate-400'}`}>{seoDescription.length}/160</span>
                </div>
                <textarea
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  maxLength={160}
                  rows={2}
                  placeholder={excerpt || 'SEO description'}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="food cost, pricing, Ireland"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>
          )}
        </div>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm font-medium text-slate-700">Published</span>
        </label>
      </div>
    </div>
  )
}
