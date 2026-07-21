import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPER_ADMIN_EMAIL } from '@/lib/auth/admin'
import TicketDetailClient from './TicketDetailClient'

export default async function AdminTicketDetail({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) redirect('/')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const { data: ticket } = await admin
    .from('support_tickets')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!ticket) notFound()

  const { data: messages } = await admin
    .from('support_messages')
    .select('id, author_role, author_name, body, created_at')
    .eq('ticket_id', params.id)
    .order('created_at', { ascending: true })

  // Opening the detail view marks it read.
  if (ticket.admin_unread) {
    await admin.from('support_tickets').update({ admin_unread: false }).eq('id', params.id)
  }

  return (
    <TicketDetailClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ticket={ticket as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages={(messages ?? []) as any}
    />
  )
}
