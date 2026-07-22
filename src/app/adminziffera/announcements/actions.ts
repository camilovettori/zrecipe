'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin, SUPER_ADMIN_EMAIL } from '@/lib/auth/admin'
import { getEffectiveSubscriptionStatus } from '@/lib/tenant'
import { sendEmail, SUPPORT_FROM } from '@/lib/email/send'
import { renderEmail, paragraphs } from '@/lib/email/template'
import { renderAnnouncementBody, renderAnnouncementTitle } from '@/lib/support/announcementTemplate'

export type AudienceKind = 'all' | 'segment' | 'manual'
export type AudienceSegment = 'active' | 'trialing' | 'free' | 'past_due'

export interface DirectoryUser {
  userId: string
  email: string
  name: string
  /** Raw account name for {{name}} personalization — unlike `name`,
   *  this does NOT fall back to an email-derived label, so a missing
   *  name here correctly triggers the template's "there" fallback. */
  fullName: string | null
  tenantId: string | null
  tenantName: string | null
  subscriptionStatus: string | null
  isFreeOrExpired: boolean
}

interface SendAnnouncementInput {
  title: string
  body: string
  audienceKind: AudienceKind
  audienceSegment?: AudienceSegment | null
  manualUserIds?: string[]
}

interface SendAnnouncementResult {
  id: string
  total: number
  ok: number
  failed: number
  skipped: number
  error?: string
}

interface RecipientCandidate {
  userId: string
  email: string
  tenantId: string | null
  fullName: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllAuthUsers(admin: any): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    // Supabase's default page size is 50 — explicit perPage avoids
    // silently truncating the audience once the user base grows past that.
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    return data?.users ?? []
  } catch {
    return []
  }
}

/** Full user directory with tenant/plan context — used by the composer
 *  (live audience counts + manual-select search) and by segment resolution
 *  at send time. Dedupes by user_id (first tenant membership wins). */
