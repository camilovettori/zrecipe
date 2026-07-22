'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import * as Dialog from '@radix-ui/react-dialog'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, Megaphone, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/shared/Toaster'
import { formatTicketNumber } from '@/lib/support/formatTicketNumber'
import { renderAnnouncementBody } from '@/lib/support/announcementTemplate'
import { sendAnnouncement, type AudienceKind, type AudienceSegment, type DirectoryUser } from './actions'

export interface AnnouncementListRow {
  id: string
  number: number
  createdAt: string
  title: string
  audienceKind: AudienceKind
  audienceSegment: AudienceSegment | null
  sentAt: string
  totalRecipients: number
  readCount: number
}

const SEGMENT_OPTIONS: { value: AudienceSegment; label: string }[] = [
  { value: 'active', label: 'Active subscribers' },
  { value: 'trialing', label: 'In trial' },
  { value: 'free', label: 'Free / expired' },
  { value: 'past_due', label: 'Past due' },
]

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Past Due',
  canceled: 'Cancelled',
}

function segmentCount(directory: DirectoryUser[], segment: AudienceSegment): number {
  switch (segment) {
    case 'active':
      return directory.filter((u) => u.subscriptionStatus === 'active').length
    case 'trialing':
      return directory.filter((u) => u.subscriptionStatus === 'trialing').length
    case 'past_due':
      return directory.filter((u) => u.subscriptionStatus === 'past_due').length
    case 'free':
      return directory.filter((u) => u.isFreeOrExpired).length
    default:
      return 0
  }
}

function audienceSummary(row: AnnouncementListRow): string {
  if (row.audienceKind === 'all') return 'All users'
  if (row.audienceKind === 'manual') return 'Manual selection'
  const label = SEGMENT_OPTIONS.find((s) => s.value === row.audienceSegment)?.label ?? row.audienceSegment
  return `Segment: ${label}`
}

