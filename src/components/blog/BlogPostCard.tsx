import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BlogPost } from '@/lib/blog'

export const CATEGORY_STYLE: Record<string, string> = {
  Guide: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Tips: 'bg-amber-50 text-amber-700 border-amber-200',
  News: 'bg-blue-50 text-blue-700 border-blue-200',
  'Case Study': 'bg-violet-50 text-violet-700 border-violet-200',
}

export function formatPostDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })
}

type CardPost = Pick<BlogPost, 'slug' | 'title' | 'excerpt' | 'category' | 'coverImageUrl' | 'authorName' | 'publishedAt'>

export default function BlogPostCard({ post }: { post: CardPost }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl">
      <Link href={`/blog/${post.slug}`} className="block aspect-[16/9] w-full shrink-0 overflow-hidden bg-brand-paper" tabIndex={-1}>
        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-50 to-brand-paper text-emerald-300">
            <BookOpen className="h-10 w-10" />
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-6">
        <span
          className={cn(
            'inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
            CATEGORY_STYLE[post.category] ?? CATEGORY_STYLE.Guide
          )}
        >
          {post.category}
        </span>
        <h3 className="mt-3 text-lg font-bold leading-snug text-slate-900">
          <Link href={`/blog/${post.slug}`} className="hover:text-emerald-700">
            {post.title}
          </Link>
        </h3>
        {post.excerpt && (
          <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">{post.excerpt}</p>
        )}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <span>{post.authorName}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={post.publishedAt ?? undefined}>{formatPostDate(post.publishedAt)}</time>
        </div>
      </div>
    </article>
  )
}
