import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPER_ADMIN_EMAIL } from '@/lib/auth/admin'
import BlogPostsTable, { type BlogPostListRow } from './BlogPostsTable'

export default async function AdminBlogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) redirect('/')

  const admin = createAdminClient()
  const { data } = await admin
    .from('blog_posts')
    .select('id, slug, title, category, published, published_at, updated_at')
    .order('updated_at', { ascending: false })

  const posts = (data ?? []) as BlogPostListRow[]

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Blog</h1>
          <p className="mt-0.5 text-sm text-slate-500">{posts.length} post{posts.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/adminziffera/blog/new"
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> New Post
        </Link>
      </div>

      <BlogPostsTable posts={posts} />
    </div>
  )
}
