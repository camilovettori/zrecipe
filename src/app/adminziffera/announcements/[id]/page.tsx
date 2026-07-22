import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPER_ADMIN_EMAIL } from '@/lib/auth/admin'
import AnnouncementDetailClient, { type RecipientRow } from './AnnouncementDetailClient'

export default async function AdminAnnouncementDetail({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) redirect('/')

  const adminFullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const { data: announcement } = await admin
    .from('announcements')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!announcement) notFound()

  const { data: recipients } = await admin
    .from('announcement_recipients')
    .select('id, user_id, email, read_at, email_status, email_error')
    .eq('announcement_id', params.id)
    .order('created_at', { ascending: true })

  const userIds = (recipients ?? []).map((r: { user_id: string | null }) => r.user_id).filter(Boolean)
  const nameByUserId = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of (authUsers?.users ?? []) as any[]) {
      const meta = u.user_metadata ?? {}
      nameByUserId.set(u.id, (meta.full_name || meta.name || (u.email ? u.email.split('@')[0] : 'Unknown')) as string)
    }
  }

  const recipientRows: RecipientRow[] = (recipients ?? []).map(
    (r: { id: string; user_id: string | null; email: string; read_at: string | null; email_status: string; email_error: string | null }) => ({
      id: r.id,
      name: (r.user_id && nameByUserId.get(r.user_id)) || '—',
      email: r.email,
      readAt: r.read_at,
      emailStatus: r.email_status,
      emailError: r.email_error,
    })
  )

  return (
    <AnnouncementDetailClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      announcement={announcement as any}
      recipients={recipientRows}
      adminFullName={adminFullName}
    />
  )
}
