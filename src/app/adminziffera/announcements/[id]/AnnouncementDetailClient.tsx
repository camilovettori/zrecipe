'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ArrowLeft, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTicketNumber } from '@/lib/support/formatTicketNumber'
import { renderAnnouncementBody } from '@/lib/support/announcementTemplate'

export interface RecipientRow {
  id: string
  name: string
  email: string
  readAt: string | null
  emailStatus: string
  emailError: string | null
}

interface Announcement {
  id: string
  number: number
  created_at: string
  title: string
  body: string
  audience_kind: 'all' | 'segment' | 'manual'
  audience_segment: string | null
  sent_by_email: string
  sent_at: string
  total_recipients: number
  email_ok_count: number
  email_failed_count: number
}

const SEGMENT_LABEL: Record<string, string> = {
  active: 'Active subscribers',
  trialing: 'In trial',
  free: 'Free / expired',
  past_due: 'Past due',
}

const STATUS_CHIP: Record<string, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  skipped: 'border-slate-200 bg-slate-100 text-slate-500',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
}

type SortKey = 'name' | 'email' | 'emailStatus' | 'readAt'
type SortDir = 'asc' | 'desc'

function audienceSummary(a: Announcement): string {
  if (a.audience_kind === 'all') return 'All users'
  if (a.audience_kind === 'manual') return 'Manual selection'
  return `Segment: ${SEGMENT_LABEL[a.audience_segment ?? ''] ?? a.audience_segment}`
}

export default function AnnouncementDetailClient({
  announcement,
  recipients,
  adminFullName,
}: {
  announcement: Announcement
  recipients: RecipientRow[]
  adminFullName: string | null
}) {
  const [sortKey, setSortKey] = useState<SortKey>('readAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const readCount = recipients.filter((r) => r.readAt).length
  const skippedCount = recipients.filter((r) => r.emailStatus === 'skipped').length

  const sorted = useMemo(() => {
    const rows = [...recipients]
    rows.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'readAt') {
        cmp = (a.readAt ? new Date(a.readAt).getTime() : 0) - (b.readAt ? new Date(b.readAt).getTime() : 0)
      } else {
        cmp = String(a[sortKey]).localeCompare(String(b[sortKey]))
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [recipients, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Recipient' },
    { key: 'emailStatus', label: 'Email status' },
    { key: 'readAt', label: 'Read status' },
  ]

  return (
    <div className="max-w-4xl">
      <Link
        href="/adminziffera/announcements"
        className="mb-6 flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Announcements
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{announcement.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sent {formatDistanceToNow(new Date(announcement.sent_at), { addSuffix: true })} by{' '}
            {announcement.sent_by_email}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-sm font-medium text-slate-500">
            {formatTicketNumber(announcement.number, announcement.created_at, 'announcement')}
          </span>
          <span className="w-fit rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
            {audienceSummary(announcement)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Template</p>
          <div className="max-w-[85%] rounded-2xl bg-slate-100 px-4 py-3 text-slate-800 shadow-sm">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{announcement.body}</p>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Preview (using your name)
          </p>
          <div className="max-w-[85%] rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-3 text-slate-800 shadow-sm">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {renderAnnouncementBody(announcement.body, adminFullName)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate-600">
        <span>
          Sent: <span className="font-semibold text-slate-900">{announcement.total_recipients}</span>
        </span>
        <span>
          Read: <span className="font-semibold text-slate-900">{readCount}</span>
        </span>
        <span>
          Failed: <span className="font-semibold text-slate-900">{announcement.email_failed_count}</span>
        </span>
        <span>
          Skipped: <span className="font-semibold text-slate-900">{skippedCount}</span>
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-2.5">
                  <button
                    onClick={() => toggleSort(col.key)}
                    className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-700"
                  >
                    {col.label}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{r.name}</p>
                  <p className="text-xs text-slate-400">{r.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      STATUS_CHIP[r.emailStatus] ?? STATUS_CHIP.pending
                    )}
                    title={r.emailError ?? undefined}
                  >
                    {r.emailStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {r.readAt ? formatDistanceToNow(new Date(r.readAt), { addSuffix: true }) : 'Unread'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
