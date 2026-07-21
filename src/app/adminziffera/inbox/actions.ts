'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin, SUPER_ADMIN_EMAIL } from '@/lib/auth/admin'
import { sendEmail, SUPPORT_FROM, HELLO_FROM } from '@/lib/email/send'
import { renderEmail, paragraphs } from '@/lib/email/template'
import { ADMIN_HELLO_INBOX, ADMIN_SUPPORT_INBOX } from '@/lib/email/constants'
import { formatTicketNumber } from '@/lib/support/formatTicketNumber'

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
    .select('id, number, channel, channel_source, subject, requester_name, requester_email')
    .eq('id', ticketId)
    .maybeSingle()

  if (!ticket) return { error: 'Ticket not found.' }
  const ticketNumber = formatTicketNumber(ticket.number as number)

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
    const firstName = ticket.requester_name.split(' ')[0] || ticket.requester_name
    const result = await sendEmail({
      from: SUPPORT_FROM,
      to: ticket.requester_email,
      subject: `Ticket ${ticketNumber} — new reply from ZRecipe Support`,
      html: renderEmail({
        preheader: 'New reply from ZRecipe Support',
        eyebrow: 'New reply from ZRecipe Support',
        heading: `Re: ${ticket.subject}`,
        bodyHtml: paragraphs(
          `Hi ${firstName},`,
          'You have a new reply from ZRecipe Support. View the full conversation and reply from your account.'
        ),
        button: { label: 'Open ticket in ZRecipe', href: `${appUrl}/support/${ticketId}` },
      }),
    })
    if (!result.ok) console.error('[inbox] reply notification email failed:', result.error)
  } else {
    // Which admin inbox originally received this ticket determines both
    // which sender identity replies as, and where the customer's next
    // reply should land — older rows with no channel_source recorded yet
    // fall back to the Support channel.
    const isContact = ticket.channel_source === 'contact'
    const from = isContact ? HELLO_FROM : SUPPORT_FROM
    const replyToInbox = isContact ? ADMIN_HELLO_INBOX : ADMIN_SUPPORT_INBOX
    const result = await sendEmail({
      from,
      to: ticket.requester_email,
      replyTo: replyToInbox,
      subject: `Re: ${ticketNumber} ${ticket.subject}`,
      html: renderEmail({
        preheader: trimmed.slice(0, 90),
        heading: `Re: ${ticket.subject}`,
        bodyHtml: paragraphs(...trimmed.split(/\n{2,}/)),
      }),
    })
    if (!result.ok) console.error('[inbox] email-channel reply failed:', result.error)
  }

  revalidateInbox(ticketId)
  return {}
}
