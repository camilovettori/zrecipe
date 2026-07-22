import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, SUPPORT_FROM, HELLO_FROM } from '@/lib/email/send'
import { renderEmail, paragraphs } from '@/lib/email/template'
import { ADMIN_HELLO_INBOX, ADMIN_SUPPORT_INBOX } from '@/lib/email/constants'
import { formatTicketNumber } from '@/lib/support/formatTicketNumber'

export const runtime = 'nodejs'

const RATE_LIMIT_PER_HOUR = 3

const schema = z.object({
  name: z.string().min(2, 'Please enter your name').max(200),
  email: z.string().email('Please enter a valid email'),
  subject: z.string().min(3, 'Subject is too short').max(140, 'Subject is too long'),
  message: z.string().min(10, 'Message is too short').max(5000, 'Message is too long'),
  // Which entry point this came from — landing "Contact" nav vs the
  // login/register "Support" modal. Server-side only; defaults to
  // 'support' so any request that omits it keeps prior behavior.
  source: z.enum(['contact', 'support']).optional().default('support'),
  // Honeypot — real users never see or fill this field.
  website: z.string().optional(),
})

export async function POST(request: NextRequest) {
  let payload: z.infer<typeof schema>
  try {
    payload = schema.parse(await request.json())
  } catch {
    return NextResponse.json(
      { error: 'Please check the form and try again.' },
      { status: 400 }
    )
  }

  // Bot filter — silently succeed without doing anything.
  if (payload.website && payload.website.trim() !== '') {
    return NextResponse.json({ success: true })
  }

  const name = payload.name.trim()
  const email = payload.email.trim().toLowerCase()
  const subject = payload.subject.trim()
  const message = payload.message.trim()
  const source = payload.source
  const isContact = source === 'contact'
  const senderFrom = isContact ? HELLO_FROM : SUPPORT_FROM
  const adminInbox = isContact ? ADMIN_HELLO_INBOX : ADMIN_SUPPORT_INBOX

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: countError } = await admin
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('requester_email', email)
    .gte('created_at', oneHourAgo)

  if (countError) {
    console.error('[support/public] rate limit check failed:', countError.message)
  } else if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: "You've sent several messages recently. Please wait a bit before sending another." },
      { status: 429 }
    )
  }

  const { data: ticket, error: ticketError } = await admin
    .from('support_tickets')
    .insert({
      channel: 'email',
      channel_source: source,
      requester_name: name,
      requester_email: email,
      subject,
      last_message_preview: message.slice(0, 200),
      admin_unread: true,
    })
    .select('id, number, created_at')
    .single()

  if (ticketError || !ticket) {
    console.error('[support/public] failed to create ticket:', ticketError?.message)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }

  const { error: messageError } = await admin.from('support_messages').insert({
    ticket_id: ticket.id,
    author_role: 'user',
    author_name: name,
    author_email: email,
    body: message,
  })

  if (messageError) {
    console.error('[support/public] failed to record message:', messageError.message)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zrecipe.ie'
  const ticketNumber = formatTicketNumber(ticket.number as number, ticket.created_at as string)

  // Admin notification — reply-to is the requester so the admin can just hit
  // "Reply" in Gmail and the conversation continues over email from there.
  const adminResult = await sendEmail({
    from: senderFrom,
    to: adminInbox,
    subject: `[ZRecipe Support ${ticketNumber}] ${subject}`,
    replyTo: email,
    html: renderEmail({
      preheader: `${name}: ${subject}`,
      eyebrow: isContact ? 'New contact message · Landing page' : 'New support ticket · Email channel',
      heading: subject,
      bodyHtml: paragraphs(`${name} just submitted a support message via the ZRecipe contact form.`),
      meta: [
        { label: 'From', value: `${name} <${email}>` },
        { label: 'Subject', value: subject },
        { label: 'Message', value: message },
      ],
      button: { label: 'View ticket in admin inbox', href: `${appUrl}/adminziffera/inbox/${ticket.id}` },
    }),
  })
  if (!adminResult.ok) {
    console.error('[support/public] admin notification email failed:', adminResult.error)
  }

  const confirmResult = await sendEmail({
    from: senderFrom,
    to: email,
    subject: `Ticket ${ticketNumber} received — we'll be in touch`,
    html: renderEmail({
      preheader: 'We received your message and will reply soon.',
      heading: 'Thanks — we received your message',
      bodyHtml: paragraphs(
        `Hi ${name},`,
        `Thanks for reaching out to ZRecipe. We've received your message (ticket ${ticketNumber}) and will get back to you as soon as possible, usually within one business day.`,
        '— The ZRecipe team'
      ),
    }),
  })
  if (!confirmResult.ok) {
    console.error('[support/public] confirmation email failed:', confirmResult.error)
  }

  return NextResponse.json({ success: true, ticketId: ticket.id as string, ticketNumber })
}
