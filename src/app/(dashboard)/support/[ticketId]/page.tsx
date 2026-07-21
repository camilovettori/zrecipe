'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import TicketThread, { type ThreadMessage } from '@/components/support/TicketThread'
import { toast } from '@/components/shared/Toaster'

interface Ticket {
  id: string
  subject: string
  status: 'open' | 'closed'
}

export default function SupportTicketPage({ params }: { params: { ticketId: string } }) {
  const { ticketId } = params
  const router = useRouter()
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: ticketRow } = await supabase
        .from('support_tickets')
        .select('id, subject, status')
        .eq('id', ticketId)
        .maybeSingle()

      if (cancelled) return
      if (!ticketRow) {
        setTicket(null)
        return
      }
      setTicket(ticketRow as Ticket)

      const { data: messageRows } = await supabase
        .from('support_messages')
        .select('id, author_role, author_name, body, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })

      if (!cancelled) setMessages((messageRows ?? []) as ThreadMessage[])

      // Opening the ticket marks it read.
      await supabase.from('support_tickets').update({ user_unread: false }).eq('id', ticketId)
    }

    load()
    return () => { cancelled = true }
  }, [ticketId])

  const handleReply = async () => {
    if (!reply.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/support/internal/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error('Failed to send reply', { description: (body as { error?: string }).error })
        return
      }
      setReply('')
      router.refresh()
      // Re-fetch the thread so the new message shows immediately.
      const supabase = createClient()
      const { data: messageRows } = await supabase
        .from('support_messages')
        .select('id, author_role, author_name, body, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })
      setMessages((messageRows ?? []) as ThreadMessage[])
    } finally {
      setSending(false)
    }
  }

  if (ticket === undefined) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (ticket === null) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-slate-500">Ticket not found.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/support"
        className="mb-5 flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Support
      </Link>

      <div className="mb-5 flex items-center gap-2">
        <h1 className="text-lg font-semibold text-slate-900">{ticket.subject}</h1>
        {ticket.status === 'closed' && (
          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            Closed
          </span>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <TicketThread messages={messages} />

        <div className="mt-6 border-t border-slate-100 pt-5">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            placeholder="Write a reply…"
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleReply}
              disabled={sending || !reply.trim()}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send reply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
