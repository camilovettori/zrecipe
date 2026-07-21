'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNowStrict } from 'date-fns'
import { ArrowLeft, Loader2, Mail, MessageSquare, Plus, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/shared/Toaster'
import { cn } from '@/lib/utils'
import SupportModal from '@/components/support/SupportModal'
import { getChannelSourceBadge } from '@/lib/support/channelSource'
import { formatTicketNumber } from '@/lib/support/formatTicketNumber'

interface Ticket {
  id: string
  number: number
  channel: 'email' | 'internal'
  channel_source?: string | null
  subject: string
  status: 'open' | 'closed'
}

interface ThreadMessage {
  id: string
  author_role: 'user' | 'admin'
  author_name: string
  body: string
  created_at: string
}

export default function SupportTicketPage({ params }: { params: { ticketId: string } }) {
  const { ticketId } = params
  const router = useRouter()
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [newTicketOpen, setNewTicketOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: ticketRow } = await supabase
        .from('support_tickets')
        .select('id, number, channel, channel_source, subject, status')
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

  const badge = getChannelSourceBadge(ticket.channel, ticket.channel_source)

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/support"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Support
      </Link>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{ticket.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-500">{formatTicketNumber(ticket.number)}</span>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                badge.className
              )}
            >
              {badge.icon === 'mail' ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
              {badge.label}
            </span>
          </div>
        </div>
        <span
          className={cn(
            'w-fit rounded-full px-2.5 py-1 text-[10px] font-semibold',
            ticket.status === 'open'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border border-slate-200 bg-slate-100 text-slate-500'
          )}
        >
          {ticket.status === 'open' ? 'Open' : 'Closed'}
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No messages yet.</p>
          ) : (
            messages.map((message) => {
              const isAdmin = message.author_role === 'admin'
              const createdAt = new Date(message.created_at)
              return (
                <div key={message.id} className={cn('flex', isAdmin ? 'justify-start' : 'justify-end')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-3 shadow-sm',
                      isAdmin
                        ? 'bg-emerald-50 text-slate-800'
                        : 'border border-slate-200 bg-white text-slate-800'
                    )}
                  >
                    {isAdmin && (
                      <p className="mb-1 text-xs font-semibold text-emerald-700">ZRecipe Support</p>
                    )}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                    <p
                      className="mt-2 text-xs text-slate-400"
                      title={createdAt.toLocaleString('en-IE', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    >
                      {formatDistanceToNowStrict(createdAt, { addSuffix: true })}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {ticket.status === 'closed' ? (
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                This ticket is closed. Open a new ticket to continue the conversation.
              </p>
              <button
                type="button"
                onClick={() => setNewTicketOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                New ticket
              </button>
            </div>
          </div>
        ) : (
          <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 p-5 backdrop-blur">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={4}
              placeholder="Write a reply..."
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleReply}
                disabled={sending || !reply.trim()}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send reply
              </button>
            </div>
          </div>
        )}
      </div>

      <SupportModal
        open={newTicketOpen}
        onOpenChange={setNewTicketOpen}
        mode="internal"
        onTicketCreated={(created) => {
          setNewTicketOpen(false)
          toast.success(`${created.ticketNumber ?? 'Ticket'} opened`)
          router.push(`/support/${created.ticketId}`)
        }}
      />
    </div>
  )
}
