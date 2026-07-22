import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { sendEmail, SUPPORT_FROM } from '@/lib/email/send'
import { renderEmail, paragraphs } from '@/lib/email/template'
import { ADMIN_SUPPORT_INBOX } from '@/lib/email/constants'
import { formatTicketNumber } from '@/lib/support/formatTicketNumber'

export const runtime = 'nodejs'

const schema = z.object({
  subject: z.string().min(3, 'Subject is too short').max(140, 'Subject is too long'),
  message: z.string().min(10, 'Message is too short').max(5000, 'Message is too long'),
})

export async function POST(request: NextRequest) {
  const supabase = createRequestSupabaseClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: z.infer<typeof schema>
  try {
    payload = schema.parse(await request.json())
  } catch {
    return NextResponse.json(
      { error: 'Please check the form and try again.' },
      { status: 400 }
    )
  }

  const subject = payload.subject.trim()
  const message = payload.message.trim()

  const { data: membership } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .maybeSingle()

  let tenantName: string | null = null
  if (membership?.tenant_id) {
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', membership.tenant_id)
      .maybeSingle()
    tenantName = tenantRow?.name ?? null
  }

  const requesterName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'ZRecipe user'
  const requesterEmail = user.email ?? ''

  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .insert({
      channel: 'internal',
      channel_source: 'internal',
      tenant_id: membership?.tenant_id ?? null,
      user_id: user.id,
      requester_name: requesterName,
      requester_email: requesterEmail,
      subject,
      last_message_preview: message.slice(0, 200),
      admin_unread: true,
    })
    .select('id, number, created_at')
    .single()

  if (ticketError || !ticket) {
    console.error('[support/internal] failed to create ticket:', ticketError?.message)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }

  const { error: messageError } = await supabase.from('support_messages').insert({
    ticket_id: ticket.id,
    author_role: 'user',
    author_name: requesterName,
    author_email: requesterEmail,
    body: message,
  })

  if (messageError) {
    console.error('[support/internal] failed to record message:', messageError.message)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zrecipe.ie'
  const ticketNumber = formatTicketNumber(ticket.number as number, ticket.created_at as string)

  const adminResult = await sendEmail({
    from: SUPPORT_FROM,
    to: ADMIN_SUPPORT_INBOX,
    subject: `[ZRecipe Support ${ticketNumber}] ${subject}`,
    html: renderEmail({
      preheader: `In-app support from ${requesterName}`,
      eyebrow: 'New support ticket · In-app channel',
      heading: subject,
      bodyHtml: paragraphs(`${requesterName} submitted a support message from inside the app.`),
      meta: [
        { label: 'From', value: `${requesterName} <${requesterEmail}>` },
        { label: 'Business', value: tenantName ?? '—' },
        { label: 'Subject', value: subject },
        { label: 'Message', value: message },
      ],
      button: { label: 'View ticket in admin inbox', href: `${appUrl}/adminziffera/inbox/${ticket.id}` },
    }),
  })
  if (!adminResult.ok) {
    console.error('[support/internal] admin notification email failed:', adminResult.error)
  }

  const resolvedFirstName = requesterName.trim().split(/\s+/)[0] || 'there'

  const confirmResult = await sendEmail({
    from: SUPPORT_FROM,
    to: requesterEmail,
    subject: `Ticket ${ticketNumber} received — we'll be in touch`,
    html: renderEmail({
      preheader: "We've received your message and will reply soon.",
      eyebrow: 'Support ticket received',
      heading: `Ticket ${ticketNumber} received`,
      bodyHtml: paragraphs(
        `Hi ${resolvedFirstName},`,
        "Thanks for reaching out. We've received your message and will get back to you as soon as possible, usually within one business day.",
        'You can also view this ticket and reply directly inside the app.',
        '— The ZRecipe team'
      ),
      button: {
        label: 'Open ticket in ZRecipe',
        href: `${appUrl}/support/${ticket.id}`,
      },
    }),
  })
  if (!confirmResult.ok) {
    console.error('[support/internal] confirmation email failed:', confirmResult.error)
  }

  return NextResponse.json({ success: true, ticketId: ticket.id as string, ticketNumber })
}
