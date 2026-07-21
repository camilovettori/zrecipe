'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin, SUPER_ADMIN_EMAIL } from '@/lib/auth/admin'
import { sendEmail, escapeHtml } from '@/lib/email/send'

function revalidateInbox(ticketId: string) {
  revalidatePath('/adminziffera/inbox')
  revalidatePath(`/adminziffera/inbox/${ticketId}`)
}

export async function markTicketRead(ticketId: string): Promise<void> {
  await requireSuperAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  await admin.from('support_tickets').update({ admin_unread: false }).eq('id', ticketId)
  revalidatePath('/adminziffera/inbox')
}

export async function setTicketStatus(ticketId: string, status: 'open' | 'closed'): Promise<void> {
  await requireSuperAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  await admin
    .from('support_tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', ticketId)
  revalidateInbox(ticketId)
}

export async function replyToTicket(ticketId: string, body: string): Promise<{ error?: string }> {
  await requireSuperAdmin()

  const trimmed = body.trim()
  if (!trimmed) return { error: 'Message is required.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const { data: ticket } = await admin
    .from('support_tickets')
    .select('id, channel, subject, requester_name, requester_email')
    .eq('id', ticketId)
    .maybeSingle()

  if (!ticket) return { error: 'Ticket not found.' }

  const { error: messageError } = await admin.from('support_messages').insert({
    ticket_id: ticketId,
    author_role: 'admin',
    author_name: 'ZRecipe Support',
    author_email: SUPER_ADMIN_EMAIL,
    body: trimmed,
  })

  if (messageError) return { error: messageError.message }

  await admin
    .from('support_tickets')
    .update({
      user_unread: true,
      last_message_at: new Date().toISOString(),
      last_message_preview: trimmed.slice(0, 200),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zrecipe.ie'

  if (ticket.channel === 'internal') {
    const result = await sendEmail({
      to: ticket.requester_email,
      subject: 'You have a new reply from ZRecipe Support',
      html: `
        <p>Hi ${escapeHtml(ticket.requester_name)},</p>
        <p>You have a new reply from ZRecipe Support — view it in your account.</p>
        <p><a href="${appUrl}/support/${ticketId}">View your ticket</a></p>
      `,
    })
    if (!result.ok) console.error('[inbox] reply notification email failed:', result.error)
  } else {
    const result = await sendEmail({
      to: ticket.requester_email,
      subject: `Re: ${ticket.subject}`,
      html: `<p>${escapeHtml(trimmed).replace(/\n/g, '<br/>')}</p>`,
    })
    if (!result.ok) console.error('[inbox] email-channel reply failed:', result.error)
  }

  revalidateInbox(ticketId)
  return {}
}
