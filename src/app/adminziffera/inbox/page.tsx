import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPER_ADMIN_EMAIL } from '@/lib/auth/admin'
import InboxClient, { type InboxTicket } from './InboxClient'

export default async function InboxPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) redirect('/')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: tickets } = await admin
    .from('support_tickets')
    .select('id, number, channel, channel_source, status, requester_name, requester_email, subject, last_message_preview, last_message_at, admin_unread')
    .order('last_message_at', { ascending: false })
    .limit(200)

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Support Inbox</h1>
        <p className="mt-0.5 text-sm text-slate-500">Email and in-app tickets, all in one place.</p>
      </div>

      <InboxClient tickets={(tickets ?? []) as InboxTicket[]} />
    </div>
  )
}
