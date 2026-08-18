'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deleteBlogPost } from './actions'

export interface BlogPostListRow {
  id: string
  slug: string
  title: string
  category: string
  published: boolean
  published_at: string | null
  updated_at: string
}

export default function BlogPostsTable({ posts }: { posts: BlogPostListRow[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleDelete(post: BlogPostListRow) {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return
    setPendingId(post.id)
    startTransition(async () => {
      try {
        await deleteBlogPost(post.id)
        router.refresh()
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Failed to delete post.')
      } finally {
        setPendingId(null)
      }
    })
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-400">
        No posts yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <th className="px-5 py-2.5 text-left">Title</th>
            <th className="px-5 py-2.5 text-left">Category</th>
            <th className="px-5 py-2.5 text-left">Status</th>
            <th className="px-5 py-2.5 text-left">Published</th>
            <th className="px-5 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {posts.map((post) => (
            <tr key={post.id} className="hover:bg-slate-50">
              <td className="px-5 py-3 text-sm font-medium text-slate-800">{post.title}</td>
              <td className="px-5 py-3 text-sm text-slate-500">{post.category}</td>
              <td className="px-5 py-3">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    post.published
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-slate-200 bg-slate-100 text-slate-500'
                  )}
                >
                  {post.published ? 'Published' : 'Draft'}
                </span>
              </td>
              <td className="px-5 py-3 text-sm text-slate-500">
                {post.published_at
                  ? new Date(post.published_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—'}
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center justify-end gap-1.5">
                  {post.published && (
                    <a
                      href={`/blog/${post.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      title="Preview"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <Link
                    href={`/adminziffera/blog/${post.id}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(post)}
                    disabled={pendingId === post.id}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Delete"
                  >
                    {pendingId === post.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
