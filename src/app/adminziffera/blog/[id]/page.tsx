import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPER_ADMIN_EMAIL } from '@/lib/auth/admin'
import BlogEditorClient, { type InitialBlogPost } from './BlogEditorClient'

export default async function BlogEditorPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) redirect('/')

  if (id === 'new') {
    return <BlogEditorClient initialPost={null} />
  }

  const admin = createAdminClient()
  const { data: post } = await admin
    .from('blog_posts')
    .select('id, slug, title, category, excerpt, content, cover_image_url, author_name, seo_title, seo_description, tags, published')
    .eq('id', id)
    .maybeSingle()

  if (!post) notFound()

  return <BlogEditorClient initialPost={post as unknown as InitialBlogPost} />
}
