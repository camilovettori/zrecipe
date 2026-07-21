import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { sendEmail, SUPPORT_FROM } from '@/lib/email/send'
import { renderEmail, paragraphs } from '@/lib/email/template'
import { ADMIN_SUPPORT_INBOX } from '@/lib/email/constants'

export const runtime = 'nodejs'

const schema = z.object({
  message: z.string().min(1, 'Message is required').max(5000, 'Message is too long'),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { ticketId: string } }
) {
  const supabase = createRequestSupabaseClient(request)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: z.infer<typeof schema>
  try {
    payload = schema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Please enter a message.' }, { status: 400 })
  }

  const message = payload.message.trim()

  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('id, user_id, subject')
    .eq('id', params.ticketId)
    .maybeSingle()

  if (!ticket || ticket.user_id !== user.id) {
    return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
  }

  const requesterName =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'ZRecipe user'
  const requesterEmail = user.email ?? ''

  const { error: messageError } = await supabase.from('support_messages').insert({
    ticket_id: ticket.id,
    author_role: 'user',
    author_name: requesterName,
    author_email: requesterEmail,
    body: message,
  })

  if (messageError) {
    console.error('[support/internal/reply] failed to insert message:', messageError.message)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }

  await supabase
    .from('support_tickets')
    .update({
      admin_unread: true,
      user_unread: false,
      last_message_at: new Date().toISOString(),
      last_message_preview: message.slice(0, 200),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticket.id)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zrecipe.ie'

  const adminResult = await sendEmail({
    from: SUPPORT_FROM,
    to: ADMIN_SUPPORT_INBOX,
    subject: `[ZRecipe Internal Ticket] New reply: ${ticket.subject}`,
    html: renderEmail({
      preheader: `${requesterName} replied`,
      eyebrow: 'New reply · In-app channel',
      heading: `Re: ${ticket.subject}`,
      bodyHtml: paragraphs(`${requesterName} replied to their internal support ticket.`),
      meta: [
        { label: 'From', value: `${requesterName} <${requesterEmail}>` },
        { label: 'Reply', value: message },
      ],
      button: { label: 'Continue in admin inbox', href: `${appUrl}/adminziffera/inbox/${ticket.id}` },
    }),
  })
  if (!adminResult.ok) {
    console.error('[support/internal/reply] admin notification email failed:', adminResult.error)
  }

  return NextResponse.json({ success: true })
}