export async function getAudienceDirectory(): Promise<DirectoryUser[]> {
  await requireSuperAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const [{ data: tenantUsers }, { data: tenants }, authUsers] = await Promise.all([
    admin.from('tenant_users').select('user_id, tenant_id'),
    admin.from('tenants').select('id, name, subscription_status, created_at'),
    fetchAllAuthUsers(admin),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantById = new Map<string, any>((tenants ?? []).map((t: any) => [t.id, t]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authUserById = new Map<string, any>(authUsers.map((u: any) => [u.id, u]))

  const seen = new Set<string>()
  const directory: DirectoryUser[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const tu of (tenantUsers ?? []) as any[]) {
    if (seen.has(tu.user_id)) continue
    seen.add(tu.user_id)

    const authUser = authUserById.get(tu.user_id)
    const tenant = tenantById.get(tu.tenant_id)
    const meta = authUser?.user_metadata ?? {}
    const email = (authUser?.email ?? '') as string
    const fullName = ((meta.full_name || meta.name || null) as string | null)
    const subscriptionStatus = (tenant?.subscription_status ?? null) as string | null
    const effective = tenant?.created_at
      ? getEffectiveSubscriptionStatus(subscriptionStatus, tenant.created_at)
      : 'canceled'

    directory.push({
      userId: tu.user_id as string,
      email,
      name: (fullName || (email ? email.split('@')[0] : 'Unknown')) as string,
      fullName,
      tenantId: (tu.tenant_id ?? null) as string | null,
      tenantName: (tenant?.name ?? null) as string | null,
      subscriptionStatus,
      isFreeOrExpired: effective !== 'active' && effective !== 'trialing',
    })
  }

  return directory
}

function filterBySegment(directory: DirectoryUser[], segment: AudienceSegment): DirectoryUser[] {
  switch (segment) {
    case 'active':
      return directory.filter((u) => u.subscriptionStatus === 'active')
    case 'trialing':
      return directory.filter((u) => u.subscriptionStatus === 'trialing')
    case 'past_due':
      return directory.filter((u) => u.subscriptionStatus === 'past_due')
    case 'free':
      return directory.filter((u) => u.isFreeOrExpired)
    default:
      return []
  }
}

async function resolveRecipients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  input: SendAnnouncementInput
): Promise<RecipientCandidate[]> {
  if (input.audienceKind === 'manual') {
    const ids = Array.from(new Set(input.manualUserIds ?? []))
    if (ids.length === 0) return []

    const authUsers = await fetchAllAuthUsers(admin)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authUserById = new Map<string, any>(authUsers.map((u: any) => [u.id, u]))

    const { data: tenantUsers } = await admin
      .from('tenant_users')
      .select('user_id, tenant_id')
      .in('user_id', ids)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenantByUser = new Map<string, any>((tenantUsers ?? []).map((tu: any) => [tu.user_id, tu.tenant_id]))

    return ids.map((id) => {
      const authUser = authUserById.get(id)
      const meta = authUser?.user_metadata ?? {}
      return {
        userId: id,
        email: (authUser?.email ?? '') as string,
        tenantId: (tenantByUser.get(id) ?? null) as string | null,
        fullName: (meta.full_name || meta.name || null) as string | null,
      }
    })
  }

  const directory = await getAudienceDirectory()

  const matched =
    input.audienceKind === 'all'
      ? directory
      : filterBySegment(directory, (input.audienceSegment ?? 'active') as AudienceSegment)

  return matched.map((u) => ({ userId: u.userId, email: u.email, tenantId: u.tenantId, fullName: u.fullName }))
}

async function insertRecipientsInChunks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  chunkSize = 500
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await admin.from('announcement_recipients').insert(chunk)
    if (error) throw new Error(error.message)
  }
}

/** Runs `task` over `items` with at most `limit` in flight at once — a
 *  hand-rolled concurrency gate so we never fire hundreds of emails at
 *  Resend simultaneously (rate limits) or spike function memory. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      await task(item)
    }
  }
  const workerCount = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
}

export async function sendAnnouncement(input: SendAnnouncementInput): Promise<SendAnnouncementResult> {
  const admin_user = await requireSuperAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const title = input.title.trim()
  const body = input.body.trim()

  if (title.length < 3 || title.length > 140) {
    return { id: '', total: 0, ok: 0, failed: 0, skipped: 0, error: 'Title must be 3–140 characters.' }
  }
  if (body.length < 10 || body.length > 5000) {
    return { id: '', total: 0, ok: 0, failed: 0, skipped: 0, error: 'Message must be 10–5000 characters.' }
  }

  const candidates = await resolveRecipients(admin, input)

  if (candidates.length === 0) {
    return { id: '', total: 0, ok: 0, failed: 0, skipped: 0, error: 'No recipients match this audience.' }
  }

  const recipientsWithEmail = candidates.filter((c) => c.email.trim() !== '')
  const skippedCandidates = candidates.filter((c) => c.email.trim() === '')

  const { data: announcement, error: announcementError } = await admin
    .from('announcements')
    .insert({
      title,
      body,
      audience_kind: input.audienceKind,
      audience_segment: input.audienceKind === 'segment' ? input.audienceSegment ?? null : null,
      sent_by_email: admin_user.email ?? SUPER_ADMIN_EMAIL,
      total_recipients: candidates.length,
    })
    .select('id, number, created_at')
    .single()

  if (announcementError || !announcement) {
    return {
      id: '',
      total: 0,
      ok: 0,
      failed: 0,
      skipped: 0,
      error: announcementError?.message ?? 'Failed to create announcement.',
    }
  }

  const recipientRows = [
    ...recipientsWithEmail.map((c) => ({
      announcement_id: announcement.id,
      tenant_id: c.tenantId,
      user_id: c.userId,
      email: c.email,
      email_status: 'pending' as const,
    })),
    ...skippedCandidates.map((c) => ({
      announcement_id: announcement.id,
      tenant_id: c.tenantId,
      user_id: c.userId,
      email: '(no email on file)',
      email_status: 'skipped' as const,
      email_error: 'no email on file',
    })),
  ]

  await insertRecipientsInChunks(admin, recipientRows)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zrecipe.ie'

  let okCount = 0
  let failedCount = 0

  await runWithConcurrency(recipientsWithEmail, 5, async (candidate) => {
    const personalizedTitle = renderAnnouncementTitle(title, candidate.fullName)
    const personalizedBody = renderAnnouncementBody(body, candidate.fullName)
    const result = await sendEmail({
      from: SUPPORT_FROM,
      to: candidate.email,
      subject: personalizedTitle,
      html: renderEmail({
        preheader: personalizedBody.slice(0, 90),
        eyebrow: 'Announcement from ZRecipe',
        heading: personalizedTitle,
        bodyHtml: paragraphs(...personalizedBody.split(/\n{2,}/)),
        button: { label: 'Open in ZRecipe', href: `${appUrl}/announcements/${announcement.id}` },
      }),
    })

    if (result.ok) {
      okCount += 1
    } else {
      failedCount += 1
    }

    await admin
      .from('announcement_recipients')
      .update({
        email_status: result.ok ? 'ok' : 'failed',
        email_error: result.ok ? null : (result.error ?? 'Unknown error'),
      })
      .eq('announcement_id', announcement.id)
      .eq('user_id', candidate.userId)
  })

  await admin
    .from('announcements')
    .update({ email_ok_count: okCount, email_failed_count: failedCount })
    .eq('id', announcement.id)

  revalidatePath('/adminziffera/announcements')
  revalidatePath(`/adminziffera/announcements/${announcement.id}`)

  return {
    id: announcement.id as string,
    total: candidates.length,
    ok: okCount,
    failed: failedCount,
    skipped: skippedCandidates.length,
  }
}
