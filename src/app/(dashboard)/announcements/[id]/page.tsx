'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowLeft, Loader2, Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatTicketNumber } from '@/lib/support/formatTicketNumber'
import { renderAnnouncementBody, renderAnnouncementTitle } from '@/lib/support/announcementTemplate'

interface Announcement {
  id: string
  number: number
  created_at: string
  title: string
  body: string
  sent_at: string
}

export default function AnnouncementDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const [announcement, setAnnouncement] = useState<Announcement | null | undefined>(undefined)
  const [viewerFullName, setViewerFullName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setViewerFullName(
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        null
      )

      const { data } = await supabase
        .from('announcements')
        .select('id, number, created_at, title, body, sent_at')
        .eq('id', id)
        .maybeSingle()

      if (cancelled) return
      if (!data) {
        setAnnouncement(null)
        return
      }
      setAnnouncement(data as Announcement)

      await supabase
        .from('announcement_recipients')
        .update({ read_at: new Date().toISOString() })
        .eq('announcement_id', id)
        .eq('user_id', user.id)
        .is('read_at', null)
    }

    load()
    return () => { cancelled = true }
  }, [id])

  if (announcement === undefined) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (announcement === null) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-slate-500">Announcement not found.</p>
      </div>
    )
  }

  const renderedTitle = renderAnnouncementTitle(announcement.title, viewerFullName)
  const renderedBody = renderAnnouncementBody(announcement.body, viewerFullName)

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/announcements"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Announcements
      </Link>

      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <Megaphone className="h-5 w-5 text-emerald-600" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{renderedTitle}</h1>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-medium text-slate-500">
            {formatTicketNumber(announcement.number, announcement.created_at, 'announcement')}
          </span>
          <span>·</span>
          <span>{formatDistanceToNowStrict(new Date(announcement.sent_at), { addSuffix: true })}</span>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{renderedBody}</p>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        If you have questions,{' '}
        <Link href="/support" className="font-medium text-emerald-600 hover:underline">
          contact support
        </Link>
        .
      </p>
    </div>
  )
}
