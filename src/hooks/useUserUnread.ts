'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const POLL_INTERVAL_MS = 30_000

export interface UnreadTicket {
  id: string
  number: number
  created_at: string
  subject: string
  last_message_at: string
}

export interface UnreadAnnouncement {
  id: string
  number: number
  created_at: string
  title: string
  sent_at: string
}

export type UnreadItem =
  | ({ kind: 'ticket' } & UnreadTicket)
  | ({ kind: 'announcement' } & UnreadAnnouncement)

function itemTimestamp(item: UnreadItem): string {
  return item.kind === 'ticket' ? item.last_message_at : item.sent_at
}

export function useUserUnread() {
  const [count, setCount] = useState(0)
  const [tickets, setTickets] = useState<UnreadTicket[]>([])
  const [announcementCount, setAnnouncementCount] = useState(0)
  const [announcements, setAnnouncements] = useState<UnreadAnnouncement[]>([])
  const [items, setItems] = useState<UnreadItem[]>([])

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function poll() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      const [
        { count: unreadTicketCount },
        { data: recentTickets },
        { count: unreadAnnouncementCount },
        { data: recentAnnouncementRows },
      ] = await Promise.all([
        supabase
          .from('support_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('user_unread', true),
        supabase
          .from('support_tickets')
          .select('id, number, created_at, subject, last_message_at')
          .eq('user_id', user.id)
          .eq('user_unread', true)
          .order('last_message_at', { ascending: false })
          .limit(5),
        supabase
          .from('announcement_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .is('read_at', null),
        supabase
          .from('announcement_recipients')
          .select('announcement_id, announcements(id, number, created_at, title, sent_at)')
          .eq('user_id', user.id)
          .is('read_at', null)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (cancelled) return

      const nextTickets = (recentTickets ?? []) as UnreadTicket[]
      const nextAnnouncements = (recentAnnouncementRows ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => row.announcements)
        .filter(Boolean) as UnreadAnnouncement[]

      setCount(unreadTicketCount ?? 0)
      setTickets(nextTickets)
      setAnnouncementCount(unreadAnnouncementCount ?? 0)
      setAnnouncements(nextAnnouncements)

      const merged: UnreadItem[] = [
        ...nextTickets.map((t) => ({ kind: 'ticket' as const, ...t })),
        ...nextAnnouncements.map((a) => ({ kind: 'announcement' as const, ...a })),
      ].sort((a, b) => new Date(itemTimestamp(b)).getTime() - new Date(itemTimestamp(a)).getTime())
      setItems(merged)
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return { count, tickets, announcementCount, announcements, items }
}
