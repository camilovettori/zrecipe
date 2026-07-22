'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Mail, MessageSquare, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import TicketThread, { type ThreadMessage } from '@/components/support/TicketThread'
import { toast } from '@/components/shared/Toaster'
import { getChannelSourceBadge } from '@/lib/support/channelSource'
import { formatTicketNumber } from '@/lib/support/formatTicketNumber'
import { replyToTicket, setTicketStatus } from '../actions'

interface Ticket {
  id: string
  number: number
  created_at: string
  channel: 'email' | 'internal'
  channel_source?: string | null
  status: 'open' | 'closed'
  requester_name: string
  requester_email: string
  subject: string
}

export default function TicketDetailClient({
  ticket,
  messages,
}: {
  ticket: Ticket
  messages: ThreadMessage[]
}) {
  const router = useRouter()
  const [reply, setReply] = useState('')
  const [sending, startSend] = useTransition()
  const [statusPending, startStatus] = useTransition()

  const handleReply = () => {
    if (!reply.trim()) return
    startSend(async () => {
      const result = await replyToTicket(ticket.id, reply)
      if (result.error) {
        toast.error('Failed to send reply', { description: result.error })
        return
      }
      setReply('')
      toast.success('Reply sent')
      router.refresh()
    })
  }

  const badge = getChannelSourceBadge(ticket.channel, ticket.channel_source)

  const handleToggleStatus = () => {
    const next = ticket.status === 'open' ? 'closed' : 'open'
    startStatus(async () => {
      await setTicketStatus(ticket.id, next)
      toast.success(next === 'closed' ? 'Ticket closed' : 'Ticket reopened')
      router.refresh()
    })
  }

  return (
    <div className="max-w-3xl">
      <Link
        href="/adminziffera/inbox"
        className="mb-6 flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Inbox
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                badge.className
              )}
            >
              {badge.icon === 'mail' ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
              {badge.label}
            </span>
            <h1 className="text-lg font-semibold text-slate-900">{ticket.subject}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {ticket.requester_name} · {ticket.requester_email}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-500">
              {formatTicketNumber(ticket.number, ticket.created_at)}
            </span>
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
          <button
            onClick={handleToggleStatus}
            disabled={statusPending}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {statusPending ? '…' : ticket.status === 'open' ? 'Mark as closed' : 'Reopen'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <TicketThread messages={messages} />

        <div className="mt-6 border-t border-slate-100 pt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {ticket.channel === 'internal' ? 'Reply in-app' : 'Reply via email'}
          </p>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            placeholder={
              ticket.channel === 'internal'
                ? 'Write a reply — the customer will see it in the app and get an email notification…'
                : `Write a reply — this will be sent to ${ticket.requester_email}…`
            }
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleReply}
              disabled={sending || !reply.trim()}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              {ticket.channel === 'internal' ? 'Send reply' : 'Send email reply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
