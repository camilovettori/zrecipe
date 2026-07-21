'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const POLL_INTERVAL_MS = 30_000

export interface UnreadTicket {
  id: string
  number: number
  subject: string
  last_message_at: string
}

export function useUserUnread() {
  const [count, setCount] = useState(0)
  const [tickets, setTickets] = useState<UnreadTicket[]>([])

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function poll() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      const [{ count: unreadCount }, { data: recentTickets }] = await Promise.all([
        supabase
          .from('support_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('user_unread', true),
        supabase
          .from('support_tickets')
          .select('id, number, subject, last_message_at')
          .eq('user_id', user.id)
          .eq('user_unread', true)
          .order('last_message_at', { ascending: false })
          .limit(5),
      ])

      if (!cancelled) {
        setCount(unreadCount ?? 0)
        setTickets((recentTickets ?? []) as UnreadTicket[])
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return { count, tickets }
}