export default function AnnouncementsClient({
  directory,
  announcements,
  adminFullName,
}: {
  directory: DirectoryUser[]
  announcements: AnnouncementListRow[]
  adminFullName: string | null
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audienceKind, setAudienceKind] = useState<AudienceKind>('all')
  const [audienceSegment, setAudienceSegment] = useState<AudienceSegment>('active')
  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set())
  const [manualSearch, setManualSearch] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, startSending] = useTransition()

  const filteredDirectory = useMemo(() => {
    const q = manualSearch.trim().toLowerCase()
    if (!q) return directory
    return directory.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
  }, [directory, manualSearch])

  const recipientCount = useMemo(() => {
    if (audienceKind === 'all') return directory.length
    if (audienceKind === 'segment') return segmentCount(directory, audienceSegment)
    return manualSelected.size
  }, [audienceKind, audienceSegment, directory, manualSelected])

  const canSend = title.trim().length >= 3 && body.trim().length >= 10 && recipientCount > 0

  const toggleManualUser = (userId: string) => {
    setManualSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const selectAllFiltered = () => {
    setManualSelected((prev) => {
      const next = new Set(prev)
      filteredDirectory.forEach((u) => next.add(u.userId))
      return next
    })
  }

  const resetComposer = () => {
    setTitle('')
    setBody('')
    setAudienceKind('all')
    setAudienceSegment('active')
    setManualSelected(new Set())
    setManualSearch('')
  }

  const handleSend = () => {
    startSending(async () => {
      const result = await sendAnnouncement({
        title,
        body,
        audienceKind,
        audienceSegment: audienceKind === 'segment' ? audienceSegment : null,
        manualUserIds: audienceKind === 'manual' ? Array.from(manualSelected) : undefined,
      })

      setConfirmOpen(false)

      if (result.error || !result.id) {
        toast.error('Failed to send announcement', { description: result.error })
        return
      }

      toast.success(`Sent to ${result.ok} of ${result.total}`, {
        description:
          result.failed > 0 || result.skipped > 0
            ? `${result.failed} failed, ${result.skipped} skipped (no email on file).`
            : undefined,
      })
      resetComposer()
      // Server action already revalidates the list path — a client
      // navigation would just re-fetch the same server component.
      window.location.href = `/adminziffera/announcements/${result.id}`
    })
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Composer */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-slate-900">New announcement</h2>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              placeholder="e.g. New feature: AI recipe ideas"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder={'Hi {{name}},\n\nWrite your announcement here...'}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Tip: use <code className="rounded bg-slate-100 px-1 py-0.5">{'{{name}}'}</code> anywhere in the title
              or message to personalize with each recipient&apos;s first name. Fallback: &ldquo;there&rdquo;.
            </p>
            {(title.includes('{{') || body.includes('{{')) && (
              <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3">
                <p className="mb-1.5 text-xs font-semibold text-slate-500">Preview (using your name)</p>
                {title && (
                  <p className="text-sm font-medium text-slate-800">{renderAnnouncementBody(title, adminFullName)}</p>
                )}
                {body && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                    {renderAnnouncementBody(body, adminFullName)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Audience */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Audience</label>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(['all', 'segment', 'manual'] as AudienceKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setAudienceKind(kind)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    audienceKind === kind ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {kind === 'all' ? 'All users' : kind === 'segment' ? 'Segment' : 'Manual selection'}
                </button>
              ))}
            </div>

            {audienceKind === 'all' && (
              <p className="mt-2 text-xs text-slate-500">
                This will send to <span className="font-semibold text-slate-700">{directory.length}</span> users.
              </p>
            )}

            {audienceKind === 'segment' && (
              <div className="mt-2">
                <div className="flex flex-wrap gap-2">
                  {SEGMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAudienceSegment(opt.value)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        audienceSegment === opt.value
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{segmentCount(directory, audienceSegment)}</span> users
                  match this segment.
                </p>
              </div>
            )}

            {audienceKind === 'manual' && (
              <div className="mt-2 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 border-b border-slate-100 p-2.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={manualSearch}
                      onChange={(e) => setManualSearch(e.target.value)}
                      placeholder="Search by name or email…"
                      className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-2.5 text-xs text-slate-700 outline-none focus:border-emerald-400"
                    />
                  </div>
                  {manualSearch && (
                    <button
                      type="button"
                      onClick={selectAllFiltered}
                      className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      Select all filtered
                    </button>
                  )}
                  <span className="shrink-0 text-xs font-medium text-slate-500">{manualSelected.size} selected</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filteredDirectory.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-slate-400">No users match.</p>
                  ) : (
                    filteredDirectory.map((u) => (
                      <label
                        key={u.userId}
                        className="flex cursor-pointer items-center gap-3 border-b border-slate-50 px-3 py-2 text-sm transition-colors last:border-0 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={manualSelected.has(u.userId)}
                          onChange={() => toggleManualUser(u.userId)}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-slate-800">{u.name}</p>
                          <p className="truncate text-xs text-slate-400">{u.email}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-slate-400">
                          {u.tenantName && <span className="max-w-[140px] truncate">{u.tenantName}</span>}
                          <span>{STATUS_LABEL[u.subscriptionStatus ?? ''] ?? '—'}</span>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!canSend}
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Megaphone className="h-4 w-4" />
              Send announcement
            </button>
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      <Dialog.Root open={confirmOpen} onOpenChange={(o) => !sending && setConfirmOpen(o)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
            <Dialog.Close
              disabled={sending}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
            <Dialog.Title className="text-base font-semibold text-slate-900">
              Send to {recipientCount} user{recipientCount === 1 ? '' : 's'}?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-slate-500">
              This will send an email to each recipient. Cannot be undone.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={sending}
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={handleSend}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                {sending ? 'Sending…' : 'Confirm & send'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Past announcements */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Past announcements</h2>
        {announcements.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
            No announcements sent yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {announcements.map((a) => (
                <Link
                  key={a.id}
                  href={`/adminziffera/announcements/${a.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{a.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatTicketNumber(a.number, a.createdAt, 'announcement')} · {audienceSummary(a)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {a.readCount} read / {a.totalRecipients} sent
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {formatDistanceToNow(new Date(a.sentAt), { addSuffix: true })}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
