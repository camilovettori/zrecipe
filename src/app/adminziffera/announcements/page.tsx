import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPER_ADMIN_EMAIL } from '@/lib/auth/admin'
import { getAudienceDirectory } from './actions'
import AnnouncementsClient, { type AnnouncementListRow } from './AnnouncementsClient'

export default async function AnnouncementsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) redirect('/')

  const adminFullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null

  const directory = await getAudienceDirectory()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: announcements } = await admin
    .from('announcements')
    .select(
      'id, number, created_at, title, audience_kind, audience_segment, sent_at, total_recipients, email_ok_count, email_failed_count'
    )
    .order('sent_at', { ascending: false })
    .limit(50)

  const announcementIds = (announcements ?? []).map((a: { id: string }) => a.id)
  const readCounts = new Map<string, number>()
  if (announcementIds.length > 0) {
    const { data: readRows } = await admin
      .from('announcement_recipients')
      .select('announcement_id')
      .in('announcement_id', announcementIds)
      .not('read_at', 'is', null)
    for (const row of (readRows ?? []) as { announcement_id: string }[]) {
      readCounts.set(row.announcement_id, (readCounts.get(row.announcement_id) ?? 0) + 1)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: AnnouncementListRow[] = (announcements ?? []).map((a: any) => ({
    id: a.id,
    number: a.number,
    createdAt: a.created_at,
    title: a.title,
    audienceKind: a.audience_kind,
    audienceSegment: a.audience_segment,
    sentAt: a.sent_at,
    totalRecipients: a.total_recipients,
    readCount: readCounts.get(a.id) ?? 0,
  }))

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Announcements</h1>
        <p className="mt-0.5 text-sm text-slate-500">Broadcast a one-way message to selected users.</p>
      </div>

      <AnnouncementsClient directory={directory} announcements={list} adminFullName={adminFullName} />
    </div>
  )
}
