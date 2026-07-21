import 'server-only'

import { Resend } from 'resend'

const FROM = 'ZRecipe Support <support@auth.ziffera.ie>'

let client: Resend | null = null

// Lazy singleton — logs loudly the first time an email is attempted without
// a configured key, but never throws at import time (this module is loaded
// by every API route that sends mail, and throwing here would take down
// routes that don't even need email on a cold start).
function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY is not set — emails will not be sent.')
    return null
  }
  if (!client) client = new Resend(apiKey)
  return client
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface SendEmailArgs {
  to: string
  subject: string
  html: string
  replyTo?: string
}

interface SendEmailResult {
  ok: boolean
  error?: string
}

// Never throws — callers (API routes) should always be able to proceed and
// return a normal response even if the email failed to send.
export async function sendEmail({ to, subject, html, replyTo }: SendEmailArgs): Promise<SendEmailResult> {
  const resend = getClient()
  if (!resend) {
    return { ok: false, error: 'Email is not configured (RESEND_API_KEY missing).' }
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
      text: stripHtml(html),
      ...(replyTo ? { replyTo } : {}),
    })

    if (error) {
      console.error('[email] Resend send failed:', error.message ?? error)
      return { ok: false, error: error.message ?? 'Failed to send email' }
    }

    return { ok: true }
  } catch (err) {
    console.error('[email] Unexpected error sending email:', err instanceof Error ? err.message : err)
    return { ok: false, error: 'Failed to send email' }
  }
}
