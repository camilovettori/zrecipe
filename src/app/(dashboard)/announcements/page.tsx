'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { Loader2, Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { formatTicketNumber } from '@/lib/support/formatTicketNumber'
import { renderAnnouncementBody, renderAnnouncementTitle } from '@/lib/support/announcementTemplate'

interface AnnouncementRow {
  id: string
  read_at: string | null
  announcement: {
    id: string
    number: number
    created_at: string
    title: string
    body: string
    sent_at: string
  }
}

export default function AnnouncementsPage() {
  const [rows, setRows] = useState<AnnouncementRow[] | null>(null)
  const [viewerFullName, setViewerFullName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) setRows([])
        return
      }

      setViewerFullName(
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        null
      )

      const { data } = await supabase
        .from('announcement_recipients')
        .select('id, read_at, announcement:announcements(id, number, created_at, title, body, sent_at)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (!cancelled) setRows((data ?? []) as unknown as AnnouncementRow[])
    }

    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <Megaphone className="h-5 w-5 text-emerald-600" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Announcements</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">Updates and news from the ZRecipe team.</p>
      </div>

      {rows === null ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-slate-400 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Megaphone className="mx-auto mb-3 h-10 w-10 text-slate-200" />
          <p className="text-sm font-semibold text-slate-700">No announcements yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {rows.map((row) => {
              const a = row.announcement
              const unread = !row.read_at
              const renderedTitle = renderAnnouncementTitle(a.title, viewerFullName)
              const renderedBody = renderAnnouncementBody(a.body, viewerFullName)
              const preview = renderedBody.length > 120 ? `${renderedBody.slice(0, 120)}…` : renderedBody
              return (
                <Link
                  key={row.id}
                  href={`/announcements/${a.id}`}
                  className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-emerald-50/40"
                >
                  <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                    {unread && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {formatTicketNumber(a.number, a.created_at, 'announcement')}
                    </p>
                    <p className={cn('truncate text-sm', unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700')}>
                      {renderedTitle}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">{preview}</p>
                  </div>

                  <span className="shrink-0 text-xs text-slate-400">
                    {formatDistanceToNowStrict(new Date(a.sent_at), { addSuffix: true })}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
